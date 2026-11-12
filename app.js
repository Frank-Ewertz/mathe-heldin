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
// 1b. TON & SPRACHE (mit Mute-Schalter)
// ==========================================
// Kurze synthetisierte Töne (Web Audio API, offline-fähig) und optionale
// Sprach-Ausgabe (speechSynthesis) für die Wort-Bilder. Alles über den
// 🔊-Knopf im Kopfbereich ein-/ausschaltbar (dauerhaft gespeichert).
let soundEnabled = true;

const soundBtnEl = document.getElementById('btn-sound');

function initSoundPreference() {
  try {
    if (localStorage.getItem('lernHeldinSound') === 'off') soundEnabled = false;
  } catch (err) {
    /* localStorage evtl. nicht verfügbar */
  }
  updateSoundButton();
}

function updateSoundButton() {
  soundBtnEl.textContent = soundEnabled ? '🔊' : '🔇';
  soundBtnEl.setAttribute('aria-pressed', String(soundEnabled));
  soundBtnEl.classList.toggle('off', !soundEnabled);
}

soundBtnEl.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem('lernHeldinSound', soundEnabled ? 'on' : 'off');
  } catch (err) {
    /* localStorage evtl. nicht verfügbar */
  }
  updateSoundButton();
  if (soundEnabled) playSuccessSound();
});

let audioCtx = null;

function getAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioCtx) audioCtx = new AudioContextConstructor();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(frequency, startDelay, duration, type, volume) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const start = ctx.currentTime + startDelay;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume || 0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function playSuccessSound() {
  playTone(523.25, 0, 0.12);    // C5
  playTone(659.25, 0.09, 0.14); // E5
  playTone(783.99, 0.18, 0.2);  // G5
}

function playErrorSound() {
  playTone(196, 0, 0.2, 'triangle', 0.14);        // G3
  playTone(155.56, 0.12, 0.28, 'triangle', 0.14); // Es3
}

function playFanfareSound() {
  playTone(523.25, 0, 0.12);    // C5
  playTone(659.25, 0.1, 0.12);  // E5
  playTone(783.99, 0.2, 0.12);  // G5
  playTone(1046.5, 0.3, 0.35);  // C6
}

function speakWord(text) {
  if (!soundEnabled || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = 0.85;
  utterance.pitch = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

initSoundPreference();

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
  { tabId: 'tab-anlaut', sectionId: 'section-anlaut' },
  { tabId: 'tab-fill', sectionId: 'section-fill' }
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

  // Anschauliche Darstellung: Bei 0 Äpfeln ein gestrichelter Platzhalter,
  // bei Subtraktion werden die abzuziehenden Äpfel durchgestrichen
  // (statt eines Text-Hinweises, den Erstklässler noch nicht lesen können).
  const visualEl = document.getElementById('visual-helpers');
  visualEl.innerHTML = '';

  if (currentTask.op === '+') {
    visualEl.appendChild(buildAppleGroup(currentTask.a, 0, '🍎'));
    const plus = document.createElement('span');
    plus.className = 'visual-op';
    plus.textContent = '+';
    visualEl.appendChild(plus);
    visualEl.appendChild(buildAppleGroup(currentTask.b, 0, '🍏'));
  } else {
    visualEl.appendChild(buildAppleGroup(currentTask.a, currentTask.b, '🍎'));
  }
}

// Erstellt eine Apfel-Gruppe; die letzten "crossLast" Äpfel werden
// durchgestrichen (Subtraktion). Bei 0 Äpfeln: gestrichelter Platzhalter.
function buildAppleGroup(count, crossLast, emoji) {
  const group = document.createElement('span');
  group.className = 'visual-group';

  if (count === 0) {
    const empty = document.createElement('span');
    empty.className = 'visual-empty';
    group.appendChild(empty);
    return group;
  }

  for (let i = 0; i < count; i++) {
    const apple = document.createElement('span');
    apple.textContent = emoji;
    if (i >= count - crossLast) {
      apple.classList.add('apple-crossed');
    }
    group.appendChild(apple);
  }
  return group;
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
    playSuccessSound();
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
    playErrorSound();
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
    playSuccessSound();
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
    playErrorSound();
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
  { letter: 'N', emoji: '🦏', word: 'Nashorn' },
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
  { letter: 'Q', emoji: '🥣', word: 'Quark' },
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
const anlautStarsEl = document.getElementById('anlaut-progress-stars');
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
  renderProgressStars(anlautStarsEl, ANLAUT_PAIRS_PER_ROUND, 0);
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

  // Buchstaben beim Wählen vorlesen (Laut-Verbindung stärken)
  const selectedPair = anlautRoundPairs[parseInt(card.dataset.pairId, 10)];
  speakWord(selectedPair.letter);
});

