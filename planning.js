let db = null;
let currentYear = new Date().getFullYear();
let currentWeekStart = getMonday(new Date());
let currentTeamType = '';
let allPersonnel = { atelier: [], chargeaffaire: [], bureau: [] };
let planningData = {};
let displayedPersonnel = {}; 
let vacationPeriods = [];
let currentCellInfo = null;

// --- CONFIGURATION DES JOURS FÉRIÉS ---
const holidays = {
    2024: [{date:'2024-01-01',name:'Nouvel An'},{date:'2024-04-01',name:'Pâques'},{date:'2024-05-01',name:'Travail'},{date:'2024-05-08',name:'8 Mai'},{date:'2024-05-09',name:'Ascension'},{date:'2024-05-20',name:'Pentecôte'},{date:'2024-07-14',name:'Fête Nat.'},{date:'2024-08-15',name:'Assomption'},{date:'2024-11-01',name:'Toussaint'},{date:'2024-11-11',name:'Armistice'},{date:'2024-12-25',name:'Noël'}],
    2025: [{date:'2025-01-01',name:'Nouvel An'},{date:'2025-04-21',name:'Pâques'},{date:'2025-05-01',name:'Travail'},{date:'2025-05-08',name:'8 Mai'},{date:'2025-05-29',name:'Ascension'},{date:'2025-06-09',name:'Pentecôte'},{date:'2025-07-14',name:'Fête Nat.'},{date:'2025-08-15',name:'Assomption'},{date:'2025-11-01',name:'Toussaint'},{date:'2025-11-11',name:'Armistice'},{date:'2025-12-25',name:'Noël'}]
};

// --- FONCTIONS DE DATE (Calculs précis) ---
function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateFromWeek(y, w) {
    let d = new Date(y, 0, 4);
    return getMonday(new Date(d.setDate(d.getDate() + (w - 1) * 7)));
}

// --- INITIALISATION FIREBASE & AUTH ---
function initFirebase() {
    const config = JSON.parse(localStorage.getItem('firebase_config'));
    if (!config) return;
    if (!firebase.apps.length) firebase.initializeApp(config);
    db = firebase.database();
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            document.getElementById('authContainer').style.display = 'none';
            setupFirebaseListeners();
        } else {
            document.getElementById('authContainer').style.display = 'flex';
        }
    });
}

function handleLogin() {
    const e = document.getElementById('loginEmail').value;
    const p = document.getElementById('loginPassword').value;
    firebase.auth().signInWithEmailAndPassword(e, p).catch(err => alert("Erreur: " + err.message));
}

function handleLogout() {
    firebase.auth().signOut().then(() => location.reload());
}

function setupFirebaseListeners() {
    db.ref('personnel').on('value', snap => { allPersonnel = snap.val() || { atelier:[], chargeaffaire:[], bureau:[] }; generatePlanning(); });
    db.ref('planning').on('value', snap => { planningData = snap.val() || {}; generatePlanning(); });
    db.ref('displayed').on('value', snap => { displayedPersonnel = snap.val() || {}; generatePlanning(); });
    db.ref('vacations').on('value', snap => { vacationPeriods = snap.val() || []; generatePlanning(); });
}

