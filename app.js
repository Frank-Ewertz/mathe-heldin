// ==========================================
// 1. Service Worker Registrierung & Sofort-Update
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // Erzwingt bei jedem Start die Prüfung auf neue Versionen
      reg.update();
      console.log('Service Worker aktiv');
    } catch (err) {
      console.error('SW Registrierungsfehler:', err);
    }
  });
}

async function requestPersistentStorage() {
  const statusEl = document.getElementById('storage-status');
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    if (isPersisted) {
      statusEl.textContent = 'Speicherstatus: Dauerhaft geschützt';
      statusEl.style.color = '#2e7d32';
    } else {
      statusEl.textContent = 'Speicherstatus: Standard';
    }
  }
}
requestPersistentStorage();

// ==========================================
// 2. IndexedDB (Interner Speicher)
// ==========================================
const DB_NAME = 'LernAppDB';
const DB_VERSION = 2;
const STORE_ENTRIES = 'aufgaben_fortschritt';
const STORE_HANDLES = 'file_handles';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addEntry(title) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    const item = { title: title, timestamp: new Date().toISOString() };
    const request = store.add(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_ENTRIES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function restoreEntries(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    store.clear();
    for (const item of items) {
      delete item.id;
      store.add(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==========================================
// 3. Echte Datei auf der Festplatte anbinden
// ==========================================
let fileHandle = null;

async function saveFileHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    const store = tx.objectStore(STORE_HANDLES);
    store.put({ key: 'active_file', handle: handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSavedFileHandle() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_HANDLES, 'readonly');
    const store = tx.objectStore(STORE_HANDLES);
    const request = store.get('active_file');
    request.onsuccess = () => resolve(request.result ? request.result.handle : null);
    request.onerror = () => resolve(null);
  });
}

async function writeDirectlyToFile(entries) {
  if (!fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(entries, null, 2));
    await writable.close();
  } catch (err) {
    console.warn('Konnte nicht in Datei schreiben:', err);
  }
}

async function initFileConnection() {
  const statusEl = document.getElementById('file-link-status');
  if (!('showOpenFilePicker' in window)) {
    statusEl.textContent = 'Dateisystem-Zugriff wird von diesem Browser nicht unterstützt.';
    document.getElementById('btn-link-file').style.display = 'none';
    return;
  }

  const savedHandle = await getSavedFileHandle();
  if (savedHandle) {
    const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      fileHandle = savedHandle;
      statusEl.textContent = `Verknüpft mit: "${fileHandle.name}" (Speichert automatisch)`;
      statusEl.style.color = '#2e7d32';
    } else {
      statusEl.textContent = `Datei "${savedHandle.name}" erkannt. Bitte einmal auf "Datei wählen" klicken zur Freigabe.`;
    }
  }
}

// ==========================================
// 4. Zahlenraum & Aufgaben-Generator
// ==========================================
let currentMaxNumber = 10;
let currentTask = { questionText: '', correctAnswer: 0, a: 0, b: 0, op: '+' };

function buildNumberPad() {
  const pad = document.getElementById('number-pad');
  pad.innerHTML = '';
  for (let i = 0; i <= currentMaxNumber; i++) {
    const btn = document.createElement('button');
    btn.className = 'pad-btn';
    btn.setAttribute('data-val', i);
    btn.textContent = i;
    pad.appendChild(btn);
  }
}

function generateNewTask() {
  const isAddition = Math.random() > 0.4; // 60% Plus, 40% Minus

  if (isAddition) {
    // Plus: Ergebnis darf maximal currentMaxNumber sein
    const a = Math.floor(Math.random() * (currentMaxNumber + 1));
    const b = Math.floor(Math.random() * (currentMaxNumber - a + 1));
    currentTask = {
      questionText: `${a} + ${b} = ?`,
      correctAnswer: a + b,
      a: a,
      b: b,
      op: '+'
    };
  } else {
    // Minus: Startzahl maximal currentMaxNumber, b wird abgezogen
    const a = Math.floor(Math.random() * currentMaxNumber) + 1;
    const b = Math.floor(Math.random() * (a + 1));
    currentTask = {
      questionText: `${a} - ${b} = ?`,
      correctAnswer: a - b,
      a: a,
      b: b,
      op: '-'
    };
  }

  document.getElementById('math-question').textContent = currentTask.questionText;

  // Zählhilfen mit Äpfeln
  const visualEl = document.getElementById('visual-helpers');
  if (currentTask.op === '+') {
    const applesA = '🍎'.repeat(currentTask.a);
    const applesB = '🍏'.repeat(currentTask.b);
    visualEl.innerHTML = `<span>${applesA || '0'}</span> <span class="visual-op">+</span> <span>${applesB || '0'}</span>`;
  } else {
    const applesA = '🍎'.repeat(currentTask.a);
    visualEl.innerHTML = `<span>${applesA}</span> <span class="visual-op"> (ziehe ${currentTask.b} ab)</span>`;
  }
}

