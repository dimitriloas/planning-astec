let db = null;
let currentYear = new Date().getFullYear();
let currentWeekStart = getMonday(new Date());
let currentTeamType = ''; // atelier, chargeaffaire, bureau
let allPersonnel = { atelier: [], chargeaffaire: [], bureau: [] };
let planningData = {};
let displayedPersonnel = {}; 
let vacationPeriods = [];
let currentCellInfo = null;

const holidays = {
    2024: [{date: '2024-01-01', name: 'Nouvel An'}, {date: '2024-04-01', name: 'Lundi de Pâques'}, {date: '2024-05-01', name: 'Fête du Travail'}, {date: '2024-05-08', name: 'Victoire 1945'}, {date: '2024-05-09', name: 'Ascension'}, {date: '2024-05-20', name: 'Lundi de Pentecôte'}, {date: '2024-07-14', name: 'Fête Nationale'}, {date: '2024-08-15', name: 'Assomption'}, {date: '2024-11-01', name: 'Toussaint'}, {date: '2024-11-11', name: 'Armistice 1918'}, {date: '2024-12-25', name: 'Noël'}],
    2025: [{date: '2025-01-01', name: 'Nouvel An'}, {date: '2025-04-21', name: 'Lundi de Pâques'}, {date: '2025-05-01', name: 'Fête du Travail'}, {date: '2025-05-08', name: 'Victoire 1945'}, {date: '2025-05-29', name: 'Ascension'}, {date: '2025-06-09', name: 'Lundi de Pentecôte'}, {date: '2025-07-14', name: 'Fête Nationale'}, {date: '2025-08-15', name: 'Assomption'}, {date: '2025-11-01', name: 'Toussaint'}, {date: '2025-11-11', name: 'Armistice 1918'}, {date: '2025-12-25', name: 'Noël'}]
};

// --- AUTH ---
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
    firebase.auth().signInWithEmailAndPassword(e, p).catch(() => alert("Identifiants incorrects"));
}

function handleLogout() { firebase.auth().signOut().then(() => location.reload()); }

function setupFirebaseListeners() {
    db.ref('personnel').on('value', snap => { allPersonnel = snap.val() || { atelier:[], chargeaffaire:[], bureau:[] }; generatePlanning(); });
    db.ref('planning').on('value', snap => { planningData = snap.val() || {}; generatePlanning(); });
    db.ref('displayed').on('value', snap => { displayedPersonnel = snap.val() || {}; generatePlanning(); });
    db.ref('vacations').on('value', snap => { vacationPeriods = snap.val() || []; generatePlanning(); });
}

// --- RENDU ---
function getMonday(d) { d = new Date(d); let day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)); }
function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7); }

function generatePlanning() {
    const weekNum = getWeekNumber(currentWeekStart);
    const weekKey = `${currentYear}-W${weekNum}`;
    document.getElementById('weekNumber').value = weekNum;
    
    const header = document.getElementById('tableHeader');
    header.innerHTML = '<th style="width:200px">Personnel</th>';
    const dates = [];
    for(let i=0; i<5; i++){
        let d = new Date(currentWeekStart); d.setDate(d.getDate() + i);
        let dStr = d.toISOString().split('T')[0];
        dates.push(dStr);
        let hol = holidays[currentYear]?.find(h => h.date === dStr);
        header.innerHTML += `<th class="${hol?'holiday':''}">${['Lun','Mar','Mer','Jeu','Ven'][i]}<br>${d.getDate()}/${d.getMonth()+1}${hol?'<br>'+hol.name:''}</th>`;
    }

    const body = document.getElementById('tableBody');
    body.innerHTML = '';
    (displayedPersonnel[weekKey] || []).forEach((name, idx) => {
        let tr = document.createElement('tr');
        let typeClass = '', isStag = false;
        ['atelier','chargeaffaire','bureau'].forEach(t => { 
            let p = allPersonnel[t]?.find(x => x.name === name); 
            if(p){ typeClass='personnel-'+t; isStag=p.stagiaire; } 
        });

        // CELLULE NOM AVEC CROIX
        tr.innerHTML = `<td class="name-cell ${typeClass} ${isStag?'stagiaire':''}">
            ${name}
            <button class="btn-delete-row no-print" onclick="removeRowFromWeek(${idx})">×</button>
        </td>`;

        dates.forEach((dStr, dayIdx) => {
            const hol = holidays[currentYear]?.find(h => h.date === dStr);
            const vac = vacationPeriods.find(v => v.personnel === name && dStr >= v.start && dStr <= v.end);
            let cellClass = 'work-cell', content = '';
            
            if(hol) { cellClass += ' holiday'; content = hol.name; }
            else if(vac) { cellClass += vac.isArret ? ' arret-travail' : ' vacation'; content = vac.isArret ? 'ARRÊT' : 'CONGÉS'; }
            else { 
                let work = planningData[`${weekKey}-${name}-${dayIdx}`];
                if(work) content = `<strong>${work.client}</strong><br>${work.site}`;
            }
            tr.innerHTML += `<td class="${cellClass}" onclick="openWorkModal('${name}', ${dayIdx})">${content}</td>`;
        });
        body.appendChild(tr);
    });
    
    let end = new Date(currentWeekStart); end.setDate(end.getDate()+4);
    document.getElementById('weekInfo').textContent = `Du ${currentWeekStart.toLocaleDateString()} au ${end.toLocaleDateString()}`;
}

