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
    2024: [{date: '2024-01-01', name: 'Nouvel An'}, {date: '2024-04-01', name: 'Pâques'}, {date: '2024-05-01', name: 'Travail'}, {date: '2024-05-08', name: '8 Mai'}, {date: '2024-05-09', name: 'Ascension'}, {date: '2024-05-20', name: 'Pentecôte'}, {date: '2024-07-14', name: 'Fête Nat.'}, {date: '2024-08-15', name: 'Assomption'}, {date: '2024-11-01', name: 'Toussaint'}, {date: '2024-11-11', name: 'Armistice'}, {date: '2024-12-25', name: 'Noël'}],
    2025: [{date: '2025-01-01', name: 'Nouvel An'}, {date: '2025-04-21', name: 'Pâques'}, {date: '2025-05-01', name: 'Travail'}, {date: '2025-05-08', name: '8 Mai'}, {date: '2025-05-29', name: 'Ascension'}, {date: '2025-06-09', name: 'Pentecôte'}, {date: '2025-07-14', name: 'Fête Nat.'}, {date: '2025-08-15', name: 'Assomption'}, {date: '2025-11-01', name: 'Toussaint'}, {date: '2025-11-11', name: 'Armistice'}, {date: '2025-12-25', name: 'Noël'}]
};

// --- AUTH & FIREBASE ---
function handleLogin() {
    const e = document.getElementById('loginEmail').value;
    const p = document.getElementById('loginPassword').value;
    firebase.auth().signInWithEmailAndPassword(e, p).catch(err => {
        const errorDiv = document.getElementById('authError');
        errorDiv.style.display = 'block';
        errorDiv.textContent = err.message;
    });
}

function handleLogout() { firebase.auth().signOut().then(() => location.reload()); }

function initFirebase() {
    const config = JSON.parse(localStorage.getItem('firebase_config'));
    if (!config) { document.getElementById('setupBanner').style.display = 'block'; return; }
    if (!firebase.apps.length) firebase.initializeApp(config);
    db = firebase.database();
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('syncStatus').textContent = "✓ Connecté";
            document.getElementById('syncStatus').className = "sync-status online";
            setupFirebaseListeners();
        } else {
            document.getElementById('authContainer').style.display = 'flex';
        }
    });
}

function saveFirebaseConfig() {
    localStorage.setItem('firebase_config', document.getElementById('firebaseConfig').value);
    location.reload();
}

function setupFirebaseListeners() {
    db.ref('personnel').on('value', snap => { allPersonnel = snap.val() || { atelier:[], chargeaffaire:[], bureau:[] }; generatePlanning(); });
    db.ref('planning').on('value', snap => { planningData = snap.val() || {}; generatePlanning(); });
    db.ref('displayed').on('value', snap => { displayedPersonnel = snap.val() || {}; generatePlanning(); });
    db.ref('vacations').on('value', snap => { vacationPeriods = snap.val() || []; generatePlanning(); });
}

// --- DATES ---
function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}

function getDateFromWeekNumber(y, w) {
    let d = new Date(y, 0, 4);
    return getMonday(new Date(d.setDate(d.getDate() + (w - 1) * 7)));
}

// --- RENDU ---
function generatePlanning() {
    const weekNum = getWeekNumber(currentWeekStart);
    const weekKey = `${currentYear}-W${weekNum}`;
    document.getElementById('weekNumber').value = weekNum;

    const header = document.getElementById('tableHeader');
    header.innerHTML = '<th>Personnel</th>';
    const dates = [];
    for(let i=0; i<5; i++){
        let d = new Date(currentWeekStart); d.setDate(d.getDate()+i);
        let dStr = d.toISOString().split('T')[0]; dates.push(dStr);
        let hol = holidays[currentYear]?.find(h => h.date === dStr);
        header.innerHTML += `<th class="${hol?'holiday':''}">${['Lun','Mar','Mer','Jeu','Ven'][i]} ${d.getDate()}/${d.getMonth()+1}${hol?'<br>'+hol.name:''}</th>`;
    }

    const body = document.getElementById('tableBody');
    body.innerHTML = '';
    // Utilise une liste persistante si disponible, sinon la liste de la semaine
    const list = displayedPersonnel['permanent'] || displayedPersonnel[weekKey] || [];

    list.forEach((name, idx) => {
        let tr = document.createElement('tr');
        let typeClass = '', isStag = false;
        ['atelier','chargeaffaire','bureau'].forEach(t => { 
            let p = allPersonnel[t]?.find(x => x.name === name); 
            if(p){ typeClass='personnel-'+t; isStag=p.stagiaire; } 
        });

        tr.innerHTML = `<td class="personnel-cell ${typeClass} ${isStag?'stagiaire':''}">
            ${name} <button class="delete-row-btn no-print" onclick="removePersonnelRow(${idx})">×</button>
        </td>`;

        dates.forEach((dStr, dIdx) => {
            let hol = holidays[currentYear]?.find(h => h.date === dStr);
            let vac = vacationPeriods.find(v => v.personnel === name && dStr >= v.start && dStr <= v.end);
            let cl = 'work-cell', txt = '';
            if(hol){ cl += ' holiday'; txt = hol.name; }
            else if(vac){ cl += vac.isArret ? ' arret-travail' : ' vacation'; txt = vac.isArret ? 'ARRÊT' : 'CONGÉS'; }
            else {
                let w = planningData[`${weekKey}-${name}-${dIdx}`];
                if(w) txt = `<strong>${w.client}</strong><br>${w.site}`;
            }
            tr.innerHTML += `<td class="${cl}" onclick="openWorkModal('${name}', ${dIdx}, '${dStr}')">${txt}</td>`;
        });
        body.appendChild(tr);
    });

    let end = new Date(currentWeekStart); end.setDate(end.getDate()+4);
    document.getElementById('weekInfo').textContent = `Du ${currentWeekStart.toLocaleDateString()} au ${end.toLocaleDateString()}`;
}

