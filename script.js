const controlsContainer = document.getElementById("controls");

let controls =
    JSON.parse(localStorage.getItem("capControle"))
    || [];

document
    .getElementById("addBtn")
    .addEventListener("click", addControl);

function addControl() {

    const subject =
        document.getElementById("subject").value.trim();

    const chapter =
        document.getElementById("chapter").value.trim();

    const date =
        document.getElementById("date").value;

    if (!subject || !chapter || !date) {
        alert("Remplis tous les champs.");
        return;
    }

    controls.push({
    subject,
    chapter,
    date,
    progress: 0
    });

    save();
    render();

    document.getElementById("subject").value = "";
    document.getElementById("chapter").value = "";
}

function save() {
    localStorage.setItem(
        "capControle",
        JSON.stringify(controls)
    );
}

function getDaysLeft(date) {

    const today = new Date();

    today.setHours(0,0,0,0);

    const examDate = new Date(date);

    const diff =
        examDate - today;

    return Math.ceil(
        diff / (1000 * 60 * 60 * 24)
    );
}

function revise(index){

    controls[index].progress += 20;

    if(controls[index].progress > 100){
        controls[index].progress = 100;
    }

    save();
    render();
}

function render() {

    controls.forEach(control => {
    if(control.progress === undefined){
        control.progress = 0;
    }
    });

    controls.sort(
        (a,b) =>
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
            c => getDaysLeft(c.date) >= 0
        );

    const nextControl =
        futureControls[0];

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
                        c => getDaysLeft(c.date) <= 7
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
    `;

    if(nextControl){

        nextExamCard.innerHTML = `

            <h3>${nextControl.subject}</h3>

            <p>${nextControl.chapter}</p>

            <p>
                Dans
                ${getDaysLeft(nextControl.date)}
                jour(s)
            </p>
        `;
    }
    else{

        nextExamCard.innerHTML = `
            <h2>Aucun contrôle prévu</h2>
        `;
    }

    const revisionsNeeded =
    futureControls
        .filter(c => (c.progress || 0) < 100)
        .slice(0,3);

        if(revisionsNeeded.length){

            todayRevision.innerHTML = `
                <h2>À réviser aujourd'hui</h2>
            `;

            revisionsNeeded.forEach(control => {

                todayRevision.innerHTML += `
                    <div class="today-item">
                        <strong>
                            ${control.subject}
                        </strong>

                        <p>
                            ${control.chapter}
                        </p>

                        <p>
                            ${control.progress || 0}% terminé
                        </p>
                    </div>
                `;
            });
        }
        else{

            todayRevision.innerHTML = `
                <h2>Tout est révisé !</h2>
            `;
        }

    controls.forEach((control,index)=>{

        const daysLeft =
            getDaysLeft(control.date);

        let className = "normal";

        if(daysLeft <= 3){
            className = "urgent";
        }
        else if(daysLeft <= 7){
            className = "soon";
        }

        const progress = control.progress || 0;

        controlsContainer.innerHTML += `
            <div class="card control">

                <h3>${control.subject}</h3>

                <p>
                    Chapitre :
                    ${control.chapter}
                </p>

                <p>
                    Date :
                    ${formatDate(control.date)}
                </p>

                <p class="days ${className}">
                    ${
                        daysLeft === 1
                        ? "Contrôle aujourd'hui"
                        : `${daysLeft} jour(s) restant(s)`
                    }
                </p>

                <p>
                    Révision : ${progress}%
                </p>

                <button class="revise-btn" onclick="revise(${index})">
                    J'ai révisé
                </button>

                <button class="delete-btn" onclick="removeControl(${index})">
                    Supprimer
                </button>

            </div>
        `;
    });
}

function removeControl(index){

    controls.splice(index,1);

    save();

    render();
}

render();

function formatDate(dateString) {

    const today = new Date();
    today.setHours(0,0,0,0);

    const date = new Date(dateString);
    date.setHours(0,0,0,0);

    const diffDays = Math.round(
        (date - today) / (1000 * 60 * 60 * 24)
    );

    if(diffDays === 0) return "Aujourd'hui";
    if(diffDays === 1) return "Demain";
    if(diffDays === -1) return "Hier";

    return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long"
    });
}

async function generateRevisionSheet() {

    const resultDiv =
        document.getElementById("aiResult");

    const course =
        document.getElementById("courseInput").value;

    if (!course.trim()) {
        alert("Colle un cours avant de générer une fiche.");
        return;
    }

    if(course.length > 10000){

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
        console.log("COURS ENVOYÉ :", course);

        const response = await fetch(
            "http://127.0.0.1:3001/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    course: course
                })
            }
        );

        const data = await response.json();

        console.log(data);

        resultDiv.innerHTML = `
            <div class="ai-card">
                <h2>Résumé</h2>
                <p>${data.summary}</p>
            </div>

            <div class="ai-card">
                <h2>Notions clés</h2>

                <ul>
                    ${data.keyPoints
                        .map(point => `<li>${point}</li>`)
                        .join("")}
                </ul>
            </div>

            <div class="ai-card">
                <h2>Quiz</h2>

                ${data.quiz
                    .map((q, index) => `
                        <div class="quiz-card">

                            <h3>
                                Question ${index + 1}
                            </h3>

                            <p>${q.question}</p>

                            <details>
                                <summary>
                                    Voir la réponse
                                </summary>

                                <p>${q.answer}</p>
                            </details>

                        </div>
                    `)
                    .join("")}
            </div>
        `;

    } catch (error) {

        console.error(error);

        resultDiv.innerHTML = `
            <div class="ai-card error">
                Erreur lors de la génération.
            </div>
        `;
    }
}