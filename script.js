let streak = 0;
let bestStreak = 0;

let controls = [];
let history = [];

const controlsContainer = document.getElementById("controls");

/* ================================================= */
/*                    CONTRÔLES                      */
/* ================================================= */

async function loadControls() {
    try {
        const response = await fetch("/api/controls", {
            credentials: "include"
        });

        if (!response.ok) {
            console.error("Impossible de charger les contrôles.");
            return;
        }

        controls = await response.json();

        if (!Array.isArray(controls)) {
            controls = [];
        }

        render();
    } catch (error) {
        console.error("Erreur chargement contrôles :", error);
    }
}

document.getElementById("addBtn")?.addEventListener("click", addControl);

async function addControl() {
    const subject = document.getElementById("subject").value.trim();
    const chapter = document.getElementById("chapter").value.trim();
    const date = document.getElementById("date").value;

    if (!subject || !chapter || !date) {
        alert("Remplis tous les champs.");
        return;
    }

    try {
        const response = await fetch("/api/controls", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                subject,
                chapter,
                date
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Impossible d'ajouter le contrôle.");
            return;
        }

        controls.push(data.control);
        render();

        document.getElementById("subject").value = "";
        document.getElementById("chapter").value = "";
        document.getElementById("date").value = "";
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                  DONNÉES COMPTE                   */
/* ================================================= */

async function loadAccountData() {
    try {
        const statsResponse = await fetch("/api/stats", {
            credentials: "include"
        });

        if (statsResponse.ok) {
            const stats = await statsResponse.json();

            streak = Number(stats.streak) || 0;
            bestStreak = Number(stats.bestStreak) || 0;
        }

        const historyResponse = await fetch("/api/history", {
            credentials: "include"
        });

        if (historyResponse.ok) {
            const data = await historyResponse.json();
            history = Array.isArray(data) ? data : [];
        } else {
            history = [];
        }

        render();
        renderHistory();
    } catch (error) {
        console.error("Erreur chargement données compte :", error);
    }
}

async function saveStats() {
    try {
        const response = await fetch("/api/stats", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                streak,
                bestStreak
            })
        });

        if (!response.ok) {
            console.error("Impossible de sauvegarder la série.");
        }
    } catch (error) {
        console.error("Erreur sauvegarde série :", error);
    }
}

/* ================================================= */
/*                     DATES                         */
/* ================================================= */

function getDaysLeft(date) {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const parts = String(date).split("-");

    if (parts.length !== 3) {
        return 0;
    }

    const examDate = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );

    examDate.setHours(0, 0, 0, 0);

    return Math.round(
        (examDate - today) / (1000 * 60 * 60 * 24)
    );
}

function formatDate(dateString) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long"
    });
}

/* ================================================= */
/*                    CONNEXION                      */
/* ================================================= */

