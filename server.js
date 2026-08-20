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

app.use(express.json({ limit: "2mb" }));

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.static(__dirname));

/* =========================================================
   MONGODB
========================================================= */

const mongoUrl = process.env.MONGODB_URI;

if (!mongoUrl) {
    console.error("❌ MONGODB_URI est manquant dans les variables d'environnement.");
    process.exit(1);
}

const mongoClient = new MongoClient(mongoUrl);

let db;
let usersCollection;
let controlsCollection;
let historyCollection;
let sharesCollection;

async function connectMongoDB() {
    await mongoClient.connect();

    db = mongoClient.db(
        process.env.MONGODB_DB || "capcontrole"
    );

    usersCollection = db.collection("users");
    controlsCollection = db.collection("controls");
    historyCollection = db.collection("history");
    sharesCollection = db.collection("shares");

    await usersCollection.createIndex(
        { email: 1 },
        { unique: true }
    );

    await controlsCollection.createIndex({
        userId: 1
    });

    await historyCollection.createIndex({
        userId: 1
    });

    await sharesCollection.createIndex(
        { code: 1 },
        { unique: true }
    );

    console.log("✅ MongoDB connecté");
}

/* =========================================================
   OPENAI
========================================================= */

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
      })
    : null;

/* =========================================================
   SESSIONS
========================================================= */

const sessions = new Map();

function createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");

    sessions.set(token, {
        userId: String(userId),
        createdAt: Date.now()
    });

    return token;
}

function getSessionUserId(req) {
    const token = req.headers.cookie
        ?.split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("session="))
        ?.split("=")[1];

    if (!token) {
        return null;
    }

    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    return session.userId;
}

function setSessionCookie(res, token) {
    res.setHeader(
        "Set-Cookie",
        `session=${token}; HttpOnly; Path=/; SameSite=Lax`
    );
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
    );
}

/* =========================================================
   AUTHENTIFICATION
========================================================= */

function requireAuth(req, res, next) {
    const userId = getSessionUserId(req);

    if (!userId) {
        return res.status(401).json({
            error: "Tu dois être connecté."
        });
    }

    req.userId = userId;

    next();
}

/* =========================================================
   MOT DE PASSE
========================================================= */

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
}

/* =========================================================
   ROUTE PRINCIPALE
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});

/* =========================================================
   INSCRIPTION
========================================================= */

app.post("/register", async (req, res) => {
    try {
        const {
            username,
            email,
            password
        } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: "Tous les champs sont obligatoires."
            });
        }

        if (username.trim().length < 2) {
            return res.status(400).json({
                error: "Le pseudo doit contenir au moins 2 caractères."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Le mot de passe doit contenir au moins 6 caractères."
            });
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const existingUser =
            await usersCollection.findOne({
                email: normalizedEmail
            });

        if (existingUser) {
            return res.status(409).json({
                error: "Cette adresse e-mail est déjà utilisée."
            });
        }

        const user = {
            username: username.trim(),
            email: normalizedEmail,
            password: hashPassword(password),
            streak: 0,
            bestStreak: 0,
            lastRevisionDate: null,
            createdAt: new Date()
        };

        const result =
            await usersCollection.insertOne(user);

        const token =
            createSession(result.insertedId);

        setSessionCookie(res, token);

        res.status(201).json({
            message: "Compte créé.",
            user: {
                _id: result.insertedId,
                username: user.username,
                email: user.email,
                streak: 0,
                bestStreak: 0
            }
        });
    } catch (error) {
        console.error(
            "Erreur inscription :",
            error
        );

        res.status(500).json({
            error: "Erreur lors de la création du compte."
        });
    }
});

/* =========================================================
   CONNEXION
========================================================= */

app.post("/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Remplis tous les champs."
            });
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const user =
            await usersCollection.findOne({
                email: normalizedEmail
            });

        if (!user) {
            return res.status(401).json({
                error: "Adresse e-mail ou mot de passe incorrect."
            });
        }

        const passwordHash =
            hashPassword(password);

        if (user.password !== passwordHash) {
            return res.status(401).json({
                error: "Adresse e-mail ou mot de passe incorrect."
            });
        }

        const token =
            createSession(user._id);

        setSessionCookie(res, token);

        res.json({
            message: "Connexion réussie.",
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                streak: user.streak || 0,
                bestStreak: user.bestStreak || 0
            }
        });
    } catch (error) {
        console.error(
            "Erreur connexion :",
            error
        );

        res.status(500).json({
            error: "Erreur lors de la connexion."
        });
    }
});