// Umschalten des Zahlenraums (10, 15, 20)
document.querySelectorAll('.range-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentMaxNumber = parseInt(e.target.getAttribute('data-max'), 10);
    buildNumberPad();
    generateNewTask();
  });
});

// ==========================================
// 5. Benutzeroberfläche & Prüfung
// ==========================================
const scoreDisplay = document.getElementById('score-display');
const historyList = document.getElementById('history-list');
const feedbackEl = document.getElementById('feedback');

async function renderUI() {
  const entries = await getAllEntries();
  scoreDisplay.textContent = entries.length;
  historyList.innerHTML = '';

  const reversed = [...entries].reverse();
  for (const entry of reversed) {
    const li = document.createElement('li');
    const dateStr = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `<span>${entry.title}</span> <span>${dateStr}</span>`;
    historyList.appendChild(li);
  }
}

// Klick auf Zahlentaste
document.getElementById('number-pad').addEventListener('click', async (e) => {
  if (!e.target.classList.contains('pad-btn')) return;

  const chosenNumber = parseInt(e.target.getAttribute('data-val'), 10);

  if (chosenNumber === currentTask.correctAnswer) {
    feedbackEl.textContent = '🌟 Richtig! Tolle Leistung!';
    feedbackEl.style.color = '#2e7d32';

    const taskLog = `${currentTask.questionText.replace('?', chosenNumber)} ⭐`;
    await addEntry(taskLog);

    const all = await getAllEntries();
    await writeDirectlyToFile(all);
    renderUI();

    setTimeout(() => {
      feedbackEl.textContent = '';
      generateNewTask();
    }, 1000);
  } else {
    feedbackEl.textContent = '🤔 Zähle noch einmal nach!';
    feedbackEl.style.color = '#d32f2f';
  }
});

// Festplatten-Verknüpfung
document.getElementById('btn-link-file').addEventListener('click', async () => {
  try {
    const options = {
      types: [{
        description: 'JSON Lernstand',
        accept: { 'application/json': ['.json'] }
      }],
      suggestedName: 'mathe_lernstand.json'
    };

    fileHandle = await window.showSaveFilePicker(options);
    await saveFileHandle(fileHandle);

    const statusEl = document.getElementById('file-link-status');
    statusEl.textContent = `Verknüpft mit: "${fileHandle.name}" (Speichert automatisch)`;
    statusEl.style.color = '#2e7d32';

    const current = await getAllEntries();
    await writeDirectlyToFile(current);
    alert(`Verbunden! Alle Daten werden jetzt direkt in "${fileHandle.name}" auf deiner Festplatte abgelegt.`);
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert('Hinweis: ' + err.message);
    }
  }
});

// Export & Import
document.getElementById('btn-export').addEventListener('click', async () => {
  const entries = await getAllEntries();
  const dataString = JSON.stringify(entries, null, 2);
  const blob = new Blob([dataString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `mathe-lernstand-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('import-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        await restoreEntries(data);
        const all = await getAllEntries();
        await writeDirectlyToFile(all);
        alert('Fortschritt geladen!');
        renderUI();
      } else {
        alert('Ungültige Datei.');
      }
    } catch (err) {
      alert('Fehler: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  if (confirm('Möchtest du wirklich alle Sterne löschen?')) {
    await clearEntries();
    await writeDirectlyToFile([]);
    renderUI();
  }
});

// Starten
initFileConnection();
renderUI();
buildNumberPad();
generateNewTask();
