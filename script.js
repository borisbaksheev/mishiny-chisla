'use strict';

/* =====================================================================
   Логика заданий. Не трогает страницу, поэтому её можно проверять отдельно.
   ===================================================================== */

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function range(min, max) {
  const result = [];
  for (let n = min; n <= max; n++) result.push(n);
  return result;
}

function pickDistinct(count, min, max) {
  return shuffle(range(min, max)).slice(0, count);
}

function isAscending(list) {
  return list.every((n, i) => i === 0 || list[i - 1] < n);
}

// «Найди число»: шесть разных чисел, одно из них — задание.
function makeFindTask(max) {
  const numbers = pickDistinct(6, 1, max);
  return { type: 'find', numbers, target: numbers[randInt(0, numbers.length - 1)] };
}

// «Какое число пропало?»: пять подряд идущих чисел, одно спрятано, три варианта ответа.
function makeMissingTask(max) {
  const start = randInt(1, max - 4);
  const sequence = range(start, start + 4);
  const missingIndex = randInt(0, 4);
  const answer = sequence[missingIndex];
  // Неверные варианты — соседние числа из диапазона, чтобы задание было осмысленным.
  const near = range(Math.max(1, answer - 3), Math.min(max, answer + 3)).filter(n => n !== answer);
  const options = shuffle([answer].concat(shuffle(near).slice(0, 2)));
  return { type: 'missing', sequence, missingIndex, answer, options };
}

// «По порядку»: пять разных чисел, показанных не по возрастанию.
function makeOrderTask(max) {
  const numbers = pickDistinct(5, 1, max);
  const sorted = numbers.slice().sort((a, b) => a - b);
  let shown = shuffle(numbers);
  while (isAscending(shown)) shown = shuffle(numbers);
  return { type: 'order', shown, sorted };
}

const MAKERS = { find: makeFindTask, missing: makeMissingTask, order: makeOrderTask };

function taskKey(task) {
  if (task.type === 'find') return 'find:' + task.target;
  if (task.type === 'missing') return 'missing:' + task.answer;
  return 'order:' + task.shown.join(',');
}

// Новое задание, по возможности не повторяющее предыдущее.
function makeTask(game, max, prevKey) {
  let task = MAKERS[game](max);
  for (let i = 0; i < 20 && taskKey(task) === prevKey; i++) task = MAKERS[game](max);
  return task;
}

globalThis.MishaLogic = {
  randInt, shuffle, range, pickDistinct, isAscending,
  makeFindTask, makeMissingTask, makeOrderTask, makeTask, taskKey,
};

/* =====================================================================
   Интерфейс
   ===================================================================== */

const PRAISE = ['Молодец!', 'Отлично!', 'Верно!', 'Умница!', 'Здорово!', 'Так держать!'];
const TRY_AGAIN = 'Попробуй ещё';
const SETTINGS_KEY = 'mishiny-chisla-settings';

const state = {
  range: 10,
  sound: true,
  game: null,
  task: null,
  lastKey: '',
  done: false,   // задание выполнено — ответы больше не принимаются
  step: 0,       // сколько чисел уже выбрано в «По порядку»
  stars: 0,
};

let els = {};

/* ---------- Озвучка ---------- */

const Speech = {
  supported: typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window,
  voice: null,

  pickVoice() {
    if (!this.supported) return;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      this.voice = voices.find(v => /^ru(-|_|$)/i.test(v.lang)) || null;
    } catch (e) {
      this.voice = null;
    }
  },

  cancel() {
    if (!this.supported) return;
    try { window.speechSynthesis.cancel(); } catch (e) { /* озвучка не критична */ }
  },

  say(text) {
    if (!this.supported || !state.sound) return;
    try {
      this.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.9;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    } catch (e) { /* без звука игра продолжает работать */ }
  },
};