/* =========================================================
   DÉCONNEXION
========================================================= */

app.post("/logout", (req, res) => {
    const token = req.headers.cookie
        ?.split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("session="))
        ?.split("=")[1];

    if (token) {
        sessions.delete(token);
    }

    clearSessionCookie(res);

    res.json({
        message: "Déconnexion réussie."
    });
});

/* =========================================================
   UTILISATEUR CONNECTÉ
========================================================= */

app.get("/me", async (req, res) => {
    try {
        const userId =
            getSessionUserId(req);

        if (!userId) {
            return res.json({
                loggedIn: false
            });
        }

        const user =
            await usersCollection.findOne({
                _id: new ObjectId(userId)
            });

        if (!user) {
            return res.json({
                loggedIn: false
            });
        }

        res.json({
            loggedIn: true,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                streak: user.streak || 0,
                bestStreak: user.bestStreak || 0,
                lastRevisionDate:
                    user.lastRevisionDate || null
            }
        });
    } catch (error) {
        console.error(
            "Erreur /me :",
            error
        );

        res.status(500).json({
            error: "Erreur serveur."
        });
    }
});

/* =========================================================
   CONTRÔLES
========================================================= */

app.get(
    "/api/controls",
    requireAuth,
    async (req, res) => {
        try {
            const controls =
                await controlsCollection
                    .find({
                        userId: new ObjectId(req.userId)
                    })
                    .sort({
                        date: 1
                    })
                    .toArray();

            res.json(controls);
        } catch (error) {
            console.error(
                "Erreur chargement contrôles :",
                error
            );

            res.status(500).json({
                error: "Impossible de charger les contrôles."
            });
        }
    }
);

app.post(
    "/api/controls",
    requireAuth,
    async (req, res) => {
        try {
            const {
                subject,
                chapter,
                date
            } = req.body;

            if (!subject || !chapter || !date) {
                return res.status(400).json({
                    error: "Tous les champs sont obligatoires."
                });
            }

            const control = {
                userId: new ObjectId(req.userId),
                subject: String(subject).trim(),
                chapter: String(chapter).trim(),
                date: String(date),
                progress: 0,
                createdAt: new Date()
            };

            const result =
                await controlsCollection.insertOne(
                    control
                );

            control._id = result.insertedId;

            res.status(201).json({
                control
            });
        } catch (error) {
            console.error(
                "Erreur ajout contrôle :",
                error
            );

            res.status(500).json({
                error: "Impossible d'ajouter le contrôle."
            });
        }
    }
);

app.put(
    "/api/controls/:id",
    requireAuth,
    async (req, res) => {
        try {
            const id =
                req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "ID invalide."
                });
            }

            const control =
                await controlsCollection.findOne({
                    _id: new ObjectId(id),
                    userId: new ObjectId(req.userId)
                });

            if (!control) {
                return res.status(404).json({
                    error: "Contrôle introuvable."
                });
            }

            const update = {};

            if (
                req.body.progress !== undefined
            ) {
                let progress =
                    Number(req.body.progress);

                if (!Number.isFinite(progress)) {
                    progress = 0;
                }

                progress =
                    Math.max(
                        0,
                        Math.min(100, progress)
                    );

                update.progress = progress;
            }

            if (req.body.subject !== undefined) {
                update.subject =
                    String(req.body.subject).trim();
            }

            if (req.body.chapter !== undefined) {
                update.chapter =
                    String(req.body.chapter).trim();
            }

            if (req.body.date !== undefined) {
                update.date =
                    String(req.body.date);
            }

            await controlsCollection.updateOne(
                {
                    _id: new ObjectId(id),
                    userId: new ObjectId(req.userId)
                },
                {
                    $set: update
                }
            );

            const updated =
                await controlsCollection.findOne({
                    _id: new ObjectId(id)
                });

            res.json({
                control: updated
            });
        } catch (error) {
            console.error(
                "Erreur modification contrôle :",
                error
            );

            res.status(500).json({
                error: "Impossible de modifier le contrôle."
            });
        }
    }
);