async function login() {
    const email = document
        .getElementById("loginEmail")
        .value
        .trim();

    const password = document
        .getElementById("loginPassword")
        .value;

    if (!email || !password) {
        alert("Remplis tous les champs.");
        return;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Erreur de connexion.");
            return;
        }

        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";

        await loadControls();
        await loadAccountData();
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                   INSCRIPTION                     */
/* ================================================= */

async function register() {
    const username = document
        .getElementById("registerUsername")
        .value
        .trim();

    const email = document
        .getElementById("registerEmail")
        .value
        .trim();

    const password = document
        .getElementById("registerPassword")
        .value;

    const confirmPassword = document
        .getElementById("registerPasswordConfirm")
        .value;

    if (!username || !email || !password || !confirmPassword) {
        alert("Remplis tous les champs.");
        return;
    }

    if (password !== confirmPassword) {
        alert("Les mots de passe ne correspondent pas.");
        return;
    }

    try {
        const response = await fetch("/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                username,
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Erreur lors de la création du compte."
            );
            return;
        }

        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";

        await loadControls();
        await loadAccountData();
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

function showRegister() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "block";
    document.getElementById("authTitle").textContent = "Créer un compte";
}

function showLogin() {
    document.getElementById("registerForm").style.display = "none";
    document.getElementById("loginForm").style.display = "block";
    document.getElementById("authTitle").textContent = "Connexion";
}

/* ================================================= */
/*                    RÉVISION                       */
/* ================================================= */

async function revise(index, minutes) {
    const control = controls[index];

    if (!control || !control._id) {
        alert("Contrôle introuvable.");
        return;
    }

    const newProgress = Math.min(
        100,
        (Number(control.progress) || 0) + Number(minutes)
    );

    try {
        const response = await fetch(
            "/api/controls/" + control._id,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    progress: newProgress
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Impossible de sauvegarder la progression."
            );
            return;
        }

        control.progress = newProgress;

        await updateStreak();

        render();
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                     AFFICHAGE                     */
/* ================================================= */

function render() {
    if (!controlsContainer) {
        return;
    }

    controls.sort(
        (a, b) =>
            new Date(a.date) - new Date(b.date)
    );

    controlsContainer.innerHTML = "";

    const dashboard = document.getElementById("dashboard");
    const nextExamCard = document.getElementById("nextExam");
    const todayRevision = document.getElementById("todayRevision");

    const futureControls = controls.filter(
        control => getDaysLeft(control.date) >= 0
    );

    const nextControl = futureControls[0];

    if (dashboard) {
        dashboard.innerHTML = `
            <div class="stat">
                <div class="stat-number">${controls.length}</div>
                <div class="stat-label">Contrôles</div>
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
                <div class="stat-label">Cette semaine</div>
            </div>

            <div class="stat">
                <div class="stat-number">
                    ${
                        nextControl
                            ? getDaysLeft(nextControl.date)
                            : "-"
                    }
                </div>
                <div class="stat-label">Jours restants</div>
            </div>

            <div class="stat">
                <div class="stat-number">${streak}</div>
                <div class="stat-label">Série</div>
            </div>

            <div class="stat">
                <div class="stat-number">${bestStreak}</div>
                <div class="stat-label">Record</div>
            </div>
        `;
    }

    if (nextExamCard) {
        if (nextControl) {
            nextExamCard.innerHTML = `
                <h3>${escapeHTML(nextControl.subject)}</h3>
                <p>${escapeHTML(nextControl.chapter)}</p>
                <p>
                    Dans ${getDaysLeft(nextControl.date)} jour(s)
                </p>
            `;
        } else {
            nextExamCard.innerHTML = `
                <h2>Aucun contrôle prévu</h2>
            `;
        }
    }

    const revisionsNeeded = futureControls
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

            revisionsNeeded.forEach(control => {
                todayRevision.innerHTML += `
                    <div class="today-item">
                        <strong>
                            ${escapeHTML(control.subject)}
                        </strong>

                        <p>
                            ${escapeHTML(control.chapter)}
                        </p>

                        <p>
                            ${Number(control.progress) || 0}% terminé
                        </p>
                    </div>
                `;
            });
        } else {
            todayRevision.innerHTML = `
                <h2>Tout est révisé !</h2>
            `;
        }
    }

    controls.forEach((control, index) => {
        const daysLeft = getDaysLeft(control.date);

        let className = "normal";

        if (daysLeft <= 3) {
            className = "urgent";
        } else if (daysLeft <= 7) {
            className = "soon";
        }

        const progress = Number(control.progress) || 0;

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
                    <option value="5">5 min</option>

                    <option value="15" selected>
                        15 min
                    </option>

                    <option value="30">30 min</option>

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
    });
}

/* ================================================= */
/*                SUPPRESSION CONTRÔLE               */
/* ================================================= */

async function removeControl(index) {
    const control = controls[index];

    if (!control || !control._id) {
        alert("Contrôle introuvable.");
        return;
    }

    try {
        const response = await fetch(
            "/api/controls/" + control._id,
            {
                method: "DELETE",
                credentials: "include"
            }
        );

        const data = await response.json();

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
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                  FICHE IA                         */
/* ================================================= */

async function generateRevisionSheet() {
    const resultDiv = document.getElementById("aiResult");

    const course = document
        .getElementById("courseInput")
        .value;

    if (!course.trim()) {
        alert("Colle un cours avant de générer une fiche.");
        return;
    }

    if (course.length > 10000) {
        resultDiv.innerHTML = `
            <div class="ai-card error">
                Le cours dépasse 10 000 caractères.
            </div>
        `;
        return;
    }

    resultDiv.innerHTML = `
        <div class="loading">
            Génération de la fiche...
        </div>
    `;

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                course
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Erreur génération."
            );
        }

        const historyResponse = await fetch(
            "/api/history",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
            history.unshift(historyData.history);
        }

        renderHistory();
        displayRevisionSheet(data);
    } catch (error) {
        console.error(error);

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

function displayRevisionSheet(data) {
    const resultDiv = document.getElementById("aiResult");

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
            ? searchInput.value.toLowerCase().trim()
            : "";

    const filtered = history.filter(
        item =>
            String(item.course || "")
                .toLowerCase()
                .includes(search)
    );

    historyList.innerHTML = "";

    filtered.forEach(item => {
        const realIndex = history.indexOf(item);

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
    });
}

/* ================================================= */
/*                 OUVRIR HISTORIQUE                 */
/* ================================================= */

function loadHistory(index) {
    const item = history[index];

    if (!item || !item.result) {
        alert("Fiche introuvable.");
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
    const item = history[index];

    if (!item || !item._id) {
        alert("Fiche introuvable.");
        return;
    }

    const newName = prompt(
        "Nouveau nom de la fiche :",
        item.course
    );

    if (!newName || !newName.trim()) {
        return;
    }

    try {
        const response = await fetch(
            "/api/history/" + item._id,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    course: newName.trim()
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Impossible de renommer la fiche."
            );
            return;
        }

        /*
         * CORRECTION :
         * Le serveur renvoie maintenant la fiche complète.
         */
        if (data.history) {
            history[index] = data.history;
        } else {
            /*
             * Sécurité si une ancienne réponse serveur
             * est encore utilisée.
             */
            history[index].course = newName.trim();
        }

        renderHistory();
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                  SUPPRIMER                        */
/* ================================================= */

async function deleteHistory(index) {
    const item = history[index];

    if (!item || !item._id) {
        alert("Fiche introuvable.");
        return;
    }

    const confirmed =
        confirm("Supprimer cette fiche ?");

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            "/api/history/" + item._id,
            {
                method: "DELETE",
                credentials: "include"
            }
        );

        const data = await response.json();

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
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                    PARTAGE                        */
/* ================================================= */

async function shareHistory(index) {
    const item = history[index];

    if (!item || !item._id) {
        alert("Fiche introuvable.");
        return;
    }

    try {
        /*
         * CORRECTION :
         * On envoie l'ID de la fiche.
         * Le serveur récupère course + result dans MongoDB.
         */
        const response = await fetch("/share", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                historyId: item._id
            })
        });

        const data = await response.json();

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
        alert("Impossible de contacter le serveur.");
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
            ? input.value.trim().toUpperCase()
            : "";

    if (!code) {
        alert("Entre un code.");
        return;
    }

    try {
        const response = await fetch(
            "/share/" +
            encodeURIComponent(code),
            {
                credentials: "include"
            }
        );

        const sheet = await response.json();

        if (!response.ok) {
            alert(
                sheet.error ||
                "Code invalide."
            );
            return;
        }

        const historyResponse =
            await fetch("/api/history", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    course: sheet.course,
                    result: sheet.result
                })
            });

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

        alert("Fiche importée !");
    } catch (error) {
        console.error(error);
        alert("Impossible de contacter le serveur.");
    }
}

