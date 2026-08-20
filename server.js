import { MongoClient } from "mongodb";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/* ========================= */
/* MongoDB */
/* ========================= */

const client = new MongoClient(
    process.env.MONGODB_URI
);

let db;

/* ========================= */
/* Express */
/* ========================= */

const app = express();

app.use(express.json());

/*
    Ton frontend est servi directement
    par Express sur Render.

    On évite donc le cors "*" avec
    les cookies de session.
*/
app.use(cors({
    origin: true,
    credentials: true
}));

/* ========================= */
/* Fichiers du site */
/* ========================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

app.use(
    express.static(__dirname)
);

/* ========================= */
/* OpenAI */
/* ========================= */

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/* ================================================= */
/*                 UTILITAIRES COMPTES               */
/* ================================================= */

/*
    Hash sécurisé du mot de passe
    avec l'algorithme scrypt intégré à Node.js.
*/

function hashPassword(password) {

    return new Promise((resolve, reject) => {

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
                    salt.toString("hex")
                    + ":"
                    + derivedKey.toString("hex")
                );

            }
        );

    });

}


/*
    Vérification du mot de passe.
*/

function verifyPassword(
    password,
    storedHash
) {

    return new Promise((resolve, reject) => {

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

                resolve(
                    crypto.timingSafeEqual(
                        originalHash,
                        derivedKey
                    )
                );

            }
        );

    });

}


/*
    Création d'un token de session.
*/

function createSessionToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


/*
    Hash du token avant de le mettre
    dans MongoDB.
*/

function hashSessionToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


/*
    Récupérer le cookie de session.
*/

function getSessionToken(req) {

    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader
            .split(";")
            .map(cookie => cookie.trim());

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

    return decodeURIComponent(
        sessionCookie.substring(
            "capcontrole_session=".length
        )
    );

}


/*
    Créer le cookie de session.
*/

function setSessionCookie(
    res,
    token
) {

    const isProduction =
        process.env.NODE_ENV === "production";

    const cookie =
        [
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


/*
    Supprimer le cookie.
*/

function clearSessionCookie(res) {

    res.setHeader(
        "Set-Cookie",
        "capcontrole_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    );

}


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

            /* Vérifications */

            if (
                !username ||
                !email ||
                !password
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

            /* Vérifier si l'e-mail existe */

            const existingEmail =
                await users.findOne({
                    email: cleanEmail
                });

            if (existingEmail) {

                return res.status(409).json({
                    success: false,
                    error:
                        "Cette adresse e-mail est déjà utilisée."
                });

            }

            /* Vérifier si le pseudo existe */

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

            /* Hash du mot de passe */

            const passwordHash =
                await hashPassword(
                    password
                );

            /* Créer l'utilisateur */

            const user = {

                username:
                    cleanUsername,

                usernameLower:
                    cleanUsername.toLowerCase(),

                email:
                    cleanEmail,

                passwordHash,

                createdAt:
                    new Date()

            };

            const result =
                await users.insertOne(user);

            /* Créer automatiquement une session */

            const token =
                createSessionToken();

            const tokenHash =
                hashSessionToken(token);

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
                            + 30 * 24 * 60 * 60 * 1000
                        )

                });

            setSessionCookie(
                res,
                token
            );

            res.json({

                success: true,

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
                "Erreur inscription :",
                error
            );

            res.status(500).json({

                success: false,

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
                !email ||
                !password
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
                hashSessionToken(token);

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
                            + 30 * 24 * 60 * 60 * 1000
                        )

                });

            setSessionCookie(
                res,
                token
            );

            res.json({

                success: true,

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
                "Erreur connexion :",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Erreur serveur."

            });

        }

    }
);


/* ================================================= */
/*                    UTILISATEUR                    */
/* ================================================= */

