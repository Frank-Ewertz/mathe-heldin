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
// 3. Modus-Umschaltung (Mathe, Silben, Anlaute)
// ==========================================
const MODE_TABS = [
  { tabId: 'tab-math', sectionId: 'section-math' },
  { tabId: 'tab-syllables', sectionId: 'section-syllables' },
  { tabId: 'tab-anlaut', sectionId: 'section-anlaut' }
];

MODE_TABS.forEach(({ tabId, sectionId }) => {
  document.getElementById(tabId).addEventListener('click', () => {
    MODE_TABS.forEach(({ tabId: otherTab, sectionId: otherSection }) => {
      const isCurrent = (otherTab === tabId);
      document.getElementById(otherTab).classList.toggle('active', isCurrent);
      document.getElementById(otherSection).style.display = isCurrent ? 'block' : 'none';
    });
  });
});

// ==========================================
// 4. MATHE-LOGIK
// ==========================================
let currentMaxNumber = 10;
let currentTask = { questionText: '', correctAnswer: 0, a: 0, b: 0, op: '+' };
let mathLocked = false; // verhindert Doppel-Sterne durch mehrfaches Klicken
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
  if (mathLocked) return;

  const chosenNumber = parseInt(e.target.getAttribute('data-val'), 10);

  if (chosenNumber === currentTask.correctAnswer) {
    mathLocked = true;
    feedbackMath.textContent = '🌟 Richtig! Tolle Leistung!';
    feedbackMath.style.color = '#2e7d32';

    const taskLog = `Mathe: ${currentTask.questionText.replace('?', chosenNumber)} ⭐`;
    await addEntry(taskLog);
    renderUI();

    setTimeout(() => {
      mathLocked = false;
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
  { word: 'Erdbeere', emoji: '🍓', syllables: 3 },
  { word: 'Prinzessin', emoji: '👸', syllables: 3 },
  { word: 'Ritterburg', emoji: '🏰', syllables: 3 },

  // 4 & 5 Silben
  { word: 'Schokolade', emoji: '🍫', syllables: 4 },
  { word: 'Wassermelone', emoji: '🍉', syllables: 5 },
  { word: 'Lokomotive', emoji: '🚂', syllables: 5 },
  { word: 'Avocado', emoji: '🥑', syllables: 4 },
  { word: 'Helikopter', emoji: '🚁', syllables: 4 },
  { word: 'Marienkäfer', emoji: '🐞', syllables: 4 },
  { word: 'Dinosaurier', emoji: '🦖', syllables: 5 }
];

let currentWord = null;
let currentArcCount = 0;
let syllablesLocked = false; // verhindert Doppel-Sterne durch mehrfaches Prüfen

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
  if (syllablesLocked) return;
  if (currentArcCount < 6) {
    currentArcCount++;
    renderArcs();
  }
});

document.getElementById('btn-remove-arc').addEventListener('click', () => {
  if (syllablesLocked) return;
  if (currentArcCount > 0) {
    currentArcCount--;
    renderArcs();
  }
});

document.getElementById('btn-check-syllables').addEventListener('click', async () => {
  if (syllablesLocked) return;
  if (currentArcCount === 0) {
    feedbackSyllables.textContent = 'Setze zuerst mindestens einen Bogen!';
    feedbackSyllables.style.color = '#e65100';
    return;
  }

  if (currentArcCount === currentWord.syllables) {
    syllablesLocked = true;
    feedbackSyllables.textContent = `🎉 Perfekt! "${currentWord.word}" hat genau ${currentWord.syllables} Silben!`;
    feedbackSyllables.style.color = '#2e7d32';

    const taskLog = `Silben: ${currentWord.word} (${currentWord.syllables} Bögen) ⭐`;
    await addEntry(taskLog);
    renderUI();

    setTimeout(() => {
      syllablesLocked = false;
      generateNewWord();
    }, 1400);
  } else {
    feedbackSyllables.textContent = `🤔 Fast! Klatsche das Wort noch einmal langsam!`;
    feedbackSyllables.style.color = '#d32f2f';
  }
});

