let streak = 0;
let bestStreak = 0;

let controls = [];
let history = [];

let currentUser = null;
let controlsContainer = null;


/* ================================================= */
/*                 THÈME SOMBRE                      */
/* ================================================= */

function applyTheme(theme) {

    const root = document.documentElement;

    const dark = theme === "dark";

    if (dark) {

        document.body.classList.add("dark-theme");

        root.style.setProperty("--background", "#0f172a");
        root.style.setProperty("--card", "#1e293b");
        root.style.setProperty("--text", "#f8fafc");
        root.style.setProperty("--muted", "#94a3b8");
        root.style.setProperty("--border", "#334155");

    } else {

        document.body.classList.remove("dark-theme");

        root.style.setProperty("--background", "#f8fafc");
        root.style.setProperty("--card", "#ffffff");
        root.style.setProperty("--text", "#111827");
        root.style.setProperty("--muted", "#6b7280");
        root.style.setProperty("--border", "#e5e7eb");
    }

    applyDarkModeFixes(dark);

    const themeSelect =
        document.getElementById("themeSelect");

    if (themeSelect) {
        themeSelect.value = dark ? "dark" : "light";
    }
}


/*
 * Ton CSS contient plusieurs éléments avec
 * background: white / #ffffff en dur.
 *
 * Ces règles permettent donc au mode sombre
 * de fonctionner même sans modifier ton CSS.
 */
function applyDarkModeFixes(dark) {

    let style =
        document.getElementById("capControleDarkModeStyle");

    if (!style) {

        style = document.createElement("style");

        style.id =
            "capControleDarkModeStyle";

        document.head.appendChild(style);
    }

    if (!dark) {

        style.textContent = "";

        return;
    }

    style.textContent = `

        body.dark-theme {
            background: #0f172a !important;
            color: #f8fafc !important;
        }

        body.dark-theme .screen {
            background: #0f172a !important;
            color: #f8fafc !important;
        }

        body.dark-theme .intro-screen {
            background: #0f172a !important;
            color: #f8fafc !important;
        }

        body.dark-theme .onboarding {
            background: #0f172a !important;
        }

        body.dark-theme .choice-card,
        body.dark-theme .small-choice,
        body.dark-theme .subject,
        body.dark-theme .objective,
        body.dark-theme .time-choice,
        body.dark-theme .profile-summary,
        body.dark-theme .card,
        body.dark-theme .history-card,
        body.dark-theme .ai-card,
        body.dark-theme .quiz-card,
        body.dark-theme .today-item,
        body.dark-theme .back-button,
        body.dark-theme .stat,
        body.dark-theme .settings-card,
        body.dark-theme .settings-section,
        body.dark-theme .profile-dropdown,
        body.dark-theme input,
        body.dark-theme textarea,
        body.dark-theme select {
            background: #1e293b !important;
            color: #f8fafc !important;
            border-color: #334155 !important;
        }

        body.dark-theme .choice-card:hover,
        body.dark-theme .small-choice:hover,
        body.dark-theme .subject:hover,
        body.dark-theme .objective:hover,
        body.dark-theme .time-choice:hover {
            background: #24344d !important;
        }

        body.dark-theme .choice-card.selected,
        body.dark-theme .small-choice.selected,
        body.dark-theme .subject.selected,
        body.dark-theme .objective.selected,
        body.dark-theme .time-choice.selected {
            background: #172554 !important;
            border-color: #2563eb !important;
            color: #60a5fa !important;
        }

        body.dark-theme .choice-card span,
        body.dark-theme .subtitle,
        body.dark-theme .intro-content p,
        body.dark-theme .success-content p,
        body.dark-theme .stat-label,
        body.dark-theme .history-info p {
            color: #94a3b8 !important;
        }

        body.dark-theme .loading-bar,
        body.dark-theme .progress-container {
            background: #334155 !important;
        }

        body.dark-theme input::placeholder,
        body.dark-theme textarea::placeholder {
            color: #64748b !important;
        }

        body.dark-theme option {
            background: #1e293b !important;
            color: #f8fafc !important;
        }

        body.dark-theme .profile-dropdown button,
        body.dark-theme .profile-dropdown a {
            color: #f8fafc !important;
        }

        body.dark-theme .profile-dropdown button:hover,
        body.dark-theme .profile-dropdown a:hover {
            background: #334155 !important;
        }

        body.dark-theme .settingsPage,
        body.dark-theme #settingsPage {
            background: #0f172a !important;
            color: #f8fafc !important;
        }

        body.dark-theme h1,
        body.dark-theme h2,
        body.dark-theme h3,
        body.dark-theme h4,
        body.dark-theme strong,
        body.dark-theme label {
            color: #f8fafc;
        }

        body.dark-theme .days.urgent {
            color: #f87171 !important;
        }

        body.dark-theme .days.soon {
            color: #fbbf24 !important;
        }
    `;
}


function loadTheme() {

    const savedTheme =
        localStorage.getItem("capControleTheme") || "dark";

    applyTheme(savedTheme);
}


function changeTheme() {

    const themeSelect =
        document.getElementById("themeSelect");

    if (!themeSelect) {
        return;
    }

    const theme =
        themeSelect.value === "dark"
            ? "dark"
            : "light";

    localStorage.setItem(
        "capControleTheme",
        theme
    );

    applyTheme(theme);
}


/* ================================================= */
/*                  CONTRÔLES                        */
/* ================================================= */

