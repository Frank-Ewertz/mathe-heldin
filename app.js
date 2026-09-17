// ==========================================
// 1. Service Worker & Update-Check
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();
    } catch (err) {
      console.error('SW Fehler:', err);
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
// 2. Automatischer interner Speicher (IndexedDB)
// ==========================================
const DB_NAME = 'LernAppDB';
const DB_VERSION = 2;
const STORE_ENTRIES = 'aufgaben_fortschritt';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
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

// ==========================================
// 3. Modus-Umschaltung (Mathe vs. Silben)
// ==========================================
const tabMath = document.getElementById('tab-math');
const tabSyllables = document.getElementById('tab-syllables');
const secMath = document.getElementById('section-math');
const secSyllables = document.getElementById('section-syllables');

tabMath.addEventListener('click', () => {
  tabMath.classList.add('active');
  tabSyllables.classList.remove('active');
  secMath.style.display = 'block';
  secSyllables.style.display = 'none';
});

tabSyllables.addEventListener('click', () => {
  tabSyllables.classList.add('active');
  tabMath.classList.remove('active');
  secMath.style.display = 'none';
  secSyllables.style.display = 'block';
});

// ==========================================
// 4. MATHE-LOGIK
// ==========================================
let currentMaxNumber = 10;
let currentTask = { questionText: '', correctAnswer: 0, a: 0, b: 0, op: '+' };
const feedbackMath = document.getElementById('feedback-math');

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
  const isAddition = Math.random() > 0.4;

  if (isAddition) {
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

document.querySelectorAll('.range-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentMaxNumber = parseInt(e.target.getAttribute('data-max'), 10);
    buildNumberPad();
    generateNewTask();
  });
});

document.getElementById('number-pad').addEventListener('click', async (e) => {
  if (!e.target.classList.contains('pad-btn')) return;

  const chosenNumber = parseInt(e.target.getAttribute('data-val'), 10);

  if (chosenNumber === currentTask.correctAnswer) {
    feedbackMath.textContent = '🌟 Richtig! Tolle Leistung!';
    feedbackMath.style.color = '#2e7d32';

    const taskLog = `Mathe: ${currentTask.questionText.replace('?', chosenNumber)} ⭐`;
    await addEntry(taskLog);
    renderUI();

    setTimeout(() => {
      feedbackMath.textContent = '';
      generateNewTask();
    }, 1000);
  } else {
    feedbackMath.textContent = '🤔 Zähle noch einmal nach!';
    feedbackMath.style.color = '#d32f2f';
  }
});

