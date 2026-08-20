import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/* ================================================= */
/*                    CONFIGURATION                  */
/* ================================================= */

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI est manquant.");
    process.exit(1);
}

if (!OPENAI_API_KEY) {
    console.warn(
        "⚠️ OPENAI_API_KEY est manquant. La génération IA ne fonctionnera pas."
    );
}


/* ================================================= */
/*                    MONGODB                        */
/* ================================================= */

const client = new MongoClient(MONGODB_URI);

let db;


/* ================================================= */
/*                    EXPRESS                        */
/* ================================================= */

const app = express();

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    cors({
        origin: true,
        credentials: true
    })
);


/* ================================================= */
/*                 FICHIERS DU SITE                  */
/* ================================================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

app.use(
    express.static(__dirname)
);


/* ================================================= */
/*                     OPENAI                        */
/* ================================================= */

const openai = OPENAI_API_KEY
    ? new OpenAI({
        apiKey: OPENAI_API_KEY
    })
    : null;


/* ================================================= */
/*                 UTILITAIRES                       */
/* ================================================= */


/* ================================================= */
/*              MOTS DE PASSE                        */
/* ================================================= */

function hashPassword(password) {

    return new Promise(
        (resolve, reject) => {

            const salt =
                crypto.randomBytes(16);

            crypto.scrypt(
                password,
                salt,
                64,
                (error, derivedKey) => {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(
                        `${salt.toString("hex")}:${derivedKey.toString("hex")}`
                    );

                }
            );

        }
    );
}


function verifyPassword(
    password,
    storedHash
) {

    return new Promise(
        (resolve, reject) => {

            try {

                const parts =
                    storedHash.split(":");

                if (parts.length !== 2) {
                    resolve(false);
                    return;
                }

                const salt =
                    Buffer.from(
                        parts[0],
                        "hex"
                    );

                const originalHash =
                    Buffer.from(
                        parts[1],
                        "hex"
                    );

                crypto.scrypt(
                    password,
                    salt,
                    64,
                    (error, derivedKey) => {

                        if (error) {
                            reject(error);
                            return;
                        }

                        if (
                            originalHash.length !==
                            derivedKey.length
                        ) {

                            resolve(false);
                            return;

                        }

                        resolve(
                            crypto.timingSafeEqual(
                                originalHash,
                                derivedKey
                            )
                        );

                    }
                );

            } catch {
                resolve(false);
            }

        }
    );
}


/* ================================================= */
/*                    SESSIONS                       */
/* ================================================= */

function createSessionToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function hashSessionToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


/* ================================================= */
/*                COOKIES SESSION                    */
/* ================================================= */

function getSessionToken(req) {

    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader
            .split(";")
            .map(
                cookie =>
                    cookie.trim()
            );

    const sessionCookie =
        cookies.find(
            cookie =>
                cookie.startsWith(
                    "capcontrole_session="
                )
        );

    if (!sessionCookie) {
        return null;
    }

    try {

        return decodeURIComponent(
            sessionCookie.substring(
                "capcontrole_session=".length
            )
        );

    } catch {

        return null;

    }
}


