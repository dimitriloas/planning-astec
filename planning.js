let db = null;
let currentYear = new Date().getFullYear();
let currentWeekStart = getMonday(new Date());
let currentTeam = '';
let allPersonnel = { atelier: [], chargeaffaire: [], bureau: [] };
let planningData = {};
let displayedPersonnel = {}; 
let vacationPeriods = [];
let currentWorkCell = null;

const holidays = {
    2024: [{date: '2024-01-01', name: 'Nouvel An'}, {date: '2024-04-01', name: 'Lundi de Pâques'}, {date: '2024-05-01', name: 'Fête du Travail'}, {date: '2024-05-08', name: 'Victoire 1945'}, {date: '2024-05-09', name: 'Ascension'}, {date: '2024-05-20', name: 'Lundi de Pentecôte'}, {date: '2024-07-14', name: 'Fête Nationale'}, {date: '2024-08-15', name: 'Assomption'}, {date: '2024-11-01', name: 'Toussaint'}, {date: '2024-11-11', name: 'Armistice 1918'}, {date: '2024-12-25', name: 'Noël'}],
    2025: [{date: '2025-01-01', name: 'Nouvel An'}, {date: '2025-04-21', name: 'Lundi de Pâques'}, {date: '2025-05-01', name: 'Fête du Travail'}, {date: '2025-05-08', name: 'Victoire 1945'}, {date: '2025-05-29', name: 'Ascension'}, {date: '2025-06-09', name: 'Lundi de Pentecôte'}, {date: '2025-07-14', name: 'Fête Nationale'}, {date: '2025-08-15', name: 'Assomption'}, {date: '2025-11-01', name: 'Toussaint'}, {date: '2025-11-11', name: 'Armistice 1918'}, {date: '2025-12-25', name: 'Noël'}],
    2026: [{date: '2026-01-01', name: 'Nouvel An'}, {date: '2026-04-06', name: 'Lundi de Pâques'}, {date: '2026-05-01', name: 'Fête du Travail'}, {date: '2026-05-08', name: 'Victoire 1945'}, {date: '2026-05-14', name: 'Ascension'}, {date: '2026-05-25', name: 'Lundi de Pentecôte'}, {date: '2026-07-14', name: 'Fête Nationale'}, {date: '2026-08-15', name: 'Assomption'}, {date: '2026-11-01', name: 'Toussaint'}, {date: '2026-11-11', name: 'Armistice 1918'}, {date: '2026-12-25', name: 'Noël'}]
};

// --- LOGIQUE AUTHENTIFICATION ---

function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('authError');
    errorDiv.style.display = 'none';

    firebase.auth().signInWithEmailAndPassword(email, password)
        .catch((error) => {
            errorDiv.style.display = 'block';
            errorDiv.textContent = "Erreur de connexion : " + error.message;
        });
}

function handleLogout() {
    firebase.auth().signOut().then(() => {
        location.reload();
    });
}

function setupAuthListener() {
    firebase.auth().onAuthStateChanged((user) => {
        const authContainer = document.getElementById('authContainer');
        const syncStatus = document.getElementById('syncStatus');
        if (user) {
            authContainer.style.display = 'none';
            syncStatus.textContent = '✓ Connecté : ' + user.email;
            syncStatus.className = 'sync-status online';
            setupFirebaseListeners();
        } else {
            authContainer.style.display = 'flex';
            syncStatus.textContent = '🔒 Accès restreint';
            syncStatus.className = 'sync-status offline';
        }
    });
}

// --- INITIALISATION & FIREBASE ---

function initFirebase() {
    const savedConfig = localStorage.getItem('firebase_config');
    if (!savedConfig) {
        document.getElementById('setupBanner').style.display = 'block';
        return false;
    }
    try {
        const config = JSON.parse(savedConfig);
        if (!firebase.apps.length) firebase.initializeApp(config);
        db = firebase.database();
        document.getElementById('setupBanner').style.display = 'none';
        setupAuthListener();
        return true;
    } catch (e) {
        return false;
    }
}

