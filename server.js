import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   CONFIGURATION
========================================================= */

const MONGODB_URI = process.env.MONGODB_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI manquant dans les variables d'environnement.");
    process.exit(1);
}

const openai = OPENAI_API_KEY
    ? new OpenAI({
        apiKey: OPENAI_API_KEY
    })
    : null;

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({ limit: "1mb" }));

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

/* =========================================================
   MONGODB
========================================================= */

const mongoClient = new MongoClient(MONGODB_URI);

let db;

async function connectDatabase() {
    await mongoClient.connect();

    db = mongoClient.db("capcontrole");

    console.log("✅ Connecté à MongoDB");

    await db.collection("users").createIndex(
        { email: 1 },
        { unique: true }
    );

    await db.collection("sharedSheets").createIndex(
        { code: 1 },
        { unique: true }
    );

    await db.collection("sessions").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
    );
}

/* =========================================================
   COLLECTIONS
========================================================= */

function usersCollection() {
    return db.collection("users");
}

function controlsCollection() {
    return db.collection("controls");
}

function historiesCollection() {
    return db.collection("histories");
}

function statsCollection() {
    return db.collection("stats");
}

function sharedSheetsCollection() {
    return db.collection("sharedSheets");
}

function sessionsCollection() {
    return db.collection("sessions");
}

/* =========================================================
   UTILITAIRES
========================================================= */

function isValidObjectId(id) {
    return ObjectId.isValid(id);
}

function toObjectId(id) {
    return new ObjectId(id);
}

function sanitizeUser(user) {
    if (!user) return null;

    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastRevisionDate: user.lastRevisionDate || null
    };
}

/* =========================================================
   MOTS DE PASSE
   PBKDF2 + SHA-256
========================================================= */

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");

    const derivedKey = await new Promise((resolve, reject) => {
        crypto.pbkdf2(
            password,
            salt,
            120000,
            64,
            "sha256",
            (error, key) => {
                if (error) reject(error);
                else resolve(key);
            }
        );
    });

    return {
        salt,
        hash: derivedKey.toString("hex")
    };
}

async function verifyPassword(password, salt, storedHash) {
    const derivedKey = await new Promise((resolve, reject) => {
        crypto.pbkdf2(
            password,
            salt,
            120000,
            64,
            "sha256",
            (error, key) => {
                if (error) reject(error);
                else resolve(key);
            }
        );
    });

    const calculatedHash = derivedKey.toString("hex");

    return crypto.timingSafeEqual(
        Buffer.from(calculatedHash, "hex"),
        Buffer.from(storedHash, "hex")
    );
}

/* =========================================================
   SESSIONS
========================================================= */

const SESSION_COOKIE = "cc_session";

const SESSION_DURATION = 1000 * 60 * 60 * 24 * 30;

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function parseCookies(request) {
    const header = request.headers.cookie;

    if (!header) {
        return {};
    }

    const cookies = {};

    header.split(";").forEach(part => {
        const index = part.indexOf("=");

        if (index === -1) return;

        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();

        cookies[key] = decodeURIComponent(value);
    });

    return cookies;
}

async function createSession(userId) {
    const token = generateSessionToken();

    const expiresAt = new Date(
        Date.now() + SESSION_DURATION
    );

    await sessionsCollection().insertOne({
        token,
        userId: toObjectId(userId),
        createdAt: new Date(),
        expiresAt
    });

    return {
        token,
        expiresAt
    };
}