// ==========================================
// 6. ANLAUT-DATEN (Anlaut-Zuordnung)
// ==========================================
// Pool lässt sich leicht erweitern: einfach weitere Objekte ergänzen.
// { letter: 'A', emoji: '🍎', word: 'Apfel' }
const ANLAUT_DATA = [
  // A
  { letter: 'A', emoji: '🍎', word: 'Apfel' },
  { letter: 'A', emoji: '🐒', word: 'Affe' },
  { letter: 'A', emoji: '🚦', word: 'Ampel' },
  { letter: 'A', emoji: '🚗', word: 'Auto' },
  { letter: 'A', emoji: '🐜', word: 'Ameise' },
  { letter: 'A', emoji: '🍍', word: 'Ananas' },
  { letter: 'A', emoji: '⚓', word: 'Anker' },
  { letter: 'A', emoji: '🪓', word: 'Axt' },
  { letter: 'A', emoji: '👁️', word: 'Auge' },
  { letter: 'A', emoji: '🍆', word: 'Aubergine' },
  // B
  { letter: 'B', emoji: '🐻', word: 'Bär' },
  { letter: 'B', emoji: '🌳', word: 'Baum' },
  { letter: 'B', emoji: '🐝', word: 'Biene' },
  { letter: 'B', emoji: '🍌', word: 'Banane' },
  { letter: 'B', emoji: '🍞', word: 'Brot' },
  { letter: 'B', emoji: '📚', word: 'Buch' },
  { letter: 'B', emoji: '⚽', word: 'Ball' },
  { letter: 'B', emoji: '🎈', word: 'Ballon' },
  { letter: 'B', emoji: '🛏️', word: 'Bett' },
  { letter: 'B', emoji: '🚌', word: 'Bus' },
  { letter: 'B', emoji: '🍔', word: 'Burger' },
  { letter: 'B', emoji: '🥦', word: 'Brokkoli' },
  // C
  { letter: 'C', emoji: '🤡', word: 'Clown' },
  { letter: 'C', emoji: '💻', word: 'Computer' },
  { letter: 'C', emoji: '🏕️', word: 'Camping' },
  // D
  { letter: 'D', emoji: '🐬', word: 'Delfin' },
  { letter: 'D', emoji: '🦖', word: 'Dinosaurier' },
  { letter: 'D', emoji: '🍩', word: 'Donut' },
  { letter: 'D', emoji: '🐉', word: 'Drache' },
  { letter: 'D', emoji: '💎', word: 'Diamant' },
  { letter: 'D', emoji: '🚿', word: 'Dusche' },
  // E
  { letter: 'E', emoji: '🐘', word: 'Elefant' },
  { letter: 'E', emoji: '🍓', word: 'Erdbeere' },
  { letter: 'E', emoji: '🦆', word: 'Ente' },
  { letter: 'E', emoji: '🦉', word: 'Eule' },
  { letter: 'E', emoji: '🦄', word: 'Einhorn' },
  { letter: 'E', emoji: '🍦', word: 'Eis' },
  { letter: 'E', emoji: '🌍', word: 'Erde' },
  { letter: 'E', emoji: '👼', word: 'Engel' },
  { letter: 'E', emoji: '🚂', word: 'Eisenbahn' },
  // F
  { letter: 'F', emoji: '🐟', word: 'Fisch' },
  { letter: 'F', emoji: '🐸', word: 'Frosch' },
  { letter: 'F', emoji: '🦊', word: 'Fuchs' },
  { letter: 'F', emoji: '🚲', word: 'Fahrrad' },
  { letter: 'F', emoji: '🦇', word: 'Fledermaus' },
  { letter: 'F', emoji: '📺', word: 'Fernseher' },
  { letter: 'F', emoji: '🔥', word: 'Feuer' },
  { letter: 'F', emoji: '🐷', word: 'Ferkel' },
  // G
  { letter: 'G', emoji: '🦒', word: 'Giraffe' },
  { letter: 'G', emoji: '🎸', word: 'Gitarre' },
  { letter: 'G', emoji: '🎁', word: 'Geschenk' },
  { letter: 'G', emoji: '👻', word: 'Geist' },
  { letter: 'G', emoji: '🥒', word: 'Gurke' },
  { letter: 'G', emoji: '🔔', word: 'Glocke' },
  { letter: 'G', emoji: '🦍', word: 'Gorilla' },
  // H
  { letter: 'H', emoji: '🐶', word: 'Hund' },
  { letter: 'H', emoji: '🚁', word: 'Hubschrauber' },
  { letter: 'H', emoji: '🏠', word: 'Haus' },
  { letter: 'H', emoji: '🐰', word: 'Hase' },
  { letter: 'H', emoji: '🐓', word: 'Hahn' },
  { letter: 'H', emoji: '🍯', word: 'Honig' },
  { letter: 'H', emoji: '🧙‍♀️', word: 'Hexe' },
  { letter: 'H', emoji: '🦈', word: 'Hai' },
  // I
  { letter: 'I', emoji: '🏝️', word: 'Insel' },
  { letter: 'I', emoji: '🦔', word: 'Igel' },
  { letter: 'I', emoji: '🐝', word: 'Insekt' },
  // J
  { letter: 'J', emoji: '🧥', word: 'Jacke' },
  { letter: 'J', emoji: '👖', word: 'Jeans' },
  { letter: 'J', emoji: '👦', word: 'Junge' },
  { letter: 'J', emoji: '🪀', word: 'Jojo' },
  // K
  { letter: 'K', emoji: '🐱', word: 'Katze' },
  { letter: 'K', emoji: '👑', word: 'Krone' },
  { letter: 'K', emoji: '🧀', word: 'Käse' },
  { letter: 'K', emoji: '🍒', word: 'Kirsche' },
  { letter: 'K', emoji: '👗', word: 'Kleid' },
  { letter: 'K', emoji: '🐫', word: 'Kamel' },
  { letter: 'K', emoji: '🐊', word: 'Krokodil' },
  { letter: 'K', emoji: '🧳', word: 'Koffer' },
  { letter: 'K', emoji: '🎃', word: 'Kürbis' },
  // L
  { letter: 'L', emoji: '🦁', word: 'Löwe' },
  { letter: 'L', emoji: '🪜', word: 'Leiter' },
  { letter: 'L', emoji: '🍭', word: 'Lutscher' },
  { letter: 'L', emoji: '🐆', word: 'Leopard' },
  { letter: 'L', emoji: '🚛', word: 'LKW' },
  { letter: 'L', emoji: '🔦', word: 'Lampe' },
  { letter: 'L', emoji: '👄', word: 'Lippen' },
  // M
  { letter: 'M', emoji: '🐭', word: 'Maus' },
  { letter: 'M', emoji: '🍉', word: 'Melone' },
  { letter: 'M', emoji: '🌙', word: 'Mond' },
  { letter: 'M', emoji: '🥛', word: 'Milch' },
  { letter: 'M', emoji: '🏍️', word: 'Motorrad' },
  { letter: 'M', emoji: '🔪', word: 'Messer' },
  { letter: 'M', emoji: '🗑️', word: 'Mülleimer' },
  { letter: 'M', emoji: '🦟', word: 'Mücke' },
  // N
  { letter: 'N', emoji: '🦛', word: 'Nilpferd' },
  { letter: 'N', emoji: '🍝', word: 'Nudeln' },
  { letter: 'N', emoji: '🌰', word: 'Nuss' },
  { letter: 'N', emoji: '👃', word: 'Nase' },
  { letter: 'N', emoji: '🪹', word: 'Nest' },
  // O
  { letter: 'O', emoji: '👵', word: 'Oma' },
  { letter: 'O', emoji: '👴', word: 'Opa' },
  { letter: 'O', emoji: '🍊', word: 'Orange' },
  { letter: 'O', emoji: '👂', word: 'Ohr' },
  { letter: 'O', emoji: '🐙', word: 'Oktopus' },
  { letter: 'O', emoji: '🦦', word: 'Otter' },
  // P
  { letter: 'P', emoji: '🐧', word: 'Pinguin' },
  { letter: 'P', emoji: '🍕', word: 'Pizza' },
  { letter: 'P', emoji: '🍄', word: 'Pilz' },
  { letter: 'P', emoji: '🎁', word: 'Paket' },
  { letter: 'P', emoji: '🦜', word: 'Papagei' },
  { letter: 'P', emoji: '🐴', word: 'Pferd' },
  { letter: 'P', emoji: '👮', word: 'Polizist' },
  { letter: 'P', emoji: '🥞', word: 'Pfannkuchen' },
  // Q
  { letter: 'Q', emoji: '🪼', word: 'Qualle' },
  // R
  { letter: 'R', emoji: '🚀', word: 'Rakete' },
  { letter: 'R', emoji: '🌹', word: 'Rose' },
  { letter: 'R', emoji: '💍', word: 'Ring' },
  { letter: 'R', emoji: '🐛', word: 'Raupe' },
  { letter: 'R', emoji: '📻', word: 'Radio' },
  { letter: 'R', emoji: '🌧️', word: 'Regen' },
  { letter: 'R', emoji: '🐀', word: 'Ratte' },
  { letter: 'R', emoji: '🤖', word: 'Roboter' },
  // S
  { letter: 'S', emoji: '☀️', word: 'Sonne' },
  { letter: 'S', emoji: '🛋️', word: 'Sofa' },
  { letter: 'S', emoji: '🧃', word: 'Saft' },
  { letter: 'S', emoji: '🐷', word: 'Schwein' },
  { letter: 'S', emoji: '✂️', word: 'Schere' },
  { letter: 'S', emoji: '🚢', word: 'Schiff' },
  { letter: 'S', emoji: '⛄', word: 'Schneemann' },
  { letter: 'S', emoji: '🐍', word: 'Schlange' },
  { letter: 'S', emoji: '🗝️', word: 'Schlüssel' },
  // T
  { letter: 'T', emoji: '🐯', word: 'Tiger' },
  { letter: 'T', emoji: '🗼', word: 'Turm' },
  { letter: 'T', emoji: '🍅', word: 'Tomate' },
  { letter: 'T', emoji: '🚜', word: 'Traktor' },
  { letter: 'T', emoji: '☎️', word: 'Telefon' },
  { letter: 'T', emoji: '🚪', word: 'Tür' },
  { letter: 'T', emoji: '☕', word: 'Tasse' },
  { letter: 'T', emoji: '🎂', word: 'Torte' },
  // U
  { letter: 'U', emoji: '⌚', word: 'Uhr' },
  { letter: 'U', emoji: '🚇', word: 'U-Bahn' },
  { letter: 'U', emoji: '🛸', word: 'UFO' },
  // V
  { letter: 'V', emoji: '🐦', word: 'Vogel' },
  { letter: 'V', emoji: '🌋', word: 'Vulkan' },
  { letter: 'V', emoji: '🧛', word: 'Vampir' },
  // W
  { letter: 'W', emoji: '🐳', word: 'Wal' },
  { letter: 'W', emoji: '☁️', word: 'Wolke' },
  { letter: 'W', emoji: '🎲', word: 'Würfel' },
  { letter: 'W', emoji: '💧', word: 'Wasser' },
  { letter: 'W', emoji: '🐺', word: 'Wolf' },
  { letter: 'W', emoji: '🐛', word: 'Wurm' },
  { letter: 'W', emoji: '⚖️', word: 'Waage' },
  // Z
  { letter: 'Z', emoji: '🦓', word: 'Zebra' },
  { letter: 'Z', emoji: '🍋', word: 'Zitrone' },
  { letter: 'Z', emoji: '⛺', word: 'Zelt' },
  { letter: 'Z', emoji: '🚂', word: 'Zug' },
  { letter: 'Z', emoji: '🐐', word: 'Ziege' },
  { letter: 'Z', emoji: '🦷', word: 'Zahn' },
  { letter: 'Z', emoji: '🪄', word: 'Zauberstab' }
];