// --- GENERATION DU TABLEAU ---
function generatePlanning() {
    const weekNum = getWeekNumber(currentWeekStart);
    const weekKey = `${currentYear}-W${weekNum}`;
    document.getElementById('weekNumber').value = weekNum;
    
    const header = document.getElementById('tableHeader');
    header.innerHTML = '<th style="width:200px">Personnel</th>';
    const dates = [];
    
    for(let i=0; i<5; i++){
        let d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        let dStr = d.toISOString().split('T')[0];
        dates.push(dStr);
        let hol = holidays[currentYear]?.find(h => h.date === dStr);
        header.innerHTML += `<th class="${hol?'holiday':''}">
            ${['Lundi','Mardi','Mercredi','Jeudi','Vendredi'][i]}<br>${d.getDate()}/${d.getMonth()+1}
            ${hol ? '<br><small>'+hol.name+'</small>' : ''}
        </th>`;
    }

    const body = document.getElementById('tableBody');
    body.innerHTML = '';
    const currentList = displayedPersonnel[weekKey] || [];

    currentList.forEach((name, idx) => {
        let tr = document.createElement('tr');
        let typeClass = '', isStag = false;
        ['atelier','chargeaffaire','bureau'].forEach(t => { 
            let p = allPersonnel[t]?.find(x => x.name === name); 
            if(p){ typeClass='personnel-'+t; isStag=p.stagiaire; } 
        });

        tr.innerHTML = `<td class="name-cell ${typeClass} ${isStag?'stagiaire':''}">
            ${name}
            <button class="btn-delete-row no-print" onclick="removeRow(${idx})">×</button>
        </td>`;

        dates.forEach((dStr, dIdx) => {
            const hol = holidays[currentYear]?.find(h => h.date === dStr);
            const vac = vacationPeriods.find(v => v.personnel === name && dStr >= v.start && dStr <= v.end);
            let cl = 'work-cell', txt = '';
            
            if(hol) { cl += ' holiday'; txt = hol.name; }
            else if(vac) { cl += vac.isArret ? ' arret-travail' : ' vacation'; txt = vac.isArret ? 'ARRÊT' : 'CONGÉS'; }
            else { 
                let w = planningData[`${weekKey}-${name}-${dIdx}`];
                if(w) txt = `<strong>${w.client}</strong><br>${w.site}`;
            }
            tr.innerHTML += `<td class="${cl}" onclick="openWorkModal('${name}', ${dIdx})">${txt}</td>`;
        });
        body.appendChild(tr);
    });
    
    let end = new Date(currentWeekStart); end.setDate(end.getDate()+4);
    document.getElementById('currentWeekDisplay').textContent = `Semaine ${weekNum} : du ${currentWeekStart.toLocaleDateString()} au ${end.toLocaleDateString()}`;
}

// --- GESTION DES MODALES (Équipes) ---
function openTeamModal(type) {
    currentTeamType = type;
    document.getElementById('teamModalTitle').textContent = "Gestion : " + type.toUpperCase();
    refreshPersonnelList();
    document.getElementById('teamModal').style.display = 'block';
}