// ==========================================
// 5. SILBEN-LOGIK (Ganzjahres-Wortschatz)
// ==========================================
const SYLLABLE_WORDS = [
  // 1 Silbe
  { word: 'Ei', emoji: '🥚', syllables: 1 },
  { word: 'Baum', emoji: '🌳', syllables: 1 },
  { word: 'Hund', emoji: '🐶', syllables: 1 },
  { word: 'Fisch', emoji: '🐟', syllables: 1 },
  { word: 'Maus', emoji: '🐭', syllables: 1 },
  { word: 'Buch', emoji: '📖', syllables: 1 },
  { word: 'Bett', emoji: '🛏️', syllables: 1 },
  { word: 'Haus', emoji: '🏠', syllables: 1 },
  { word: 'Hut', emoji: '👒', syllables: 1 },
  { word: 'Schuh', emoji: '👟', syllables: 1 },
  { word: 'Boot', emoji: '⛵', syllables: 1 },
  { word: 'Brot', emoji: '🍞', syllables: 1 },
  { word: 'Ball', emoji: '⚽', syllables: 1 },
  { word: 'Bär', emoji: '🐻', syllables: 1 },
  { word: 'Schaf', emoji: '🐑', syllables: 1 },
  { word: 'Schwein', emoji: '🐷', syllables: 1 },
  { word: 'Kuh', emoji: '🐮', syllables: 1 },
  { word: 'Hand', emoji: '✋', syllables: 1 },
  { word: 'Fuß', emoji: '🦶', syllables: 1 },
  { word: 'Mond', emoji: '🌙', syllables: 1 },
  { word: 'Stern', emoji: '⭐', syllables: 1 },
  { word: 'Zug', emoji: '🚆', syllables: 1 },
  { word: 'Uhr', emoji: '⏰', syllables: 1 },
  { word: 'Zahn', emoji: '🦷', syllables: 1 },
  { word: 'Pilz', emoji: '🍄', syllables: 1 },

  // 2 Silben
  { word: 'Auto', emoji: '🚗', syllables: 2 },
  { word: 'Katze', emoji: '🐱', syllables: 2 },
  { word: 'Sonne', emoji: '☀️', syllables: 2 },
  { word: 'Schneemann', emoji: '⛄', syllables: 2 },
  { word: 'Apfel', emoji: '🍎', syllables: 2 },
  { word: 'Birne', emoji: '🍐', syllables: 2 },
  { word: 'Kirsche', emoji: '🍒', syllables: 2 },
  { word: 'Zitrone', emoji: '🍋', syllables: 2 },
  { word: 'Erdbeere', emoji: '🍓', syllables: 2 },
  { word: 'Hase', emoji: '🐰', syllables: 2 },
  { word: 'Löwe', emoji: '🦁', syllables: 2 },
  { word: 'Tiger', emoji: '🐯', syllables: 2 },
  { word: 'Affe', emoji: '🐵', syllables: 2 },
  { word: 'Zebra', emoji: '🦓', syllables: 2 },
  { word: 'Vogel', emoji: '🐦', syllables: 2 },
  { word: 'Ente', emoji: '🦆', syllables: 2 },
  { word: 'Eule', emoji: '🦉', syllables: 2 },
  { word: 'Pferd', emoji: '🐴', syllables: 2 },
  { word: 'Schlange', emoji: '🐍', syllables: 2 },
  { word: 'Spinne', emoji: '🕷️', syllables: 2 },
  { word: 'Käfer', emoji: '🐞', syllables: 2 },
  { word: 'Biene', emoji: '🐝', syllables: 2 },
  { word: 'Blume', emoji: '🌸', syllables: 2 },
  { word: 'Rose', emoji: '🌹', syllables: 2 },
  { word: 'Tanne', emoji: '🌲', syllables: 2 },
  { word: 'Kuchen', emoji: '🍰', syllables: 2 },
  { word: 'Torte', emoji: '🎂', syllables: 2 },
  { word: 'Käse', emoji: '🧀', syllables: 2 },
  { word: 'Pizza', emoji: '🍕', syllables: 2 },
  { word: 'Zucker', emoji: '🍬', syllables: 2 },
  { word: 'Lutscher', emoji: '🍭', syllables: 2 },
  { word: 'Lampe', emoji: '💡', syllables: 2 },
  { word: 'Kerze', emoji: '🕯️', syllables: 2 },
  { word: 'Koffer', emoji: '🧳', syllables: 2 },
  { word: 'Brille', emoji: '👓', syllables: 2 },
  { word: 'Schere', emoji: '✂️', syllables: 2 },
  { word: 'Glocke', emoji: '🔔', syllables: 2 },
  { word: 'Flasche', emoji: '🍼', syllables: 2 },
  { word: 'Gitarre', emoji: '🎸', syllables: 2 },
  { word: 'Trommel', emoji: '🥁', syllables: 2 },
  { word: 'Schule', emoji: '🏫', syllables: 2 },
  { word: 'Krone', emoji: '👑', syllables: 2 },
  { word: 'Wolke', emoji: '☁️', syllables: 2 },
  { word: 'Wasser', emoji: '💧', syllables: 2 },
  { word: 'Regen', emoji: '🌧️', syllables: 2 },

  // 3 Silben
  { word: 'Zauberer', emoji: '🧙‍♂️', syllables: 3 },
  { word: 'Schmetterling', emoji: '🦋', syllables: 3 },
  { word: 'Elefant', emoji: '🐘', syllables: 3 },
  { word: 'Banane', emoji: '🍌', syllables: 3 },
  { word: 'Regenschirm', emoji: '☂️', syllables: 3 },
  { word: 'Tomate', emoji: '🍅', syllables: 3 },
  { word: 'Karotte', emoji: '🥕', syllables: 3 },
  { word: 'Krokodil', emoji: '🐊', syllables: 3 },
  { word: 'Dinosaurier', emoji: '🦖', syllables: 4 },
  { word: 'Papagei', emoji: '🦜', syllables: 3 },
  { word: 'Flamingo', emoji: '🦩', syllables: 3 },
  { word: 'Gorilla', emoji: '🦍', syllables: 3 },
  { word: 'Fahrradhelm', emoji: '⛑️', syllables: 3 },
  { word: 'Feuerwehr', emoji: '🚒', syllables: 3 },
  { word: 'Flugzeug', emoji: '✈️', syllables: 2 },
  { word: 'Hubschrauber', emoji: '🚁', syllables: 3 },
  { word: 'Polizei', emoji: '🚓', syllables: 3 },
  { word: 'Krankenhaus', emoji: '🏥', syllables: 3 },
  { word: 'Regenbogen', emoji: '🌈', syllables: 4 },
  { word: 'Sonnenblume', emoji: '🌻', syllables: 4 },
  { word: 'Telefon', emoji: '☎️', syllables: 3 },
  { word: 'Mikrofon', emoji: '🎤', syllables: 3 },
  { word: 'Teleskop', emoji: '🔭', syllables: 3 },
  { word: 'Luftballon', emoji: '🎈', syllables: 3 },
  { word: 'Geschenkkorb', emoji: '🎁', syllables: 3 },
  { word: 'Schultüte', emoji: '🎒', syllables: 3 },
  { word: 'Kleeblatt', emoji: '☘️', syllables: 2 },
  { word: 'Marienkäfer', emoji: '🐞', syllables: 5 },

  // 4 & 5 Silben
  { word: 'Schokolade', emoji: '🍫', syllables: 4 },
  { word: 'Wassermelone', emoji: '🍉', syllables: 5 },
  { word: 'Lokomotive', emoji: '🚂', syllables: 5 },
  { word: 'Avocado', emoji: '🥑', syllables: 4 },
  { word: 'Helikopter', emoji: '🚁', syllables: 4 },
  { word: 'Prinzessin', emoji: '👸', syllables: 3 },
  { word: 'Ritterburg', emoji: '🏰', syllables: 3 }
];