/* ---------- Настройки ---------- */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (saved.range === 10 || saved.range === 20) state.range = saved.range;
    if (typeof saved.sound === 'boolean') state.sound = saved.sound;
  } catch (e) { /* хранилище недоступно — используем значения по умолчанию */ }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ range: state.range, sound: state.sound }));
  } catch (e) { /* не страшно */ }
}

function renderSettings() {
  els.rangeButtons.forEach(btn => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.range) === state.range));
  });
  if (!Speech.supported) {
    els.soundToggle.disabled = true;
    els.soundToggle.setAttribute('aria-pressed', 'false');
    els.soundToggle.textContent = '🔇 Без озвучки';
    els.soundNote.hidden = false;
    return;
  }
  els.soundToggle.setAttribute('aria-pressed', String(state.sound));
  els.soundToggle.textContent = state.sound ? '🔊 Озвучка: вкл' : '🔇 Озвучка: выкл';
}

/* ---------- Помощники ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Перезапускает CSS-анимацию, даже если класс уже был.
function animate(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function numButton(n, onPick) {
  const btn = el('button', 'num-btn', String(n));
  btn.type = 'button';
  btn.dataset.value = String(n);
  btn.addEventListener('click', () => onPick(n, btn));
  return btn;
}

function setFeedback(text, kind) {
  els.feedback.textContent = text;
  els.feedback.className = 'feedback' + (kind ? ' ' + kind : '');
  if (text) animate(els.feedback, 'show');
}

function showScreen(name) {
  els.menu.hidden = name !== 'menu';
  els.game.hidden = name !== 'game';
  window.scrollTo(0, 0);
}

/* ---------- Ход игры ---------- */

function startGame(game) {
  state.game = game;
  state.lastKey = '';
  showScreen('game');
  nextTask();
}

function goToMenu() {
  Speech.cancel();
  state.game = null;
  state.task = null;
  state.done = true;
  showScreen('menu');
}

function nextTask() {
  Speech.cancel();
  state.task = makeTask(state.game, state.range, state.lastKey);
  state.lastKey = taskKey(state.task);
  state.done = false;
  state.step = 0;
  els.next.hidden = true;
  setFeedback('', '');
  els.board.replaceChildren();
  els.prompt.replaceChildren();

  if (state.task.type === 'find') renderFind(state.task);
  else if (state.task.type === 'missing') renderMissing(state.task);
  else renderOrder(state.task);

  Speech.say(taskSpeech());
}

function taskSpeech() {
  const t = state.task;
  if (!t) return '';
  if (t.type === 'find') return 'Найди число ' + t.target;
  if (t.type === 'missing') return 'Какое число пропало?';
  return 'Нажимай числа по порядку: от меньшего к большему';
}

function repeatTask() {
  if (!state.task) return;
  animate(els.prompt, 'flash');
  Speech.say(taskSpeech());
}

function tryAgain(btn) {
  animate(btn, 'shake');
  setFeedback(TRY_AGAIN, 'try');
  Speech.say(TRY_AGAIN);
}