function saveFirebaseConfig() {
    const configStr = document.getElementById('firebaseConfig').value;
    try {
        const config = JSON.parse(configStr.includes('const firebaseConfig =') ? 
            configStr.split('=')[1].trim().replace(';', '') : configStr);
        localStorage.setItem('firebase_config', JSON.stringify(config));
        location.reload();
    } catch (e) {
        alert('Format de configuration invalide');
    }
}

function setupFirebaseListeners() {
    if (!db) return;
    db.ref('personnel').on('value', snap => {
        allPersonnel = snap.exists() ? snap.val() : { atelier: [], chargeaffaire: [], bureau: [] };
        if (currentTeam) updatePersonnelList();
        generatePlanning();
    });
    db.ref('planning').on('value', snap => {
        planningData = snap.exists() ? snap.val() : {};
        generatePlanning();
    });
    db.ref('displayed').on('value', snap => {
        displayedPersonnel = snap.exists() ? snap.val() : {};
        generatePlanning();
    });
    db.ref('vacations').on('value', snap => {
        vacationPeriods = snap.exists() ? snap.val() : [];
        if (document.getElementById('vacationModal').style.display === 'block') updateVacationList();
        generatePlanning();
    });
}

// --- LOGIQUE METIER (CONSERVÉE) ---

function getMonday(d) {
    d = new Date(d);
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateFromWeekNumber(year, week) {
    let simple = new Date(year, 0, 1 + (week - 1) * 7);
    let dow = simple.getDay();
    let ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
}

function initYearSelector() {
    const selector = document.getElementById('yearSelect');
    const years = [2024, 2025, 2026];
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        selector.appendChild(option);
    });
    selector.onchange = (e) => {
        currentYear = parseInt(e.target.value);
        currentWeekStart = getDateFromWeekNumber(currentYear, getWeekNumber(currentWeekStart));
        generatePlanning();
    };
}

function goToWeek() {
    const weekInput = document.getElementById('weekNumber');
    const weekNum = parseInt(weekInput.value);
    if (weekNum >= 1 && weekNum <= 53) {
        currentWeekStart = getDateFromWeekNumber(currentYear, weekNum);
        generatePlanning();
    }
}

function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    if (currentWeekStart.getFullYear() > currentYear) currentYear = currentWeekStart.getFullYear();
    generatePlanning();
}

function previousWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    if (currentWeekStart.getFullYear() < currentYear) currentYear = currentWeekStart.getFullYear();
    generatePlanning();
}

function isHoliday(date) {
    const dateStr = date.toISOString().split('T')[0];
    return holidays[currentYear]?.find(h => h.date === dateStr);
}

function getVacationType(personName, date) {
    const dateStr = date.toISOString().split('T')[0];
    return vacationPeriods.find(v => 
        v.personnel === personName && 
        dateStr >= v.start && 
        dateStr <= v.end
    );
}