function setSessionCookie(response, token) {
    const secure =
        process.env.NODE_ENV === "production";

    response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
            SESSION_DURATION / 1000
        )}${secure ? "; Secure" : ""}`
    );
}

function clearSessionCookie(response) {
    const secure =
        process.env.NODE_ENV === "production";

    response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
    );
}

async function getCurrentUser(request) {
    const cookies = parseCookies(request);

    const token = cookies[SESSION_COOKIE];

    if (!token) {
        return null;
    }

    const session =
        await sessionsCollection().findOne({
            token
        });

    if (!session) {
        return null;
    }

    if (
        session.expiresAt &&
        new Date(session.expiresAt) <= new Date()
    ) {
        await sessionsCollection().deleteOne({
            _id: session._id
        });

        return null;
    }

    const user =
        await usersCollection().findOne({
            _id: session.userId
        });

    if (!user) {
        await sessionsCollection().deleteOne({
            _id: session._id
        });

        return null;
    }

    return user;
}

async function requireAuth(request, response, next) {
    try {
        const user = await getCurrentUser(request);

        if (!user) {
            return response.status(401).json({
                error: "Tu dois être connecté."
            });
        }

        request.user = user;

        next();
    } catch (error) {
        console.error(error);

        return response.status(500).json({
            error: "Erreur d'authentification."
        });
    }
}

/* =========================================================
   AUTHENTIFICATION
========================================================= */

/* REGISTER */

app.post("/register", async (request, response) => {
    try {
        const {
            username,
            email,
            password
        } = request.body;

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return response.status(400).json({
                error: "Données invalides."
            });
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (
            cleanUsername.length < 2 ||
            cleanUsername.length > 30
        ) {
            return response.status(400).json({
                error: "Le pseudo doit contenir entre 2 et 30 caractères."
            });
        }

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                cleanEmail
            )
        ) {
            return response.status(400).json({
                error: "Adresse e-mail invalide."
            });
        }

        if (password.length < 6) {
            return response.status(400).json({
                error: "Le mot de passe doit contenir au moins 6 caractères."
            });
        }

        const existingUser =
            await usersCollection().findOne({
                email: cleanEmail
            });

        if (existingUser) {
            return response.status(409).json({
                error: "Cette adresse e-mail est déjà utilisée."
            });
        }

        const passwordData =
            await hashPassword(password);

        const now = new Date();

        const user = {
            username: cleanUsername,
            email: cleanEmail,
            passwordHash: passwordData.hash,
            passwordSalt: passwordData.salt,
            createdAt: now,
            lastRevisionDate: null
        };

        const result =
            await usersCollection().insertOne(user);

        const userId = result.insertedId;

        await statsCollection().insertOne({
            userId,
            streak: 0,
            bestStreak: 0,
            lastRevisionDate: null
        });

        const session =
            await createSession(userId.toString());

        setSessionCookie(
            response,
            session.token
        );

        return response.status(201).json({
            message: "Compte créé.",
            user: {
                id: userId.toString(),
                username: cleanUsername,
                email: cleanEmail,
                lastRevisionDate: null
            }
        });

    } catch (error) {
        console.error(
            "Erreur register :",
            error
        );

        return response.status(500).json({
            error: "Impossible de créer le compte."
        });
    }
});

/* LOGIN */

app.post("/login", async (request, response) => {
    try {
        const {
            email,
            password
        } = request.body;

        if (!email || !password) {
            return response.status(400).json({
                error: "Remplis tous les champs."
            });
        }

        const user =
            await usersCollection().findOne({
                email: String(email)
                    .trim()
                    .toLowerCase()
            });

        if (!user) {
            return response.status(401).json({
                error: "E-mail ou mot de passe incorrect."
            });
        }

        const valid =
            await verifyPassword(
                password,
                user.passwordSalt,
                user.passwordHash
            );

        if (!valid) {
            return response.status(401).json({
                error: "E-mail ou mot de passe incorrect."
            });
        }

        const session =
            await createSession(
                user._id.toString()
            );

        setSessionCookie(
            response,
            session.token
        );

        return response.json({
            message: "Connexion réussie.",
            user: sanitizeUser(user)
        });

    } catch (error) {
        console.error(
            "Erreur login :",
            error
        );

        return response.status(500).json({
            error: "Impossible de se connecter."
        });
    }
});

/* LOGOUT */

app.post("/logout", async (request, response) => {
    try {
        const cookies = parseCookies(request);

        const token = cookies[SESSION_COOKIE];

        if (token) {
            await sessionsCollection().deleteOne({
                token
            });
        }

        clearSessionCookie(response);

        return response.json({
            message: "Déconnexion réussie."
        });

    } catch (error) {
        console.error(error);

        clearSessionCookie(response);

        return response.status(500).json({
            error: "Impossible de se déconnecter."
        });
    }
});

/* =========================================================
   /ME
========================================================= */

app.get("/me", async (request, response) => {
    try {
        const user =
            await getCurrentUser(request);

        if (!user) {
            return response.json({
                loggedIn: false
            });
        }

        return response.json({
            loggedIn: true,
            user: sanitizeUser(user)
        });

    } catch (error) {
        console.error(error);

        return response.status(500).json({
            error: "Impossible de récupérer le compte."
        });
    }
});

/* =========================================================
   PARAMÈTRES - PSEUDO
========================================================= */

app.put(
    "/api/account/username",
    requireAuth,
    async (request, response) => {
        try {
            const username =
                String(
                    request.body?.username || ""
                ).trim();

            if (
                username.length < 2 ||
                username.length > 30
            ) {
                return response.status(400).json({
                    error:
                        "Le pseudo doit contenir entre 2 et 30 caractères."
                });
            }

            await usersCollection().updateOne(
                {
                    _id: request.user._id
                },
                {
                    $set: {
                        username
                    }
                }
            );

            const updatedUser =
                await usersCollection().findOne({
                    _id: request.user._id
                });

            return response.json({
                message: "Pseudo modifié.",
                user: sanitizeUser(updatedUser)
            });

        } catch (error) {
            console.error(
                "Erreur changement pseudo :",
                error
            );

            return response.status(500).json({
                error:
                    "Impossible de modifier le pseudo."
            });
        }
    }
);

/* =========================================================
   PARAMÈTRES - MOT DE PASSE
========================================================= */

app.put(
    "/api/account/password",
    requireAuth,
    async (request, response) => {
        try {
            const password =
                String(
                    request.body?.password || ""
                );

            if (password.length < 6) {
                return response.status(400).json({
                    error:
                        "Le mot de passe doit contenir au moins 6 caractères."
                });
            }

            const passwordData =
                await hashPassword(password);

            await usersCollection().updateOne(
                {
                    _id: request.user._id
                },
                {
                    $set: {
                        passwordHash:
                            passwordData.hash,
                        passwordSalt:
                            passwordData.salt
                    }
                }
            );

            return response.json({
                message:
                    "Mot de passe modifié."
            });

        } catch (error) {
            console.error(
                "Erreur changement mot de passe :",
                error
            );

            return response.status(500).json({
                error:
                    "Impossible de modifier le mot de passe."
            });
        }
    }
);

/* =========================================================
   PARAMÈTRES - SUPPRESSION COMPTE
========================================================= */

app.delete(
    "/api/account",
    requireAuth,
    async (request, response) => {
        try {
            const userId =
                request.user._id;

            await usersCollection().deleteOne({
                _id: userId
            });

            await controlsCollection().deleteMany({
                userId
            });

            await historiesCollection().deleteMany({
                userId
            });

            await statsCollection().deleteMany({
                userId
            });

            await sessionsCollection().deleteMany({
                userId
            });

            clearSessionCookie(response);

            return response.json({
                message:
                    "Compte supprimé définitivement."
            });

        } catch (error) {
            console.error(
                "Erreur suppression compte :",
                error
            );

            return response.status(500).json({
                error:
                    "Impossible de supprimer le compte."
            });
        }
    }
);

/* =========================================================
   CONTRÔLES
========================================================= */

/* GET CONTROLS */

app.get(
    "/api/controls",
    requireAuth,
    async (request, response) => {
        try {
            const controls =
                await controlsCollection()
                    .find({
                        userId:
                            request.user._id
                    })
                    .sort({
                        date: 1
                    })
                    .toArray();

            return response.json(controls);

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de charger les contrôles."
            });
        }
    }
);

/* POST CONTROL */

app.post(
    "/api/controls",
    requireAuth,
    async (request, response) => {
        try {
            const {
                subject,
                chapter,
                date
            } = request.body;

            if (
                !subject ||
                !chapter ||
                !date
            ) {
                return response.status(400).json({
                    error:
                        "Remplis tous les champs."
                });
            }

            const control = {
                userId:
                    request.user._id,

                subject:
                    String(subject).trim(),

                chapter:
                    String(chapter).trim(),

                date:
                    String(date),

                progress: 0,

                createdAt:
                    new Date()
            };

            const result =
                await controlsCollection()
                    .insertOne(control);

            control._id =
                result.insertedId;

            return response.status(201).json({
                control
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible d'ajouter le contrôle."
            });
        }
    }
);

/* PUT CONTROL */

app.put(
    "/api/controls/:id",
    requireAuth,
    async (request, response) => {
        try {
            const id =
                request.params.id;

            if (!isValidObjectId(id)) {
                return response.status(400).json({
                    error:
                        "Identifiant de contrôle invalide."
                });
            }

            const controlId =
                toObjectId(id);

            const control =
                await controlsCollection()
                    .findOne({
                        _id: controlId,
                        userId:
                            request.user._id
                    });

            if (!control) {
                return response.status(404).json({
                    error:
                        "Contrôle introuvable."
                });
            }

            const update = {};

            if (
                request.body.progress !==
                undefined
            ) {
                let progress =
                    Number(
                        request.body.progress
                    );

                if (!Number.isFinite(progress)) {
                    progress = 0;
                }

                progress =
                    Math.max(
                        0,
                        Math.min(
                            100,
                            progress
                        )
                    );

                update.progress =
                    progress;
            }

            if (
                request.body.subject !==
                undefined
            ) {
                update.subject =
                    String(
                        request.body.subject
                    ).trim();
            }

            if (
                request.body.chapter !==
                undefined
            ) {
                update.chapter =
                    String(
                        request.body.chapter
                    ).trim();
            }

            if (
                request.body.date !==
                undefined
            ) {
                update.date =
                    String(
                        request.body.date
                    );
            }

            await controlsCollection()
                .updateOne(
                    {
                        _id: controlId,
                        userId:
                            request.user._id
                    },
                    {
                        $set: update
                    }
                );

            const updated =
                await controlsCollection()
                    .findOne({
                        _id: controlId
                    });

            return response.json({
                control: updated
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de modifier le contrôle."
            });
        }
    }
);

/* DELETE CONTROL */

app.delete(
    "/api/controls/:id",
    requireAuth,
    async (request, response) => {
        try {
            const id =
                request.params.id;

            if (!isValidObjectId(id)) {
                return response.status(400).json({
                    error:
                        "Identifiant de contrôle invalide."
                });
            }

            const result =
                await controlsCollection()
                    .deleteOne({
                        _id:
                            toObjectId(id),

                        userId:
                            request.user._id
                    });

            if (
                result.deletedCount === 0
            ) {
                return response.status(404).json({
                    error:
                        "Contrôle introuvable."
                });
            }

            return response.json({
                message:
                    "Contrôle supprimé."
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de supprimer le contrôle."
            });
        }
    }
);

/* =========================================================
   STATS / SÉRIE
========================================================= */

app.get(
    "/api/stats",
    requireAuth,
    async (request, response) => {
        try {
            let stats =
                await statsCollection()
                    .findOne({
                        userId:
                            request.user._id
                    });

            if (!stats) {
                stats = {
                    userId:
                        request.user._id,
                    streak: 0,
                    bestStreak: 0,
                    lastRevisionDate: null
                };

                await statsCollection()
                    .insertOne(stats);
            }

            return response.json({
                streak:
                    Number(stats.streak) || 0,

                bestStreak:
                    Number(stats.bestStreak) || 0,

                lastRevisionDate:
                    stats.lastRevisionDate ||
                    null
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de charger les statistiques."
            });
        }
    }
);

app.put(
    "/api/stats",
    requireAuth,
    async (request, response) => {
        try {
            let streak =
                Number(
                    request.body?.streak
                );

            let bestStreak =
                Number(
                    request.body?.bestStreak
                );

            if (!Number.isFinite(streak)) {
                streak = 0;
            }

            if (!Number.isFinite(bestStreak)) {
                bestStreak = 0;
            }

            streak =
                Math.max(0, streak);

            bestStreak =
                Math.max(
                    0,
                    bestStreak
                );

            const today =
                new Date()
                    .toISOString()
                    .slice(0, 10);

            await statsCollection()
                .updateOne(
                    {
                        userId:
                            request.user._id
                    },
                    {
                        $set: {
                            streak,
                            bestStreak,
                            lastRevisionDate:
                                today
                        }
                    },
                    {
                        upsert: true
                    }
                );

            await usersCollection()
                .updateOne(
                    {
                        _id:
                            request.user._id
                    },
                    {
                        $set: {
                            lastRevisionDate:
                                today
                        }
                    }
                );

            return response.json({
                streak,
                bestStreak,
                lastRevisionDate:
                    today
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de sauvegarder la série."
            });
        }
    }
);

/* =========================================================
   HISTORIQUE DES FICHES IA
========================================================= */

/* GET HISTORY */

app.get(
    "/api/history",
    requireAuth,
    async (request, response) => {
        try {
            const history =
                await historiesCollection()
                    .find({
                        userId:
                            request.user._id
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

            return response.json(history);

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de charger l'historique."
            });
        }
    }
);

/* POST HISTORY */

app.post(
    "/api/history",
    requireAuth,
    async (request, response) => {
        try {
            const {
                course,
                result
            } = request.body;

            if (
                !course ||
                !result
            ) {
                return response.status(400).json({
                    error:
                        "Données de fiche manquantes."
                });
            }

            const history = {
                userId:
                    request.user._id,

                course:
                    String(course),

                result,

                createdAt:
                    new Date()
            };

            const insertResult =
                await historiesCollection()
                    .insertOne(history);

            history._id =
                insertResult.insertedId;

            return response.status(201).json({
                history
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de sauvegarder la fiche."
            });
        }
    }
);

/* PUT HISTORY */

app.put(
    "/api/history/:id",
    requireAuth,
    async (request, response) => {
        try {
            const id =
                request.params.id;

            if (!isValidObjectId(id)) {
                return response.status(400).json({
                    error:
                        "Identifiant de fiche invalide."
                });
            }

            const historyId =
                toObjectId(id);

            const newName =
                String(
                    request.body?.course || ""
                ).trim();

            if (!newName) {
                return response.status(400).json({
                    error:
                        "Le nom de la fiche est vide."
                });
            }

            const result =
                await historiesCollection()
                    .updateOne(
                        {
                            _id: historyId,
                            userId:
                                request.user._id
                        },
                        {
                            $set: {
                                course:
                                    newName
                            }
                        }
                    );

            if (
                result.matchedCount === 0
            ) {
                return response.status(404).json({
                    error:
                        "Fiche introuvable."
                });
            }

            const history =
                await historiesCollection()
                    .findOne({
                        _id: historyId
                    });

            return response.json({
                history
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de renommer la fiche."
            });
        }
    }
);

/* DELETE HISTORY */

app.delete(
    "/api/history/:id",
    requireAuth,
    async (request, response) => {
        try {
            const id =
                request.params.id;

            if (!isValidObjectId(id)) {
                return response.status(400).json({
                    error:
                        "Identifiant de fiche invalide."
                });
            }

            const result =
                await historiesCollection()
                    .deleteOne({
                        _id:
                            toObjectId(id),

                        userId:
                            request.user._id
                    });

            if (
                result.deletedCount === 0
            ) {
                return response.status(404).json({
                    error:
                        "Fiche introuvable."
                });
            }

            return response.json({
                message:
                    "Fiche supprimée."
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de supprimer la fiche."
            });
        }
    }
);

/* =========================================================
   IA - GÉNÉRATION DE FICHE
========================================================= */

app.post(
    "/generate",
    requireAuth,
    async (request, response) => {
        try {
            if (!openai) {
                return response.status(503).json({
                    error:
                        "L'API OpenAI n'est pas configurée."
                });
            }

            const course =
                String(
                    request.body?.course || ""
                ).trim();

            if (!course) {
                return response.status(400).json({
                    error:
                        "Aucun cours fourni."
                });
            }

            if (course.length > 10000) {
                return response.status(400).json({
                    error:
                        "Le cours dépasse 10 000 caractères."
                });
            }

            const completion =
                await openai.chat.completions.create({
                    model:
                        process.env.OPENAI_MODEL ||
                        "gpt-4.1-mini",

                    response_format: {
                        type: "json_object"
                    },

                    messages: [
                        {
                            role: "system",
                            content:
                                `Tu es l'assistant de révision de Cap Contrôle.