function setSessionCookie(
    res,
    token
) {

    const isProduction =
        process.env.NODE_ENV === "production";

    const cookie = [
        `capcontrole_session=${encodeURIComponent(token)}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=2592000"
    ];

    if (isProduction) {
        cookie.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookie.join("; ")
    );
}


function clearSessionCookie(res) {

    const isProduction =
        process.env.NODE_ENV === "production";

    const cookie = [
        "capcontrole_session=",
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=0"
    ];

    if (isProduction) {
        cookie.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookie.join("; ")
    );
}


/* ================================================= */
/*             UTILISATEUR CONNECTÉ                  */
/* ================================================= */

async function getCurrentUser(req) {

    if (!db) {
        return null;
    }

    const token =
        getSessionToken(req);

    if (!token) {
        return null;
    }

    const tokenHash =
        hashSessionToken(token);

    const session =
        await db
            .collection("sessions")
            .findOne({
                tokenHash
            });

    if (!session) {
        return null;
    }

    if (
        !session.expiresAt ||
        session.expiresAt <= new Date()
    ) {

        await db
            .collection("sessions")
            .deleteOne({
                _id:
                    session._id
            });

        return null;
    }

    const user =
        await db
            .collection("users")
            .findOne({
                _id:
                    session.userId
            });

    if (!user) {

        await db
            .collection("sessions")
            .deleteOne({
                _id:
                    session._id
            });

        return null;
    }

    return user;
}


/* ================================================= */
/*                  ROUTE DE TEST                    */
/* ================================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            success: true,
            server: "Cap Contrôle",
            database: !!db
        });

    }
);


/* ================================================= */
/*                    INSCRIPTION                    */
/* ================================================= */

app.post(
    "/register",
    async (req, res) => {

        try {

            const {
                username,
                email,
                password
            } = req.body;

            if (
                typeof username !== "string" ||
                typeof email !== "string" ||
                typeof password !== "string"
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Tous les champs sont obligatoires."
                });

            }

            const cleanUsername =
                username.trim();

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            if (
                cleanUsername.length < 3
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Le pseudo doit contenir au moins 3 caractères."
                });

            }

            if (
                cleanUsername.length > 30
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Le pseudo est trop long."
                });

            }

            if (
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                    .test(cleanEmail)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Adresse e-mail invalide."
                });

            }

            if (
                password.length < 8
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Le mot de passe doit contenir au moins 8 caractères."
                });

            }

            const users =
                db.collection("users");


            /* Vérification e-mail */

            const existingEmail =
                await users.findOne({
                    email:
                        cleanEmail
                });

            if (existingEmail) {

                return res.status(409).json({
                    success: false,
                    error:
                        "Cette adresse e-mail est déjà utilisée."
                });

            }


            /* Vérification pseudo */

            const existingUsername =
                await users.findOne({
                    usernameLower:
                        cleanUsername.toLowerCase()
                });

            if (existingUsername) {

                return res.status(409).json({
                    success: false,
                    error:
                        "Ce pseudo est déjà utilisé."
                });

            }


            /* Hash */

            const passwordHash =
                await hashPassword(
                    password
                );


            /* Création */

            const user = {

                username:
                    cleanUsername,

                usernameLower:
                    cleanUsername.toLowerCase(),

                email:
                    cleanEmail,

                passwordHash,

                streak:
                    0,

                bestStreak:
                    0,

                createdAt:
                    new Date()

            };

            const result =
                await users.insertOne(
                    user
                );


            /* Session */

            const token =
                createSessionToken();

            const tokenHash =
                hashSessionToken(
                    token
                );

            await db
                .collection("sessions")
                .insertOne({

                    tokenHash,

                    userId:
                        result.insertedId,

                    createdAt:
                        new Date(),

                    expiresAt:
                        new Date(
                            Date.now()
                            +
                            30 *
                            24 *
                            60 *
                            60 *
                            1000
                        )

                });


            setSessionCookie(
                res,
                token
            );


            return res.json({

                success:
                    true,

                user: {

                    id:
                        result.insertedId,

                    username:
                        cleanUsername,

                    email:
                        cleanEmail

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur inscription :",
                error
            );

            if (
                error.code === 11000
            ) {

                return res.status(409).json({
                    success: false,
                    error:
                        "Cet e-mail ou ce pseudo est déjà utilisé."
                });

            }

            return res.status(500).json({

                success:
                    false,

                error:
                    "Erreur serveur."

            });

        }

    }
);


/* ================================================= */
/*                     CONNEXION                     */
/* ================================================= */

app.post(
    "/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;

            if (
                typeof email !== "string" ||
                typeof password !== "string"
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "E-mail et mot de passe obligatoires."
                });

            }

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            const user =
                await db
                    .collection("users")
                    .findOne({
                        email:
                            cleanEmail
                    });

            if (!user) {

                return res.status(401).json({
                    success: false,
                    error:
                        "E-mail ou mot de passe incorrect."
                });

            }

            const valid =
                await verifyPassword(
                    password,
                    user.passwordHash
                );

            if (!valid) {

                return res.status(401).json({
                    success: false,
                    error:
                        "E-mail ou mot de passe incorrect."
                });

            }


            /* Nouvelle session */

            const token =
                createSessionToken();

            const tokenHash =
                hashSessionToken(
                    token
                );

            await db
                .collection("sessions")
                .insertOne({

                    tokenHash,

                    userId:
                        user._id,

                    createdAt:
                        new Date(),

                    expiresAt:
                        new Date(
                            Date.now()
                            +
                            30 *
                            24 *
                            60 *
                            60 *
                            1000
                        )

                });


            setSessionCookie(
                res,
                token
            );


            return res.json({

                success:
                    true,

                user: {

                    id:
                        user._id,

                    username:
                        user.username,

                    email:
                        user.email

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur connexion :",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Erreur serveur."

            });

        }

    }
);


/* ================================================= */
/*                       /ME                         */
/* ================================================= */

app.get(
    "/me",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.json({
                    loggedIn: false
                });

            }

            return res.json({

                loggedIn:
                    true,

                user: {

                    id:
                        user._id,

                    username:
                        user.username,

                    email:
                        user.email

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur /me :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                    DÉCONNEXION                    */
/* ================================================= */

app.post(
    "/logout",
    async (req, res) => {

        try {

            const token =
                getSessionToken(req);

            if (token) {

                const tokenHash =
                    hashSessionToken(
                        token
                    );

                await db
                    .collection("sessions")
                    .deleteOne({
                        tokenHash
                    });

            }

            clearSessionCookie(res);

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "❌ Erreur déconnexion :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                    STATISTIQUES                   */
/* ================================================= */

app.get(
    "/api/stats",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            return res.json({

                streak:
                    Number(user.streak) || 0,

                bestStreak:
                    Number(user.bestStreak) || 0

            });

        } catch (error) {

            console.error(
                "❌ Erreur statistiques :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


app.put(
    "/api/stats",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const streak =
                Number(req.body.streak);

            const bestStreak =
                Number(req.body.bestStreak);

            if (
                !Number.isFinite(streak) ||
                !Number.isFinite(bestStreak) ||
                streak < 0 ||
                bestStreak < 0
            ) {

                return res.status(400).json({
                    error:
                        "Statistiques invalides."
                });

            }

            await db
                .collection("users")
                .updateOne(
                    {
                        _id:
                            user._id
                    },
                    {
                        $set: {

                            streak:
                                Math.floor(streak),

                            bestStreak:
                                Math.floor(bestStreak)

                        }
                    }
                );

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "❌ Erreur sauvegarde statistiques :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                    HISTORIQUE                     */
/* ================================================= */

app.get(
    "/api/history",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const history =
                await db
                    .collection("history")
                    .find({
                        userId:
                            user._id
                    })
                    .sort({
                        createdAt:
                            -1
                    })
                    .toArray();

            return res.json(
                history
            );

        } catch (error) {

            console.error(
                "❌ Erreur récupération historique :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


app.post(
    "/api/history",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const course =
                typeof req.body.course === "string"
                    ? req.body.course.trim()
                    : "";

            const result =
                req.body.result;

            if (
                !course ||
                result === undefined ||
                result === null
            ) {

                return res.status(400).json({
                    error:
                        "Données invalides."
                });

            }

            const now =
                new Date();

            const historyItem = {

                userId:
                    user._id,

                course,

                result,

                date:
                    now.toLocaleString(
                        "fr-FR"
                    ),

                createdAt:
                    now

            };

            const inserted =
                await db
                    .collection("history")
                    .insertOne(
                        historyItem
                    );

            return res.json({

                success:
                    true,

                history: {

                    _id:
                        inserted.insertedId,

                    ...historyItem

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur ajout historique :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                 RENOMMER UNE FICHE                */
/* ================================================= */

app.put(
    "/api/history/:id",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            if (
                !ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    error:
                        "Identifiant invalide."
                });

            }

            const course =
                typeof req.body.course === "string"
                    ? req.body.course.trim()
                    : "";

            if (!course) {

                return res.status(400).json({
                    error:
                        "Nom de fiche invalide."
                });

            }

            const result =
                await db
                    .collection("history")
                    .updateOne(
                        {
                            _id:
                                new ObjectId(
                                    req.params.id
                                ),

                            userId:
                                user._id
                        },
                        {
                            $set: {
                                course
                            }
                        }
                    );

            if (
                result.matchedCount === 0
            ) {

                return res.status(404).json({
                    error:
                        "Fiche introuvable."
                });

            }

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "❌ Erreur renommage fiche :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                 SUPPRIMER UNE FICHE               */
/* ================================================= */

app.delete(
    "/api/history/:id",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            if (
                !ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    error:
                        "Identifiant invalide."
                });

            }

            const result =
                await db
                    .collection("history")
                    .deleteOne({

                        _id:
                            new ObjectId(
                                req.params.id
                            ),

                        userId:
                            user._id

                    });

            if (
                result.deletedCount === 0
            ) {

                return res.status(404).json({
                    error:
                        "Fiche introuvable."
                });

            }

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "❌ Erreur suppression fiche :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                     CONTRÔLES                     */
/* ================================================= */

app.get(
    "/api/controls",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const controls =
                await db
                    .collection("controls")
                    .find({
                        userId:
                            user._id
                    })
                    .sort({
                        date:
                            1
                    })
                    .toArray();

            return res.json(
                controls
            );

        } catch (error) {

            console.error(
                "❌ Erreur récupération contrôles :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


app.post(
    "/api/controls",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const subject =
                typeof req.body.subject === "string"
                    ? req.body.subject.trim()
                    : "";

            const chapter =
                typeof req.body.chapter === "string"
                    ? req.body.chapter.trim()
                    : "";

            const date =
                typeof req.body.date === "string"
                    ? req.body.date.trim()
                    : "";

            if (
                !subject ||
                !chapter ||
                !date
            ) {

                return res.status(400).json({
                    error:
                        "Tous les champs sont obligatoires."
                });

            }

            const control = {

                userId:
                    user._id,

                subject,

                chapter,

                date,

                progress:
                    0,

                revisionTime:
                    900,

                createdAt:
                    new Date()

            };

            const result =
                await db
                    .collection("controls")
                    .insertOne(
                        control
                    );

            return res.json({

                success:
                    true,

                control: {

                    _id:
                        result.insertedId,

                    ...control

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur ajout contrôle :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*              MODIFIER PROGRESSION                 */
/* ================================================= */

app.put(
    "/api/controls/:id",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            if (
                !ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    error:
                        "Identifiant invalide."
                });

            }

            const progress =
                Number(
                    req.body.progress
                );

            if (
                !Number.isFinite(
                    progress
                )
            ) {

                return res.status(400).json({
                    error:
                        "Progression invalide."
                });

            }

            const safeProgress =
                Math.min(
                    100,
                    Math.max(
                        0,
                        progress
                    )
                );

            const result =
                await db
                    .collection("controls")
                    .updateOne(
                        {
                            _id:
                                new ObjectId(
                                    req.params.id
                                ),

                            userId:
                                user._id
                        },
                        {
                            $set: {
                                progress:
                                    safeProgress
                            }
                        }
                    );

            if (
                result.matchedCount === 0
            ) {

                return res.status(404).json({
                    error:
                        "Contrôle introuvable."
                });

            }

            return res.json({
                success: true,
                progress: safeProgress
            });

        } catch (error) {

            console.error(
                "❌ Erreur modification progression :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                SUPPRIMER CONTRÔLE                */
/* ================================================= */

app.delete(
    "/api/controls/:id",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            if (
                !ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    error:
                        "Identifiant invalide."
                });

            }

            const result =
                await db
                    .collection("controls")
                    .deleteOne({

                        _id:
                            new ObjectId(
                                req.params.id
                            ),

                        userId:
                            user._id

                    });

            if (
                result.deletedCount === 0
            ) {

                return res.status(404).json({
                    error:
                        "Contrôle introuvable."
                });

            }

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "❌ Erreur suppression contrôle :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                       IA                          */
/* ================================================= */

app.post(
    "/generate",
    async (req, res) => {

        try {

            if (!openai) {

                return res.status(503).json({
                    error:
                        "L'IA n'est pas configurée sur le serveur."
                });

            }

            const course =
                typeof req.body.course === "string"
                    ? req.body.course.trim()
                    : "";

            if (!course) {

                return res.status(400).json({
                    error:
                        "Cours manquant."
                });

            }

            if (
                course.length > 10000
            ) {

                return res.status(400).json({
                    error:
                        "Cours trop long."
                });

            }

            console.log(
                "🤖 Génération IA demandée."
            );


            const response =
                await openai.chat.completions.create({

                    model:
                        "gpt-4.1-mini",

                    response_format: {
                        type:
                            "json_object"
                    },

                    messages: [

                        {
                            role:
                                "system",

                            content: `
Tu es un professeur qui aide un lycéen à réviser.

Analyse le cours fourni.

Réponds uniquement avec un objet JSON valide.

Format obligatoire :

{
  "summary": "résumé clair du cours",
  "keyPoints": [
    "point important 1",
    "point important 2"
  ],
  "quiz": [
    {
      "question": "question",
      "answer": "réponse"
    }
  ]
}

Le résumé doit être compréhensible.
Les points clés doivent être utiles pour réviser.
Crée plusieurs questions de quiz.
`
                        },

                        {
                            role:
                                "user",

                            content:
                                course
                        }

                    ]

                });


            const content =
                response
                    ?.choices?.[0]
                    ?.message?.content;


            if (!content) {

                throw new Error(
                    "L'IA n'a retourné aucune réponse."
                );

            }


            let parsed;

            try {

                parsed =
                    JSON.parse(
                        content
                    );

            } catch {

                const cleaned =
                    content
                        .replace(
                            /^```json\s*/i,
                            ""
                        )
                        .replace(
                            /^```\s*/i,
                            ""
                        )
                        .replace(
                            /\s*```$/i,
                            ""
                        )
                        .trim();

                parsed =
                    JSON.parse(
                        cleaned
                    );

            }


            if (
                !parsed.summary
            ) {

                parsed.summary = "";

            }

            if (
                !Array.isArray(
                    parsed.keyPoints
                )
            ) {

                parsed.keyPoints = [];

            }

            if (
                !Array.isArray(
                    parsed.quiz
                )
            ) {

                parsed.quiz = [];

            }

            return res.json(
                parsed
            );

        } catch (error) {

            console.error(
                "❌ Erreur génération IA :",
                error
            );

            return res.status(500).json({

                error:
                    error?.message ||
                    "Erreur lors de la génération IA."

            });

        }

    }
);