async function loadControls() {

    try {

        const response =
            await fetch("/api/controls", {
                credentials: "include"
            });

        if (!response.ok) {

            console.error(
                "Impossible de charger les contrôles."
            );

            return;
        }

        controls = await response.json();

        if (!Array.isArray(controls)) {
            controls = [];
        }

        render();

    } catch (error) {

        console.error(
            "Erreur chargement contrôles :",
            error
        );
    }
}


async function addControl() {

    const subject =
        document
            .getElementById("subject")
            ?.value
            .trim();

    const chapter =
        document
            .getElementById("chapter")
            ?.value
            .trim();

    const date =
        document
            .getElementById("date")
            ?.value;

    if (!subject || !chapter || !date) {

        alert(
            "Remplis tous les champs."
        );

        return;
    }

    try {

        const response =
            await fetch("/api/controls", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    subject,
                    chapter,
                    date
                })
            });

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible d'ajouter le contrôle."
            );

            return;
        }

        controls.push(data.control);

        render();

        const subjectInput =
            document.getElementById("subject");

        const chapterInput =
            document.getElementById("chapter");

        const dateInput =
            document.getElementById("date");

        if (subjectInput) {
            subjectInput.value = "";
        }

        if (chapterInput) {
            chapterInput.value = "";
        }

        if (dateInput) {
            dateInput.value = "";
        }

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                  DONNÉES COMPTE                   */
/* ================================================= */

async function loadAccountData() {

    try {

        const statsResponse =
            await fetch("/api/stats", {
                credentials: "include"
            });

        if (statsResponse.ok) {

            const stats =
                await statsResponse.json();

            streak =
                Number(stats.streak) || 0;

            bestStreak =
                Number(stats.bestStreak) || 0;
        }

        const historyResponse =
            await fetch("/api/history", {
                credentials: "include"
            });

        if (historyResponse.ok) {

            const data =
                await historyResponse.json();

            history =
                Array.isArray(data)
                    ? data
                    : [];

        } else {

            history = [];
        }

        render();
        renderHistory();

    } catch (error) {

        console.error(
            "Erreur chargement données compte :",
            error
        );
    }
}


async function saveStats() {

    try {

        const response =
            await fetch("/api/stats", {
                method: "PUT",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    streak,
                    bestStreak
                })
            });

        if (!response.ok) {

            console.error(
                "Impossible de sauvegarder la série."
            );
        }

    } catch (error) {

        console.error(
            "Erreur sauvegarde série :",
            error
        );
    }
}


/* ================================================= */
/*                    DATES                          */
/* ================================================= */

function getDaysLeft(date) {

    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    const parts =
        String(date).split("-");

    if (parts.length !== 3) {
        return 0;
    }

    const examDate =
        new Date(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2])
        );

    examDate.setHours(
        0,
        0,
        0,
        0
    );

    return Math.round(
        (examDate - today) /
        (1000 * 60 * 60 * 24)
    );
}


function formatDate(dateString) {

    const date =
        new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(
        "fr-FR",
        {
            day: "numeric",
            month: "long"
        }
    );
}


/* ================================================= */
/*                    CONNEXION                     */
/* ================================================= */

async function login() {

    const email =
        document
            .getElementById("loginEmail")
            ?.value
            .trim();

    const password =
        document
            .getElementById("loginPassword")
            ?.value;

    if (!email || !password) {

        alert(
            "Remplis tous les champs."
        );

        return;
    }

    try {

        const response =
            await fetch("/login", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    email,
                    password
                })
            });

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Erreur de connexion."
            );

            return;
        }

        const meResponse =
            await fetch("/me", {
                credentials: "include"
            });

        if (meResponse.ok) {

            const meData =
                await meResponse.json();

            if (meData.user) {
                currentUser =
                    meData.user;
            }
        }

        await startAccountExperience();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                   INSCRIPTION                     */
/* ================================================= */

