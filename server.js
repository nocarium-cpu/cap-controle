import { MongoClient } from "mongodb";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const client = new MongoClient(
    process.env.MONGODB_URI
);

let db;

const app = express();

app.use(cors());
app.use(express.json());

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.post("/generate", async (req, res) => {

    console.log("Génération demandée");

    try {

        const { course } = req.body;

        if(!course || course.length > 10000){
            return res.status(400).json({
                error: "Cours trop long"
            });
        }
        console.log("COURS REÇU :");
        console.log(course);

        const response =
            await openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
    {
        role: "system",
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
        role: "user",
        content: course
    }
]
            });

        const content =
    response.choices[0].message.content;

console.log(content);

const cleanContent = content
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

res.json(
    JSON.parse(cleanContent)
);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });

    }
});

async function startServer() {

    try {

        await client.connect();

        db =
            client.db("capcontrole");

        console.log(
            "MongoDB connecté"
        );

        app.listen(3001, () => {

            console.log(
                "Serveur lancé sur http://localhost:3001"
            );

        });

    } catch(error) {

        console.error(
            "Erreur MongoDB :",
            error
        );

    }
}

app.post("/share", async (req, res) => {

    try {

        const code =
            Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

        await db
            .collection("sharedSheets")
            .insertOne({
                code,
                ...req.body,
                createdAt: new Date()
            });

        res.json({ code });

    } catch(error) {

        console.error(error);

        res.status(500).json({
            error: "Erreur partage"
        });

    }

});

app.get("/share/:code", async (req, res) => {

    try {

        const sheet =
            await db
                .collection("sharedSheets")
                .findOne({
                    code:
                        req.params.code
                            .toUpperCase()
                });

        if(!sheet){

            return res.status(404).json({
                error: "Fiche introuvable"
            });

        }

        res.json(sheet);

    } catch(error){

        console.error(error);

        res.status(500).json({
            error: "Erreur serveur"
        });

    }

});

startServer();

app.use(cors({
    origin: "*"
}));

app.post("/login", (req, res) => {

    const { password } = req.body;

    if (
        password ===
        process.env.APP_PASSWORD
    ) {

        res.json({
            success: true
        });

    } else {

        res.json({
            success: false
        });

    }

});