// --- ACTIONS ---
function openTeamModal(t) { currentTeam = t; document.getElementById('modalTitle').textContent = "Liste " + t.toUpperCase(); updatePersonnelList(); document.getElementById('teamModal').style.display='block'; }
function closeModal() { document.getElementById('teamModal').style.display='none'; }

function updatePersonnelList() {
    const list = document.getElementById('personnelList');
    list.innerHTML = (allPersonnel[currentTeam] || []).map((p, i) => `
        <div class="personnel-item">
            <span>${p.name}</span>
            <button class="btn btn-primary" onclick="addToPlanning('${p.name}')">Afficher</button>
            <button class="btn btn-danger" onclick="deletePersonnel(${i})">Supprimer</button>
        </div>
    `).join('');
}

function addPersonnel() {
    const n = document.getElementById('personnelName').value;
    if(!allPersonnel[currentTeam]) allPersonnel[currentTeam] = [];
    allPersonnel[currentTeam].push({name: n, stagiaire: document.getElementById('stagiaire').checked});
    db.ref('personnel').set(allPersonnel);
}

function deletePersonnel(i) { allPersonnel[currentTeam].splice(i,1); db.ref('personnel').set(allPersonnel); }

function addToPlanning(name) {
    if(!displayedPersonnel['permanent']) displayedPersonnel['permanent'] = [];
    if(!displayedPersonnel['permanent'].includes(name)) {
        displayedPersonnel['permanent'].push(name);
        db.ref('displayed/permanent').set(displayedPersonnel['permanent']);
    }
}

function removePersonnelRow(i) {
    displayedPersonnel['permanent'].splice(i,1);
    db.ref('displayed/permanent').set(displayedPersonnel['permanent']);
}

function addPersonnelRow() {
    let n = prompt("Nom du personnel :");
    if(n) addToPlanning(n);
}

// --- CONGES ---
function openVacationModal() {
    const sel = document.getElementById('vacationPersonnelSelect');
    let all = [...allPersonnel.atelier, ...allPersonnel.chargeaffaire, ...allPersonnel.bureau];
    sel.innerHTML = all.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    updateVacationList();
    document.getElementById('vacationModal').style.display='block';
}

function addVacationPeriod() {
    vacationPeriods.push({
        personnel: document.getElementById('vacationPersonnelSelect').value,
        start: document.getElementById('vacationStartDate').value,
        end: document.getElementById('vacationEndDate').value,
        isArret: document.getElementById('arretTravail').checked
    });
    db.ref('vacations').set(vacationPeriods);
}

function updateVacationList() {
    document.getElementById('vacationList').innerHTML = vacationPeriods.map((v, i) => `
        <div class="personnel-item">${v.personnel} (${v.start} au ${v.end}) <button onclick="vacationPeriods.splice(${i},1); db.ref('vacations').set(vacationPeriods);">×</button></div>
    `).join('');
}

function closeVacationModal() { document.getElementById('vacationModal').style.display='none'; }

// --- TRAVAIL ---
function openWorkModal(name, dIdx, dStr) {
    currentWorkCell = { name, dIdx, weekKey: `${currentYear}-W${getWeekNumber(currentWeekStart)}` };
    let w = planningData[`${currentWorkCell.weekKey}-${name}-${dIdx}`] || {client:'', site:''};
    document.getElementById('clientName').value = w.client;
    document.getElementById('siteName').value = w.site;
    ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach((d, i) => document.getElementById('apply'+d).checked = (i === dIdx));
    document.getElementById('workModal').style.display='block';
}

function saveWorkInfo() {
    const c = document.getElementById('clientName').value;
    const s = document.getElementById('siteName').value;
    ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach((d, i) => {
        if(document.getElementById('apply'+d).checked) db.ref(`planning/${currentWorkCell.weekKey}-${currentWorkCell.name}-${i}`).set({client:c, site:s});
    });
    closeWorkModal();
}

function deleteCurrentDay() { db.ref(`planning/${currentWorkCell.weekKey}-${currentWorkCell.name}-${currentWorkCell.dIdx}`).remove(); closeWorkModal(); }
function closeWorkModal() { document.getElementById('workModal').style.display='none'; }

// --- LISTENERS ---
function nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate()+7); generatePlanning(); }
function previousWeek() { currentWeekStart.setDate(currentWeekStart.getDate()-7); generatePlanning(); }
function goToWeek() { currentWeekStart = getDateFromWeekNumber(currentYear, document.getElementById('weekNumber').value); generatePlanning(); }

document.getElementById('weekNumber').addEventListener('keydown', e => { if(e.key === 'Enter') goToWeek(); });

initFirebase();