À partir du cours fourni, crée une fiche de révision claire, fidèle au cours et adaptée à un lycéen.

Réponds UNIQUEMENT avec un objet JSON valide ayant exactement cette structure :

{
  "summary": "Résumé clair et court du cours",
  "keyPoints": [
    "Notion clé 1",
    "Notion clé 2",
    "Notion clé 3"
  ],
  "quiz": [
    {
      "question": "Question",
      "answer": "Réponse"
    }
  ]
}

Ne mets aucun Markdown autour du JSON.
Ne crée pas d'informations qui ne sont pas présentes ou déductibles du cours.
Le quiz doit permettre de réviser les notions importantes.`
                        },
                        {
                            role: "user",
                            content:
                                course
                        }
                    ]
                });

            const content =
                completion
                    .choices?.[0]
                    ?.message
                    ?.content;

            if (!content) {
                return response.status(500).json({
                    error:
                        "L'IA n'a renvoyé aucun résultat."
                });
            }

            let result;

            try {
                result =
                    JSON.parse(content);
            } catch {
                console.error(
                    "Réponse IA non JSON :",
                    content
                );

                return response.status(500).json({
                    error:
                        "La réponse de l'IA est invalide."
                });
            }

            return response.json(result);

        } catch (error) {
            console.error(
                "Erreur OpenAI :",
                error
            );

            if (
                error?.status === 429
            ) {
                return response.status(429).json({
                    error:
                        "Quota OpenAI dépassé ou trop de requêtes."
                });
            }

            return response.status(500).json({
                error:
                    "Erreur lors de la génération de la fiche."
            });
        }
    }
);

/* =========================================================
   PARTAGE DE FICHES
========================================================= */

function generateShareCode() {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code +=
            chars[
                crypto.randomInt(
                    0,
                    chars.length
                )
            ];
    }

    return code;
}

/* POST SHARE */

app.post(
    "/share",
    requireAuth,
    async (request, response) => {
        try {
            const historyId =
                request.body?.historyId;

            if (
                !historyId ||
                !isValidObjectId(historyId)
            ) {
                return response.status(400).json({
                    error:
                        "Identifiant de fiche invalide."
                });
            }

            const history =
                await historiesCollection()
                    .findOne({
                        _id:
                            toObjectId(historyId),

                        userId:
                            request.user._id
                    });

            if (!history) {
                return response.status(404).json({
                    error:
                        "Fiche introuvable."
                });
            }

            let code;
            let exists = true;

            while (exists) {
                code =
                    generateShareCode();

                exists =
                    !!(
                        await sharedSheetsCollection()
                            .findOne({
                                code
                            })
                    );
            }

            await sharedSheetsCollection()
                .insertOne({
                    code,
                    course:
                        history.course,
                    result:
                        history.result,
                    createdAt:
                        new Date()
                });

            return response.json({
                code
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de partager la fiche."
            });
        }
    }
);

/* GET SHARE */

app.get(
    "/share/:code",
    requireAuth,
    async (request, response) => {
        try {
            const code =
                String(
                    request.params.code || ""
                )
                    .trim()
                    .toUpperCase();

            if (!code) {
                return response.status(400).json({
                    error:
                        "Code invalide."
                });
            }

            const sheet =
                await sharedSheetsCollection()
                    .findOne({
                        code
                    });

            if (!sheet) {
                return response.status(404).json({
                    error:
                        "Code de partage invalide ou inexistant."
                });
            }

            return response.json({
                course:
                    sheet.course,

                result:
                    sheet.result
            });

        } catch (error) {
            console.error(error);

            return response.status(500).json({
                error:
                    "Impossible de récupérer la fiche."
            });
        }
    }
);

/* =========================================================
   FICHIERS DU SITE
========================================================= */

app.use(
    express.static(__dirname, {
        index: "index.html"
    })
);

/* =========================================================
   404 API
========================================================= */

app.use(
    (request, response, next) => {
        if (
            request.path.startsWith("/api/") ||
            request.path === "/login" ||
            request.path === "/register" ||
            request.path === "/logout" ||
            request.path === "/me" ||
            request.path === "/generate" ||
            request.path === "/share"
        ) {
            return response.status(404).json({
                error: "Route introuvable."
            });
        }

        next();
    }
);

/* =========================================================
   ERREURS
========================================================= */

app.use(
    (error, request, response, next) => {
        console.error(
            "Erreur serveur :",
            error
        );

        if (response.headersSent) {
            return next(error);
        }

        return response.status(500).json({
            error:
                "Erreur interne du serveur."
        });
    }
);

/* =========================================================
   DÉMARRAGE
========================================================= */

async function startServer() {
    try {
        await connectDatabase();

        app.listen(
            PORT,
            "0.0.0.0",
            () => {
                console.log(
                    `🚀 Cap Contrôle lancé sur le port ${PORT}`
                );
            }
        );
    } catch (error) {
        console.error(
            "❌ Impossible de démarrer le serveur :",
            error
        );

        process.exit(1);
    }
}

startServer();

/* =========================================================
   ARRÊT PROPRE
========================================================= */

async function shutdown() {
    console.log(
        "Arrêt du serveur..."
    );

    try {
        await mongoClient.close();
    } catch (error) {
        console.error(error);
    }

    process.exit(0);
}

process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);