// ==========================================
// 6b. ANLAUT-LOGIK (Zuordnungs-Spiel)
// ==========================================
// Rundenbasiert: Pro Runde 6 zufällige Paare (jeder Buchstabe und jedes
// Emoji nur einmal, damit die Zuordnung eindeutig bleibt). Beide Spalten
// werden unabhängig voneinander gemischt.
const ANLAUT_PAIRS_PER_ROUND = 6;

const anlautLettersEl = document.getElementById('anlaut-letters');
const anlautEmojisEl = document.getElementById('anlaut-emojis');
const anlautRoundEl = document.getElementById('anlaut-round');
const anlautProgressEl = document.getElementById('anlaut-progress');
const feedbackAnlaut = document.getElementById('feedback-anlaut');
const anlautConfettiEl = document.getElementById('anlaut-confetti');

let anlautRoundPairs = [];
let anlautMatchedCount = 0;
let anlautRoundNo = 1;
let anlautLocked = false;        // blockiert Klicks während Shake-/Wartephase
let anlautSelectedCard = null;   // aktuell gewählte Buchstaben-Karte

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawRoundPairs() {
  const pool = [...ANLAUT_DATA];
  const chosen = [];
  const usedLetters = new Set();
  const usedEmojis = new Set();

  while (chosen.length < ANLAUT_PAIRS_PER_ROUND && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const pair = pool.splice(randomIndex, 1)[0];

    if (!usedLetters.has(pair.letter) && !usedEmojis.has(pair.emoji)) {
      usedLetters.add(pair.letter);
      usedEmojis.add(pair.emoji);
      chosen.push(pair);
    }
  }

  return chosen;
}