function generatePlanning() {
    const weekNum = getWeekNumber(currentWeekStart);
    document.getElementById('weekNumber').value = weekNum;
    
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const header = document.getElementById('tableHeader');
    header.innerHTML = '<th>Personnel</th>';
    
    const weekDates = [];
    for (let i = 0; i < 5; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        weekDates.push(date);
        const holiday = isHoliday(date);
        header.innerHTML += `<th class="${holiday ? 'holiday' : ''}">${days[i]}<br>${date.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})}${holiday ? '<br>'+holiday.name : ''}</th>`;
    }
    header.innerHTML += '<th class="no-print">Action</th>';

    const weekKey = `${currentYear}-W${weekNum}`;
    const weekPersonnel = displayedPersonnel[weekKey] || [];
    const body = document.getElementById('tableBody');
    body.innerHTML = '';

    weekPersonnel.forEach((person, rowIndex) => {
        const tr = document.createElement('tr');
        const isStagiaire = (allPersonnel.atelier.find(p => p.name === person)?.stagiaire) || 
                          (allPersonnel.chargeaffaire.find(p => p.name === person)?.stagiaire) || 
                          (allPersonnel.bureau.find(p => p.name === person)?.stagiaire);
        
        let typeClass = '';
        if (allPersonnel.atelier.find(p => p.name === person)) typeClass = 'personnel-atelier';
        else if (allPersonnel.chargeaffaire.find(p => p.name === person)) typeClass = 'personnel-chargeaffaire';
        else if (allPersonnel.bureau.find(p => p.name === person)) typeClass = 'personnel-bureau';

        tr.innerHTML = `<td class="personnel-cell ${typeClass} ${isStagiaire ? 'stagiaire' : ''}">${person}</td>`;

        weekDates.forEach((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0];
            const holiday = isHoliday(date);
            const vacation = getVacationType(person, date);
            
            let cellContent = '';
            let cellClass = 'work-cell';
            if (holiday) cellClass += ' holiday';
            else if (vacation) {
                cellClass += vacation.isArret ? ' arret-travail' : ' vacation';
                cellContent = vacation.isArret ? 'ARRÊT TRAVAIL' : 'CONGÉS';
            } else {
                const work = planningData[`${weekKey}-${person}-${dayIndex}`];
                if (work) {
                    cellContent = `<div class="work-info"><strong>${work.client}</strong>${work.site}</div>`;
                }
            }

            tr.innerHTML += `<td class="${cellClass}" onclick="holiday ? null : openWorkModal('${person}', ${dayIndex}, '${dateStr}')">${cellContent}</td>`;
        });

        tr.innerHTML += `<td class="no-print"><button class="delete-row-btn" onclick="removePersonnelRow(${rowIndex})">×</button></td>`;
        body.appendChild(tr);
    });

    const start = new Date(currentWeekStart);
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 4);
    document.getElementById('weekInfo').innerHTML = `Du ${start.toLocaleDateString()} au ${end.toLocaleDateString()}<span class="week-number">Semaine ${weekNum}</span>`;
}

// --- GESTION DES MODALES ET ACTIONS ---

function openTeamModal(team) {
    currentTeam = team;
    document.getElementById('modalTitle').textContent = `Gérer le Personnel ${team.charAt(0).toUpperCase() + team.slice(1)}`;
    updatePersonnelList();
    document.getElementById('teamModal').style.display = 'block';
}

function closeModal() { document.getElementById('teamModal').style.display = 'none'; }

function updatePersonnelList() {
    const list = document.getElementById('personnelList');
    list.innerHTML = '';
    allPersonnel[currentTeam].forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'personnel-item';
        div.innerHTML = `<h4>${p.name} ${p.stagiaire ? '(Stagiaire)' : ''}</h4>
            <button class="btn btn-primary" onclick="addToPlanning('${p.name}')">Ajouter au planning cette semaine</button>
            <button class="btn btn-danger" onclick="deletePersonnel(${index})">Supprimer de la liste</button>`;
        list.appendChild(div);
    });
}

function addPersonnel() {
    const name = document.getElementById('personnelName').value.trim();
    const stagiaire = document.getElementById('stagiaire').checked;
    if (name && !allPersonnel[currentTeam].find(p => p.name === name)) {
        allPersonnel[currentTeam].push({ name, stagiaire });
        db.ref('personnel').set(allPersonnel);
        document.getElementById('personnelName').value = '';
        document.getElementById('stagiaire').checked = false;
    }
}

function deletePersonnel(index) {
    if (confirm('Supprimer ce personnel de la liste ?')) {
        allPersonnel[currentTeam].splice(index, 1);
        db.ref('personnel').set(allPersonnel);
    }
}

function addToPlanning(name) {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    if (!displayedPersonnel[weekKey]) displayedPersonnel[weekKey] = [];
    if (!displayedPersonnel[weekKey].includes(name)) {
        displayedPersonnel[weekKey].push(name);
        db.ref('displayed').set(displayedPersonnel);
    }
}

function removePersonnelRow(index) {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    displayedPersonnel[weekKey].splice(index, 1);
    db.ref('displayed').set(displayedPersonnel);
}

function addPersonnelRow() {
    const name = prompt("Entrez le nom du personnel :");
    if (name) addToPlanning(name);
}

function openWorkModal(person, dayIndex, dateStr) {
    if (!db) return;
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    currentWorkCell = { person, dayIndex, weekKey };
    const work = planningData[`${weekKey}-${person}-${dayIndex}`] || { client: '', site: '' };
    document.getElementById('clientName').value = work.client;
    document.getElementById('siteName').value = work.site;
    document.getElementById('deleteOptions').style.display = planningData[`${weekKey}-${person}-${dayIndex}`] ? 'block' : 'none';
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    days.forEach((day, i) => document.getElementById(`apply${day}`).checked = (i === dayIndex));
    
    document.getElementById('workModal').style.display = 'block';
}