let currentWord = null;
let currentArcCount = 0;

const syllableEmojiEl = document.getElementById('syllable-emoji');
const syllableWordEl = document.getElementById('syllable-word');
const arcsContainerEl = document.getElementById('arcs-container');
const feedbackSyllables = document.getElementById('feedback-syllables');

function renderArcs() {
  arcsContainerEl.innerHTML = '';
  if (currentArcCount === 0) {
    arcsContainerEl.innerHTML = '<span class="placeholder-text">Tippe auf den grünen Knopf für jede Silbe!</span>';
    return;
  }
  for (let i = 0; i < currentArcCount; i++) {
    const arc = document.createElement('span');
    arc.className = 'syllable-arc';
    arc.textContent = '◡';
    arcsContainerEl.appendChild(arc);
  }
}

function generateNewWord() {
  currentArcCount = 0;
  renderArcs();
  feedbackSyllables.textContent = '';

  const randomIndex = Math.floor(Math.random() * SYLLABLE_WORDS.length);
  currentWord = SYLLABLE_WORDS[randomIndex];

  syllableEmojiEl.textContent = currentWord.emoji;
  syllableWordEl.textContent = currentWord.word;
}

document.getElementById('btn-add-arc').addEventListener('click', () => {
  if (currentArcCount < 6) {
    currentArcCount++;
    renderArcs();
  }
});

document.getElementById('btn-remove-arc').addEventListener('click', () => {
  if (currentArcCount > 0) {
    currentArcCount--;
    renderArcs();
  }
});

document.getElementById('btn-check-syllables').addEventListener('click', async () => {
  if (currentArcCount === 0) {
    feedbackSyllables.textContent = 'Setze zuerst mindestens einen Bogen!';
    feedbackSyllables.style.color = '#e65100';
    return;
  }

  if (currentArcCount === currentWord.syllables) {
    feedbackSyllables.textContent = `🎉 Perfekt! "${currentWord.word}" hat genau ${currentWord.syllables} Silben!`;
    feedbackSyllables.style.color = '#2e7d32';

    const taskLog = `Silben: ${currentWord.word} (${currentWord.syllables} Bögen) ⭐`;
    await addEntry(taskLog);
    renderUI();

    setTimeout(() => {
      generateNewWord();
    }, 1400);
  } else {
    feedbackSyllables.textContent = `🤔 Fast! Klatsche das Wort noch einmal langsam!`;
    feedbackSyllables.style.color = '#d32f2f';
  }
});

// ==========================================
// 6. UI & RESET
// ==========================================
const scoreDisplay = document.getElementById('score-display');
const historyList = document.getElementById('history-list');

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

document.getElementById('btn-clear').addEventListener('click', async () => {
  if (confirm('Möchtest du wirklich alle gesammelten Sterne zurücksetzen?')) {
    await clearEntries();
    renderUI();
  }
});

// Starten
renderUI();
buildNumberPad();
generateNewTask();
generateNewWord();