app.delete(
    "/api/controls/:id",
    requireAuth,
    async (req, res) => {
        try {
            const id =
                req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "ID invalide."
                });
            }

            const result =
                await controlsCollection.deleteOne({
                    _id: new ObjectId(id),
                    userId: new ObjectId(req.userId)
                });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    error: "Contrôle introuvable."
                });
            }

            res.json({
                message: "Contrôle supprimé."
            });
        } catch (error) {
            console.error(
                "Erreur suppression contrôle :",
                error
            );

            res.status(500).json({
                error: "Impossible de supprimer le contrôle."
            });
        }
    }
);

/* =========================================================
   STATISTIQUES
========================================================= */

app.get(
    "/api/stats",
    requireAuth,
    async (req, res) => {
        try {
            const user =
                await usersCollection.findOne({
                    _id: new ObjectId(req.userId)
                });

            res.json({
                streak: user?.streak || 0,
                bestStreak:
                    user?.bestStreak || 0
            });
        } catch (error) {
            console.error(
                "Erreur stats :",
                error
            );

            res.status(500).json({
                error: "Impossible de charger les statistiques."
            });
        }
    }
);

app.put(
    "/api/stats",
    requireAuth,
    async (req, res) => {
        try {
            let streak =
                Number(req.body.streak) || 0;

            let bestStreak =
                Number(req.body.bestStreak) || 0;

            streak =
                Math.max(0, streak);

            bestStreak =
                Math.max(0, bestStreak);

            await usersCollection.updateOne(
                {
                    _id: new ObjectId(req.userId)
                },
                {
                    $set: {
                        streak,
                        bestStreak
                    }
                }
            );

            res.json({
                streak,
                bestStreak
            });
        } catch (error) {
            console.error(
                "Erreur sauvegarde stats :",
                error
            );

            res.status(500).json({
                error: "Impossible de sauvegarder les statistiques."
            });
        }
    }
);

/* =========================================================
   HISTORIQUE DES FICHES
========================================================= */

app.get(
    "/api/history",
    requireAuth,
    async (req, res) => {
        try {
            const history =
                await historyCollection
                    .find({
                        userId: new ObjectId(req.userId)
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

            res.json(history);
        } catch (error) {
            console.error(
                "Erreur historique :",
                error
            );

            res.status(500).json({
                error: "Impossible de charger l'historique."
            });
        }
    }
);

app.post(
    "/api/history",
    requireAuth,
    async (req, res) => {
        try {
            const {
                course,
                result
            } = req.body;

            if (!course || !result) {
                return res.status(400).json({
                    error: "Données de fiche manquantes."
                });
            }

            const historyItem = {
                userId: new ObjectId(req.userId),
                course: String(course).trim(),
                result,
                createdAt: new Date()
            };

            const insertResult =
                await historyCollection.insertOne(
                    historyItem
                );

            historyItem._id =
                insertResult.insertedId;

            res.status(201).json({
                history: historyItem
            });
        } catch (error) {
            console.error(
                "Erreur sauvegarde historique :",
                error
            );

            res.status(500).json({
                error: "Impossible de sauvegarder la fiche."
            });
        }
    }
);

app.put(
    "/api/history/:id",
    requireAuth,
    async (req, res) => {
        try {
            const id =
                req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "ID invalide."
                });
            }

            const newCourse =
                String(
                    req.body.course || ""
                ).trim();

            if (!newCourse) {
                return res.status(400).json({
                    error: "Le nom de la fiche est vide."
                });
            }

            const result =
                await historyCollection.updateOne(
                    {
                        _id: new ObjectId(id),
                        userId: new ObjectId(req.userId)
                    },
                    {
                        $set: {
                            course: newCourse
                        }
                    }
                );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    error: "Fiche introuvable."
                });
            }

            const history =
                await historyCollection.findOne({
                    _id: new ObjectId(id)
                });

            res.json({
                history
            });
        } catch (error) {
            console.error(
                "Erreur renommage fiche :",
                error
            );

            res.status(500).json({
                error: "Impossible de renommer la fiche."
            });
        }
    }
);