function createAnlautCard(pair, type) {
  const btn = document.createElement('button');
  btn.className = 'anlaut-card-btn' + (type === 'emoji' ? ' emoji-card' : '');
  btn.dataset.pairId = pair.id;
  btn.dataset.type = type;
  btn.textContent = type === 'emoji' ? pair.emoji : pair.letter;
  return btn;
}

function renderAnlautBoard() {
  anlautLettersEl.innerHTML = '';
  anlautEmojisEl.innerHTML = '';

  // Linke Spalte: Buchstaben (gemischt)
  shuffleArray(anlautRoundPairs).forEach((pair) => {
    anlautLettersEl.appendChild(createAnlautCard(pair, 'letter'));
  });

  // Rechte Spalte: Emojis (unabhängig davon gemischt)
  shuffleArray(anlautRoundPairs).forEach((pair) => {
    anlautEmojisEl.appendChild(createAnlautCard(pair, 'emoji'));
  });

  anlautRoundEl.textContent = `Runde ${anlautRoundNo}`;
  anlautProgressEl.textContent = `0 / ${ANLAUT_PAIRS_PER_ROUND} Paare`;
}

function startAnlautRound() {
  anlautRoundPairs = drawRoundPairs().map((pair, index) => ({ ...pair, id: index }));
  anlautMatchedCount = 0;
  anlautSelectedCard = null;
  anlautLocked = false;
  feedbackAnlaut.textContent = '';
  renderAnlautBoard();
}