function refreshPersonnelList() {
    const list = document.getElementById('personnelList');
    list.innerHTML = (allPersonnel[currentTeamType] || []).map((p, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:5px; border-bottom:1px solid #eee;">
            <span>${p.name} ${p.stagiaire?'(S)':''}</span>
            <button class="btn btn-danger" style="padding:2px 8px;" onclick="deleteFromDb(${i})">Supprimer</button>
        </div>
    `).join('');
}

function addNewPerson() {
    const name = document.getElementById('newPersonName').value.trim();
    if(!name) return;
    const stag = document.getElementById('isStag').checked;
    if(!allPersonnel[currentTeamType]) allPersonnel[currentTeamType] = [];
    allPersonnel[currentTeamType].push({name, stagiaire: stag});
    db.ref('personnel/' + currentTeamType).set(allPersonnel[currentTeamType]);
    document.getElementById('newPersonName').value = '';
    refreshPersonnelList();
}

function deleteFromDb(idx) {
    allPersonnel[currentTeamType].splice(idx, 1);
    db.ref('personnel/' + currentTeamType).set(allPersonnel[currentTeamType]);
    refreshPersonnelList();
}

// --- GESTION PLANNING (Ajout/Suppression lignes) ---
function openAddRowModal() {
    const list = document.getElementById('selectionList');
    list.innerHTML = '';
    ['atelier','chargeaffaire','bureau'].forEach(t => {
        let div = document.createElement('div');
        div.innerHTML = `<h4 style="color:#9C27B0; border-bottom:1px solid #ccc; padding-bottom:5px;">${t.toUpperCase()}</h4>`;
        (allPersonnel[t] || []).forEach(p => {
            div.innerHTML += `<button class="btn" style="background:#eee; color:#333; width:100%; margin:4px 0; text-align:left;" onclick="addRowToPlanning('${p.name}')">+ ${p.name}</button>`;
        });
        list.appendChild(div);
    });
    document.getElementById('addRowModal').style.display = 'block';
}

function addRowToPlanning(name) {
    const wk = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    if(!displayedPersonnel[wk]) displayedPersonnel[wk] = [];
    if(!displayedPersonnel[wk].includes(name)) {
        displayedPersonnel[wk].push(name);
        db.ref('displayed/' + wk).set(displayedPersonnel[wk]);
    }
    closeModal('addRowModal');
}

function removeRow(idx) {
    const wk = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    displayedPersonnel[wk].splice(idx, 1);
    db.ref('displayed/' + wk).set(displayedPersonnel[wk]);
}

// --- CONGÉS ---
function openVacationModal() {
    const sel = document.getElementById('vacationPersonSelect');
    let fullList = [...allPersonnel.atelier, ...allPersonnel.chargeaffaire, ...allPersonnel.bureau];
    sel.innerHTML = fullList.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    updateVacationListView();
    document.getElementById('vacationModal').style.display = 'block';
}

function saveVacation() {
    const v = {
        personnel: document.getElementById('vacationPersonSelect').value,
        start: document.getElementById('vacationStart').value,
        end: document.getElementById('vacationEnd').value,
        isArret: document.getElementById('isArret').checked
    };
    if(v.start && v.end) {
        vacationPeriods.push(v);
        db.ref('vacations').set(vacationPeriods);
        updateVacationListView();
    }
}

function updateVacationListView() {
    document.getElementById('activeVacations').innerHTML = vacationPeriods.map((v, i) => `
        <div style="font-size:0.85em; padding:5px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
            <span>${v.personnel} (${v.isArret?'ARRÊT':'CONGÉ'}) : du ${v.start} au ${v.end}</span>
            <button onclick="vacationPeriods.splice(${i},1); db.ref('vacations').set(vacationPeriods); updateVacationListView();">×</button>
        </div>
    `).join('');
}

// --- TRAVAIL ---
function openWorkModal(name, dIdx) {
    currentCellInfo = { name, dIdx };
    const wk = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    const w = planningData[`${wk}-${name}-${dIdx}`] || {client:'', site:''};
    document.getElementById('workModalTitle').textContent = "Affectation : " + name;
    document.getElementById('workClient').value = w.client;
    document.getElementById('workSite').value = w.site;
    [0,1,2,3,4].forEach(i => document.getElementById('c'+i).checked = (i === dIdx));
    document.getElementById('workModal').style.display = 'block';
}

function saveWork() {
    const wk = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    const client = document.getElementById('workClient').value;
    const site = document.getElementById('workSite').value;
    for(let i=0; i<5; i++) {
        if(document.getElementById('c'+i).checked) {
            db.ref(`planning/${wk}-${currentCellInfo.name}-${i}`).set({ client, site });
        }
    }
    closeModal('workModal');
}

function deleteDay() {
    const wk = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    db.ref(`planning/${wk}-${currentCellInfo.name}-${currentCellInfo.dIdx}`).remove();
    closeModal('workModal');
}

// --- NAVIGATION & EVENT LISTENERS ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); generatePlanning(); }
function previousWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); generatePlanning(); }

// Navigation directe par numéro de semaine
document.getElementById('weekNumber').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const val = parseInt(this.value);
        if (val >= 1 && val <= 53) {
            currentWeekStart = getDateFromWeek(currentYear, val);
            generatePlanning();
        }
    }
});

// Scroll sur le numéro de semaine
document.getElementById('weekNumber').addEventListener('wheel', function(e) {
    e.preventDefault();
    let val = parseInt(this.value);
    val = (e.deltaY < 0) ? Math.min(53, val + 1) : Math.max(1, val - 1);
    this.value = val;
    currentWeekStart = getDateFromWeek(currentYear, val);
    generatePlanning();
}, { passive: false });

initFirebase();