app.delete(
    "/api/history/:id",
    requireAuth,
    async (req, res) => {
        try {
            const id =
                req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "ID invalide."
                });
            }

            const result =
                await historyCollection.deleteOne({
                    _id: new ObjectId(id),
                    userId: new ObjectId(req.userId)
                });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    error: "Fiche introuvable."
                });
            }

            res.json({
                message: "Fiche supprimée."
            });
        } catch (error) {
            console.error(
                "Erreur suppression fiche :",
                error
            );

            res.status(500).json({
                error: "Impossible de supprimer la fiche."
            });
        }
    }
);

/* =========================================================
   GÉNÉRATION IA
========================================================= */

app.post(
    "/generate",
    requireAuth,
    async (req, res) => {
        try {
            const {
                course
            } = req.body;

            if (!course || !String(course).trim()) {
                return res.status(400).json({
                    error: "Aucun cours fourni."
                });
            }

            if (String(course).length > 10000) {
                return res.status(400).json({
                    error: "Le cours dépasse 10 000 caractères."
                });
            }

            if (!openai) {
                return res.status(500).json({
                    error: "La clé API OpenAI n'est pas configurée."
                });
            }

            const response =
                await openai.responses.create({
                    model:
                        process.env.OPENAI_MODEL ||
                        "gpt-4.1-mini",

                    input: [
                        {
                            role: "system",
                            content:
                                "Tu es un assistant scolaire français. " +
                                "Transforme le cours fourni en fiche de révision claire, " +
                                "courte et adaptée à un lycéen. " +
                                "Retourne UNIQUEMENT un JSON valide avec exactement " +
                                "les propriétés summary, keyPoints et quiz. " +
                                "summary doit être une chaîne. " +
                                "keyPoints doit être un tableau de chaînes. " +
                                "quiz doit être un tableau d'objets contenant question et answer."
                        },
                        {
                            role: "user",
                            content:
                                String(course)
                        }
                    ]
                });

            let text =
                response.output_text;

            if (!text) {
                throw new Error(
                    "Aucune réponse de l'IA."
                );
            }

            text = text.trim();

            if (
                text.startsWith("```json")
            ) {
                text =
                    text
                        .replace(/^```json/, "")
                        .replace(/```$/, "")
                        .trim();
            }

            if (
                text.startsWith("```")
            ) {
                text =
                    text
                        .replace(/^```/, "")
                        .replace(/```$/, "")
                        .trim();
            }

            let result;

            try {
                result =
                    JSON.parse(text);
            } catch {
                console.error(
                    "Réponse IA non JSON :",
                    text
                );

                return res.status(500).json({
                    error:
                        "La réponse de l'IA n'est pas valide."
                });
            }

            if (
                typeof result.summary !== "string"
            ) {
                result.summary = "";
            }

            if (
                !Array.isArray(
                    result.keyPoints
                )
            ) {
                result.keyPoints = [];
            }

            if (
                !Array.isArray(
                    result.quiz
                )
            ) {
                result.quiz = [];
            }

            res.json(result);
        } catch (error) {
            console.error(
                "Erreur génération IA :",
                error
            );

            res.status(500).json({
                error:
                    error.message ||
                    "Erreur lors de la génération de la fiche."
            });
        }
    }
);

/* =========================================================
   PARTAGE DE FICHES
========================================================= */

function generateShareCode() {
    return crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase();
}

app.post(
    "/share",
    requireAuth,
    async (req, res) => {
        try {
            const {
                historyId
            } = req.body;

            if (
                !historyId ||
                !ObjectId.isValid(historyId)
            ) {
                return res.status(400).json({
                    error: "Fiche invalide."
                });
            }

            const historyItem =
                await historyCollection.findOne({
                    _id: new ObjectId(historyId),
                    userId: new ObjectId(req.userId)
                });

            if (!historyItem) {
                return res.status(404).json({
                    error: "Fiche introuvable."
                });
            }

            let code;
            let exists = true;

            while (exists) {
                code =
                    generateShareCode();

                exists =
                    !!(await sharesCollection.findOne({
                        code
                    }));
            }

            await sharesCollection.insertOne({
                code,
                course: historyItem.course,
                result: historyItem.result,
                userId: new ObjectId(req.userId),
                createdAt: new Date()
            });

            res.json({
                code
            });
        } catch (error) {
            console.error(
                "Erreur partage :",
                error
            );

            res.status(500).json({
                error: "Impossible de partager la fiche."
            });
        }
    }
);