// --- ACTIONS MODALES ---
function openTeamModal(type) {
    currentTeamType = type;
    document.getElementById('teamModalTitle').textContent = "Liste : " + type.toUpperCase();
    refreshPersonnelList();
    document.getElementById('teamModal').style.display = 'block';
}

function refreshPersonnelList() {
    const list = document.getElementById('personnelList');
    list.innerHTML = (allPersonnel[currentTeamType] || []).map((p, i) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <span>${p.name} ${p.stagiaire?'(S)':''}</span>
            <button class="btn-danger" onclick="deleteFromDatabase(${i})" style="padding:2px 5px; border-radius:3px;">Supprimer</button>
        </div>
    `).join('');
}

function addNewPersonnel() {
    const name = document.getElementById('newPersonnelName').value.trim();
    if(!name) return;
    const stag = document.getElementById('isStagiaire').checked;
    allPersonnel[currentTeamType].push({name, stagiaire: stag});
    db.ref('personnel/' + currentTeamType).set(allPersonnel[currentTeamType]);
    document.getElementById('newPersonnelName').value = '';
    refreshPersonnelList();
}

function deleteFromDatabase(idx) {
    allPersonnel[currentTeamType].splice(idx, 1);
    db.ref('personnel/' + currentTeamType).set(allPersonnel[currentTeamType]);
    refreshPersonnelList();
}

// --- AJOUT AU PLANNING ---
function openAddRowModal() {
    const list = document.getElementById('selectionList');
    list.innerHTML = '';
    ['atelier','chargeaffaire','bureau'].forEach(t => {
        let div = document.createElement('div');
        div.innerHTML = `<h4 style="color:#9C27B0; margin-bottom:10px; border-bottom:1px solid #ccc;">${t.toUpperCase()}</h4>`;
        (allPersonnel[t] || []).forEach(p => {
            div.innerHTML += `<button class="btn" style="background:#eee; color:#333; width:100%; margin-bottom:5px; text-align:left; font-size:0.8em;" onclick="addToWeek('${p.name}')">+ ${p.name}</button>`;
        });
        list.appendChild(div);
    });
    document.getElementById('addRowModal').style.display = 'block';
}

function addToWeek(name) {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    if(!displayedPersonnel[weekKey]) displayedPersonnel[weekKey] = [];
    if(!displayedPersonnel[weekKey].includes(name)) {
        displayedPersonnel[weekKey].push(name);
        db.ref('displayed/' + weekKey).set(displayedPersonnel[weekKey]);
    }
    closeModal('addRowModal');
}

function removeRowFromWeek(idx) {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    displayedPersonnel[weekKey].splice(idx, 1);
    db.ref('displayed/' + weekKey).set(displayedPersonnel[weekKey]);
}

// --- CONGÉS ---
function openVacationModal() {
    const select = document.getElementById('vacationPersonnelSelect');
    select.innerHTML = [...allPersonnel.atelier, ...allPersonnel.chargeaffaire, ...allPersonnel.bureau].map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    updateVacationList();
    document.getElementById('vacationModal').style.display = 'block';
}

function saveVacation() {
    const v = {
        personnel: document.getElementById('vacationPersonnelSelect').value,
        start: document.getElementById('vacationStart').value,
        end: document.getElementById('vacationEnd').value,
        isArret: document.getElementById('isMedicalLeave').checked
    };
    if(v.start && v.end) {
        vacationPeriods.push(v);
        db.ref('vacations').set(vacationPeriods);
        updateVacationList();
    }
}

function updateVacationList() {
    document.getElementById('activeVacationsList').innerHTML = vacationPeriods.map((v, i) => `
        <div style="font-size:0.8em; padding:5px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
            <span>${v.personnel} (${v.isArret?'ARRÊT':'CONGÉ'}) : du ${v.start} au ${v.end}</span>
            <button onclick="vacationPeriods.splice(${i},1); db.ref('vacations').set(vacationPeriods); updateVacationList();">×</button>
        </div>
    `).join('');
}

// --- TRAVAIL ---
function openWorkModal(name, day) {
    currentCellInfo = {name, day};
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    const work = planningData[`${weekKey}-${name}-${day}`] || {client:'', site:''};
    document.getElementById('workModalTitle').textContent = "Affectation : " + name;
    document.getElementById('workClient').value = work.client;
    document.getElementById('workSite').value = work.site;
    [0,1,2,3,4].forEach(i => document.getElementById('chk'+i).checked = (i === day));
    document.getElementById('workModal').style.display = 'block';
}

function saveWork() {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    for(let i=0; i<5; i++) {
        if(document.getElementById('chk'+i).checked) {
            db.ref(`planning/${weekKey}-${currentCellInfo.name}-${i}`).set({
                client: document.getElementById('workClient').value,
                site: document.getElementById('workSite').value
            });
        }
    }
    closeModal('workModal');
}

function deleteWork() {
    const weekKey = `${currentYear}-W${getWeekNumber(currentWeekStart)}`;
    db.ref(`planning/${weekKey}-${currentCellInfo.name}-${currentCellInfo.day}`).remove();
    closeModal('workModal');
}

// --- NAV ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate()+7); generatePlanning(); }
function previousWeek() { currentWeekStart.setDate(currentWeekStart.getDate()-7); generatePlanning(); }
function goToWeek() {
    let wn = document.getElementById('weekNumber').value;
    if(wn >= 1 && wn <= 53) {
        let d = new Date(currentYear, 0, 1);
        d.setDate(d.getDate() + (wn - 1) * 7);
        currentWeekStart = getMonday(d);
        generatePlanning();
    }
}

initFirebase();