// Emoji antippen -> prüfen
anlautEmojisEl.addEventListener('click', async (e) => {
  const emojiCard = e.target.closest('.anlaut-card-btn');
  if (!emojiCard || anlautLocked || emojiCard.classList.contains('matched')) return;

  if (!anlautSelectedCard) {
    // Ohne Auswahl: Wort vorlesen, damit das Kind es hören kann
    const heardPair = anlautRoundPairs[parseInt(emojiCard.dataset.pairId, 10)];
    speakWord(heardPair.word);
    feedbackAnlaut.textContent = '👆 Jetzt den passenden Buchstaben antippen!';
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

    playSuccessSound();
    feedbackAnlaut.textContent = `✅ ${pair.word} beginnt mit ${pair.letter}!`;
    feedbackAnlaut.style.color = '#2e7d32';
    anlautProgressEl.textContent = `${anlautMatchedCount} / ${ANLAUT_PAIRS_PER_ROUND} Paare`;
    renderProgressStars(anlautStarsEl, ANLAUT_PAIRS_PER_ROUND, anlautMatchedCount);

    await addEntry(`Anlaut: ${pair.word} → ${pair.letter} ⭐`);
    renderUI();

    if (anlautMatchedCount === ANLAUT_PAIRS_PER_ROUND) {
      // Runde geschafft: Konfetti + nach 3 Sekunden neue Runde
      anlautLocked = true;
      showConfetti();
      playFanfareSound();
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
    letterCard.dataset.tries = String((parseInt(letterCard.dataset.tries || '0', 10)) + 1);

    playErrorSound();
    emojiCard.classList.add('wrong');
    letterCard.classList.add('wrong');

    feedbackAnlaut.textContent = '🤔 Höre noch mal genau hin!';
    feedbackAnlaut.style.color = '#d32f2f';

    setTimeout(() => {
      emojiCard.classList.remove('wrong');
      letterCard.classList.remove('wrong');
      clearAnlautSelection();
      anlautLocked = false;

      // Anti-Frust-Hilfe: nach 3 Fehlversuchen die richtige Karte aufleuchten
      if (parseInt(letterCard.dataset.tries, 10) >= 3) {
        letterCard.dataset.tries = '0';
        const hintCard = anlautEmojisEl.querySelector(
          `.anlaut-card-btn[data-pair-id="${letterCard.dataset.pairId}"]:not(.matched)`
        );
        if (hintCard) {
          const hintPair = anlautRoundPairs[parseInt(hintCard.dataset.pairId, 10)];
          speakWord(hintPair.word);
          hintCard.classList.add('hint-glow');
          setTimeout(() => hintCard.classList.remove('hint-glow'), 1700);
        }
      }
    }, 600);
  }
});

// ==========================================
// 6c. ANFANGSSILBEN-DATEN (Silben ausmalen)
// ==========================================
// Pool lässt sich leicht erweitern: einfach weitere Objekte ergänzen.
// { emoji: '🍌', word: 'Banane', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Ba' }
const FILL_DATA = [
  // B-Silben
  { emoji: '🍌', word: 'Banane', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Ba' },
  { emoji: '🛏️', word: 'Bett', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Be' },
  { emoji: '🐝', word: 'Biene', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Bi' },
  { emoji: '⛵', word: 'Boot', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Bo' },
  { emoji: '📚', word: 'Buch', base: 'B', syllables: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'], correct: 'Bu' },

  // D-Silben
  { emoji: '🏠', word: 'Dach', base: 'D', syllables: ['Da', 'De', 'Di', 'Do', 'Du'], correct: 'Da' },
  { emoji: '🐬', word: 'Delfin', base: 'D', syllables: ['Da', 'De', 'Di', 'Do', 'Du'], correct: 'De' },
  { emoji: '💎', word: 'Diamant', base: 'D', syllables: ['Da', 'De', 'Di', 'Do', 'Du'], correct: 'Di' },
  { emoji: '🥫', word: 'Dose', base: 'D', syllables: ['Da', 'De', 'Di', 'Do', 'Du'], correct: 'Do' },
  { emoji: '🚿', word: 'Dusche', base: 'D', syllables: ['Da', 'De', 'Di', 'Do', 'Du'], correct: 'Du' },

  // F-Silben
  { emoji: '🚲', word: 'Fahrrad', base: 'F', syllables: ['Fa', 'Fe', 'Fi', 'Fo', 'Fu'], correct: 'Fa' },
  { emoji: '🪶', word: 'Feder', base: 'F', syllables: ['Fa', 'Fe', 'Fi', 'Fo', 'Fu'], correct: 'Fe' },
  { emoji: '🐟', word: 'Fisch', base: 'F', syllables: ['Fa', 'Fe', 'Fi', 'Fo', 'Fu'], correct: 'Fi' },
  { emoji: '📷', word: 'Foto', base: 'F', syllables: ['Fa', 'Fe', 'Fi', 'Fo', 'Fu'], correct: 'Fo' },
  { emoji: '🦊', word: 'Fuchs', base: 'F', syllables: ['Fa', 'Fe', 'Fi', 'Fo', 'Fu'], correct: 'Fu' },

  // G-Silben
  { emoji: '🍴', word: 'Gabel', base: 'G', syllables: ['Ga', 'Ge', 'Gi', 'Go', 'Gu'], correct: 'Ga' },
  { emoji: '👻', word: 'Gespenst', base: 'G', syllables: ['Ga', 'Ge', 'Gi', 'Go', 'Gu'], correct: 'Ge' },
  { emoji: '🦒', word: 'Giraffe', base: 'G', syllables: ['Ga', 'Ge', 'Gi', 'Go', 'Gu'], correct: 'Gi' },
  { emoji: '🦍', word: 'Gorilla', base: 'G', syllables: ['Ga', 'Ge', 'Gi', 'Go', 'Gu'], correct: 'Go' },
  { emoji: '🥒', word: 'Gurke', base: 'G', syllables: ['Ga', 'Ge', 'Gi', 'Go', 'Gu'], correct: 'Gu' },

  // H-Silben
  { emoji: '🐰', word: 'Hase', base: 'H', syllables: ['Ha', 'He', 'Hi', 'Ho', 'Hu'], correct: 'Ha' },
  { emoji: '🧙‍♀️', word: 'Hexe', base: 'H', syllables: ['Ha', 'He', 'Hi', 'Ho', 'Hu'], correct: 'He' },
  { emoji: '🦌', word: 'Hirsch', base: 'H', syllables: ['Ha', 'He', 'Hi', 'Ho', 'Hu'], correct: 'Hi' },
  { emoji: '👖', word: 'Hose', base: 'H', syllables: ['Ha', 'He', 'Hi', 'Ho', 'Hu'], correct: 'Ho' },
  { emoji: '🐶', word: 'Hund', base: 'H', syllables: ['Ha', 'He', 'Hi', 'Ho', 'Hu'], correct: 'Hu' },

  // K-Silben
  { emoji: '🐱', word: 'Katze', base: 'K', syllables: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'], correct: 'Ka' },
  { emoji: '🍪', word: 'Keks', base: 'K', syllables: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'], correct: 'Ke' },
  { emoji: '🍒', word: 'Kirsche', base: 'K', syllables: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'], correct: 'Ki' },
  { emoji: '🧳', word: 'Koffer', base: 'K', syllables: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'], correct: 'Ko' },
  { emoji: '🐄', word: 'Kuh', base: 'K', syllables: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'], correct: 'Ku' },

  // L-Silben
  { emoji: '🏮', word: 'Lampe', base: 'L', syllables: ['La', 'Le', 'Li', 'Lo', 'Lu'], correct: 'La' },
  { emoji: '🪜', word: 'Leiter', base: 'L', syllables: ['La', 'Le', 'Li', 'Lo', 'Lu'], correct: 'Le' },
  { emoji: '👄', word: 'Lippen', base: 'L', syllables: ['La', 'Le', 'Li', 'Lo', 'Lu'], correct: 'Li' },
  { emoji: '🚂', word: 'Lokomotive', base: 'L', syllables: ['La', 'Le', 'Li', 'Lo', 'Lu'], correct: 'Lo' },
  { emoji: '🔎', word: 'Lupe', base: 'L', syllables: ['La', 'Le', 'Li', 'Lo', 'Lu'], correct: 'Lu' },

  // M-Silben
  { emoji: '🐭', word: 'Maus', base: 'M', syllables: ['Ma', 'Me', 'Mi', 'Mo', 'Mu'], correct: 'Ma' },
  { emoji: '🍈', word: 'Melone', base: 'M', syllables: ['Ma', 'Me', 'Mi', 'Mo', 'Mu'], correct: 'Me' },
  { emoji: '🥛', word: 'Milch', base: 'M', syllables: ['Ma', 'Me', 'Mi', 'Mo', 'Mu'], correct: 'Mi' },
  { emoji: '🌙', word: 'Mond', base: 'M', syllables: ['Ma', 'Me', 'Mi', 'Mo', 'Mu'], correct: 'Mo' },
  { emoji: '🐚', word: 'Muschel', base: 'M', syllables: ['Ma', 'Me', 'Mi', 'Mo', 'Mu'], correct: 'Mu' },

  // N-Silben
  { emoji: '👃', word: 'Nase', base: 'N', syllables: ['Na', 'Ne', 'Ni', 'No', 'Nu'], correct: 'Na' },
  { emoji: '🦏', word: 'Nashorn', base: 'N', syllables: ['Na', 'Ne', 'Ni', 'No', 'Nu'], correct: 'Na' },
  { emoji: '🦛', word: 'Nilpferd', base: 'N', syllables: ['Na', 'Ne', 'Ni', 'No', 'Nu'], correct: 'Ni' },
  { emoji: '🎵', word: 'Note', base: 'N', syllables: ['Na', 'Ne', 'Ni', 'No', 'Nu'], correct: 'No' },
  { emoji: '🍝', word: 'Nudel', base: 'N', syllables: ['Na', 'Ne', 'Ni', 'No', 'Nu'], correct: 'Nu' },

  // P-Silben
  { emoji: '🌴', word: 'Palme', base: 'P', syllables: ['Pa', 'Pe', 'Pi', 'Po', 'Pu'], correct: 'Pa' },
  { emoji: '🧍', word: 'Person', base: 'P', syllables: ['Pa', 'Pe', 'Pi', 'Po', 'Pu'], correct: 'Pe' },
  { emoji: '🐧', word: 'Pinguin', base: 'P', syllables: ['Pa', 'Pe', 'Pi', 'Po', 'Pu'], correct: 'Pi' },
  { emoji: '👮', word: 'Polizei', base: 'P', syllables: ['Pa', 'Pe', 'Pi', 'Po', 'Pu'], correct: 'Po' },
  { emoji: '🍮', word: 'Pudding', base: 'P', syllables: ['Pa', 'Pe', 'Pi', 'Po', 'Pu'], correct: 'Pu' },

  // R-Silben
  { emoji: '📻', word: 'Radio', base: 'R', syllables: ['Ra', 'Re', 'Ri', 'Ro', 'Ru'], correct: 'Ra' },
  { emoji: '🌧️', word: 'Regen', base: 'R', syllables: ['Ra', 'Re', 'Ri', 'Ro', 'Ru'], correct: 'Re' },
  { emoji: '💍', word: 'Ring', base: 'R', syllables: ['Ra', 'Re', 'Ri', 'Ro', 'Ru'], correct: 'Ri' },
  { emoji: '🌹', word: 'Rose', base: 'R', syllables: ['Ra', 'Re', 'Ri', 'Ro', 'Ru'], correct: 'Ro' },
  { emoji: '🎒', word: 'Rucksack', base: 'R', syllables: ['Ra', 'Re', 'Ri', 'Ro', 'Ru'], correct: 'Ru' },

  // S-Silben
  { emoji: '🥗', word: 'Salat', base: 'S', syllables: ['Sa', 'Se', 'Si', 'So', 'Su'], correct: 'Sa' },
  { emoji: '🧼', word: 'Seife', base: 'S', syllables: ['Sa', 'Se', 'Si', 'So', 'Su'], correct: 'Se' },
  { emoji: '🚨', word: 'Sirene', base: 'S', syllables: ['Sa', 'Se', 'Si', 'So', 'Su'], correct: 'Si' },
  { emoji: '☀️', word: 'Sonne', base: 'S', syllables: ['Sa', 'Se', 'Si', 'So', 'Su'], correct: 'So' },
  { emoji: '🥣', word: 'Suppe', base: 'S', syllables: ['Sa', 'Se', 'Si', 'So', 'Su'], correct: 'Su' },

  // T-Silben
  { emoji: '🌲', word: 'Tanne', base: 'T', syllables: ['Ta', 'Te', 'Ti', 'To', 'Tu'], correct: 'Ta' },
  { emoji: '☎️', word: 'Telefon', base: 'T', syllables: ['Ta', 'Te', 'Ti', 'To', 'Tu'], correct: 'Te' },
  { emoji: '🐯', word: 'Tiger', base: 'T', syllables: ['Ta', 'Te', 'Ti', 'To', 'Tu'], correct: 'Ti' },
  { emoji: '🍅', word: 'Tomate', base: 'T', syllables: ['Ta', 'Te', 'Ti', 'To', 'Tu'], correct: 'To' },
  { emoji: '🌷', word: 'Tulpe', base: 'T', syllables: ['Ta', 'Te', 'Ti', 'To', 'Tu'], correct: 'Tu' },

  // W-Silben
  { emoji: '⚖️', word: 'Waage', base: 'W', syllables: ['Wa', 'We', 'Wi', 'Wo', 'Wu'], correct: 'Wa' },
  { emoji: '⏰', word: 'Wecker', base: 'W', syllables: ['Wa', 'We', 'Wi', 'Wo', 'Wu'], correct: 'We' },
  { emoji: '🏞️', word: 'Wiese', base: 'W', syllables: ['Wa', 'We', 'Wi', 'Wo', 'Wu'], correct: 'Wi' },
  { emoji: '☁️', word: 'Wolke', base: 'W', syllables: ['Wa', 'We', 'Wi', 'Wo', 'Wu'], correct: 'Wo' },
  { emoji: '🐛', word: 'Wurm', base: 'W', syllables: ['Wa', 'We', 'Wi', 'Wo', 'Wu'], correct: 'Wu' },

  // Z-Silben
  { emoji: '🦷', word: 'Zahn', base: 'Z', syllables: ['Za', 'Ze', 'Zi', 'Zo', 'Zu'], correct: 'Za' },
  { emoji: '🦓', word: 'Zebra', base: 'Z', syllables: ['Za', 'Ze', 'Zi', 'Zo', 'Zu'], correct: 'Ze' },
  { emoji: '🍋', word: 'Zitrone', base: 'Z', syllables: ['Za', 'Ze', 'Zi', 'Zo', 'Zu'], correct: 'Zi' },
  { emoji: '🦁', word: 'Zoo', base: 'Z', syllables: ['Za', 'Ze', 'Zi', 'Zo', 'Zu'], correct: 'Zo' },
  { emoji: '🚂', word: 'Zug', base: 'Z', syllables: ['Za', 'Ze', 'Zi', 'Zo', 'Zu'], correct: 'Zu' }
];

// ==========================================
// 6d. ANFANGSSILBEN-LOGIK (Tap-to-Fill Ausmalen)
// ==========================================
// Rundenbasiert: Pro Runde 4-5 zufällige Zeilen (jedes Emoji nur einmal).
// Pro Zeile: Emoji links, rechts 5 Silben-Kästchen. Das Kind tippt die
// richtige Anfangssilbe an -> das Kästchen "malt sich aus".
const FILL_MIN_ROWS = 4;
const FILL_MAX_ROWS = 5;

const fillBoardEl = document.getElementById('fill-board');
const fillRoundEl = document.getElementById('fill-round');
const fillProgressEl = document.getElementById('fill-progress');
const fillStarsEl = document.getElementById('fill-progress-stars');
const feedbackFill = document.getElementById('feedback-fill');

let fillRoundRows = [];
let fillSolvedCount = 0;
let fillRoundNo = 1;
let fillLocked = false; // blockiert Klicks während des Rundenwechsels

function drawFillRows() {
  const rowCount = FILL_MIN_ROWS +
    Math.floor(Math.random() * (FILL_MAX_ROWS - FILL_MIN_ROWS + 1)); // 4 oder 5
  const pool = shuffleArray(FILL_DATA);
  const chosen = [];
  const usedEmojis = new Set();

  for (const entry of pool) {
    if (chosen.length >= rowCount) break;
    if (!usedEmojis.has(entry.emoji)) {
      usedEmojis.add(entry.emoji);
      chosen.push(entry);
    }
  }

  return chosen;
}

function createFillRow(entry, index) {
  const row = document.createElement('div');
  row.className = 'fill-row';
  row.dataset.index = index;

  // Ganz links: großes Emoji
  const emoji = document.createElement('span');
  emoji.className = 'fill-emoji';
  emoji.textContent = entry.emoji;
  row.appendChild(emoji);

  // Rechts daneben: 5 Silben-Kästchen
  const options = document.createElement('div');
  options.className = 'fill-options';
  entry.syllables.forEach((syl) => {
    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'fill-box';
    box.dataset.syllable = syl;

    const text = document.createElement('span');
    text.className = 'fill-box-text';
    text.textContent = syl;
    box.appendChild(text);

    const tick = document.createElement('span');
    tick.className = 'fill-tick';
    tick.textContent = '✔️';
    box.appendChild(tick);

    options.appendChild(box);
  });
  row.appendChild(options);

  return row;
}

function renderFillBoard() {
  fillBoardEl.innerHTML = '';
  fillRoundRows.forEach((entry, index) => {
    fillBoardEl.appendChild(createFillRow(entry, index));
  });

  fillRoundEl.textContent = `Runde ${fillRoundNo}`;
  fillProgressEl.textContent = `0 / ${fillRoundRows.length} Zeilen`;
  renderProgressStars(fillStarsEl, fillRoundRows.length, 0);
}

function startFillRound() {
  fillRoundRows = drawFillRows();
  fillSolvedCount = 0;
  fillLocked = false;
  feedbackFill.textContent = '';
  renderFillBoard();
}

// Silben-Kästchen antippen -> ausmalen & prüfen
fillBoardEl.addEventListener('click', async (e) => {
  // Bild antippen: Wort vorlesen (Hör-Hilfe)
  const emojiEl = e.target.closest('.fill-emoji');
  if (emojiEl) {
    const emojiRow = emojiEl.closest('.fill-row');
    if (emojiRow && !emojiRow.classList.contains('solved')) {
      speakWord(fillRoundRows[parseInt(emojiRow.dataset.index, 10)].word);
    }
    return;
  }

  const box = e.target.closest('.fill-box');
  if (!box || fillLocked) return;

  const row = box.closest('.fill-row');
  if (!row || row.classList.contains('solved')) return;
  if (row.dataset.rowLocked === 'true') return; // Zeile kurz nach Fehler gesperrt

  const entry = fillRoundRows[parseInt(row.dataset.index, 10)];

  if (box.dataset.syllable === entry.correct) {
    // RICHTIG: Kästchen füllt sich grün, Häkchen erscheint,
    // restliche Kästchen der Zeile werden deaktiviert
    row.classList.add('solved');
    box.classList.add('state-correct');
    fillSolvedCount++;

    playSuccessSound();
    feedbackFill.textContent = `✅ ${entry.word} beginnt mit ${entry.correct}!`;
    feedbackFill.style.color = '#2e7d32';
    fillProgressEl.textContent = `${fillSolvedCount} / ${fillRoundRows.length} Zeilen`;
    renderProgressStars(fillStarsEl, fillRoundRows.length, fillSolvedCount);

    await addEntry(`Anfangssilbe: ${entry.word} → ${entry.correct} ⭐`);
    renderUI();

    if (fillSolvedCount === fillRoundRows.length) {
      // Runde geschafft: Konfetti + nach 3 Sekunden neue Runde
      fillLocked = true;
      showConfetti();
      playFanfareSound();
      feedbackFill.textContent = '🎉 Super! Alle Silben richtig ausgemalt!';
      feedbackFill.style.color = '#2e7d32';

      setTimeout(() => {
        fillRoundNo++;
        startFillRound();
      }, 3000);
    }
  } else {
    // FALSCH: Kästchen füllt sich kurz rot, wackelt und wird wieder weiß
    row.dataset.rowLocked = 'true';
    row.dataset.tries = String((parseInt(row.dataset.tries || '0', 10)) + 1);
    box.classList.add('state-wrong');

    playErrorSound();
    feedbackFill.textContent = '🤔 Sprich das Wort noch einmal langsam!';
    feedbackFill.style.color = '#d32f2f';

    setTimeout(() => {
      box.classList.remove('state-wrong');
      row.dataset.rowLocked = 'false';

      // Anti-Frust-Hilfe: nach 3 Fehlversuchen die richtige Silbe aufleuchten
      if (parseInt(row.dataset.tries, 10) >= 3) {
        row.dataset.tries = '0';
        const hintBox = row.querySelector(`.fill-box[data-syllable="${entry.correct}"]`);
        if (hintBox) {
          speakWord(entry.word);
          hintBox.classList.add('hint-glow');
          setTimeout(() => hintBox.classList.remove('hint-glow'), 1700);
        }
      }
    }, 700);
  }
});

// ==========================================
// 6e. GEMEINSAME HILFEN: FORTSCHRITTS-STERNE & MEILENSTEINE
// ==========================================
function renderProgressStars(containerEl, total, current) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const star = document.createElement('span');
    star.className = 'p-star' + (i < current ? ' lit' : '');
    star.textContent = '★';
    containerEl.appendChild(star);
  }
}

const MILESTONES = [
  { stars: 10, emoji: '🌟', title: 'Sterne-Sammlerin!', text: 'Du hast schon 10 Aufgaben gelöst!' },
  { stars: 25, emoji: '🦊', title: 'Rechen-Fuchs!', text: '25 Sterne – richtig stark!' },
  { stars: 50, emoji: '🚀', title: 'Lern-Rakete!', text: '50 Sterne – du fliegst ab!' },
  { stars: 100, emoji: '🏆', title: 'Lern-Champion!', text: '100 Sterne – unglaublich!' },
  { stars: 200, emoji: '👑', title: 'Lern-Königin!', text: '200 Sterne – legendär!' }
];

let shownMilestones = new Set();

function loadShownMilestones() {
  try {
    const raw = localStorage.getItem('lernHeldinMilestones');
    if (raw) return new Set(JSON.parse(raw));
  } catch (err) {
    /* localStorage evtl. nicht verfügbar */
  }
  return new Set();
}

function saveShownMilestones() {
  try {
    localStorage.setItem('lernHeldinMilestones', JSON.stringify([...shownMilestones]));
  } catch (err) {
    /* localStorage evtl. nicht verfügbar */
  }
}

function showMilestoneBanner(milestone) {
  const banner = document.getElementById('milestone-banner');
  document.getElementById('milestone-emoji').textContent = milestone.emoji;
  document.getElementById('milestone-title').textContent = milestone.title;
  document.getElementById('milestone-text').textContent = milestone.text;

  playFanfareSound();
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 3500);
}

function checkMilestone(totalStars) {
  let newest = null;
  for (const m of MILESTONES) {
    if (totalStars >= m.stars && !shownMilestones.has(m.stars)) {
      shownMilestones.add(m.stars);
      newest = m;
    }
  }
  if (newest) {
    saveShownMilestones();
    showMilestoneBanner(newest);
  }
}

shownMilestones = loadShownMilestones();

// ==========================================
// 7. UI & RESET
// ==========================================
const scoreDisplay = document.getElementById('score-display');
const historyList = document.getElementById('history-list');

const MAX_HISTORY_ENTRIES = 50;

async function renderUI() {
  const entries = await getAllEntries();
  scoreDisplay.textContent = entries.length;
  checkMilestone(entries.length);
  historyList.innerHTML = '';

  // Nur die letzten Einträge anzeigen (Sterne-Zähler zählt weiterhin alles)
  const reversed = [...entries].reverse().slice(0, MAX_HISTORY_ENTRIES);
  for (const entry of reversed) {
    const li = document.createElement('li');
    const dateStr = new Date(entry.timestamp).toLocaleString([], {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    li.innerHTML = `<span>${entry.title}</span> <span>${dateStr}</span>`;
    historyList.appendChild(li);
  }
}

const resetDialogEl = document.getElementById('reset-dialog');

document.getElementById('btn-clear').addEventListener('click', () => {
  resetDialogEl.classList.add('open');
});

document.getElementById('btn-reset-cancel').addEventListener('click', () => {
  resetDialogEl.classList.remove('open');
});

document.getElementById('btn-reset-confirm').addEventListener('click', async () => {
  resetDialogEl.classList.remove('open');
  await clearEntries();
  renderUI();
});

// Klick auf den abgedunkelten Hintergrund schließt den Dialog ebenfalls
resetDialogEl.addEventListener('click', (e) => {
  if (e.target === resetDialogEl) resetDialogEl.classList.remove('open');
});

// Starten
renderUI();
buildNumberPad();
generateNewTask();
generateNewWord();
startAnlautRound();
startFillRound();