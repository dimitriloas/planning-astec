let db = null;
let currentYear = new Date().getFullYear();
let currentWeekStart = getMonday(new Date());
let currentTeam = '';
let allPersonnel = { atelier: [], chargeaffaire: [], bureau: [] };
let planningData = {};
let displayedPersonnel = {}; // Changé en objet pour stocker par semaine
let vacationPeriods = [];
let currentWorkCell = null;

const holidays = {
    2024: [{date: '2024-01-01', name: 'Nouvel An'}, {date: '2024-04-01', name: 'Lundi de Pâques'}, {date: '2024-05-01', name: 'Fête du Travail'}, {date: '2024-05-08', name: 'Victoire 1945'}, {date: '2024-05-09', name: 'Ascension'}, {date: '2024-05-20', name: 'Lundi de Pentecôte'}, {date: '2024-07-14', name: 'Fête Nationale'}, {date: '2024-08-15', name: 'Assomption'}, {date: '2024-11-01', name: 'Toussaint'}, {date: '2024-11-11', name: 'Armistice 1918'}, {date: '2024-12-25', name: 'Noël'}],
    2025: [{date: '2025-01-01', name: 'Nouvel An'}, {date: '2025-04-21', name: 'Lundi de Pâques'}, {date: '2025-05-01', name: 'Fête du Travail'}, {date: '2025-05-08', name: 'Victoire 1945'}, {date: '2025-05-29', name: 'Ascension'}, {date: '2025-06-09', name: 'Lundi de Pentecôte'}, {date: '2025-07-14', name: 'Fête Nationale'}, {date: '2025-08-15', name: 'Assomption'}, {date: '2025-11-01', name: 'Toussaint'}, {date: '2025-11-11', name: 'Armistice 1918'}, {date: '2025-12-25', name: 'Noël'}],
    2026: [{date: '2026-01-01', name: 'Nouvel An'}, {date: '2026-04-06', name: 'Lundi de Pâques'}, {date: '2026-05-01', name: 'Fête du Travail'}, {date: '2026-05-08', name: 'Victoire 1945'}, {date: '2026-05-14', name: 'Ascension'}, {date: '2026-05-25', name: 'Lundi de Pentecôte'}, {date: '2026-07-14', name: 'Fête Nationale'}, {date: '2026-08-15', name: 'Assomption'}, {date: '2026-11-01', name: 'Toussaint'}, {date: '2026-11-11', name: 'Armistice 1918'}, {date: '2026-12-25', name: 'Noël'}]
};

function saveFirebaseConfig() {
    const configText = document.getElementById('firebaseConfig').value.trim();
    if (!configText) { alert('Veuillez coller votre configuration Firebase'); return; }
    try {
        const config = JSON.parse(configText);
        localStorage.setItem('firebase_config', JSON.stringify(config));
        const banner = document.getElementById('setupBanner');
        banner.classList.add('configured');
        banner.innerHTML = '<h3>✅ Configuration enregistrée !</h3><p>Rechargez la page.</p><button onclick="location.reload()" class="btn btn-success" style="margin-top: 10px;">🔄 Recharger</button>';
    } catch (e) { alert('Erreur: Configuration invalide.'); }
}

function initFirebase() {
    const savedConfig = localStorage.getItem('firebase_config');
    if (!savedConfig) {
        document.getElementById('syncStatus').textContent = '⚠️ Configuration requise';
        document.getElementById('syncStatus').className = 'sync-status offline';
        return false;
    }
    try {
        const config = JSON.parse(savedConfig);
        firebase.initializeApp(config);
        db = firebase.database();
        document.getElementById('setupBanner').style.display = 'none';
        document.getElementById('syncStatus').textContent = '✓ En ligne';
        document.getElementById('syncStatus').className = 'sync-status online';
        setupFirebaseListeners();
        return true;
    } catch (e) {
        console.error('Erreur Firebase:', e);
        document.getElementById('syncStatus').textContent = '✗ Erreur';
        document.getElementById('syncStatus').className = 'sync-status offline';
        return false;
    }
}