/* ================================================= */
/*                     PARTAGE                       */
/* ================================================= */

/*
    IMPORTANT :

    Les fiches partagées sont enregistrées
    dans MongoDB.

    Elles ne dépendent PAS du localStorage.
*/


app.post(
    "/share",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const course =
                typeof req.body.course === "string"
                    ? req.body.course.trim()
                    : "";

            const result =
                req.body.result;

            if (
                !course ||
                result === undefined ||
                result === null
            ) {

                return res.status(400).json({
                    error:
                        "Données de partage invalides."
                });

            }


            /* Génération d'un code unique */

            let code;
            let exists = true;

            while (exists) {

                code =
                    crypto
                        .randomBytes(4)
                        .toString("hex")
                        .toUpperCase();

                const existing =
                    await db
                        .collection(
                            "sharedSheets"
                        )
                        .findOne({
                            code
                        });

                exists =
                    !!existing;

            }


            /* Enregistrement MongoDB */

            await db
                .collection(
                    "sharedSheets"
                )
                .insertOne({

                    code,

                    ownerId:
                        user._id,

                    course,

                    result,

                    createdAt:
                        new Date()

                });


            return res.json({

                success:
                    true,

                code

            });

        } catch (error) {

            console.error(
                "❌ Erreur partage :",
                error
            );

            return res.status(500).json({

                error:
                    "Erreur lors du partage."

            });

        }

    }
);