function complete() {
  state.done = true;
  els.board.querySelectorAll('button').forEach(b => { b.disabled = true; });
  state.stars += 1;
  els.stars.textContent = String(state.stars);
  const praise = PRAISE[randInt(0, PRAISE.length - 1)];
  setFeedback(praise, 'good');
  animate(els.buddy, 'hop');
  Speech.say(praise);
  els.next.hidden = false;
  els.next.focus({ preventScroll: true });
  // На маленьких экранах кнопка «Дальше» может оказаться ниже края.
  els.next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* «Найди число» */
function renderFind(task) {
  els.prompt.append(el('span', '', 'Найди число'), el('span', 'target', String(task.target)));
  const grid = el('div', 'num-grid');
  task.numbers.forEach(n => grid.append(numButton(n, pickFind)));
  els.board.append(grid);
}

function pickFind(n, btn) {
  if (state.done) return;
  if (n === state.task.target) {
    btn.classList.add('correct');
    animate(btn, 'pop');
    complete();
  } else {
    tryAgain(btn);
  }
}

/* «Какое число пропало?» */
function renderMissing(task) {
  els.prompt.append(el('span', '', 'Какое число пропало?'));
  const row = el('div', 'sequence');
  task.sequence.forEach((n, i) => {
    const hidden = i === task.missingIndex;
    const card = el('div', 'seq-card' + (hidden ? ' missing' : ''), hidden ? '?' : String(n));
    if (hidden) card.id = 'missing-card';
    row.append(card);
  });
  const options = el('div', 'options');
  task.options.forEach(n => options.append(numButton(n, pickMissing)));
  els.board.append(row, options);
}

function pickMissing(n, btn) {
  if (state.done) return;
  if (n === state.task.answer) {
    const card = document.getElementById('missing-card');
    card.textContent = String(n);
    card.classList.remove('missing');
    card.classList.add('filled');
    animate(card, 'pop');
    btn.classList.add('correct');
    animate(btn, 'pop');
    complete();
  } else {
    tryAgain(btn);
  }
}

/* «По порядку» */
function renderOrder(task) {
  els.prompt.append(el('span', '', 'От меньшего к большему'));
  const slots = el('div', 'slots');
  task.sorted.forEach(() => slots.append(el('div', 'slot')));
  const grid = el('div', 'order-grid');
  task.shown.forEach(n => grid.append(numButton(n, pickOrder)));
  els.board.append(slots, grid);
}

function pickOrder(n, btn) {
  if (state.done || btn.classList.contains('picked')) return;
  if (n !== state.task.sorted[state.step]) {
    tryAgain(btn);
    return;
  }
  const slot = els.board.querySelectorAll('.slot')[state.step];
  slot.textContent = String(n);
  slot.classList.add('filled');
  animate(slot, 'pop');

  btn.classList.add('picked');
  btn.disabled = true;
  btn.append(el('span', 'badge', String(state.step + 1)));
  animate(btn, 'pop');

  state.step += 1;
  if (state.step === state.task.sorted.length) {
    complete();
  } else {
    setFeedback('', '');
    Speech.say(String(n));
  }
}

/* ---------- Запуск ---------- */

function init() {
  els = {
    menu: document.getElementById('menu'),
    game: document.getElementById('game'),
    prompt: document.getElementById('prompt'),
    board: document.getElementById('board'),
    feedback: document.getElementById('feedback'),
    buddy: document.getElementById('buddy'),
    next: document.getElementById('next'),
    stars: document.getElementById('stars'),
    soundToggle: document.getElementById('sound-toggle'),
    soundNote: document.getElementById('sound-note'),
    rangeButtons: Array.from(document.querySelectorAll('[data-range]')),
  };

  loadSettings();
  renderSettings();

  if (Speech.supported) {
    Speech.pickVoice();
    try { window.speechSynthesis.addEventListener('voiceschanged', () => Speech.pickVoice()); } catch (e) { /* старые браузеры */ }
  }

  document.querySelectorAll('[data-game]').forEach(btn => {
    btn.addEventListener('click', () => startGame(btn.dataset.game));
  });

  els.rangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.range = Number(btn.dataset.range);
      saveSettings();
      renderSettings();
    });
  });

  els.soundToggle.addEventListener('click', () => {
    if (!Speech.supported) return;
    state.sound = !state.sound;
    saveSettings();
    renderSettings();
    if (state.sound) Speech.say('Озвучка включена');
    else Speech.cancel();
  });

  document.getElementById('to-menu').addEventListener('click', goToMenu);
  document.getElementById('repeat').addEventListener('click', repeatTask);

  els.next.addEventListener('click', () => {
    if (!state.done || !state.game) return; // защита от двойного нажатия
    nextTask();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Speech.cancel();
  });
}

if (typeof document !== 'undefined') init();