app.get(
    "/me",
    async (req, res) => {

        try {

            const token =
                getSessionToken(req);

            if (!token) {

                return res.json({
                    loggedIn: false
                });

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

                return res.json({
                    loggedIn: false
                });

            }

            /* Session expirée */

            if (
                session.expiresAt <
                new Date()
            ) {

                await db
                    .collection("sessions")
                    .deleteOne({
                        _id:
                            session._id
                    });

                clearSessionCookie(res);

                return res.json({
                    loggedIn: false
                });

            }

            const user =
                await db
                    .collection("users")
                    .findOne({
                        _id:
                            session.userId
                    });

            if (!user) {

                clearSessionCookie(res);

                return res.json({
                    loggedIn: false
                });

            }

            res.json({

                loggedIn: true,

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
                "Erreur /me :",
                error
            );

            res.status(500).json({
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
                    hashSessionToken(token);

                await db
                    .collection("sessions")
                    .deleteOne({
                        tokenHash
                    });

            }

            clearSessionCookie(res);

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur déconnexion :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);

/* ================================================= */
/*                 AUTHENTIFICATION                  */
/* ================================================= */

/*
    Récupère l'utilisateur connecté
    à partir de sa session.
*/

async function getCurrentUser(req) {

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
        session.expiresAt < new Date()
    ) {

        await db
            .collection("sessions")
            .deleteOne({
                _id: session._id
            });

        return null;
    }

    const user =
        await db
            .collection("users")
            .findOne({
                _id: session.userId
            });

    return user || null;
}

/* ================================================= */
/*          SYNCHRONISATION DU COMPTE                */
/* ================================================= */


/* ========================= */
/* Récupérer série + record  */
/* ========================= */

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

            res.json({

                streak:
                    user.streak || 0,

                bestStreak:
                    user.bestStreak || 0

            });

        } catch (error) {

            console.error(
                "Erreur récupération statistiques :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Sauvegarder série + record */
/* ========================= */

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
                !Number.isFinite(bestStreak)
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
                        _id: user._id
                    },
                    {
                        $set: {
                            streak,
                            bestStreak
                        }
                    }
                );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur sauvegarde statistiques :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                    HISTORIQUE                     */
/* ================================================= */


/* ========================= */
/* Récupérer l'historique    */
/* ========================= */

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
                        createdAt: -1
                    })
                    .toArray();

            res.json(history);

        } catch (error) {

            console.error(
                "Erreur récupération historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Ajouter à l'historique    */
/* ========================= */

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

            const {
                course,
                result
            } = req.body;

            if (
                typeof course !== "string" ||
                !course.trim() ||
                !result
            ) {

                return res.status(400).json({
                    error:
                        "Données invalides."
                });

            }

            const historyItem = {

                userId:
                    user._id,

                course:
                    course.trim(),

                result,

                date:
                    new Date().toLocaleString(
                        "fr-FR"
                    ),

                createdAt:
                    new Date()

            };

            const inserted =
                await db
                    .collection("history")
                    .insertOne(
                        historyItem
                    );

            res.json({

                success: true,

                history: {

                    _id:
                        inserted.insertedId,

                    ...historyItem

                }

            });

        } catch (error) {

            console.error(
                "Erreur ajout historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Supprimer une fiche       */
/* ========================= */

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

            const { ObjectId } =
                await import("mongodb");

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

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur suppression historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);

/* ================================================= */
/*             DONNÉES DU COMPTE                     */
/* ================================================= */

/* ========================= */
/* Récupérer les statistiques */
/* ========================= */

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

            res.json({

                streak:
                    user.streak || 0,

                bestStreak:
                    user.bestStreak || 0

            });

        } catch (error) {

            console.error(
                "Erreur récupération statistiques :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Sauvegarder les statistiques */
/* ========================= */

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

            const {
                streak,
                bestStreak
            } = req.body;

            const update = {};

            if (
                typeof streak === "number"
            ) {

                update.streak =
                    streak;

            }

            if (
                typeof bestStreak === "number"
            ) {

                update.bestStreak =
                    bestStreak;

            }

            await db
                .collection("users")
                .updateOne(
                    {
                        _id: user._id
                    },
                    {
                        $set: update
                    }
                );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur sauvegarde statistiques :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ================================================= */
/*                 HISTORIQUE IA                     */
/* ================================================= */


/* ========================= */
/* Récupérer l'historique    */
/* ========================= */

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
                        createdAt: -1
                    })
                    .toArray();

            res.json(history);

        } catch (error) {

            console.error(
                "Erreur récupération historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Ajouter une fiche         */
/* ========================= */

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

            const {
                course,
                result
            } = req.body;

            if (
                !course ||
                !result
            ) {

                return res.status(400).json({
                    error:
                        "Données manquantes."
                });

            }

            const historyItem = {

                userId:
                    user._id,

                date:
                    new Date().toLocaleString(
                        "fr-FR"
                    ),

                course,

                result,

                createdAt:
                    new Date()

            };

            const inserted =
                await db
                    .collection("history")
                    .insertOne(
                        historyItem
                    );

            res.json({

                success: true,

                history: {
                    _id:
                        inserted.insertedId,

                    ...historyItem
                }

            });

        } catch (error) {

            console.error(
                "Erreur ajout historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/* ========================= */
/* Supprimer une fiche       */
/* ========================= */

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

            const { ObjectId } =
                await import("mongodb");

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

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur suppression historique :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);

/* ================================================= */
/*                    CONTRÔLES                      */
/* ================================================= */


/*
    Récupérer les contrôles
    de l'utilisateur connecté.
*/

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
                        userId: user._id
                    })
                    .sort({
                        date: 1
                    })
                    .toArray();

            res.json(controls);

        } catch (error) {

            console.error(
                "Erreur récupération contrôles :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/*
    Ajouter un contrôle.
*/

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

            const {
                subject,
                chapter,
                date
            } = req.body;

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

                subject:
                    subject.trim(),

                chapter:
                    chapter.trim(),

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
                    .insertOne(control);

            res.json({

                success: true,

                control: {
                    _id:
                        result.insertedId,

                    ...control

                }

            });

        } catch (error) {

            console.error(
                "Erreur ajout contrôle :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/*
    Modifier la progression
    d'un contrôle.
*/

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

            const {
                progress
            } = req.body;

            if (
                typeof progress !== "number"
            ) {

                return res.status(400).json({
                    error:
                        "Progression invalide."
                });

            }

            const { ObjectId } =
                await import("mongodb");

            const id =
                new ObjectId(
                    req.params.id
                );

            const result =
                await db
                    .collection("controls")
                    .updateOne(

                        {
                            _id: id,

                            userId:
                                user._id
                        },

                        {
                            $set: {
                                progress:
                                    Math.min(
                                        100,
                                        Math.max(
                                            0,
                                            progress
                                        )
                                    )
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

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur modification contrôle :",
                error
            );

            res.status(500).json({
                error:
                    "Erreur serveur."
            });

        }

    }
);


/*
    Supprimer un contrôle.
*/

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

            const { ObjectId } =
                await import("mongodb");

            const id =
                new ObjectId(
                    req.params.id
                );

            const result =
                await db
                    .collection("controls")
                    .deleteOne({

                        _id: id,

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

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Erreur suppression contrôle :",
                error
            );

            res.status(500).json({
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

        console.log(
            "Génération demandée"
        );

        try {

            const {
                course
            } = req.body;

            if (
                !course ||
                course.length > 10000
            ) {

                return res.status(400).json({

                    error:
                        "Cours trop long"

                });

            }

            console.log(
                "COURS REÇU :"
            );

            console.log(course);

            const response =
                await openai
                    .chat
                    .completions
                    .create({

                        model:
                            "gpt-4.1-mini",

                        messages: [

                            {
                                role:
                                    "system",

                                content: `
Tu es un professeur.

Réponds UNIQUEMENT avec du JSON valide.

Format :

{
  "summary": "résumé",
  "keyPoints": [
    "point 1",
    "point 2"
  ],
  "quiz": [
    {
      "question": "question",
      "answer": "réponse"
    }
  ]
}

Aucun texte avant ou après le JSON.
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
                    .choices[0]
                    .message
                    .content;

            console.log(content);

            const cleanContent =
                content
                    .replace(
                        /```json/g,
                        ""
                    )
                    .replace(
                        /```/g,
                        ""
                    )
                    .trim();

            res.json(
                JSON.parse(
                    cleanContent
                )
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message

            });

        }

    }
);


/* ================================================= */
/*                    PARTAGE                        */
/* ================================================= */

app.post(
    "/share",
    async (req, res) => {

        try {

            const code =
                Math.random()
                    .toString(36)
                    .substring(2, 8)
                    .toUpperCase();

            await db
                .collection(
                    "sharedSheets"
                )
                .insertOne({

                    code,

                    ...req.body,

                    createdAt:
                        new Date()

                });

            res.json({
                code
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "Erreur partage"

            });

        }

    }
);


app.get(
    "/share/:code",
    async (req, res) => {

        try {

            const sheet =
                await db
                    .collection(
                        "sharedSheets"
                    )
                    .findOne({

                        code:
                            req.params.code
                                .toUpperCase()

                    });

            if (!sheet) {

                return res.status(404).json({

                    error:
                        "Fiche introuvable"

                });

            }

            res.json(sheet);

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    "Erreur serveur"

            });

        }

    }
);


/* ================================================= */
/*                 DÉMARRAGE SERVEUR                 */
/* ================================================= */

async function startServer() {

    try {

        await client.connect();

        db =
            client.db(
                "capcontrole"
            );

        console.log(
            "MongoDB connecté"
        );

        const PORT = process.env.PORT || 3001;
        
        app.listen(PORT, "0.0.0.0", () => {
        
            console.log(
                `Serveur lancé sur le port ${PORT}`
            );
        
        });

    } catch (error) {

        console.error(
            "Erreur MongoDB :",
            error
        );

    }

}

startServer();