/* ================================================= */
/*              RÉCUPÉRER PARTAGE                   */
/* ================================================= */

app.get(
    "/share/:code",
    async (req, res) => {

        try {

            const code =
                typeof req.params.code === "string"
                    ? req.params.code
                        .trim()
                        .toUpperCase()
                    : "";

            if (!code) {

                return res.status(400).json({
                    error:
                        "Code de partage invalide."
                });

            }

            const sheet =
                await db
                    .collection(
                        "sharedSheets"
                    )
                    .findOne({
                        code
                    });

            if (!sheet) {

                return res.status(404).json({
                    error:
                        "Fiche introuvable."
                });

            }

            return res.json({

                success:
                    true,

                course:
                    sheet.course,

                result:
                    sheet.result,

                code:
                    sheet.code

            });

        } catch (error) {

            console.error(
                "❌ Erreur récupération partage :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*          IMPORTER UNE FICHE PARTAGÉE              */
/* ================================================= */

app.post(
    "/api/history/import",
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.status(401).json({
                    error:
                        "Utilisateur non connecté."
                });

            }

            const code =
                typeof req.body.code === "string"
                    ? req.body.code
                        .trim()
                        .toUpperCase()
                    : "";

            if (!code) {

                return res.status(400).json({
                    error:
                        "Code invalide."
                });

            }

            const sheet =
                await db
                    .collection(
                        "sharedSheets"
                    )
                    .findOne({
                        code
                    });

            if (!sheet) {

                return res.status(404).json({
                    error:
                        "Code invalide."
                });

            }

            const now =
                new Date();

            const historyItem = {

                userId:
                    user._id,

                course:
                    sheet.course,

                result:
                    sheet.result,

                date:
                    now.toLocaleString(
                        "fr-FR"
                    ),

                createdAt:
                    now

            };

            const inserted =
                await db
                    .collection("history")
                    .insertOne(
                        historyItem
                    );

            return res.json({

                success:
                    true,

                history: {

                    _id:
                        inserted.insertedId,

                    ...historyItem

                }

            });

        } catch (error) {

            console.error(
                "❌ Erreur import fiche :",
                error
            );

            return res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*             NETTOYAGE DES SESSIONS               */
/* ================================================= */

async function cleanupExpiredSessions() {

    try {

        if (!db) {
            return;
        }

        const result =
            await db
                .collection("sessions")
                .deleteMany({
                    expiresAt: {
                        $lte:
                            new Date()
                    }
                });

        if (
            result.deletedCount > 0
        ) {

            console.log(
                `🧹 ${result.deletedCount} session(s) expirée(s) supprimée(s).`
            );

        }

    } catch (error) {

        console.error(
            "Erreur nettoyage sessions :",
            error
        );

    }

}


/* ================================================= */
/*                 ERREUR GLOBALE                    */
/* ================================================= */

app.use(
    (error, req, res, next) => {

        console.error(
            "❌ Erreur Express :",
            error
        );

        if (
            res.headersSent
        ) {

            return next(error);

        }

        return res.status(500).json({
            error:
                "Erreur serveur."
        });

    }
);


/* ================================================= */
/*                 DÉMARRAGE SERVEUR                 */
/* ================================================= */

async function startServer() {

    try {

        console.log(
            "🔄 Connexion à MongoDB..."
        );

        await client.connect();

        db =
            client.db(
                "capcontrole"
            );

        console.log(
            "✅ MongoDB connecté."
        );


        /* ================================================= */
        /*                       INDEX                       */
        /* ================================================= */

        await db
            .collection("users")
            .createIndex(
                {
                    email: 1
                },
                {
                    unique: true
                }
            );

        await db
            .collection("users")
            .createIndex(
                {
                    usernameLower: 1
                },
                {
                    unique: true
                }
            );

        await db
            .collection("sessions")
            .createIndex(
                {
                    tokenHash: 1
                },
                {
                    unique: true
                }
            );

        await db
            .collection("sessions")
            .createIndex(
                {
                    expiresAt: 1
                },
                {
                    expireAfterSeconds: 0
                }
            );

        await db
            .collection("sharedSheets")
            .createIndex(
                {
                    code: 1
                },
                {
                    unique: true
                }
            );

        await db
            .collection("history")
            .createIndex({
                userId: 1,
                createdAt: -1
            });

        await db
            .collection("controls")
            .createIndex({
                userId: 1,
                date: 1
            });


        console.log(
            "✅ Index MongoDB vérifiés."
        );


        /* Nettoyage immédiat */

        await cleanupExpiredSessions();


        /* Nettoyage toutes les heures */

        setInterval(
            cleanupExpiredSessions,
            60 * 60 * 1000
        );


        /* ================================================= */
        /*                       LISTEN                       */
        /* ================================================= */

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


/* ================================================= */
/*                 ARRÊT PROPRE                      */
/* ================================================= */

async function shutdown() {

    console.log(
        "🛑 Arrêt du serveur..."
    );

    try {

        await client.close();

        console.log(
            "MongoDB déconnecté."
        );

        process.exit(0);

    } catch (error) {

        console.error(
            "Erreur fermeture :",
            error
        );

        process.exit(1);

    }

}

process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);
