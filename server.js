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
/*                    MONGODB                        */
/* ================================================= */

const client = new MongoClient(
    process.env.MONGODB_URI
);

let db;


/* ================================================= */
/*                    EXPRESS                        */
/* ================================================= */

const app = express();

app.use(
    express.json()
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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


/* ================================================= */
/*                 UTILITAIRES                       */
/* ================================================= */


/* ========================= */
/* Hash mot de passe         */
/* ========================= */

function hashPassword(password) {

    return new Promise(
        (resolve, reject) => {

            const salt =
                crypto.randomBytes(16);

            crypto.scrypt(
                password,
                salt,
                64,
                (
                    error,
                    derivedKey
                ) => {

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

        }
    );

}


/* ========================= */
/* Vérifier mot de passe     */
/* ========================= */

function verifyPassword(
    password,
    storedHash
) {

    return new Promise(
        (resolve, reject) => {

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
                (
                    error,
                    derivedKey
                ) => {

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

        }
    );

}


/* ========================= */
/* Token session             */
/* ========================= */

function createSessionToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


/* ========================= */
/* Hash token session        */
/* ========================= */

function hashSessionToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


/* ========================= */
/* Lire cookie session       */
/* ========================= */

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

    return decodeURIComponent(
        sessionCookie.substring(
            "capcontrole_session=".length
        )
    );

}


/* ========================= */
/* Créer cookie session      */
/* ========================= */

function setSessionCookie(
    res,
    token
) {

    const isProduction =
        process.env.NODE_ENV ===
        "production";

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


/* ========================= */
/* Supprimer cookie          */
/* ========================= */

function clearSessionCookie(res) {

    res.setHeader(
        "Set-Cookie",
        "capcontrole_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    );

}


/* ================================================= */
/*              UTILISATEUR CONNECTÉ                */
/* ================================================= */

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

    return user || null;

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


            /* Vérifier email */

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


            /* Vérifier pseudo */

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


            /* Créer utilisateur */

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


            /* Session automatique */

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


            res.json({

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
                "Erreur inscription :",
                error
            );

            res.status(500).json({

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


            res.json({

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
                "Erreur connexion :",
                error
            );

            res.status(500).json({

                success:
                    false,

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

            const user =
                await getCurrentUser(req);

            if (!user) {

                return res.json({
                    loggedIn:
                        false
                });

            }

            res.json({

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

            res.json({
                success:
                    true
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
/*                 SÉRIE + RECORD                    */
/* ================================================= */


/* ========================= */
/* Récupérer statistiques    */
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
/* Sauvegarder statistiques  */
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
                Number(
                    req.body.streak
                );

            const bestStreak =
                Number(
                    req.body.bestStreak
                );

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
                        _id:
                            user._id
                    },
                    {
                        $set: {

                            streak,

                            bestStreak

                        }
                    }
                );

            res.json({
                success:
                    true
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
/* Récupérer historique      */
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
                        createdAt:
                            -1
                    })
                    .toArray();

            res.json(
                history
            );

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
/* Ajouter fiche             */
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
/* Renommer fiche            */
/* ========================= */

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

            const {
                course
            } = req.body;

            if (
                typeof course !== "string" ||
                !course.trim()
            ) {

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
                                course:
                                    course.trim()
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

            res.json({
                success:
                    true
            });

        } catch (error) {

            console.error(
                "Erreur renommage historique :",
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
/* Supprimer fiche           */
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
                success:
                    true
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


/* ========================= */
/* Récupérer contrôles       */
/* ========================= */

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

            res.json(
                controls
            );

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


/* ========================= */
/* Ajouter contrôle          */
/* ========================= */

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
                    .insertOne(
                        control
                    );

            res.json({

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


/* ========================= */
/* Modifier progression      */
/* ========================= */

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
                success:
                    true
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


/* ========================= */
/* Supprimer contrôle        */
/* ========================= */

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

            res.json({
                success:
                    true
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
                typeof course !== "string"
            ) {

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
                "COURS REÇU :"
            );

            console.log(
                course
            );


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

            console.error(
                "Erreur génération IA :",
                error
            );

            res.status(500).json({

                error:
                    error.message

            });

        }

    }
);


/* ================================================= */
/*                     PARTAGE                       */
/* ================================================= */


/*
    Créer un code de partage.

    La fiche partagée est enregistrée
    dans MongoDB.
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
                        "Données de partage invalides."
                });

            }


            /* Générer un code */

            let code;

            let existing;

            do {

                code =
                    crypto
                        .randomBytes(4)
                        .toString("hex")
                        .toUpperCase();

                existing =
                    await db
                        .collection(
                            "sharedSheets"
                        )
                        .findOne({
                            code
                        });

            } while (existing);


            /* Enregistrer dans MongoDB */

            await db
                .collection(
                    "sharedSheets"
                )
                .insertOne({

                    code,

                    ownerId:
                        user._id,

                    course:
                        course.trim(),

                    result,

                    createdAt:
                        new Date()

                });


            res.json({

                success:
                    true,

                code

            });

        } catch (error) {

            console.error(
                "Erreur partage :",
                error
            );

            res.status(500).json({

                error:
                    "Erreur partage."

            });

        }

    }
);


/*
    Récupérer une fiche partagée
    avec son code.
*/

app.get(
    "/share/:code",
    async (req, res) => {

        try {

            const code =
                req.params.code
                    .trim()
                    .toUpperCase();

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

            res.json({

                course:
                    sheet.course,

                result:
                    sheet.result

            });

        } catch (error) {

            console.error(
                "Erreur récupération partage :",
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
    Importer directement une fiche
    partagée dans le compte connecté.

    Cela permet de ne plus dépendre
    du localStorage pour l'historique.
*/

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

            const {
                code
            } = req.body;

            if (
                typeof code !== "string" ||
                !code.trim()
            ) {

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
                        code:
                            code
                                .trim()
                                .toUpperCase()
                    });

            if (!sheet) {

                return res.status(404).json({
                    error:
                        "Code invalide."
                });

            }


            /* Créer la fiche dans
               l'historique du compte */

            const historyItem = {

                userId:
                    user._id,

                course:
                    sheet.course,

                result:
                    sheet.result,

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
                "Erreur import fiche :",
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


        /* Index utiles */

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
            .collection("sharedSheets")
            .createIndex(
                {
                    code: 1
                },
                {
                    unique: true
                }
            );


        const PORT =
            process.env.PORT ||
            3001;


        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `Serveur lancé sur le port ${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "Erreur MongoDB :",
            error
        );

    }

}


startServer();