async function register() {

    const username =
        document
            .getElementById("registerUsername")
            ?.value
            .trim();

    const email =
        document
            .getElementById("registerEmail")
            ?.value
            .trim();

    const password =
        document
            .getElementById("registerPassword")
            ?.value;

    const confirmPassword =
        document
            .getElementById(
                "registerPasswordConfirm"
            )
            ?.value;

    if (
        !username ||
        !email ||
        !password ||
        !confirmPassword
    ) {

        alert(
            "Remplis tous les champs."
        );

        return;
    }

    if (password !== confirmPassword) {

        alert(
            "Les mots de passe ne correspondent pas."
        );

        return;
    }

    try {

        const response =
            await fetch("/register", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Erreur lors de la création du compte."
            );

            return;
        }

        const meResponse =
            await fetch("/me", {
                credentials: "include"
            });

        if (meResponse.ok) {

            const meData =
                await meResponse.json();

            if (meData.user) {
                currentUser =
                    meData.user;
            }
        }

        await startAccountExperience();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


function showRegister() {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");

    const title =
        document.getElementById("authTitle");

    if (loginForm) {
        loginForm.style.display = "none";
    }

    if (registerForm) {
        registerForm.style.display = "block";
    }

    if (title) {
        title.textContent = "Créer un compte";
    }
}


function showLogin() {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");

    const title =
        document.getElementById("authTitle");

    if (registerForm) {
        registerForm.style.display = "none";
    }

    if (loginForm) {
        loginForm.style.display = "block";
    }

    if (title) {
        title.textContent = "Connexion";
    }
}


/* ================================================= */
/*                    RÉVISION                       */
/* ================================================= */

async function revise(index, minutes) {

    const control =
        controls[index];

    if (!control || !control._id) {

        alert(
            "Contrôle introuvable."
        );

        return;
    }

    const newProgress =
        Math.min(
            100,
            (Number(control.progress) || 0) +
            Number(minutes)
        );

    try {

        const response =
            await fetch(
                "/api/controls/" +
                control._id,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        progress:
                            newProgress
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de sauvegarder la progression."
            );

            return;
        }

        control.progress =
            newProgress;

        await updateStreak();

        render();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                     AFFICHAGE                     */
/* ================================================= */

function render() {

    if (!controlsContainer) {
        controlsContainer =
            document.getElementById("controls");
    }

    if (!controlsContainer) {
        return;
    }

    controls.sort(
        (a, b) =>
            new Date(a.date) -
            new Date(b.date)
    );

    controlsContainer.innerHTML = "";

    const dashboard =
        document.getElementById("dashboard");

    const nextExamCard =
        document.getElementById("nextExam");

    const todayRevision =
        document.getElementById("todayRevision");

    const futureControls =
        controls.filter(
            control =>
                getDaysLeft(control.date) >= 0
        );

    const nextControl =
        futureControls[0];

    if (dashboard) {

        dashboard.innerHTML = `

            <div class="stat">
                <div class="stat-number">
                    ${controls.length}
                </div>
                <div class="stat-label">
                    Contrôles
                </div>
            </div>

            <div class="stat">
                <div class="stat-number">
                    ${
                        futureControls.filter(
                            control =>
                                getDaysLeft(control.date) <= 7
                        ).length
                    }
                </div>
                <div class="stat-label">
                    Cette semaine
                </div>
            </div>

            <div class="stat">
                <div class="stat-number">
                    ${
                        nextControl
                            ? getDaysLeft(nextControl.date)
                            : "-"
                    }
                </div>
                <div class="stat-label">
                    Jours restants
                </div>
            </div>

            <div class="stat">
                <div class="stat-number">
                    ${streak}
                </div>
                <div class="stat-label">
                    Série
                </div>
            </div>

            <div class="stat">
                <div class="stat-number">
                    ${bestStreak}
                </div>
                <div class="stat-label">
                    Record
                </div>
            </div>
        `;
    }

    if (nextExamCard) {

        if (nextControl) {

            nextExamCard.innerHTML = `

                <h3>
                    ${escapeHTML(nextControl.subject)}
                </h3>

                <p>
                    ${escapeHTML(nextControl.chapter)}
                </p>

                <p>
                    Dans ${
                        getDaysLeft(nextControl.date)
                    } jour(s)
                </p>
            `;

        } else {

            nextExamCard.innerHTML = `
                <h2>Aucun contrôle prévu</h2>
            `;
        }
    }

    const revisionsNeeded =
        futureControls
            .filter(
                control =>
                    (Number(control.progress) || 0) < 100
            )
            .slice(0, 3);

    if (todayRevision) {

        if (revisionsNeeded.length) {

            todayRevision.innerHTML = `
                <h2>À réviser aujourd'hui</h2>
            `;

            revisionsNeeded.forEach(
                control => {

                    todayRevision.innerHTML += `

                        <div class="today-item">

                            <strong>
                                ${escapeHTML(control.subject)}
                            </strong>

                            <p>
                                ${escapeHTML(control.chapter)}
                            </p>

                            <p>
                                ${
                                    Number(control.progress) || 0
                                }% terminé
                            </p>

                        </div>
                    `;
                }
            );

        } else {

            todayRevision.innerHTML = `
                <h2>Tout est révisé !</h2>
            `;
        }
    }

    controls.forEach(
        (control, index) => {

            const daysLeft =
                getDaysLeft(control.date);

            let className = "normal";

            if (daysLeft <= 3) {
                className = "urgent";
            } else if (daysLeft <= 7) {
                className = "soon";
            }

            const progress =
                Number(control.progress) || 0;

            controlsContainer.innerHTML += `

                <div class="card control">

                    <h3>
                        ${escapeHTML(control.subject)}
                    </h3>

                    <p>
                        Chapitre :
                        ${escapeHTML(control.chapter)}
                    </p>

                    <p>
                        Date :
                        ${formatDate(control.date)}
                    </p>

                    <p class="days ${className}">
                        ${
                            daysLeft === 0
                                ? "Contrôle aujourd'hui"
                                : daysLeft === 1
                                    ? "Contrôle demain"
                                    : `${daysLeft} jour(s) restant(s)`
                        }
                    </p>

                    <p>
                        Révision :
                        ${progress}%
                    </p>

                    <select id="revisionTime${index}">

                        <option value="5">
                            5 min
                        </option>

                        <option value="15" selected>
                            15 min
                        </option>

                        <option value="30">
                            30 min
                        </option>

                        <option value="60">
                            1 h
                        </option>

                    </select>

                    <button
                        class="revise-btn"
                        onclick="startRevision(${index}, this)"
                    >
                        Réviser
                    </button>

                    <button
                        class="delete-btn"
                        onclick="removeControl(${index})"
                    >
                        Supprimer
                    </button>

                </div>
            `;
        }
    );
}


/* ================================================= */
/*                SUPPRESSION CONTRÔLE               */
/* ================================================= */

async function removeControl(index) {

    const control =
        controls[index];

    if (!control || !control._id) {

        alert(
            "Contrôle introuvable."
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/api/controls/" +
                control._id,
                {
                    method: "DELETE",
                    credentials: "include"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de supprimer le contrôle."
            );

            return;
        }

        controls.splice(index, 1);

        render();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                  FICHE IA                         */
/* ================================================= */

async function generateRevisionSheet() {

    const resultDiv =
        document.getElementById("aiResult");

    const course =
        document
            .getElementById("courseInput")
            ?.value || "";

    if (!course.trim()) {

        alert(
            "Colle un cours avant de générer une fiche."
        );

        return;
    }

    if (course.length > 10000) {

        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="ai-card error">
                    Le cours dépasse 10 000 caractères.
                </div>
            `;
        }

        return;
    }

    if (resultDiv) {
        resultDiv.innerHTML = `
            <div class="loading">
                Génération de la fiche...
            </div>
        `;
    }

    try {

        const response =
            await fetch("/generate", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    course
                })
            });

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Erreur génération."
            );
        }

        const historyResponse =
            await fetch(
                "/api/history",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        course,
                        result: data
                    })
                }
            );

        const historyData =
            await historyResponse.json();

        if (!historyResponse.ok) {

            throw new Error(
                historyData.error ||
                "Impossible de sauvegarder la fiche."
            );
        }

        if (historyData.history) {

            history.unshift(
                historyData.history
            );
        }

        renderHistory();

        displayRevisionSheet(data);

    } catch (error) {

        console.error(error);

        if (resultDiv) {

            resultDiv.innerHTML = `
                <div class="ai-card error">
                    ${escapeHTML(
                        error.message ||
                        "Erreur lors de la génération."
                    )}
                </div>
            `;
        }
    }
}


function displayRevisionSheet(data) {

    const resultDiv =
        document.getElementById("aiResult");

    if (!resultDiv) {
        return;
    }

    resultDiv.innerHTML = `

        <div class="ai-card">

            <h2>Résumé</h2>

            <p>
                ${escapeHTML(data.summary || "")}
            </p>

        </div>

        <div class="ai-card">

            <h2>Notions clés</h2>

            <ul>

                ${
                    Array.isArray(data.keyPoints)
                        ? data.keyPoints
                            .map(
                                point =>
                                    `<li>${escapeHTML(point)}</li>`
                            )
                            .join("")
                        : ""
                }

            </ul>

        </div>

        <div class="ai-card">

            <h2>Quiz</h2>

            ${
                Array.isArray(data.quiz)
                    ? data.quiz
                        .map(
                            (question, index) => `

                                <div class="quiz-card">

                                    <h3>
                                        Question ${index + 1}
                                    </h3>

                                    <p>
                                        ${escapeHTML(
                                            question.question
                                        )}
                                    </p>

                                    <details>

                                        <summary>
                                            Voir la réponse
                                        </summary>

                                        <p>
                                            ${escapeHTML(
                                                question.answer
                                            )}
                                        </p>

                                    </details>

                                </div>
                            `
                        )
                        .join("")
                    : ""
            }

        </div>
    `;
}


/* ================================================= */
/*                  HISTORIQUE                       */
/* ================================================= */

function renderHistory() {

    const historyList =
        document.getElementById("historyList");

    if (!historyList) {
        return;
    }

    const searchInput =
        document.getElementById("historySearch");

    const search =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : "";

    const filtered =
        history.filter(
            item =>
                String(item.course || "")
                    .toLowerCase()
                    .includes(search)
        );

    historyList.innerHTML = "";

    filtered.forEach(
        item => {

            const realIndex =
                history.indexOf(item);

            historyList.innerHTML += `

                <div class="history-card">

                    <div class="history-info">

                        <strong>
                            ${escapeHTML(
                                item.course ||
                                "Fiche sans nom"
                            )}
                        </strong>

                    </div>

                    <div class="history-actions">

                        <button
                            onclick="loadHistory(${realIndex})"
                        >
                            Ouvrir
                        </button>

                        <button
                            onclick="renameHistory(${realIndex})"
                        >
                            Renommer
                        </button>

                        <button
                            onclick="shareHistory(${realIndex})"
                        >
                            Partager
                        </button>

                        <button
                            class="delete-history-btn"
                            onclick="deleteHistory(${realIndex})"
                        >
                            Supprimer
                        </button>

                    </div>

                </div>
            `;
        }
    );
}


function loadHistory(index) {

    const item =
        history[index];

    if (!item || !item.result) {

        alert(
            "Fiche introuvable."
        );

        return;
    }

    displayRevisionSheet(item.result);

    const resultDiv =
        document.getElementById("aiResult");

    if (resultDiv) {

        resultDiv.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


/* ================================================= */
/*                  RENOMMER                         */
/* ================================================= */

async function renameHistory(index) {

    const item =
        history[index];

    if (!item || !item._id) {

        alert(
            "Fiche introuvable."
        );

        return;
    }

    const newName =
        prompt(
            "Nouveau nom de la fiche :",
            item.course
        );

    if (!newName || !newName.trim()) {
        return;
    }

    try {

        const response =
            await fetch(
                "/api/history/" +
                item._id,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        course:
                            newName.trim()
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de renommer la fiche."
            );

            return;
        }

        if (data.history) {

            history[index] =
                data.history;

        } else {

            history[index].course =
                newName.trim();
        }

        renderHistory();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                  SUPPRIMER                        */
/* ================================================= */

async function deleteHistory(index) {

    const item =
        history[index];

    if (!item || !item._id) {

        alert(
            "Fiche introuvable."
        );

        return;
    }

    const confirmed =
        confirm(
            "Supprimer cette fiche ?"
        );

    if (!confirmed) {
        return;
    }

    try {

        const response =
            await fetch(
                "/api/history/" +
                item._id,
                {
                    method: "DELETE",
                    credentials: "include"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de supprimer la fiche."
            );

            return;
        }

        history.splice(index, 1);

        renderHistory();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                    PARTAGE                        */
/* ================================================= */

async function shareHistory(index) {

    const item =
        history[index];

    if (!item || !item._id) {

        alert(
            "Fiche introuvable."
        );

        return;
    }

    try {

        const response =
            await fetch("/share", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    historyId:
                        item._id
                })
            });

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de partager la fiche."
            );

            return;
        }

        prompt(
            "Code de partage :",
            data.code
        );

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                    IMPORT                         */
/* ================================================= */

async function importSheet() {

    const input =
        document.getElementById("shareCode");

    const code =
        input
            ? input.value
                .trim()
                .toUpperCase()
            : "";

    if (!code) {

        alert(
            "Entre un code."
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/share/" +
                encodeURIComponent(code),
                {
                    credentials: "include"
                }
            );

        const sheet =
            await response.json();

        if (!response.ok) {

            alert(
                sheet.error ||
                "Code invalide."
            );

            return;
        }

        const historyResponse =
            await fetch(
                "/api/history",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        course:
                            sheet.course,
                        result:
                            sheet.result
                    })
                }
            );

        const historyData =
            await historyResponse.json();

        if (!historyResponse.ok) {

            alert(
                historyData.error ||
                "Impossible d'importer la fiche."
            );

            return;
        }

        history.unshift(
            historyData.history
        );

        renderHistory();

        alert(
            "Fiche importée !"
        );

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                    SÉRIE                          */
/* ================================================= */

async function updateStreak() {

    const today =
        new Date();

    const todayKey =
        today
            .toISOString()
            .slice(0, 10);

    const yesterday =
        new Date(
            today.getTime() -
            86400000
        );

    const yesterdayKey =
        yesterday
            .toISOString()
            .slice(0, 10);

    try {

        const meResponse =
            await fetch("/me", {
                credentials: "include"
            });

        if (!meResponse.ok) {
            return;
        }

        const me =
            await meResponse.json();

        const lastRevision =
            me.user?.lastRevisionDate ||
            null;

        if (lastRevision === todayKey) {
            return;
        }

        if (lastRevision === yesterdayKey) {
            streak++;
        } else {
            streak = 1;
        }

        if (streak > bestStreak) {
            bestStreak = streak;
        }

        await saveStats();

    } catch (error) {

        console.error(
            "Erreur série :",
            error
        );
    }
}


/* ================================================= */
/*                 CHRONOMÈTRE                       */
/* ================================================= */

function startRevision(index, button) {

    const select =
        document.getElementById(
            `revisionTime${index}`
        );

    if (!select) {
        return;
    }

    const minutes =
        Number(select.value);

    let timeLeft =
        minutes * 60;

    button.disabled = true;

    const interval =
        setInterval(
            () => {

                timeLeft--;

                const mins =
                    Math.floor(
                        timeLeft / 60
                    );

                const secs =
                    String(
                        timeLeft % 60
                    ).padStart(
                        2,
                        "0"
                    );

                button.textContent =
                    `${mins}:${secs}`;

                if (timeLeft <= 0) {

                    clearInterval(interval);

                    revise(
                        index,
                        minutes
                    );
                }

            },
            1000
        );
}


/* ================================================= */
/*                  SÉCURITÉ HTML                    */
/* ================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* ================================================= */
/*                   MENU PROFIL                     */
/* ================================================= */

function initializeProfileMenu() {

    const profileButton =
        document.getElementById(
            "profileButton"
        );

    const profileDropdown =
        document.getElementById(
            "profileDropdown"
        );

    const settingsButton =
        document.getElementById(
            "settingsButton"
        );

    const logoutButton =
        document.getElementById(
            "logoutButton"
        );

    profileButton?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            profileDropdown?.classList.toggle(
                "open"
            );
        }
    );

    profileDropdown?.addEventListener(
        "click",
        event => {

            event.stopPropagation();
        }
    );

    document.addEventListener(
        "click",
        () => {

            profileDropdown?.classList.remove(
                "open"
            );
        }
    );

    settingsButton?.addEventListener(
        "click",
        () => {

            profileDropdown?.classList.remove(
                "open"
            );

            openSettings();
        }
    );

    logoutButton?.addEventListener(
        "click",
        logout
    );
}


/* ================================================= */
/*                    DÉCONNEXION                    */
/* ================================================= */

async function logout() {

    try {

        const response =
            await fetch(
                "/logout",
                {
                    method: "POST",
                    credentials: "include"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de se déconnecter."
            );

            return;
        }

        const profileDropdown =
            document.getElementById(
                "profileDropdown"
            );

        profileDropdown?.classList.remove(
            "open"
        );

        const app =
            document.getElementById("app");

        const loginScreen =
            document.getElementById(
                "loginScreen"
            );

        if (app) {
            app.style.display = "none";
        }

        if (loginScreen) {
            loginScreen.style.display = "block";
        }

        const loginEmail =
            document.getElementById(
                "loginEmail"
            );

        const loginPassword =
            document.getElementById(
                "loginPassword"
            );

        if (loginEmail) {
            loginEmail.value = "";
        }

        if (loginPassword) {
            loginPassword.value = "";
        }

        currentUser = null;

        showLogin();

    } catch (error) {

        console.error(
            "Erreur déconnexion :",
            error
        );

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                PARAMÈTRES                         */
/* ================================================= */

function openSettings() {

    const settingsPage =
        document.getElementById(
            "settingsPage"
        );

    const profileMenu =
        document.querySelector(
            ".profile-menu-container"
        );

    const container =
        document.querySelector(
            ".container"
        );

    if (!settingsPage) {
        return;
    }

    if (profileMenu) {
        profileMenu.style.display = "none";
    }

    if (container) {
        container.style.display = "none";
    }

    settingsPage.style.display = "block";

    loadSettings();
}


function closeSettings() {

    const settingsPage =
        document.getElementById(
            "settingsPage"
        );

    const profileMenu =
        document.querySelector(
            ".profile-menu-container"
        );

    const container =
        document.querySelector(
            ".container"
        );

    if (!settingsPage) {
        return;
    }

    settingsPage.style.display = "none";

    if (profileMenu) {
        profileMenu.style.display = "block";
    }

    if (container) {
        container.style.display = "block";
    }
}


async function loadSettings() {

    const usernameElement =
        document.getElementById(
            "settingsUsername"
        );

    const emailElement =
        document.getElementById(
            "settingsEmail"
        );

    const themeSelect =
        document.getElementById(
            "themeSelect"
        );

    try {

        const response =
            await fetch("/me", {
                credentials: "include"
            });

        if (!response.ok) {

            throw new Error(
                "Impossible de récupérer le profil."
            );
        }

        const data =
            await response.json();

        if (!data.loggedIn || !data.user) {
            return;
        }

        currentUser =
            data.user;

        if (usernameElement) {

            usernameElement.textContent =
                currentUser.username ||
                "Non renseigné";
        }

        if (emailElement) {

            emailElement.textContent =
                currentUser.email ||
                "Non renseigné";
        }

    } catch (error) {

        console.error(
            "Erreur chargement paramètres :",
            error
        );

        if (usernameElement) {
            usernameElement.textContent =
                "Impossible de charger";
        }

        if (emailElement) {
            emailElement.textContent =
                "Impossible de charger";
        }
    }

    const savedTheme =
        localStorage.getItem(
            "capControleTheme"
        ) || "light";

    if (themeSelect) {
        themeSelect.value = savedTheme;
    }

    applyTheme(savedTheme);
}


/* ================================================= */
/*                 MODIFIER PSEUDO                   */
/* ================================================= */

async function editUsername() {

    if (!currentUser) {
        await loadSettings();
    }

    const newUsername =
        prompt(
            "Entre ton nouveau pseudo :",
            currentUser?.username || ""
        );

    if (newUsername === null) {
        return;
    }

    const username =
        newUsername.trim();

    if (username.length < 2) {

        alert(
            "Le pseudo doit contenir au moins 2 caractères."
        );

        return;
    }

    if (username.length > 30) {

        alert(
            "Le pseudo ne peut pas dépasser 30 caractères."
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/api/account/username",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        username
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de modifier le pseudo."
            );

            return;
        }

        currentUser.username =
            username;

        const usernameElement =
            document.getElementById(
                "settingsUsername"
            );

        if (usernameElement) {
            usernameElement.textContent =
                username;
        }

        alert(
            "Ton pseudo a été modifié."
        );

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*              MODIFIER MOT DE PASSE                */
/* ================================================= */

async function changePassword() {

    const newPassword =
        prompt(
            "Entre ton nouveau mot de passe :"
        );

    if (newPassword === null) {
        return;
    }

    if (newPassword.length < 6) {

        alert(
            "Le mot de passe doit contenir au moins 6 caractères."
        );

        return;
    }

    const confirmation =
        prompt(
            "Confirme ton nouveau mot de passe :"
        );

    if (confirmation === null) {
        return;
    }

    if (newPassword !== confirmation) {

        alert(
            "Les mots de passe ne correspondent pas."
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/api/account/password",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        password:
                            newPassword
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de modifier le mot de passe."
            );

            return;
        }

        alert(
            "Ton mot de passe a été modifié."
        );

    } catch (error) {

        console.error(error);

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                SUPPRIMER COMPTE                   */
/* ================================================= */

async function deleteAccount() {

    const confirmation =
        confirm(
            "⚠️ Es-tu sûr de vouloir supprimer ton compte ?\n\n" +
            "Toutes tes données seront supprimées définitivement."
        );

    if (!confirmation) {
        return;
    }

    const secondConfirmation =
        prompt(
            'Pour confirmer, écris "SUPPRIMER".'
        );

    if (secondConfirmation !== "SUPPRIMER") {

        alert(
            "Suppression annulée."
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/api/account",
                {
                    method: "DELETE",
                    credentials: "include"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Impossible de supprimer le compte."
            );

            return;
        }

        alert(
            "Ton compte a été supprimé."
        );

        currentUser = null;

        const app =
            document.getElementById("app");

        const settingsPage =
            document.getElementById(
                "settingsPage"
            );

        const loginScreen =
            document.getElementById(
                "loginScreen"
            );

        if (app) {
            app.style.display = "none";
        }

        if (settingsPage) {
            settingsPage.style.display = "none";
        }

        if (loginScreen) {
            loginScreen.style.display = "block";
        }

        showLogin();

    } catch (error) {

        console.error(
            "Erreur suppression compte :",
            error
        );

        alert(
            "Impossible de contacter le serveur."
        );
    }
}


/* ================================================= */
/*                  ONBOARDING                       */
/* ================================================= */

let onboardingStep = 1;

const onboardingData = {
    role: null,
    class: null,
    subjects: [],
    objective: null,
    time: null
};


/* ================================================= */
/*              UTILITAIRES ONBOARDING               */
/* ================================================= */

function getOnboardingKey() {

    if (currentUser?.email) {

        return (
            "capControleOnboarding_" +
            currentUser.email.toLowerCase()
        );
    }

    return "capControleOnboarding";
}


function hasCompletedOnboarding() {

    return (
        localStorage.getItem(
            getOnboardingKey()
        ) === "true"
    );
}


function saveOnboarding() {

    localStorage.setItem(
        getOnboardingKey(),
        "true"
    );

    localStorage.setItem(
        getOnboardingKey() + "_data",
        JSON.stringify(onboardingData)
    );
}


function loadOnboardingData() {

    try {

        const saved =
            localStorage.getItem(
                getOnboardingKey() + "_data"
            );

        if (!saved) {
            return;
        }

        const data =
            JSON.parse(saved);

        if (
            data &&
            typeof data === "object"
        ) {

            Object.assign(
                onboardingData,
                data
            );
        }

    } catch (error) {

        console.error(
            "Erreur chargement onboarding :",
            error
        );
    }
}



/* ================================================= */
/*                AFFICHAGE ÉCRANS                   */
/* ================================================= */


function waitForIntroThen(callback) {

    const loadingBar =
        document.querySelector(".loading-bar div");

    if (!loadingBar) {
        setTimeout(callback, 2200);
        return;
    }

    let finished = false;

    const finishOnce = () => {

        if (finished) {
            return;
        }

        finished = true;

        setTimeout(callback, 150);
    };

    loadingBar.addEventListener(
        "animationend",
        finishOnce,
        { once: true }
    );

    setTimeout(finishOnce, 3500);
}

function showIntro() {

    const intro = document.getElementById("intro");
    const onboarding = document.getElementById("onboarding");
    const success = document.getElementById("success");
    const app = document.getElementById("app");

    if (app) app.style.display = "none";

    if (intro) {
        intro.classList.remove("hidden");
        intro.style.display = "flex";
    }

    if (onboarding) onboarding.classList.add("hidden");
    if (success) success.classList.add("hidden");

    waitForIntroThen(() => {

        if (intro) {
            intro.classList.add("hidden");
            intro.style.display = "none";
        }

        if (onboarding) {
            onboarding.classList.remove("hidden");
            onboardingStep = 1;
            updateOnboarding();
        }
    });
}


function showSuccess() {

    const onboarding =
        document.getElementById("onboarding");

    const success =
        document.getElementById("success");

    if (onboarding) {
        onboarding.classList.add("hidden");
    }

    if (success) {
        success.classList.remove("hidden");
    }

    const summary =
        document.getElementById(
            "profileSummary"
        );

    if (!summary) {
        return;
    }

    summary.innerHTML = `

        <strong>
            Ton profil
        </strong>

        <br><br>

        🎓 ${
            onboardingData.role === "eleve"
                ? "Élève"
                : "Professeur"
        }

        <br>

        ${
            onboardingData.class
                ? "📚 Classe : " +
                  escapeHTML(
                      onboardingData.class
                  ) +
                  "<br>"
                : ""
        }

        ${
            onboardingData.subjects.length
                ? "📖 Matières : " +
                  onboardingData.subjects
                    .map(
                        subject =>
                            escapeHTML(subject)
                    )
                    .join(", ") +
                  "<br>"
                : ""
        }

        🎯 Objectif :
        ${
            getObjectiveLabel(
                onboardingData.objective
            )
        }

        <br>

        ⏱️ Temps disponible :
        ${onboardingData.time}
        min
    `;
}


function showApp() {

    const intro =
        document.getElementById("intro");

    const onboarding =
        document.getElementById("onboarding");

    const success =
        document.getElementById("success");

    const loginScreen =
        document.getElementById("loginScreen");

    const app =
        document.getElementById("app");

    if (intro) {
        intro.classList.add("hidden");
    }

    if (onboarding) {
        onboarding.classList.add("hidden");
    }

    if (success) {
        success.classList.add("hidden");
    }

    if (loginScreen) {
        loginScreen.style.display = "none";
    }

    if (app) {
        app.style.display = "block";
    }
}


/* ================================================= */
/*                    ÉTAPES                         */
/* ================================================= */

function updateOnboarding() {

    const steps =
        document.querySelectorAll(
            "#steps .step"
        );

    steps.forEach(
        step => {

            const stepNumber =
                Number(step.dataset.step);

            step.classList.toggle(
                "active",
                stepNumber === onboardingStep
            );
        }
    );

    const progressBar =
        document.getElementById(
            "progressBar"
        );

    const stepNumber =
        document.getElementById(
            "stepNumber"
        );

    if (progressBar) {

        progressBar.style.width =
            `${(onboardingStep / 6) * 100}%`;
    }

    if (stepNumber) {

        stepNumber.textContent =
            `${onboardingStep}/6`;
    }

    updateContinueButton();
}


function updateContinueButton() {

    const currentStep =
        document.querySelector(
            `.step[data-step="${onboardingStep}"]`
        );

    if (!currentStep) {
        return;
    }

    const button =
        currentStep.querySelector(
            ".next-button"
        );

    if (!button) {
        return;
    }

    let valid = false;

    switch (onboardingStep) {

        case 1:
            valid = true;
            break;

        case 2:
            valid =
                onboardingData.role !== null;
            break;

        case 3:
            valid =
                onboardingData.class !== null;
            break;

        case 4:
            valid =
                onboardingData.subjects.length > 0;
            break;

        case 5:
            valid =
                onboardingData.objective !== null;
            break;

        default:
            valid = true;
    }

    button.classList.toggle(
        "disabled",
        !valid
    );

    button.disabled =
        !valid;
}


/* ================================================= */
/*                  OBJECTIFS LABELS                 */
/* ================================================= */

function getObjectiveLabel(value) {

    const labels = {

        notes:
            "Améliorer mes notes",

        controle:
            "Préparer un contrôle",

        bac:
            "Préparer un examen",

        regularite:
            "Réviser régulièrement",

        retard:
            "Rattraper mon retard"
    };

    return escapeHTML(
        labels[value] ||
        "Non renseigné"
    );
}


/* ================================================= */
/*              TERMINER ONBOARDING                  */
/* ================================================= */

async function completeOnboarding() {

    saveOnboarding();

    showApp();

    await loadControls();
    await loadAccountData();
}


/* ================================================= */
/*          DÉMARRER EXPÉRIENCE COMPTE              */
/* ================================================= */

async function startAccountExperience() {

    loadOnboardingData();

    if (hasCompletedOnboarding()) {

        waitForIntroThen(async () => {

            showApp();

            await loadControls();
            await loadAccountData();
        });

        return;
    }

    showIntro();
}

/* ================================================= */
/*             INITIALISATION DOM                    */
/* ================================================= */

function initializeApp() {

    controlsContainer =
        document.getElementById("controls");


    /* ========================= */
    /* THÈME */
    /* ========================= */

    loadTheme();

    const themeSelect =
        document.getElementById(
            "themeSelect"
        );

    if (themeSelect) {

        themeSelect.addEventListener(
            "change",
            changeTheme
        );
    }


    /* ========================= */
    /* AJOUT CONTRÔLE */
    /* ========================= */

    document
        .getElementById("addBtn")
        ?.addEventListener(
            "click",
            addControl
        );


    /* ========================= */
    /* MENU PROFIL */
    /* ========================= */

    initializeProfileMenu();


    /* ========================= */
    /* RETOUR ONBOARDING */
    /* ========================= */

    document
        .getElementById("backButton")
        ?.addEventListener(
            "click",
            () => {

                if (onboardingStep <= 1) {
                    return;
                }

                onboardingStep--;

                updateOnboarding();
            }
        );


    /* ========================= */
    /* BOUTONS CONTINUER */
    /* ========================= */

    document
        .querySelectorAll(".next-button")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        if (
                            button.disabled ||
                            button.classList.contains(
                                "disabled"
                            )
                        ) {
                            return;
                        }

                        if (
                            onboardingStep < 6
                        ) {

                            onboardingStep++;

                            updateOnboarding();
                        }
                    }
                );
            }
        );


    /* ========================= */
    /* RÔLE */
    /* ========================= */

    document
        .querySelectorAll(".choice-card")
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".choice-card"
                            )
                            .forEach(
                                element =>
                                    element.classList.remove(
                                        "selected"
                                    )
                            );

                        card.classList.add(
                            "selected"
                        );

                        onboardingData.role =
                            card.dataset.value;

                        updateContinueButton();
                    }
                );
            }
        );


    /* ========================= */
    /* CLASSE */
    /* ========================= */

    document
        .querySelectorAll(".small-choice")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".small-choice"
                            )
                            .forEach(
                                element =>
                                    element.classList.remove(
                                        "selected"
                                    )
                            );

                        button.classList.add(
                            "selected"
                        );

                        onboardingData.class =
                            button.dataset.value;

                        updateContinueButton();
                    }
                );
            }
        );


    /* ========================= */
    /* MATIÈRES */
    /* ========================= */

    document
        .querySelectorAll(".subject")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const value =
                            button.dataset.value;

                        button.classList.toggle(
                            "selected"
                        );

                        if (
                            onboardingData.subjects
                                .includes(value)
                        ) {

                            onboardingData.subjects =
                                onboardingData.subjects
                                    .filter(
                                        subject =>
                                            subject !== value
                                    );

                        } else {

                            onboardingData.subjects
                                .push(value);
                        }

                        updateContinueButton();
                    }
                );
            }
        );


    /* ========================= */
    /* OBJECTIF */
    /* ========================= */

    document
        .querySelectorAll(".objective")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".objective"
                            )
                            .forEach(
                                element =>
                                    element.classList.remove(
                                        "selected"
                                    )
                            );

                        button.classList.add(
                            "selected"
                        );

                        onboardingData.objective =
                            button.dataset.value;

                        updateContinueButton();
                    }
                );
            }
        );


    /* ========================= */
    /* TEMPS */
    /* ========================= */

    document
        .querySelectorAll(".time-choice")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".time-choice"
                            )
                            .forEach(
                                element =>
                                    element.classList.remove(
                                        "selected"
                                    )
                            );

                        button.classList.add(
                            "selected"
                        );

                        onboardingData.time =
                            button.dataset.value;

                        const finishButton =
                            document.getElementById(
                                "finishButton"
                            );

                        if (finishButton) {

                            finishButton.classList.remove(
                                "disabled"
                            );

                            finishButton.disabled =
                                false;
                        }
                    }
                );
            }
        );


    /* ========================= */
    /* TERMINER */
    /* ========================= */

    document
        .getElementById("finishButton")
        ?.addEventListener(
            "click",
            async () => {

                const button =
                    document.getElementById(
                        "finishButton"
                    );

                if (
                    !onboardingData.time ||
                    button?.disabled
                ) {
                    return;
                }

                saveOnboarding();

                showSuccess();
            }
        );


    /* ========================= */
    /* DÉCOUVRIR */
    /* ========================= */

    document
        .getElementById("discoverButton")
        ?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await completeOnboarding();
            }
        );


    /* ========================= */
    /* RECHERCHE HISTORIQUE */
    /* ========================= */

    document
        .getElementById("historySearch")
        ?.addEventListener(
            "input",
            renderHistory
        );
}


/* ================================================= */
/*                 INITIALISATION                    */
/* ================================================= */

window.addEventListener(
    "load",
    () => {

        initializeApp();

        if (hasCompletedOnboarding()) {

            const intro =
                document.getElementById("intro");

            if (intro) {
                intro.classList.add("hidden");
                intro.style.display = "none";
            }

            showSuccess();

        } else {

            showIntro();
        }
    }
);