app.get(
    "/share/:code",
    requireAuth,
    async (req, res) => {
        try {
            const code =
                String(
                    req.params.code || ""
                )
                    .trim()
                    .toUpperCase();

            if (!code) {
                return res.status(400).json({
                    error: "Code invalide."
                });
            }

            const share =
                await sharesCollection.findOne({
                    code
                });

            if (!share) {
                return res.status(404).json({
                    error: "Code de partage invalide ou expiré."
                });
            }

            res.json({
                course: share.course,
                result: share.result
            });
        } catch (error) {
            console.error(
                "Erreur import partage :",
                error
            );

            res.status(500).json({
                error: "Impossible de récupérer la fiche."
            });
        }
    }
);

/* =========================================================
   MODIFICATION DU PSEUDO
========================================================= */

app.put(
    "/api/profile/username",
    requireAuth,
    async (req, res) => {
        try {
            const username =
                String(
                    req.body.username || ""
                ).trim();

            if (username.length < 2) {
                return res.status(400).json({
                    error:
                        "Le pseudo doit contenir au moins 2 caractères."
                });
            }

            await usersCollection.updateOne(
                {
                    _id: new ObjectId(req.userId)
                },
                {
                    $set: {
                        username
                    }
                }
            );

            const user =
                await usersCollection.findOne({
                    _id: new ObjectId(req.userId)
                });

            res.json({
                user: {
                    _id: user._id,
                    username: user.username,
                    email: user.email
                }
            });
        } catch (error) {
            console.error(
                "Erreur modification pseudo :",
                error
            );

            res.status(500).json({
                error:
                    "Impossible de modifier le pseudo."
            });
        }
    }
);

/* =========================================================
   MODIFICATION MOT DE PASSE
========================================================= */

app.put(
    "/api/profile/password",
    requireAuth,
    async (req, res) => {
        try {
            const {
                password
            } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({
                    error:
                        "Le mot de passe doit contenir au moins 6 caractères."
                });
            }

            await usersCollection.updateOne(
                {
                    _id: new ObjectId(req.userId)
                },
                {
                    $set: {
                        password:
                            hashPassword(password)
                    }
                }
            );

            res.json({
                message:
                    "Mot de passe modifié."
            });
        } catch (error) {
            console.error(
                "Erreur modification mot de passe :",
                error
            );

            res.status(500).json({
                error:
                    "Impossible de modifier le mot de passe."
            });
        }
    }
);

/* =========================================================
   SUPPRESSION DU COMPTE
========================================================= */

app.delete(
    "/api/account",
    requireAuth,
    async (req, res) => {
        try {
            const userId =
                new ObjectId(req.userId);

            await controlsCollection.deleteMany({
                userId
            });

            await historyCollection.deleteMany({
                userId
            });

            await sharesCollection.deleteMany({
                userId
            });

            await usersCollection.deleteOne({
                _id: userId
            });

            const token =
                req.headers.cookie
                    ?.split(";")
                    .map(cookie => cookie.trim())
                    .find(cookie =>
                        cookie.startsWith(
                            "session="
                        )
                    )
                    ?.split("=")[1];

            if (token) {
                sessions.delete(token);
            }

            clearSessionCookie(res);

            res.json({
                message:
                    "Compte supprimé."
            });
        } catch (error) {
            console.error(
                "Erreur suppression compte :",
                error
            );

            res.status(500).json({
                error:
                    "Impossible de supprimer le compte."
            });
        }
    }
);

/* =========================================================
   404 API
========================================================= */

app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            error: "Route API introuvable."
        });
    }
);

/* =========================================================
   DÉMARRAGE
========================================================= */

async function startServer() {
    try {
        await connectMongoDB();

        app.listen(
            PORT,
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