/* ================================================= */
/*                    SÉRIE                          */
/* ================================================= */

async function updateStreak() {
    const today = new Date();

    const todayKey =
        today.toISOString().slice(0, 10);

    const yesterday =
        new Date(today.getTime() - 86400000);

    const yesterdayKey =
        yesterday.toISOString().slice(0, 10);

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
            me.user?.lastRevisionDate || null;

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
        setInterval(() => {
            timeLeft--;

            const mins =
                Math.floor(timeLeft / 60);

            const secs =
                String(timeLeft % 60)
                    .padStart(2, "0");

            button.textContent =
                `${mins}:${secs}`;

            if (timeLeft <= 0) {
                clearInterval(interval);

                revise(
                    index,
                    minutes
                );
            }
        }, 1000);
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
/*                INITIALISATION                    */
/* ================================================= */

window.addEventListener(
    "load",
    async () => {
        try {
            const response =
                await fetch("/me", {
                    credentials: "include"
                });

            const data =
                await response.json();

            if (data.loggedIn) {
                document.getElementById(
                    "loginScreen"
                ).style.display = "none";

                document.getElementById(
                    "app"
                ).style.display = "block";

                await loadControls();
                await loadAccountData();
            } else {
                document.getElementById(
                    "loginScreen"
                ).style.display = "block";

                document.getElementById(
                    "app"
                ).style.display = "none";
            }
        } catch (error) {
            console.error(
                "Erreur vérification session :",
                error
            );
        }
    }
);

/* ================================================= */
/*                   MENU PROFIL                     */
/* ================================================= */

const profileButton =
    document.getElementById("profileButton");

const profileDropdown =
    document.getElementById("profileDropdown");

const settingsButton =
    document.getElementById("settingsButton");

const logoutButton =
    document.getElementById("logoutButton");


/* Ouvrir / fermer le menu */

profileButton?.addEventListener(
    "click",
    (event) => {

        event.stopPropagation();

        profileDropdown?.classList.toggle(
            "open"
        );

    }
);


/* Empêcher le clic dans le menu de le fermer */

profileDropdown?.addEventListener(
    "click",
    (event) => {

        event.stopPropagation();

    }
);


/* Fermer en cliquant ailleurs */

document.addEventListener(
    "click",
    () => {

        profileDropdown?.classList.remove(
            "open"
        );

    }
);


/* Paramètres */

settingsButton?.addEventListener(
    "click",
    () => {

        profileDropdown?.classList.remove(
            "open"
        );

        alert(
            "Les paramètres seront bientôt disponibles."
        );

    }
);


/* Déconnexion */

logoutButton?.addEventListener(
    "click",
    async () => {

        try {

            const response =
                await fetch(
                    "/logout",
                    {
                        method:"POST",
                        credentials:"include"
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

            profileDropdown?.classList.remove(
                "open"
            );

            document
                .getElementById("app")
                .style.display = "none";

            document
                .getElementById("loginScreen")
                .style.display = "block";

            /* Nettoyage des champs de connexion */

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

            /* On revient sur l'écran connexion */

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
);