function setupFirebaseListeners() {
    db.ref('personnel').on('value', snap => {
        if (snap.exists()) {
            allPersonnel = snap.val();
        } else {
            allPersonnel = { atelier: [], chargeaffaire: [], bureau: [] };
        }
        if (currentTeam) updatePersonnelList();
        generatePlanning();
    });

    db.ref('planning').on('value', snap => {
        if (snap.exists()) {
            planningData = snap.val();
        }
        generatePlanning();
    });

    db.ref('displayed').on('value', snap => {
        if (snap.exists()) {
            displayedPersonnel = snap.val();
        } else {
            displayedPersonnel = {};
        }
        generatePlanning();
    });

    db.ref('vacations').on('value', snap => {
        if (snap.exists()) {
            vacationPeriods = snap.val();
        } else {
            vacationPeriods = [];
        }
        if (document.getElementById('vacationModal').style.display === 'block') {
            updateVacationList();
        }
        generatePlanning();
    });
}

function getMonday(d) {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateFromWeekNumber(year, week) {
    const jan4 = new Date(year, 0, 4);
    const monday = getMonday(jan4);
    monday.setDate(monday.getDate() + (week - 1) * 7);
    return monday;
}

function goToWeek() {
    const weekNum = parseInt(document.getElementById('weekNumber').value);
    if (!weekNum || weekNum < 1 || weekNum > 53) {
        alert('Numéro de semaine invalide (1-53)');
        return;
    }
    currentWeekStart = getDateFromWeekNumber(currentYear, weekNum);
    generatePlanning();
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

function cleanFirebaseKey(key) {
    return key.replace(/[.#$\[\]]/g, '_');
}

function getWeekKey(date) {
    return formatDate(getMonday(date));
}

function isHoliday(date) {
    const dateStr = formatDate(date);
    const yearHolidays = holidays[date.getFullYear()] || [];
    return yearHolidays.find(h => h.date === dateStr);
}

function initYearSelector() {
    const select = document.getElementById('yearSelect');
    for (let year = 2024; year <= 2030; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        select.appendChild(option);
    }
    select.addEventListener('change', e => {
        const oldWeekNumber = getWeekNumber(currentWeekStart);
        currentYear = parseInt(e.target.value);
        currentWeekStart = getDateFromWeekNumber(currentYear, oldWeekNumber);
        generatePlanning();
    });
}

function generatePlanning() {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    const weekInfo = document.getElementById('weekInfo');
    
    header.innerHTML = '<th>Personnel</th>';
    body.innerHTML = '';

    const weekDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const dates = [];

    for (let i = 0; i < 5; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        dates.push(date);

        const holiday = isHoliday(date);
        const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        const headerText = holiday ? `${weekDays[i]}<br>${dateStr}<br>${holiday.name}` : `${weekDays[i]}<br>${dateStr}`;
        header.innerHTML += `<th class="${holiday ? 'holiday' : ''}">${headerText}</th>`;
    }

    const friday = dates[4];
    const weekNumber = getWeekNumber(currentWeekStart);
    weekInfo.innerHTML = `<span>Semaine du ${dates[0].getDate()}/${dates[0].getMonth() + 1}/${dates[0].getFullYear()} au ${friday.getDate()}/${friday.getMonth() + 1}/${friday.getFullYear()}</span><span class="week-number">Semaine N°${weekNumber}</span>`;
    document.getElementById('weekNumber').value = weekNumber;

    const weekKey = getWeekKey(currentWeekStart);
    if (!planningData[weekKey]) planningData[weekKey] = {};
    
    const currentWeekPersonnel = displayedPersonnel[weekKey] || [];

    if (!currentWeekPersonnel || currentWeekPersonnel.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" style="text-align: center; padding: 40px; color: #666; font-style: italic;">Aucun personnel affiché. Cliquez sur "+ Ajouter une ligne de personnel"</td>';
        body.appendChild(emptyRow);
        return;
    }

    currentWeekPersonnel.forEach((person, index) => {
        const row = document.createElement('tr');
        
        const personnelSelect = document.createElement('select');
        personnelSelect.className = `day-select personnel-cell personnel-${person.team}${person.stagiaire ? ' stagiaire' : ''}`;
        personnelSelect.onchange = e => {
            const newPerson = findPersonnelById(e.target.value);
            if (newPerson && db) {
                const weekKey = getWeekKey(currentWeekStart);
                if (!displayedPersonnel[weekKey]) displayedPersonnel[weekKey] = [];
                displayedPersonnel[weekKey][index] = newPerson;
                db.ref('displayed').set(displayedPersonnel);
            }
        };

        personnelSelect.innerHTML = '<option value="">-- Sélectionner --</option>';
        ['atelier', 'chargeaffaire', 'bureau'].forEach(team => {
            if (allPersonnel[team]) {
                allPersonnel[team].forEach(p => {
                    personnelSelect.innerHTML += `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${p.name}</option>`;
                });
            }
        });

        const personnelCell = document.createElement('td');
        personnelCell.className = `personnel-cell personnel-${person.team}${person.stagiaire ? ' stagiaire' : ''}`;
        
        const cellWrapper = document.createElement('div');
        cellWrapper.style.display = 'flex';
        cellWrapper.style.alignItems = 'center';
        cellWrapper.style.gap = '5px';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.className = 'delete-row-btn';
        deleteBtn.title = 'Supprimer cette ligne du planning';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            removePersonnelFromPlanning(index);
        };
        
        cellWrapper.appendChild(deleteBtn);
        cellWrapper.appendChild(personnelSelect);
        personnelCell.appendChild(cellWrapper);
        row.appendChild(personnelCell);

        dates.forEach(date => {
            const dateKey = formatDate(date);
            const cellKey = cleanFirebaseKey(`${person.id}_${dateKey}`);
            const cell = document.createElement('td');
            const holiday = isHoliday(date);

            const vacation = vacationPeriods.find(vac => {
                if (vac.personnelId !== person.id) return false;
                const vacStart = new Date(vac.startDate);
                const vacEnd = new Date(vac.endDate);
                vacEnd.setHours(23, 59, 59, 999);
                return date >= vacStart && date <= vacEnd;
            });

            if (holiday) {
                cell.className = 'holiday';
                cell.textContent = holiday.name;
            } else if (vacation) {
                cell.className = vacation.arretTravail ? 'arret-travail' : 'vacation';
                cell.textContent = vacation.arretTravail ? 'Arrêt travail' : 'Congé';
            } else {
                const workData = planningData[weekKey] ? planningData[weekKey][cellKey] : null;
                cell.className = 'work-cell';
                if (workData?.client) {
                    const info = document.createElement('div');
                    info.className = 'work-info';
                    info.innerHTML = `<strong>${workData.client}</strong>${workData.site}`;
                    cell.appendChild(info);
                }
                cell.onclick = () => openWorkModal(person, date, dateKey);
            }

            row.appendChild(cell);
        });

        body.appendChild(row);
    });
}

function openWorkModal(person, date, dateKey) {
    currentWorkCell = { person, date, dateKey };
    const weekKey = getWeekKey(currentWeekStart);
    const cellKey = cleanFirebaseKey(`${person.id}_${dateKey}`);
    const workData = planningData[weekKey] ? planningData[weekKey][cellKey] : null;

    document.getElementById('clientName').value = workData?.client || '';
    document.getElementById('siteName').value = workData?.site || '';

    ['applyMonday', 'applyTuesday', 'applyWednesday', 'applyThursday', 'applyFriday'].forEach(id => {
        document.getElementById(id).checked = false;
    });

    const dayIds = ['', 'applyMonday', 'applyTuesday', 'applyWednesday', 'applyThursday', 'applyFriday'];
    const dayOfWeek = date.getDay();
    if (dayIds[dayOfWeek]) document.getElementById(dayIds[dayOfWeek]).checked = true;

    document.getElementById('deleteOptions').style.display = workData?.client ? 'block' : 'none';
    document.getElementById('workModal').style.display = 'block';
}

function closeWorkModal() {
    document.getElementById('workModal').style.display = 'none';
}

function saveWorkInfo() {
    if (!currentWorkCell || !db) return;

    const client = document.getElementById('clientName').value.trim();
    const site = document.getElementById('siteName').value.trim();

    if (!client && !site) {
        alert('Veuillez renseigner au moins le client ou le site');
        return;
    }

    const weekKey = getWeekKey(currentWeekStart);
    if (!planningData[weekKey]) planningData[weekKey] = {};

    const dayCheckboxes = [
        { id: 'applyMonday', dayOffset: 0 },
        { id: 'applyTuesday', dayOffset: 1 },
        { id: 'applyWednesday', dayOffset: 2 },
        { id: 'applyThursday', dayOffset: 3 },
        { id: 'applyFriday', dayOffset: 4 }
    ];

    dayCheckboxes.forEach(({ id, dayOffset }) => {
        if (document.getElementById(id).checked) {
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate() + dayOffset);
            const cellKey = cleanFirebaseKey(`${currentWorkCell.person.id}_${formatDate(date)}`);
            planningData[weekKey][cellKey] = { client, site };
        }
    });

    db.ref('planning').set(planningData);
    closeWorkModal();
}

function deleteCurrentDay() {
    if (!currentWorkCell || !db) return;
    const weekKey = getWeekKey(currentWeekStart);
    const cellKey = cleanFirebaseKey(`${currentWorkCell.person.id}_${currentWorkCell.dateKey}`);
    delete planningData[weekKey][cellKey];
    db.ref('planning').set(planningData);
    closeWorkModal();
}

function deleteAllSelectedDays() {
    if (!currentWorkCell || !db) return;
    const weekKey = getWeekKey(currentWeekStart);
    const dayCheckboxes = [
        { id: 'applyMonday', dayOffset: 0 },
        { id: 'applyTuesday', dayOffset: 1 },
        { id: 'applyWednesday', dayOffset: 2 },
        { id: 'applyThursday', dayOffset: 3 },
        { id: 'applyFriday', dayOffset: 4 }
    ];

    dayCheckboxes.forEach(({ id, dayOffset }) => {
        if (document.getElementById(id).checked) {
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate() + dayOffset);
            const cellKey = cleanFirebaseKey(`${currentWorkCell.person.id}_${formatDate(date)}`);
            delete planningData[weekKey][cellKey];
        }
    });

    db.ref('planning').set(planningData);
    closeWorkModal();
}

function findPersonnelById(id) {
    for (let team in allPersonnel) {
        const person = allPersonnel[team].find(p => p.id === id);
        if (person) return person;
    }
    return null;
}

function openTeamModal(team) {
    currentTeam = team;
    const titles = {
        atelier: 'Personnel Atelier',
        chargeaffaire: 'Personnel Chargé d\'affaire',
        bureau: 'Personnel Bureau'
    };
    document.getElementById('modalTitle').textContent = titles[team];
    document.getElementById('teamModal').style.display = 'block';
    updatePersonnelList();
}

function closeModal() {
    document.getElementById('teamModal').style.display = 'none';
    document.getElementById('personnelName').value = '';
    document.getElementById('stagiaire').checked = false;
}

function addPersonnel() {
    if (!db) return;
    const name = document.getElementById('personnelName').value.trim();
    if (!name) {
        alert('Veuillez entrer un nom');
        return;
    }

    if (!allPersonnel[currentTeam]) {
        allPersonnel[currentTeam] = [];
    }

    const person = {
        id: Date.now() + '_' + Math.random(),
        name: name,
        team: currentTeam,
        stagiaire: document.getElementById('stagiaire').checked
    };

    allPersonnel[currentTeam].push(person);
    db.ref('personnel').set(allPersonnel);
    
    document.getElementById('personnelName').value = '';
    document.getElementById('stagiaire').checked = false;
}

function updatePersonnelList() {
    const list = document.getElementById('personnelList');
    list.innerHTML = '<h3>Personnel actuel</h3>';

    if (!allPersonnel[currentTeam] || allPersonnel[currentTeam].length === 0) {
        list.innerHTML += '<p style="color: #666; font-style: italic;">Aucun personnel dans cette équipe</p>';
        return;
    }

    allPersonnel[currentTeam].forEach((person, index) => {
        const div = document.createElement('div');
        div.className = 'personnel-item';
        div.innerHTML = `<h4>${person.name}${person.stagiaire ? ' (Stagiaire/Alternant)' : ''}</h4><button class="btn btn-warning" onclick="removePersonnel(${index})">Supprimer</button>`;
        list.appendChild(div);
    });
}

function removePersonnel(index) {
    if (!db) return;
    if (!allPersonnel[currentTeam]) return;
    
    const person = allPersonnel[currentTeam][index];
    allPersonnel[currentTeam].splice(index, 1);
    
    // Supprimer de toutes les semaines dans displayedPersonnel
    for (let weekKey in displayedPersonnel) {
        if (Array.isArray(displayedPersonnel[weekKey])) {
            displayedPersonnel[weekKey] = displayedPersonnel[weekKey].filter(p => p.id !== person.id);
        }
    }
    
    db.ref('personnel').set(allPersonnel);
    db.ref('displayed').set(displayedPersonnel);
}

function removePersonnelFromPlanning(index) {
    if (!db) {
        alert('Connexion Firebase non établie');
        return;
    }
    
    const weekKey = getWeekKey(currentWeekStart);
    if (!displayedPersonnel[weekKey] || !Array.isArray(displayedPersonnel[weekKey])) {
        return;
    }
    
    if (confirm(`Voulez-vous retirer ${displayedPersonnel[weekKey][index].name} du planning de cette semaine uniquement ?\n\n(Le personnel restera disponible dans sa catégorie et dans les autres semaines)`)) {
        displayedPersonnel[weekKey].splice(index, 1);
        db.ref('displayed').set(displayedPersonnel);
    }
}

function addPersonnelRow() {
    if (!db) {
        alert('Connexion Firebase non établie');
        return;
    }
    
    const weekKey = getWeekKey(currentWeekStart);
    if (!displayedPersonnel[weekKey]) {
        displayedPersonnel[weekKey] = [];
    }
    
    const allPeople = [];
    ['atelier', 'chargeaffaire', 'bureau'].forEach(team => {
        if (allPersonnel[team] && Array.isArray(allPersonnel[team])) {
            allPersonnel[team].forEach(p => {
                const alreadyDisplayed = displayedPersonnel[weekKey].find(dp => dp.id === p.id);
                
                if (!alreadyDisplayed) {
                    allPeople.push(p);
                }
            });
        }
    });

    if (allPeople.length === 0) {
        alert('Aucun personnel disponible.\n\nCréez d\'abord du personnel dans:\n- Personnel Atelier\n- Personnel Chargé d\'affaire\n- Personnel Bureau');
        return;
    }

    const personToAdd = allPeople[0];
    
    // Ajouter le personnel à toutes les semaines de l'année en cours
    for (let weekNum = 1; weekNum <= 53; weekNum++) {
        const weekDate = getDateFromWeekNumber(currentYear, weekNum);
        const key = getWeekKey(weekDate);
        
        if (!displayedPersonnel[key]) {
            displayedPersonnel[key] = [];
        }
        
        // Vérifier si le personnel n'est pas déjà présent dans cette semaine
        const alreadyInWeek = displayedPersonnel[key].find(p => p.id === personToAdd.id);
        if (!alreadyInWeek) {
            displayedPersonnel[key].push(personToAdd);
        }
    }
    
    db.ref('displayed').set(displayedPersonnel);
    alert(`${personToAdd.name} a été ajouté(e) à toutes les semaines de ${currentYear}`);
}

function previousWeek() {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    currentWeekStart = newDate;
    const newYear = newDate.getFullYear();
    if (newYear !== currentYear) {
        currentYear = newYear;
        document.getElementById('yearSelect').value = currentYear;
    }
    generatePlanning();
}

function nextWeek() {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    currentWeekStart = newDate;
    const newYear = newDate.getFullYear();
    if (newYear !== currentYear) {
        currentYear = newYear;
        document.getElementById('yearSelect').value = currentYear;
    }
    generatePlanning();
}

function printPlanning() {
    window.print();
}

function openVacationModal() {
    const select = document.getElementById('vacationPersonnelSelect');
    select.innerHTML = '<option value="">-- Choisir --</option>';
    
    ['atelier', 'chargeaffaire', 'bureau'].forEach(team => {
        if (allPersonnel[team]) {
            allPersonnel[team].forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.name} (${team})</option>`;
            });
        }
    });
    
    document.getElementById('vacationModal').style.display = 'block';
    updateVacationList();
}

function closeVacationModal() {
    document.getElementById('vacationModal').style.display = 'none';
    document.getElementById('vacationPersonnelSelect').value = '';
    document.getElementById('vacationStartDate').value = '';
    document.getElementById('vacationEndDate').value = '';
    document.getElementById('arretTravail').checked = false;
}

function addVacationPeriod() {
    if (!db) return;
    const personnelId = document.getElementById('vacationPersonnelSelect').value;
    const startDate = document.getElementById('vacationStartDate').value;
    const endDate = document.getElementById('vacationEndDate').value;
    const arretTravail = document.getElementById('arretTravail').checked;

    if (!personnelId || !startDate || !endDate) {
        alert('Remplissez tous les champs');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert('Date de début doit être avant date de fin');
        return;
    }

    const person = findPersonnelById(personnelId);
    if (!person) {
        alert('Personnel non trouvé');
        return;
    }
    
    if (!Array.isArray(vacationPeriods)) {
        vacationPeriods = [];
    }
    
    vacationPeriods.push({
        id: Date.now() + '_' + Math.random(),
        personnelId,
        personnelName: person.name,
        startDate,
        endDate,
        arretTravail
    });

    db.ref('vacations').set(vacationPeriods);
    
    document.getElementById('vacationPersonnelSelect').value = '';
    document.getElementById('vacationStartDate').value = '';
    document.getElementById('vacationEndDate').value = '';
    document.getElementById('arretTravail').checked = false;
}

function updateVacationList() {
    const list = document.getElementById('vacationList');
    list.innerHTML = '<h3>Périodes enregistrées</h3>';

    if (!vacationPeriods || vacationPeriods.length === 0) {
        list.innerHTML += '<p>Aucune période</p>';
        return;
    }

    vacationPeriods.forEach((vacation, index) => {
        const div = document.createElement('div');
        div.className = 'personnel-item';
        const startFormatted = new Date(vacation.startDate).toLocaleDateString('fr-FR');
        const endFormatted = new Date(vacation.endDate).toLocaleDateString('fr-FR');
        div.innerHTML = `<h4>${vacation.personnelName}${vacation.arretTravail ? ' (Arrêt)' : ''}</h4><p>Du ${startFormatted} au ${endFormatted}</p><button class="btn btn-warning" onclick="removeVacation(${index})">Supprimer</button>`;
        list.appendChild(div);
    });
}

function removeVacation(index) {
    if (!db) return;
    vacationPeriods.splice(index, 1);
    db.ref('vacations').set(vacationPeriods);
}

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
        
        if (e.deltaY < 0) {
            currentValue = Math.min(53, currentValue + 1);
        } else {
            currentValue = Math.max(1, currentValue - 1);
        }
        
        input.value = currentValue;
        currentWeekStart = getDateFromWeekNumber(currentYear, currentValue);
        generatePlanning();
        return;
    }

    if (e.target.closest('.modal') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (wheelTimeout) return;
    wheelTimeout = setTimeout(() => wheelTimeout = null, 300);
    if (e.deltaY > 0) nextWeek();
    else if (e.deltaY < 0) previousWeek();
    e.preventDefault();
}, { passive: false });

initYearSelector();
if (initFirebase()) {
    generatePlanning();
}