function clearAnlautSelection() {
  if (anlautSelectedCard) {
    anlautSelectedCard.classList.remove('selected');
    anlautSelectedCard = null;
  }
}

function showConfetti() {
  const colors = ['#ff9800', '#4caf50', '#2196f3', '#e91e63', '#ffca28', '#9c27b0'];
  anlautConfettiEl.innerHTML = '';

  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.width = (6 + Math.random() * 6) + 'px';
    piece.style.height = (5 + Math.random() * 5) + 'px';
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    piece.style.animationDuration = (1.9 + Math.random() * 1.6) + 's';
    anlautConfettiEl.appendChild(piece);
  }

  setTimeout(() => {
    anlautConfettiEl.innerHTML = '';
  }, 4500);
}

// Buchstabe antippen -> auswählen (gelber Rand)
anlautLettersEl.addEventListener('click', (e) => {
  const card = e.target.closest('.anlaut-card-btn');
  if (!card || anlautLocked || card.classList.contains('matched')) return;

  clearAnlautSelection();
  card.classList.add('selected');
  anlautSelectedCard = card;
});

// Emoji antippen -> prüfen
anlautEmojisEl.addEventListener('click', async (e) => {
  const emojiCard = e.target.closest('.anlaut-card-btn');
  if (!emojiCard || anlautLocked || emojiCard.classList.contains('matched')) return;

  if (!anlautSelectedCard) {
    feedbackAnlaut.textContent = '👆 Tippe zuerst auf einen Buchstaben!';
    feedbackAnlaut.style.color = '#e65100';
    return;
  }

  if (emojiCard.dataset.pairId === anlautSelectedCard.dataset.pairId) {
    // RICHTIG: grün + Häkchen, Karte nicht mehr anklickbar
    const pair = anlautRoundPairs[parseInt(emojiCard.dataset.pairId, 10)];

    emojiCard.classList.add('matched');
    anlautSelectedCard.classList.add('matched');
    clearAnlautSelection();
    anlautMatchedCount++;

    feedbackAnlaut.textContent = `✅ ${pair.word} beginnt mit ${pair.letter}!`;
    feedbackAnlaut.style.color = '#2e7d32';
    anlautProgressEl.textContent = `${anlautMatchedCount} / ${ANLAUT_PAIRS_PER_ROUND} Paare`;

    await addEntry(`Anlaut: ${pair.word} → ${pair.letter} ⭐`);
    renderUI();

    if (anlautMatchedCount === ANLAUT_PAIRS_PER_ROUND) {
      // Runde geschafft: Konfetti + nach 3 Sekunden neue Runde
      anlautLocked = true;
      showConfetti();
      feedbackAnlaut.textContent = '🎉 Super! Alle Paare richtig geschafft!';
      feedbackAnlaut.style.color = '#2e7d32';

      setTimeout(() => {
        anlautRoundNo++;
        startAnlautRound();
      }, 3000);
    }
  } else {
    // FALSCH: rot aufblinken, wackeln, Auswahl zurücksetzen
    anlautLocked = true;
    const letterCard = anlautSelectedCard;

    emojiCard.classList.add('wrong');
    letterCard.classList.add('wrong');

    feedbackAnlaut.textContent = '🤔 Höre noch mal genau hin!';
    feedbackAnlaut.style.color = '#d32f2f';

    setTimeout(() => {
      emojiCard.classList.remove('wrong');
      letterCard.classList.remove('wrong');
      clearAnlautSelection();
      anlautLocked = false;
    }, 600);
  }
});

// ==========================================
// 7. UI & RESET
// ==========================================
const scoreDisplay = document.getElementById('score-display');
const historyList = document.getElementById('history-list');

const MAX_HISTORY_ENTRIES = 50;

async function renderUI() {
  const entries = await getAllEntries();
  scoreDisplay.textContent = entries.length;
  historyList.innerHTML = '';

  // Nur die letzten Einträge anzeigen (Sterne-Zähler zählt weiterhin alles)
  const reversed = [...entries].reverse().slice(0, MAX_HISTORY_ENTRIES);
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
startAnlautRound();