function closeWorkModal() { document.getElementById('workModal').style.display = 'none'; }

function saveWorkInfo() {
    const client = document.getElementById('clientName').value.trim();
    const site = document.getElementById('siteName').value.trim();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    days.forEach((day, i) => {
        if (document.getElementById(`apply${day}`).checked) {
            const key = `${currentWorkCell.weekKey}-${currentWorkCell.person}-${i}`;
            if (client || site) planningData[key] = { client, site };
            else delete planningData[key];
        }
    });
    db.ref('planning').set(planningData);
    closeWorkModal();
}

function deleteCurrentDay() {
    const key = `${currentWorkCell.weekKey}-${currentWorkCell.person}-${currentWorkCell.dayIndex}`;
    delete planningData[key];
    db.ref('planning').set(planningData);
    closeWorkModal();
}

function deleteAllSelectedDays() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    days.forEach((day, i) => {
        if (document.getElementById(`apply${day}`).checked) {
            delete planningData[`${currentWorkCell.weekKey}-${currentWorkCell.person}-${i}`];
        }
    });
    db.ref('planning').set(planningData);
    closeWorkModal();
}

function openVacationModal() {
    const select = document.getElementById('vacationPersonnelSelect');
    select.innerHTML = '';
    [...allPersonnel.atelier, ...allPersonnel.chargeaffaire, ...allPersonnel.bureau]
        .sort((a,b) => a.name.localeCompare(b.name))
        .forEach(p => select.innerHTML += `<option value="${p.name}">${p.name}</option>`);
    updateVacationList();
    document.getElementById('vacationModal').style.display = 'block';
}

function closeVacationModal() { document.getElementById('vacationModal').style.display = 'none'; }

function addVacationPeriod() {
    const personnel = document.getElementById('vacationPersonnelSelect').value;
    const start = document.getElementById('vacationStartDate').value;
    const end = document.getElementById('vacationEndDate').value;
    const isArret = document.getElementById('arretTravail').checked;
    if (personnel && start && end) {
        vacationPeriods.push({ personnel, start, end, isArret });
        db.ref('vacations').set(vacationPeriods);
    }
}

function updateVacationList() {
    const list = document.getElementById('vacationList');
    list.innerHTML = '';
    vacationPeriods.forEach((v, index) => {
        const div = document.createElement('div');
        div.className = 'personnel-item';
        div.innerHTML = `<strong>${v.personnel}</strong><br>${v.isArret ? 'ARRÊT' : 'CONGÉS'} : du ${v.start} au ${v.end}
            <button class="btn btn-warning" onclick="removeVacation(${index})">Supprimer</button>`;
        list.appendChild(div);
    });
}

function removeVacation(index) {
    vacationPeriods.splice(index, 1);
    db.ref('vacations').set(vacationPeriods);
}

function printPlanning() { window.print(); }

// --- LISTENERS SOURIS & WINDOW ---

window.onclick = e => {
    if (e.target.id === 'teamModal') closeModal();
    if (e.target.id === 'vacationModal') closeVacationModal();
    if (e.target.id === 'workModal') closeWorkModal();
}

let wheelTimeout = null;
document.addEventListener('wheel', e => {
    if (e.target.id === 'weekNumber') {
        e.preventDefault();
        const input = e.target;
        let currentValue = parseInt(input.value) || getWeekNumber(currentWeekStart);
        if (e.deltaY < 0) currentValue = Math.min(53, currentValue + 1);
        else currentValue = Math.max(1, currentValue - 1);
        input.value = currentValue;
        currentWeekStart = getDateFromWeekNumber(currentYear, currentValue);
        generatePlanning();
        return;
    }
    if (e.target.closest('.modal') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (wheelTimeout) return;
    wheelTimeout = setTimeout(() => wheelTimeout = null, 300);
    if (e.deltaY > 0) nextWeek();
    else previousWeek();
}, { passive: false });

// Lancement
initYearSelector();
initFirebase();
