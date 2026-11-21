import { FOODS } from './foods.js';

// ---------- утилиты ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const scale = (per, g) => ({ kcal: per.kcal * g / 100, p: per.p * g / 100, f: per.f * g / 100, c: per.c * g / 100 });
const sum = (entries) => entries.reduce((a, e) => {
  const t = scale(e.per100, e.grams);
  a.kcal += t.kcal; a.p += t.p; a.f += t.f; a.c += t.c; return a;
}, { kcal: 0, p: 0, f: 0, c: 0 });

const APP_VERSION = '2.7';
const REPO = 'PavelCGB/kalorii'; // откуда брать обновления APK (GitHub Releases)
// ключ snack остаётся прежним, чтобы старые записи дневника не потерялись
const MEALS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const MEAL_ICON = { breakfast: '🍳', lunch: '🍲', dinner: '🥗', snack: '🍎' };
const MACRO3 = [['p', 'Белки', 'var(--p)'], ['f', 'Жиры', 'var(--f)'], ['c', 'Углеводы', 'var(--c)']];
const WATER_GLASSES = 8;
const DEFAULTS = { goals: { kcal: 2000, p: 100, f: 70, c: 250 }, apiKey: '', model: 'google/gemma-4-31b-it:free' };

// ---------- хранилище ----------
function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; } catch { return def; }
}
const loadedSettings = load('kc_settings', {});
let settings = { ...DEFAULTS, ...loadedSettings, goals: { ...DEFAULTS.goals, ...(loadedSettings.goals || {}) } };
let diary = load('kc_diary', {});       // { 'YYYY-MM-DD': [entry] }
let myFoods = load('kc_myfoods', []);   // [{id, name, barcode, per100}]
const saveSettings = () => localStorage.setItem('kc_settings', JSON.stringify(settings));
const saveDiary = () => localStorage.setItem('kc_diary', JSON.stringify(diary));
const saveMy = () => localStorage.setItem('kc_myfoods', JSON.stringify(myFoods));
let water = load('kc_water', {});       // { 'YYYY-MM-DD': стаканов }
let weight = load('kc_weight', {});     // { 'YYYY-MM-DD': кг }
const saveWater = () => localStorage.setItem('kc_water', JSON.stringify(water));
const saveWeight = () => localStorage.setItem('kc_weight', JSON.stringify(weight));
const fmtNum = (n) => r0(n).toLocaleString('ru-RU');

const BUILTIN = FOODS.map(([name, kcal, p, f, c, piece]) => ({ name, per100: { kcal, p, f, c }, piece, source: 'local' }));
const pcs = (g, piece) => `${r1(g / piece)} шт`; // 120 г банана при 1 шт = 120 г → «1 шт»

let curDate = dkey(new Date());
let addMeal = 'breakfast';

// ---------- главный экран ----------
const shiftKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };

function dateLabel(k) {
  const today = dkey(new Date());
  const dm = parseKey(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (k === today) return 'Сегодня, ' + dm;
  if (k === shiftKey(today, -1)) return 'Вчера, ' + dm;
  if (k === shiftKey(today, 1)) return 'Завтра, ' + dm;
  return parseKey(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
}

// последний вес на дату k или раньше, и предыдущий до него — для «78,4 кг ↓0,6»
function weightAt(k) {
  const days = Object.keys(weight).filter((d) => d <= k).sort();
  const last = days.at(-1), prev = days.at(-2);
  return last ? { kg: weight[last], delta: prev ? weight[last] - weight[prev] : null } : null;
}
const fmtKg = (v) => r1(v).toLocaleString('ru-RU');

const openMeals = new Set(); // какие приёмы пищи раскрыты (список блюд)
let lastAdded = null;

function renderDay() {
  const entries = diary[curDate] || [];
  const tot = sum(entries);
  const g = settings.goals;
  $('#dateLabel').textContent = dateLabel(curDate);

  // кольцо «осталось ккал»
  const goal = num(g.kcal), left = goal - tot.kcal, over = left < 0;
  $('#kcalLeft').textContent = fmtNum(Math.abs(left));
  $('#kcalLeftLabel').textContent = over ? 'перебор ккал' : 'осталось ккал';
  $('#kcalEaten').textContent = fmtNum(tot.kcal);
  $('#kcalGoal').textContent = fmtNum(goal);
  $('.hero').classList.toggle('over', over);
  const frac = goal ? Math.min(1, tot.kcal / goal) : 0;
  $('#ringArc').style.strokeDashoffset = 389.6 * (1 - frac);

  // Б/Ж/У
  $('#macros').innerHTML = MACRO3.map(([k, label, color]) => {
    const v = tot[k], gg = num(g[k]);
    const pct = gg ? Math.min(100, (v / gg) * 100) : 0;
    return `<div class="m"><p>${label}</p><b>${r0(v)} <small>/ ${gg} г</small></b>
      <div class="bar"><i class="${gg && v > gg ? 'over' : ''}" style="background:${color}" data-w="${pct}"></i></div></div>`;
  }).join('');

  // вода
  const w = water[curDate] || 0;
  $('#waterLabel').textContent = `${w} из ${WATER_GLASSES} стаканов`;
  $('#water').innerHTML = Array.from({ length: WATER_GLASSES }, (_, i) =>
    `<button class="${i < w ? 'on' : ''}" data-glass="${i}" aria-label="Стакан ${i + 1}"></button>`).join('');

  // приёмы пищи: строка-сводка, по нажатию раскрывается список блюд
  $('#meals').innerHTML = Object.entries(MEALS).map(([m, label]) => {
    const list = entries.filter((e) => e.meal === m);
    const t = sum(list);
    const summary = list.length
      ? list.map((e) => e.name + (e.piece ? ' ' + pcs(e.grams, e.piece) : '')).join(', ') + ` · ${r0(t.kcal)} ккал`
      : 'Пока пусто';
    const open = openMeals.has(m) || list.some((e) => e.id === lastAdded);
    const items = list.map((e) => {
      const x = scale(e.per100, e.grams);
      return `<li data-entry="${e.id}" class="${e.id === lastAdded ? 'new' : ''}">
        <div class="e-main"><span class="e-name">${esc(e.name)}</span><span class="e-kcal">${r0(x.kcal)} ккал</span></div>
        <div class="e-sub muted">${e.piece ? pcs(e.grams, e.piece) + ' · ' : ''}${r1(e.grams)} г · Б ${r1(x.p)} · Ж ${r1(x.f)} · У ${r1(x.c)}</div>
      </li>`;
    }).join('');
    return `<div class="meal" data-toggle="${m}">
        <div class="ic">${MEAL_ICON[m]}</div>
        <div class="meal-info"><b>${label}</b><p>${esc(summary)}</p></div>
        <button class="add-btn" data-add="${m}" aria-label="Добавить в ${label}">+</button>
      </div>
      ${open && items ? `<ul class="entries">${items}</ul>` : ''}`;
  }).join('');
  lastAdded = null;

  renderWeek();

  // полоски заполняются плавно: ширина 0 → принудительная перерисовка → нужная ширина (сработает transition)
  void $('#macros').offsetWidth;
  $$('#macros [data-w]').forEach((b) => { b.style.width = b.dataset.w + '%'; });
}

// столбики калорий за неделю (Пн–Вс) того дня, что открыт
function renderWeek() {
  const d = parseKey(curDate);
  const monday = shiftKey(curDate, -((d.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftKey(monday, i));
  const goal = num(settings.goals.kcal);
  const kcal = days.map((k) => sum(diary[k] || []).kcal);
  const max = Math.max(goal * 1.15, ...kcal) || 1;
  const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  $('#week').innerHTML = days.map((k, i) =>
    `<button data-day="${k}" class="${k === curDate ? 'today' : ''} ${goal && kcal[i] > goal ? 'over' : ''}" aria-label="${names[i]}: ${r0(kcal[i])} ккал">
      <i style="height:${Math.round((kcal[i] / max) * 66)}px"></i>${names[i]}</button>`).join('');
  const wt = weightAt(curDate);
  $('#weekWeight').textContent = wt
    ? `вес ${fmtKg(wt.kg)} кг` + (wt.delta ? ` ${wt.delta < 0 ? '↓' : '↑'}${fmtKg(Math.abs(wt.delta))}` : '')
    : '';
}

function shiftDay(n) { curDate = shiftKey(curDate, n); renderDay(); }

$('#prevDay').addEventListener('click', () => shiftDay(-1));
$('#nextDay').addEventListener('click', () => shiftDay(1));
$('#dateLabel').addEventListener('click', () => { curDate = dkey(new Date()); renderDay(); });
$('#week').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (b) { curDate = b.dataset.day; renderDay(); }
});

$('#water').addEventListener('click', (e) => {
  const b = e.target.closest('[data-glass]'); if (!b) return;
  const i = Number(b.dataset.glass), w = water[curDate] || 0;
  // нажал на последний полный стакан — убираем его, иначе наполняем до нажатого
  water[curDate] = i + 1 === w ? i : i + 1;
  if (!water[curDate]) delete water[curDate];
  saveWater(); renderDay();
});

$('#meals').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) return openAdd(add.dataset.add);
  const li = e.target.closest('[data-entry]');
  if (li) {
    const entry = (diary[curDate] || []).find((x) => x.id === li.dataset.entry);
    if (entry) openPortion({ name: entry.name, per100: entry.per100, barcode: entry.barcode, source: entry.source, piece: entry.piece }, entry);
    return;
  }
  const row = e.target.closest('[data-toggle]');
  if (row) {
    const m = row.dataset.toggle;
    if (!(diary[curDate] || []).some((x) => x.meal === m)) return openAdd(m); // пусто — сразу добавить
    openMeals.has(m) ? openMeals.delete(m) : openMeals.add(m);
    renderDay();
  }
});

$('#copyYesterday').addEventListener('click', () => {
  const src = diary[shiftKey(curDate, -1)] || [];
  if (!src.length) return toast('Вчера ничего не записано');
  const list = (diary[curDate] ||= []);
  src.forEach((e) => list.push({ ...e, id: uid(), t: Date.now() }));
  saveDiary(); renderDay();
  toast(`Скопировано со вчера: ${src.length} шт · ${r0(sum(src).kcal)} ккал`);
});

// ---------- нижнее меню ----------
const mealByTime = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'; };
const closeOverlays = () => $$('.overlay:not(.hidden)').forEach((o) => hide('#' + o.id));
$('#navDiary').addEventListener('click', () => { closeOverlays(); scrollTo({ top: 0, behavior: 'smooth' }); });
$('#navSearch').addEventListener('click', () => { closeOverlays(); openAdd(mealByTime()); setTimeout(() => $('#searchInput').focus(), 250); });
$('#navScan').addEventListener('click', () => { closeOverlays(); openAdd(mealByTime()); switchTab('barcode'); });
$('#navStats').addEventListener('click', () => { closeOverlays(); openStats(); });
$('#navProfile').addEventListener('click', () => { closeOverlays(); openSettings(); });

// ---------- оверлеи ----------
function show(sel) { $(sel).classList.remove('hidden'); document.body.classList.add('noscroll'); }
function hide(sel) {
  $(sel).classList.add('hidden');
  if (sel === '#addSheet') stopScanner();
  if (!$$('.overlay').some((o) => !o.classList.contains('hidden'))) document.body.classList.remove('noscroll');
}
$$('.overlay').forEach((o) => {
  o.addEventListener('click', (e) => {
    if (e.target === o || e.target.closest('[data-close]')) {
      hide('#' + o.id);
      if (o.id === 'portion') onPortionCancelled();
    }
  });
});

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ---------- окно добавления ----------
let activeTab = 'search';
function openAdd(meal) {
  addMeal = meal;
  $('#addTitle').textContent = 'Добавить: ' + MEALS[meal];
  $('#searchInput').value = '';
  $('#photoResults').innerHTML = '';
  $('#photoPreview').classList.add('hidden');
  setHint('');
  renderSearch('');
  show('#addSheet');
  switchTab('search');
}

function switchTab(name) {
  activeTab = name;
  $$('#addSheet .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('#addSheet .tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + name));
  if (name === 'barcode') startScanner(); else stopScanner();
}
$$('#addSheet .tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// Единый список найденных продуктов (по id), чтобы по клику открыть порцию
const pmap = new Map();
let pid = 0;
function itemHtml(p) {
  const id = ++pid; pmap.set(id, p);
  const sub = [p.brand, p.piece ? `1 шт ≈ ${r0(p.piece)} г` : '', p.suggestGrams ? `≈ ${r0(p.suggestGrams)} г на фото` : '', p.source === 'my' ? (p.ai ? '🤖 найдено ИИ' : 'мой продукт') : '']
    .filter(Boolean).join(' · ');
  return `<button class="food-item" data-pid="${id}">
    <div><div class="f-name">${esc(p.name)}</div>${sub ? `<div class="muted small">${esc(sub)}</div>` : ''}</div>
    <div class="f-kcal">${r0(p.per100.kcal)}<span class="small"> ккал/100г</span></div>
  </button>`;
}
const section = (title, items) => `<h4 class="sec-title">${esc(title)}</h4>` + items.map(itemHtml).join('');

$('#addSheet').addEventListener('click', (e) => {
  const it = e.target.closest('.food-item[data-pid]');
  if (it) { const p = pmap.get(Number(it.dataset.pid)); if (p) openPortion(p); return; }
  if (e.target.closest('[data-open-settings]')) { openSettings(); return; }
  if (e.target.closest('#askAiBtn')) { askAiText($('#searchInput').value.trim()); return; }
  if (e.target.closest('#toManual')) {
    switchTab('manual');
    $('#mName').value = $('#searchInput').value.trim();
    $('#mK').focus();
  }
});

// ---------- поиск ----------
function recentFoods() {
  const seen = new Set(); const out = [];
  for (const d of Object.keys(diary).sort().reverse()) {
    for (const e of [...diary[d]].reverse()) {
      const key = norm(e.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: e.name, per100: e.per100, barcode: e.barcode, source: e.source || 'recent', lastGrams: e.grams, piece: e.piece });
      if (out.length >= 25) return out;
    }
  }
  return out;
}

function localMatches(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const all = [...myFoods.map((f) => ({ ...f, source: 'my' })), ...BUILTIN];
  const res = all.filter((f) => { const n = norm(f.name); return words.every((w) => n.includes(w)); });
  // те, что начинаются с запроса — выше
  const first = norm(q);
  res.sort((a, b) => (norm(b.name).startsWith(first) - norm(a.name).startsWith(first)));
  return res.slice(0, 40);
}

let searchTimer, offCtrl, searchSeq = 0;
function renderSearch(q) {
  q = q.trim();
  clearTimeout(searchTimer);
  offCtrl?.abort();
  pmap.clear();
  const box = $('#searchResults');
  if (!q) {
    const rec = recentFoods();
    box.innerHTML = rec.length ? section('Недавние', rec) : '<p class="muted pad">Начни вводить название продукта</p>';
    return;
  }
  const local = localMatches(q);
  box.innerHTML =
    (local.length ? section('Справочник и мои продукты', local) : '<p class="muted pad">В справочнике не нашлось</p>') +
    (q.length >= 3 ? '<div id="offBlock"><p class="muted pad">Ищу в Open Food Facts…</p></div>' : '') +
    `<div id="aiBlock"></div>
     <button class="btn secondary wide" id="askAiBtn">🤖 Спросить ИИ про «${esc(q)}»</button>
     <button class="btn secondary wide" id="toManual">✍️ Ввести вручную</button>`;
  if (q.length >= 3) {
    const seq = ++searchSeq;
    searchTimer = setTimeout(() => searchOFF(q, seq), 600);
  }
}
$('#searchInput').addEventListener('input', (e) => renderSearch(e.target.value));

function offToProduct(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n['energy_100g'] != null) kcal = num(n['energy_100g']) / 4.184; // кДж → ккал
  const name = (p.product_name_ru || p.product_name || '').trim();
  if (kcal == null || !name) return null;
  return {
    name, brand: p.brands || '', barcode: p.code,
    per100: { kcal: num(kcal), p: num(n.proteins_100g), f: num(n.fat_100g), c: num(n.carbohydrates_100g) },
    source: 'off',
  };
}

async function searchOFF(q, seq) {
  offCtrl = new AbortController();
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25' +
    '&fields=code,product_name,product_name_ru,brands,nutriments&search_terms=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, { signal: offCtrl.signal });
    const j = await r.json();
    const block = $('#offBlock');
    if (!block || seq !== searchSeq) return;
    const items = (j.products || []).map(offToProduct).filter(Boolean);
    block.innerHTML = items.length
      ? section('Open Food Facts — магазинные товары', items)
      : '<p class="muted pad">В Open Food Facts ничего не нашлось</p>';
  } catch (e) {
    if (e.name === 'AbortError') return;
    const block = $('#offBlock');
    if (block && seq === searchSeq) block.innerHTML = '<p class="muted pad">Не удалось связаться с Open Food Facts</p>';
  }
}

// ---------- штрихкод ----------
let stream = null, scanTimer = null, html5 = null, scanning = false;
const setScanStatus = (t) => { $('#scanStatus').textContent = t; };

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('не загрузилась библиотека сканера'));
    document.head.appendChild(s);
  });
}

async function getDetector() {
  if (!('BarcodeDetector' in window)) return null;
  const sup = await BarcodeDetector.getSupportedFormats();
  const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'].filter((f) => sup.includes(f));
  return want.length ? new BarcodeDetector({ formats: want }) : null;
}

let stopping = Promise.resolve(); // пока старый сеанс камеры не закрыт, новый не открываем
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ждём первые кадры; не пришли за 4 с — камера зависла: перезапуск (один раз), потом подсказка
let scanSession = 0;
function watchCamera(attempt) {
  const t0 = Date.now(), session = scanSession;
  const check = () => {
    if (!scanning || session !== scanSession) return;
    const v = $('#reader video');
    if (v?.videoWidth) { v.poster = BLANK; $('#reader').classList.add('live'); return; }
    if (Date.now() - t0 < 4000) return void setTimeout(check, 300);
    stopScanner();
    if (attempt < 1) startScanner(attempt + 1);
    else setScanStatus('Камера не запустилась. Нажми «Сканировать снова» или сфоткай штрихкод.');
  };
  check();
}

async function startScanner(attempt = 0) {
  if (scanning) return;
  scanning = true;
  scanSession++;
  await stopping;
  if (!scanning) return;
  const reader = $('#reader');
  reader.innerHTML = '';
  reader.classList.remove('live');
  setScanStatus(attempt ? 'Перезапускаю камеру…' : 'Наведи камеру на штрихкод (10–15 см)');
  try {
    const detector = await getDetector();
    if (detector) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', ''); video.muted = true; video.poster = BLANK;
      reader.appendChild(video);
      // по умолчанию Chrome даёт 640×480 — для мелких штрихкодов мало
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (!scanning) { stream.getTracks().forEach((t) => t.stop()); stream = null; return; }
      const [track] = stream.getVideoTracks();
      try {
        if (track.getCapabilities?.().focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch { /* автофокус не настраивается — не страшно */ }
      video.srcObject = stream;
      await video.play();
      let last = null;
      const tick = async () => {
        if (!scanning) return;
        try {
          const codes = await detector.detect(video);
          const c = codes[0]?.rawValue;
          // принимаем код, только если он прочитался два кадра подряд — отсекает ошибочные считывания
          if (c && c === last) { stopScanner(); navigator.vibrate?.(80); lookupBarcode(c); return; }
          last = c || null;
        } catch { /* кадр не готов */ }
        scanTimer = setTimeout(tick, 120);
      };
      tick();
      watchCamera(attempt);
    } else {
      // запасной вариант для браузеров без встроенного распознавания (в т.ч. внутри APK)
      await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
      if (!scanning) return;
      const h = new window.Html5Qrcode('reader');
      html5 = h;
      h.started = h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, (text) => {
        stopScanner(); navigator.vibrate?.(80); lookupBarcode(text);
      });
      watchCamera(attempt);
      await h.started;
    }
  } catch (e) {
    scanning = false;
    html5 = null;
    setScanStatus('Не удалось включить камеру (' + (e.message || e) + '). Можно ввести цифры штрихкода вручную.');
  }
}

function stopScanner() {
  scanning = false;
  clearTimeout(scanTimer);
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (html5) {
    const h = html5; html5 = null;
    // сначала дожидаемся, пока запуск закончится, иначе камера останется открытой и следующий запуск зависнет
    stopping = Promise.resolve(h.started).catch(() => {})
      .then(() => h.stop()).catch(() => {})
      .then(() => { try { h.clear(); } catch {} });
  }
}

async function lookupBarcode(raw) {
  const code = String(raw).replace(/\D/g, '');
  if (!code) return;
  const mine = myFoods.find((f) => f.barcode === code);
  if (mine) return openPortion({ ...mine, source: 'my' });
  setScanStatus(`Код ${code}: ищу в базе…`);
  let j;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_ru,brands,nutriments`);
    j = await r.json();
  } catch {
    setScanStatus('Нет связи с Open Food Facts. Проверь интернет.');
    return;
  }
  const p = j.status === 1 && j.product ? offToProduct({ ...j.product, code }) : null;
  if (p) { setScanStatus(`Найдено: ${p.name}`); openPortion(p); return; }
  const name = j.product ? (j.product.product_name_ru || j.product.product_name || '') : '';
  setScanStatus('');
  switchTab('manual');
  setHint(`Штрихкод ${code} ${name ? `(«${name}») есть в базе, но без КБЖУ` : 'не найден в базе'}. Сфоткай этикетку с пищевой ценностью — ИИ заполнит сам, или введи вручную. Я запомню продукт.`);
  $('#mName').value = name; $('#mCode').value = code;
  (name ? $('#mK') : $('#mName')).focus();
}

$('#barcodeGo').addEventListener('click', () => lookupBarcode($('#barcodeInput').value));
$('#barcodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBarcode(e.target.value); });
$('#rescan').addEventListener('click', () => { stopScanner(); startScanner(); });

// Фото штрихкода: снимок с камеры в полном разрешении читается надёжнее видео
$('#barcodePhoto').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  stopScanner();
  setScanStatus('Читаю штрихкод с фото…');
  const notFound = 'На фото не нашёл штрихкод. Сними ближе и ровнее или введи цифры.';
  try {
    const detector = await getDetector();
    if (detector) {
      const codes = await detector.detect(await createImageBitmap(file));
      return codes.length ? lookupBarcode(codes[0].rawValue) : setScanStatus(notFound);
    }
    // нет встроенного распознавания (например, внутри APK) — запасная библиотека
    await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
    const text = await new window.Html5Qrcode('scanFileTmp').scanFile(file, false).catch(() => null);
    text ? lookupBarcode(text) : setScanStatus(notFound);
  } catch {
    setScanStatus('Не получилось прочитать фото (нужен интернет). Введи цифры вручную.');
  }
});

// ---------- ИИ (Claude) ----------
const AI_SYSTEM = `Ты — нутрициолог в приложении для подсчёта калорий. Пользователь из России.
Отвечай ТОЛЬКО одним JSON-объектом, без текста до или после, в формате:
{"items":[{"name":"название по-русски","kcal":число,"protein":число,"fat":число,"carbs":число,"grams":число или null,"piece":число или null}],"note":"короткий комментарий или пустая строка"}
- kcal, protein, fat, carbs — на 100 г продукта или блюда в том виде, в каком его едят (готовое блюдо — для готового).
- grams — примерный вес порции на фото; для текстового запроса — null.
- piece — средний вес 1 штуки в граммах (съедобная часть) для штучного: фрукт, овощ, яйцо, котлета, сырок, батончик, банка напитка и т.п.; для каш, супов, салатов — null.
- Если на фото несколько разных блюд или продуктов — перечисли каждый отдельно.
- Учитывай типичные рецепты и продукты российских магазинов. Если еды не видно — items пустой, причина в note.`;

let sdkPromise = null;
async function askAI(content, system = AI_SYSTEM) {
  if (!settings.apiKey) throw new Error('NO_KEY');
  if (settings.model.includes('/')) return askOpenAICompat('https://openrouter.ai/api/v1/chat/completions', content, system);
  if (settings.model.startsWith('kimi')) return askOpenAICompat('https://api.moonshot.ai/v1/chat/completions', content, system);
  sdkPromise ??= import('https://esm.sh/@anthropic-ai/sdk');
  const { default: Anthropic } = await sdkPromise;
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  const params = {
    model: settings.model,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content }],
  };
  let resp;
  try {
    resp = settings.model.startsWith('claude-opus')
      // если основная модель откажется, сервер сам повторит запрос на запасной
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (e) {
    e.Anthropic = Anthropic;
    throw e;
  }
  if (resp.stop_reason === 'refusal') throw new Error('ИИ отказался обработать этот запрос');
  return parseJson(resp.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

const parseJson = (text) => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new SyntaxError('no json');
  return JSON.parse(m[0]);
};

const OR_FREE_VISION = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-26b-a4b-it:free'];

// Kimi и OpenRouter: OpenAI-совместимый API, пускают запросы прямо из браузера
async function askOpenAICompat(url, content, system) {
  const parts = content.map((b) => b.type === 'image'
    ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
    : b);
  const body = { model: settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content: parts }] };
  // бесплатные модели часто перегружены — OpenRouter сам переключится на следующую из списка
  if (url.includes('openrouter')) body.models = [settings.model, ...OR_FREE_VISION.filter((m) => m !== settings.model)].slice(0, 3);
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + settings.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw Object.assign(new Error('Нет связи с сервисом ИИ — проверь интернет.'), { status: 0 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'HTTP ' + r.status), { status: r.status });
  return parseJson(j.choices?.[0]?.message?.content || '');
}

function aiErr(e) {
  if (e.message === 'NO_KEY') return null;
  if (e.status === 401) return 'Ключ API неверный — проверь его в настройках.';
  if (e.status === 429 && /balance|quota|insufficient/i.test(e.message)) return 'На счёте закончились деньги — пополни баланс.';
  if (e.status === 429) return `Бесплатные модели сейчас заняты или кончился дневной лимит — попробуй через пару минут. (${e.message})`;
  if (e.status === 0) return e.message;
  const A = e.Anthropic;
  const msg = e.message || String(e);
  if (A && e instanceof A.AuthenticationError) return 'Ключ API неверный — проверь его в настройках.';
  if (/credit balance/i.test(msg)) return 'На счёте Anthropic закончились деньги — пополни баланс на console.anthropic.com.';
  if (A && e instanceof A.RateLimitError) return 'Слишком много запросов — подожди минуту.';
  if (A && e instanceof A.InternalServerError) return 'Сервис ИИ перегружен — попробуй ещё раз.';
  if (A && e instanceof A.APIConnectionError) return 'Нет связи с сервисом ИИ — проверь интернет.';
  if (e instanceof SyntaxError) return 'ИИ ответил в неожиданном формате — попробуй ещё раз.';
  return 'Ошибка: ' + msg;
}

const noKeyHtml = '<p class="pad">Для работы ИИ нужен ключ API (бесплатный — на openrouter.ai). <button class="link" data-open-settings>Открыть настройки</button></p>';

function renderAiResults(box, res) {
  const items = (res.items || []).map((i) => ({
    name: String(i.name || 'Блюдо'),
    per100: { kcal: num(i.kcal), p: num(i.protein), f: num(i.fat), c: num(i.carbs) },
    suggestGrams: i.grams ? num(i.grams) : null,
    piece: num(i.piece) > 0 ? num(i.piece) : null,
    source: 'ai',
  }));
  box.innerHTML =
    (items.length ? section('Ответ ИИ — нажми, чтобы добавить', items) : '<p class="muted pad">Ничего не распознано</p>') +
    (res.note ? `<p class="muted small pad">${esc(res.note)}</p>` : '');
}

async function askAiText(q) {
  const box = $('#aiBlock');
  if (!q || !box) return;
  if (!settings.apiKey) { box.innerHTML = noKeyHtml; return; }
  box.innerHTML = '<p class="muted pad">🤖 Спрашиваю ИИ…</p>';
  try {
    const res = await askAI([{ type: 'text', text: `Продукт или блюдо: «${q}». Дай КБЖУ на 100 г. Если вариантов несколько (например, сырой и варёный) — дай 2–3 самых вероятных.` }]);
    renderAiResults(box, res);
  } catch (e) {
    box.innerHTML = aiErr(e) ? `<p class="error pad">${esc(aiErr(e))}</p>` : noKeyHtml;
  }
}

async function fileToJpegBase64(file, max = 1024) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function handlePhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const prev = $('#photoPreview');
  prev.src = URL.createObjectURL(file); prev.classList.remove('hidden');
  const box = $('#photoResults');
  if (!settings.apiKey) { box.innerHTML = noKeyHtml; return; }
  box.innerHTML = '<p class="muted pad">🤖 Распознаю еду… обычно 5–20 секунд</p>';
  try {
    const b64 = await fileToJpegBase64(file);
    const res = await askAI([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: 'Что за еда на фото? Дай КБЖУ на 100 г и примерный вес каждой порции.' },
    ]);
    renderAiResults(box, res);
  } catch (err) {
    box.innerHTML = aiErr(err) ? `<p class="error pad">${esc(aiErr(err))}</p>` : noKeyHtml;
  }
}
$('#photoCam').addEventListener('change', handlePhoto);
$('#photoGallery').addEventListener('change', handlePhoto);

// ---------- ручной ввод ----------
function setHint(text) { $('#mHint').textContent = text; $('#mHint').classList.toggle('hidden', !text); }

$('#labelPhoto').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  if (!settings.apiKey) return setHint('Для чтения этикетки нужен ключ API в настройках ⚙️.');
  setHint('🤖 Читаю этикетку…');
  try {
    const res = await askAI([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await fileToJpegBase64(file, 1600) } },
      { type: 'text', text: 'Это упаковка продукта. Прочитай название и пищевую ценность на 100 г (если указано на порцию — пересчитай на 100 г). Верни ровно один item, grams = null. Если пищевой ценности на фото не видно — items пустой и объясни в note.' },
    ]);
    const i = res.items?.[0];
    if (!i) return setHint(res.note || 'Не нашёл пищевую ценность на фото. Сними таблицу КБЖУ крупнее.');
    if (!$('#mName').value) $('#mName').value = i.name || '';
    $('#mK').value = r1(num(i.kcal)); $('#mP').value = r1(num(i.protein)); $('#mF').value = r1(num(i.fat)); $('#mC').value = r1(num(i.carbs));
    setHint('Готово — проверь цифры с этикеткой и нажми «Далее».');
  } catch (err) {
    setHint(aiErr(err) || 'Для чтения этикетки нужен ключ API в настройках ⚙️.');
  }
});
$('#manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#mName').value.trim();
  if (!name) return;
  const barcode = $('#mCode').value.replace(/\D/g, '') || null;
  const per100 = { kcal: num($('#mK').value), p: num($('#mP').value), f: num($('#mF').value), c: num($('#mC').value) };
  if ($('#mSave').checked) {
    const existing = myFoods.find((f) => (barcode && f.barcode === barcode) || norm(f.name) === norm(name));
    if (existing) Object.assign(existing, { name, barcode: barcode || existing.barcode, per100 });
    else myFoods.unshift({ id: uid(), name, barcode, per100 });
    saveMy();
  }
  e.target.reset(); $('#mSave').checked = true; setHint('');
  openPortion({ name, barcode, per100, source: 'manual' });
});

// ---------- порция ----------
let portionCtx = null;
const SOURCE_NOTE = {
  local: 'Данные из встроенного справочника (средние значения).',
  off: 'Данные из Open Food Facts (с этикетки).',
  ai: 'Оценка ИИ — приблизительно. Если знаешь точнее — поправь КБЖУ.',
  my: 'Твой сохранённый продукт.',
  manual: '',
};

$('#pMeal').innerHTML = Object.entries(MEALS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
// у штучных продуктов кнопки в штуках (½, 1, 2, 3 шт), у остальных — в граммах
function renderChips(piece) {
  $('#pChips').innerHTML = piece
    ? [[0.5, '½ шт'], [1, '1 шт'], [2, '2 шт'], [3, '3 шт']].map(([k, l]) => `<button type="button" data-g="${r0(piece * k)}">${l} · ${r0(piece * k)} г</button>`).join('') +
      '<button type="button" data-g="100">100 г</button>'
    : [50, 100, 150, 200, 250, 300].map((g) => `<button type="button" data-g="${g}">${g} г</button>`).join('');
}
$('#pChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]'); if (!b) return;
  $('#pGrams').value = b.dataset.g; updatePortion();
});

function openPortion(product, entry = null) {
  portionCtx = { product, editId: entry?.id || null };
  const per = product.per100;
  $('#pName').textContent = product.name;
  $('#pK').value = r1(per.kcal); $('#pP').value = r1(per.p); $('#pF').value = r1(per.f); $('#pC').value = r1(per.c);
  // штучное по умолчанию — 1 шт (или сколько ИИ насчитал на фото), остальное — как в прошлый раз или 100 г
  $('#pGrams').value = entry ? entry.grams
    : r0(product.piece ? (product.suggestGrams || product.piece) : (product.suggestGrams || product.lastGrams || 100));
  renderChips(product.piece);
  $('#pMeal').value = entry ? entry.meal : addMeal;
  $('#pSave').textContent = entry ? 'Сохранить' : 'Добавить';
  $('#pDelete').classList.toggle('hidden', !entry);
  $('#pEdit').open = false;
  $('#pNote').textContent = SOURCE_NOTE[product.source] || '';
  updatePortion();
  show('#portion');
  setTimeout(() => $('#pGrams').select(), 50);
}

const readPer = () => ({ kcal: num($('#pK').value), p: num($('#pP').value), f: num($('#pF').value), c: num($('#pC').value) });

function updatePortion() {
  const per = readPer();
  const g = num($('#pGrams').value);
  const piece = portionCtx?.product.piece;
  $('#pPer100').textContent = `На 100 г: ${r0(per.kcal)} ккал · Б ${r1(per.p)} · Ж ${r1(per.f)} · У ${r1(per.c)}` +
    (piece ? ` · 1 шт ≈ ${r0(piece)} г` : '');
  const t = scale(per, g);
  $('#pResult').innerHTML = `<div class="big bump">${r0(t.kcal)} ккал</div>
    <div class="muted">${piece ? pcs(g, piece) + ' · ' : ''}${r1(g)} г · Б ${r1(t.p)} г · Ж ${r1(t.f)} г · У ${r1(t.c)} г</div>`;
}
['#pK', '#pP', '#pF', '#pC', '#pGrams'].forEach((s) => $(s).addEventListener('input', updatePortion));
$('#pGrams').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#pSave').click(); });

function onPortionCancelled() {
  // вернулись в окно добавления со вкладки штрихкода — снова включаем камеру
  if (!$('#addSheet').classList.contains('hidden') && activeTab === 'barcode') startScanner();
}

$('#pSave').addEventListener('click', () => {
  const g = num($('#pGrams').value);
  if (g <= 0) return toast('Укажи вес в граммах');
  const per = readPer();
  const meal = $('#pMeal').value;
  const { product, editId } = portionCtx;
  const list = (diary[curDate] ||= []);
  if (editId) {
    const e = list.find((x) => x.id === editId);
    if (e) Object.assign(e, { grams: g, per100: per, meal });
  } else {
    lastAdded = uid();
    list.push({ id: lastAdded, name: product.name, grams: g, per100: per, meal, barcode: product.barcode || null, source: product.source, piece: product.piece || null, t: Date.now() });
    // найденное ИИ запоминаем в «Мои продукты», чтобы потом находилось обычным поиском без ИИ
    if (product.source === 'ai') {
      const mine = myFoods.find((f) => norm(f.name) === norm(product.name));
      if (mine) Object.assign(mine, { per100: per, piece: product.piece || mine.piece || null });
      else myFoods.unshift({ id: uid(), name: product.name, barcode: null, per100: per, piece: product.piece || null, ai: true });
      saveMy();
    }
  }
  saveDiary();
  hide('#portion'); hide('#addSheet');
  renderDay();
  toast(editId ? 'Сохранено' : `Добавлено: ${r0(scale(per, g).kcal)} ккал`);
});

$('#pDelete').addEventListener('click', () => {
  const { editId } = portionCtx;
  if (!editId || !confirm('Удалить запись?')) return;
  diary[curDate] = (diary[curDate] || []).filter((x) => x.id !== editId);
  if (!diary[curDate].length) delete diary[curDate];
  saveDiary(); hide('#portion'); renderDay(); toast('Удалено');
});

// ---------- план питания ----------
const STORES = ['Чижик', 'Пятёрочка', 'Монетка', 'Магнит', 'Красное & Белое'];
const TECH = ['Плита', 'Духовка', 'Аэрогриль', 'Мультиварка', 'Микроволновка'];
const PLAN_SYSTEM = 'Ты — нутрициолог и повар, составляешь недорогое питание для человека из России. Отвечай ТОЛЬКО одним JSON-объектом, без текста до или после.';
let plan = load('kc_plan', null); // {form, menu, shop, recipes}
let planTab = 'menu';
let planBusy = false;
const savePlan = () => localStorage.setItem('kc_plan', JSON.stringify(plan));
const setPlanStatus = (t) => { $('#plStatus').textContent = t; $('#plStatus').classList.toggle('hidden', !t); };
// значки магазинов в фирменных цветах: [надпись, фон, цвет текста]
const STORE_BADGE = {
  'Чижик': ['Ч', '#ffd200', '#222'],
  'Пятёрочка': ['5', '#e31e24', '#fff'],
  'Монетка': ['Мн', '#1aa34a', '#fff'],
  'Магнит': ['М', '#e30613', '#fff'],
  'Красное & Белое': ['К&Б', '#a6192e', '#fff'],
};
function storeBadge(name) {
  // ИИ может написать «Пятерочка» или «Красное и Белое» — сравниваем по первому слову
  const key = Object.keys(STORE_BADGE).find((k) => norm(name).includes(norm(k).split(' ')[0]));
  if (!key) return '';
  const [t, bg, fg] = STORE_BADGE[key];
  return `<span class="store-badge" style="background:${bg};color:${fg}" aria-hidden="true">${t}</span>`;
}
const checksHtml = (list, picked, icon = () => '') => list.map((x) => `<label><input type="checkbox" value="${esc(x)}" ${picked.includes(x) ? 'checked' : ''}> ${icon(x)}${esc(x)}</label>`).join('');
const checked = (sel) => $$(sel + ' input:checked').map((i) => i.value);

function openPlan() {
  const f = plan?.form || { budget: '', stores: STORES, tech: ['Плита'], prefs: '', treats: '', variety: 'mix', avoidPrev: true };
  $('#plBudget').value = f.budget;
  $('#plStores').innerHTML = checksHtml(STORES, f.stores, storeBadge);
  $('#plTech').innerHTML = checksHtml(TECH, f.tech);
  $('#plPrefs').value = f.prefs;
  $('#plTreats').value = f.treats || '';
  $('#plVariety').value = f.variety || 'mix';
  $('#plAvoidPrev').checked = f.avoidPrev ?? true;
  setPlanStatus('');
  renderPlan();
  show('#plan');
}
$('#openPlan').addEventListener('click', () => { hide('#settings'); openPlan(); });

function planBrief(f) {
  const g = settings.goals;
  return `Бюджет на неделю: ${f.budget} ₽. Магазины: ${f.stores.join(', ')}. Кухонная техника: ${f.tech.join(', ')}. ` +
    `Пожелания: ${f.prefs || 'нет'}. Дневная норма: ${g.kcal} ккал, белки ${g.p} г, жиры ${g.f} г, углеводы ${g.c} г.`;
}
const menuText = () => plan.menu.days.map((d) => d.day + ': ' +
  [...Object.entries(MEALS).map(([k, l]) => d.meals?.[k] ? `${l} — ${d.meals[k].name} ${r0(num(d.meals[k].grams))} г` : ''),
    ...(d.treats || []).map((x) => `вкусняшка — ${x.name}`)].filter(Boolean).join('; ')).join('\n');

// блюда текущего (прошлого) плана — чтобы новый план их не повторял
const prevDishes = () => plan?.menu
  ? [...new Set(plan.menu.days.flatMap((d) => Object.values(d.meals || {}).map((m) => m?.name).filter(Boolean)))].slice(0, 40)
  : plan?.prev || [];

const PLAN_PROMPTS = {
  menu: (f) => `${planBrief(f)}
Составь меню на 7 дней (Пн–Вс), 4 приёма пищи: breakfast (завтрак), lunch (обед), snack (перекус), dinner (ужин). Сумма калорий, белков, жиров и углеводов КАЖДОГО дня (вместе со вкусняшками) должна быть в пределах ±10% от дневной нормы.
${f.treats ? `Вкусняшки, которые обязательно должны быть в рационе (если не сказано, как часто, — 1 раз в день): ${f.treats}. Клади их в список "treats" нужного дня, учитывай их КБЖУ и цену в бюджете, а остальную еду подбирай так, чтобы день вместе с ними попал в норму.` : 'Вкусняшек не нужно — "treats" оставь пустым.'} Укладывайся в бюджет, используй недорогие продукты из этих магазинов и только эту технику.
${f.variety === 'eco'
    ? 'Чтобы экономить время и деньги, повторяй блюда: готовка 2–3 раза в неделю сразу на несколько дней.'
    : 'Меню должно быть РАЗНООБРАЗНЫМ: одно и то же блюдо не чаще 2 раз в неделю, завтраки тоже разные; чередуй крупы и гарниры, курицу, мясо, рыбу, яйца, бобовые, творог и способы готовки. Можно готовить основу на 2 дня, но подавать её по-разному.'}
${f.avoidPrev && prevDishes().length ? `В прошлом плане были: ${prevDishes().join(', ')}. Придумай другие блюда.` : ''}
Формат: {"days":[{"day":"Пн","meals":{"breakfast":{"name":"...","grams":число,"kcal":число,"protein":число,"fat":число,"carbs":число},"lunch":{...},"snack":{...},"dinner":{...}},"treats":[{"name":"...","grams":число,"kcal":число,"protein":число,"fat":число,"carbs":число}]}],"note":"короткий совет"}
grams — вес порции; kcal, protein, fat, carbs — на всю порцию.`,
  shop: (f) => `${planBrief(f)}
Меню на неделю:
${menuText()}
Составь список покупок на всю неделю под это меню. Распредели продукты по магазинам из списка — туда, где дешевле. Цены — примерные текущие, в рублях, за указанное количество.
Формат: {"stores":[{"store":"название","items":[{"name":"продукт","qty":"сколько купить, например 1 кг или 2 уп.","price":число}]}],"total":число,"note":"укладываемся ли в бюджет и как сэкономить"}`,
  recipes: (f) => `${planBrief(f)}
Меню на неделю:
${menuText()}
Напиши рецепты всех разных блюд из меню (без повторов), только под указанную технику, с режимами (температура, время). Укажи, на сколько порций готовить сразу.
Формат: {"recipes":[{"name":"...","portions":число,"appliance":"...","time":"например 25 мин","ingredients":["300 г гречки"],"steps":["..."]}]}`,
};
const PLAN_WAIT = { menu: 'Составляю меню на неделю…', shop: 'Составляю список покупок…', recipes: 'Пишу рецепты…' };

async function makePlanPart(kind) {
  if (planBusy) return;
  if (!settings.apiKey) return setPlanStatus('Для плана нужен ключ API в настройках ⚙️.');
  let f = plan?.form;
  if (kind === 'menu') {
    f = readPlanForm();
    if (f.budget <= 0) return setPlanStatus('Укажи бюджет на неделю.');
    if (!f.stores.length || !f.tech.length) return setPlanStatus('Отметь хотя бы один магазин и одну технику.');
  }
  planBusy = true;
  setPlanStatus('🤖 ' + PLAN_WAIT[kind] + ' Это может занять до минуты.');
  try {
    const res = await askAI([{ type: 'text', text: PLAN_PROMPTS[kind](f) }], PLAN_SYSTEM);
    const ok = { menu: res.days?.length, shop: res.stores?.length, recipes: res.recipes?.length }[kind];
    if (!ok) throw new SyntaxError('empty');
    if (kind === 'menu') plan = { form: f, menu: res, shop: null, recipes: null };
    else plan[kind] = res;
    savePlan();
    planTab = kind;
    setPlanStatus('');
    renderPlan();
  } catch (e) {
    setPlanStatus(aiErr(e) || 'Для плана нужен ключ API в настройках ⚙️.');
  } finally {
    planBusy = false;
  }
}

// все позиции дня: [ключ для «Съел», подпись, блюдо]; вкусняшки — с ключом t0, t1…
const dayItems = (d) => [
  ...Object.entries(MEALS).filter(([k]) => d.meals?.[k]).map(([k, l]) => [k, l, d.meals[k]]),
  ...(d.treats || []).map((m, i) => ['t' + i, '🍫 Вкусняшка', m]),
];

function planTabHtml() {
  const make = (kind, label) => `<button class="btn wide" data-make="${kind}">${label}</button>`;
  if (planTab === 'menu') {
    const g = settings.goals;
    return plan.menu.days.map((d, di) => {
      const items = dayItems(d);
      const t = items.reduce((a, [, , m]) => ({ kcal: a.kcal + num(m.kcal), p: a.p + num(m.protein), f: a.f + num(m.fat), c: a.c + num(m.carbs) }), { kcal: 0, p: 0, f: 0, c: 0 });
      return `<section class="card plan-day"><h3>${esc(d.day)} <span class="muted small">${r0(t.kcal)} / ${g.kcal} ккал</span></h3>
        <div class="muted small">Б ${r0(t.p)}/${g.p} · Ж ${r0(t.f)}/${g.f} · У ${r0(t.c)}/${g.c} г</div>` +
        items.map(([key, label, m]) => `<div class="plan-row"><div><div class="muted small">${label}</div><div>${esc(m.name)}</div>
            <div class="muted small">${r0(num(m.grams))} г · ${r0(num(m.kcal))} ккал · Б ${r1(num(m.protein))} · Ж ${r1(num(m.fat))} · У ${r1(num(m.carbs))}</div></div>
            <button class="btn secondary" data-ate="${di}:${key}">Съел</button></div>`).join('') + '</section>';
    }).join('') + (plan.menu.note ? `<p class="muted small pad">💡 ${esc(plan.menu.note)}</p>` : '');
  }
  if (planTab === 'shop') {
    if (!plan.shop) return make('shop', '🛒 Составить список покупок');
    const s = plan.shop;
    const total = s.stores.reduce((a, st) => a + (st.items || []).reduce((b, i) => b + num(i.price), 0), 0);
    const budget = num(plan.form.budget);
    return s.stores.map((st) => {
      const sum = (st.items || []).reduce((b, i) => b + num(i.price), 0);
      return `<section class="card plan-day"><h3><span>${storeBadge(st.store)} ${esc(st.store)}</span> <span class="muted small">≈ ${r0(sum)} ₽</span></h3>` +
        (st.items || []).map((i) => `<div class="plan-row"><div>${esc(i.name)} <span class="muted small">· ${esc(i.qty)}</span></div><div>${r0(num(i.price))} ₽</div></div>`).join('') +
        '</section>';
    }).join('') +
      `<p class="hint">Итого ≈ <b>${r0(total)} ₽</b> из ${r0(budget)} ₽ ${total > budget ? '— <span class="error">выходит за бюджет</span>' : '✓'}</p>` +
      (s.note ? `<p class="muted small pad">💡 ${esc(s.note)}</p>` : '') + make('shop', '🔄 Пересоставить список');
  }
  if (!plan.recipes) return make('recipes', '👨‍🍳 Написать рецепты');
  return plan.recipes.recipes.map((r) => `<section class="card plan-day recipe"><h3>${esc(r.name)}</h3>
    <div class="muted small">${esc([r.appliance, r.time, r.portions ? r.portions + ' порц.' : ''].filter(Boolean).join(' · '))}</div>
    <ul>${(r.ingredients || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <ol>${(r.steps || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>`).join('') + make('recipes', '🔄 Переписать рецепты');
}

function renderPlan() {
  $('#plFormBox').open = !plan?.menu;
  if (!plan?.menu) { $('#planView').innerHTML = ''; return; }
  const tabs = [['menu', '📅 Меню'], ['shop', '🛒 Покупки'], ['recipes', '👨‍🍳 Рецепты']];
  $('#planView').innerHTML =
    `<nav class="tabs">${tabs.map(([k, l]) => `<button data-ptab="${k}" class="${k === planTab ? 'active' : ''}">${l}</button>`).join('')}</nav>` + planTabHtml() +
    '<button class="btn danger wide" data-delplan>🗑 Удалить план</button>';
}

$('#plMake').addEventListener('click', () => makePlanPart('menu'));

// ---- план через чат Claude: копируем запрос, вставляем ответ ----
const readPlanForm = () => ({ budget: num($('#plBudget').value), stores: checked('#plStores'), tech: checked('#plTech'), prefs: $('#plPrefs').value.trim(), treats: $('#plTreats').value.trim(), variety: $('#plVariety').value, avoidPrev: $('#plAvoidPrev').checked });

$('#plCopy').addEventListener('click', async () => {
  const f = readPlanForm();
  if (f.budget <= 0) return setPlanStatus('Укажи бюджет на неделю.');
  if (!f.stores.length || !f.tech.length) return setPlanStatus('Отметь хотя бы один магазин и одну технику.');
  const text = `${PLAN_SYSTEM}
${PLAN_PROMPTS.menu(f)}
В том же ответе составь список покупок на неделю под это меню (по магазинам из списка — где дешевле; цены примерные текущие, в рублях) и рецепты всех разных блюд под указанную технику (с температурой и временем, на сколько порций готовить сразу).
Итоговый ответ — ОДИН JSON-объект (можно файлом plan.json), без пояснений:
{"menu":{"days":[...как в формате выше...],"note":"..."},"shop":{"stores":[{"store":"...","items":[{"name":"...","qty":"...","price":число}]}],"total":число,"note":"..."},"recipes":{"recipes":[{"name":"...","portions":число,"appliance":"...","time":"...","ingredients":["..."],"steps":["..."]}]}}`;
  try {
    await navigator.clipboard.writeText(text);
    setPlanStatus('Запрос скопирован. Вставь его в чат Claude, а ответ — в «📥 Загрузить готовый план» ниже.');
  } catch {
    $('#plImport').open = true;
    $('#plImportText').value = text; $('#plImportText').select();
    setPlanStatus('Не удалось скопировать автоматически — запрос в поле ниже, скопируй его вручную (потом очисти поле и вставь ответ).');
  }
});

function importPlan(text) {
  let obj;
  try { obj = parseJson(text); } catch { return setPlanStatus('Не получилось прочитать план: в тексте нет правильного JSON. Скопируй ответ Claude целиком.'); }
  const menu = obj.menu?.days ? obj.menu : obj.days ? obj : null;
  if (!menu?.days?.length) return setPlanStatus('В ответе нет меню (поля "menu" → "days"). Текущий план не тронут.');
  plan = {
    form: readPlanForm(),
    menu,
    shop: Array.isArray(obj.shop?.stores) ? obj.shop : null,
    recipes: Array.isArray(obj.recipes?.recipes) ? obj.recipes : null,
  };
  savePlan();
  planTab = 'menu';
  $('#plImportText').value = ''; $('#plImport').open = false;
  setPlanStatus('');
  renderPlan();
  toast(`План загружен: ${menu.days.length} дн.`);
}
$('#plImportGo').addEventListener('click', () => importPlan($('#plImportText').value));
$('#plImportFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (file) importPlan(await file.text());
});
$('#plTreatChips').innerHTML = ['Энергетик 0,45 л', 'Шоколадка 90 г', 'Чипсы 70 г', 'Мороженое', 'Газировка 0,5 л', 'Печенье']
  .map((x) => `<button type="button" data-treat="${x}">+ ${x}</button>`).join('');
$('#plTreatChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-treat]'); if (!b) return;
  const ta = $('#plTreats');
  ta.value = (ta.value.trim() ? ta.value.trim() + ', ' : '') + b.dataset.treat + ' каждый день';
});
$('#planView').addEventListener('click', (e) => {
  const t = e.target.closest('[data-ptab]');
  if (t) { planTab = t.dataset.ptab; return renderPlan(); }
  if (e.target.closest('[data-delplan]')) {
    if (!confirm('Удалить план? Его блюда не будут повторяться в следующем плане, если стоит галочка «Не повторять».')) return;
    plan = { form: plan.form, prev: prevDishes() }; // помним блюда, чтобы не предлагать их снова
    savePlan(); planTab = 'menu'; renderPlan(); toast('План удалён');
    return;
  }
  const mk = e.target.closest('[data-make]');
  if (mk) return makePlanPart(mk.dataset.make);
  const ate = e.target.closest('[data-ate]');
  if (ate) {
    const [di, key] = ate.dataset.ate.split(':');
    const [, , m] = dayItems(plan.menu.days[di]).find(([x]) => x === key);
    const k = key.startsWith('t') ? 'snack' : key; // вкусняшка идёт в перекус
    const g = num(m.grams) || 100;
    const per100 = { kcal: num(m.kcal) * 100 / g, p: num(m.protein) * 100 / g, f: num(m.fat) * 100 / g, c: num(m.carbs) * 100 / g };
    lastAdded = uid();
    (diary[curDate] ||= []).push({ id: lastAdded, name: m.name, grams: g, per100, meal: k, barcode: null, source: 'plan', t: Date.now() });
    saveDiary(); renderDay();
    toast(`${MEALS[k]}: ${m.name} — ${r0(num(m.kcal))} ккал добавлено в «${dateLabel(curDate)}»`);
  }
});

// ---------- настройки ----------
function goalCheck() {
  const k = num($('#sK').value), p = num($('#sP').value), f = num($('#sF').value), c = num($('#sC').value);
  const fromMacros = p * 4 + f * 9 + c * 4;
  $('#goalCheck').textContent = fromMacros
    ? `Белки×4 + жиры×9 + углеводы×4 = ${r0(fromMacros)} ккал` + (Math.abs(fromMacros - k) > 100 ? ' — не совпадает с нормой калорий' : ' ✓')
    : '';
}
['#sK', '#sP', '#sF', '#sC'].forEach((s) => $(s).addEventListener('input', goalCheck));

function renderMyFoods() {
  $('#myFoodsList').innerHTML = myFoods.length
    ? myFoods.map((f) => `<li><span>${esc(f.name)} <span class="muted">· ${r0(f.per100.kcal)} ккал${f.barcode ? ' · ▥' : ''}</span></span>
        <button class="icon-btn" data-del-my="${f.id}" aria-label="Удалить">🗑</button></li>`).join('')
    : '<li class="muted">Пока пусто. Продукты, введённые вручную, появятся здесь.</li>';
}
$('#myFoodsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del-my]'); if (!b) return;
  const f = myFoods.find((x) => x.id === b.dataset.delMy);
  if (f && confirm(`Удалить «${f.name}» из моих продуктов?`)) {
    myFoods = myFoods.filter((x) => x !== f); saveMy(); renderMyFoods();
  }
});

function openSettings() {
  const g = settings.goals;
  $('#sK').value = g.kcal; $('#sP').value = g.p; $('#sF').value = g.f; $('#sC').value = g.c;
  $('#sKey').value = settings.apiKey;
  $('#sModel').value = settings.model;
  goalCheck(); renderMyFoods();
  show('#settings');
}

$('#saveSettings').addEventListener('click', () => {
  settings.goals = { kcal: num($('#sK').value), p: num($('#sP').value), f: num($('#sF').value), c: num($('#sC').value) };
  settings.apiKey = $('#sKey').value.trim();
  settings.model = $('#sModel').value;
  saveSettings(); hide('#settings'); renderDay(); toast('Настройки сохранены');
});

// ---------- тема ----------
function applyTheme() {
  const dark = settings.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#0e1510' : '#f4f7ef';
  $$('#themeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === (dark ? 'dark' : 'light')));
}
$('#themeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-set]'); if (!b) return;
  settings.theme = b.dataset.themeSet; saveSettings(); applyTheme();
});
$('#themeBtn').addEventListener('click', async () => {
  const dark = settings.theme !== 'dark';
  const flip = () => { settings.theme = dark ? 'dark' : 'light'; saveSettings(); applyTheme(); };
  const r = $('#themeBtn').getBoundingClientRect();
  // без View Transitions или при «уменьшить движение» — переключаем сразу
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return flip();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)); // до дальнего угла экрана
  const t = document.startViewTransition(flip);
  await t.ready;
  document.documentElement.animate(
    { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
    { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
  );
});
applyTheme();

// ---------- резервная копия ----------
const native = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;

// в APK скачивание через <a download> не работает — пишем файл в «Документы» и открываем «Поделиться»
async function saveFile(name, text) {
  const P = native();
  if (P?.Filesystem) {
    let uri;
    try {
      uri = (await P.Filesystem.writeFile({ path: name, data: text, directory: 'DOCUMENTS', encoding: 'utf8' })).uri;
    } catch {
      uri = (await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })).uri;
    }
    try { await P.Share?.share({ title: 'Резервная копия «Калорий»', files: [uri] }); } catch { /* закрыл окно «Поделиться» */ }
    return `Сохранено: ${name} (папка «Документы»)`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'Файл скачан: ' + name;
}

$('#exportBtn').addEventListener('click', async () => {
  // ключ API в файл не кладём
  const data = { app: 'kalorii', version: 2, appVersion: APP_VERSION, goals: settings.goals, diary, myFoods, water, weight, plan };
  try { toast(await saveFile(`kalorii-${dkey(new Date())}.json`, JSON.stringify(data, null, 1))); }
  catch (e) { toast('Не удалось сохранить файл: ' + (e.message || e)); }
});

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (data?.app !== 'kalorii' || typeof data.diary !== 'object') return toast('Это не файл резервной копии «Калорий»');
  if (!confirm('Заменить текущие данные данными из файла?')) return;
  diary = data.diary || {}; myFoods = data.myFoods || [];
  water = data.water || {}; weight = data.weight || {};
  if (data.plan !== undefined) { plan = data.plan; savePlan(); }
  if (data.goals) settings.goals = { ...DEFAULTS.goals, ...data.goals };
  saveDiary(); saveMy(); saveWater(); saveWeight(); saveSettings();
  hide('#settings'); renderDay(); toast('Данные загружены');
});

// ---------- статистика ----------
let statRange = 7;
function openStats() {
  $('#weightInput').value = weight[curDate] ?? '';
  $('#weightInput').placeholder = `Вес на ${dateLabel(curDate).toLowerCase()}, кг`;
  renderStats();
  show('#stats');
}

function renderStats() {
  $$('#statTabs button').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === statRange));
  const today = dkey(new Date());
  const days = Array.from({ length: statRange }, (_, i) => shiftKey(today, i - statRange + 1));
  const goal = num(settings.goals.kcal);
  const kcal = days.map((k) => sum(diary[k] || []).kcal);
  const max = Math.max(goal * 1.15, ...kcal) || 1;
  const H = 120; // высота столбиков, px
  const filled = kcal.filter((v) => v > 0);
  $('#statAvg').textContent = filled.length ? `в среднем ${fmtNum(filled.reduce((a, b) => a + b, 0) / filled.length)} ккал` : 'нет записей';
  const wk = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  $('#statKcal').innerHTML = (goal ? `<div class="goal-line" style="bottom:${Math.round((goal / max) * H) + 20}px"><span>цель ${fmtNum(goal)}</span></div>` : '') +
    days.map((k, i) => {
      const d = parseKey(k);
      const label = statRange === 7 ? wk[d.getDay()] : (i % 5 === 4 || i === statRange - 1 ? d.getDate() : '');
      return `<button data-day="${k}" class="${k === today ? 'today' : ''} ${goal && kcal[i] > goal ? 'over' : ''}" aria-label="${k}: ${r0(kcal[i])} ккал">
        <i style="height:${Math.round((kcal[i] / max) * H)}px"></i>${label}</button>`;
    }).join('');

  // вес: линия по дням, где он записан
  const pts = days.filter((k) => weight[k] != null).map((k) => [days.indexOf(k), weight[k]]);
  const all = Object.keys(weight).sort();
  if (!pts.length) {
    $('#statWeightInfo').textContent = all.length ? `последний: ${fmtKg(weight[all.at(-1)])} кг` : '';
    $('#statWeight').innerHTML = '<p class="muted small pad">За этот период вес не записан. Взвешивайся утром и вноси сюда.</p>';
    return;
  }
  const ws = pts.map((p) => p[1]);
  const lo = Math.min(...ws) - 0.5, hi = Math.max(...ws) + 0.5;
  const x = (i) => 12 + (i / Math.max(1, statRange - 1)) * 296, y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * 100;
  const change = ws.at(-1) - ws[0];
  $('#statWeightInfo').textContent = `${fmtKg(ws.at(-1))} кг` + (pts.length > 1 ? `, ${change <= 0 ? '↓' : '↑'}${fmtKg(Math.abs(change))} за период` : '');
  $('#statWeight').innerHTML = `<svg class="wchart" viewBox="0 0 320 130" preserveAspectRatio="none" role="img" aria-label="График веса">
    <polyline points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#3fbf6a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" style="fill:var(--card)" stroke="#3fbf6a" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`).join('')}
    <text x="4" y="12" font-size="10" fill="#7d8a7f">${fmtKg(hi - 0.5)}</text><text x="4" y="126" font-size="10" fill="#7d8a7f">${fmtKg(lo + 0.5)}</text>
  </svg>`;
}

$('#statTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]'); if (b) { statRange = Number(b.dataset.range); renderStats(); }
});
$('#statKcal').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  curDate = b.dataset.day; hide('#stats'); renderDay();
});
$('#weightSave').addEventListener('click', () => {
  const v = num($('#weightInput').value);
  if (v < 20 || v > 400) return toast('Укажи вес в килограммах, например 78,4');
  weight[curDate] = r1(v); saveWeight();
  renderStats(); renderDay(); toast(`Вес ${fmtKg(v)} кг записан`);
});

// ---------- версия и обновления (GitHub Releases) ----------
$('#versionLine').textContent = $('#versionLine2').textContent = `Калории · версия ${APP_VERSION}`;
const newer = (a, b) => { // a новее b? сравнение «2.10» > «2.9» по частям
  const pa = String(a).replace(/^v/i, '').split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
console.assert(newer('v2.1', '2.0') && newer('2.10', '2.9') && !newer('v2.0', '2.0') && !newer('1.9', '2.0'), 'newer() broken');

let release = null; // последний релиз с APK: качаем по нажатию всегда, точка — только если он новее
// уведомление в приложении: «доступно обновление — нажми»
const showUpdateBanner = (tag) => {
  $('#ubTitle').textContent = `Доступно обновление ${tag}`;
  $('#updateBanner').classList.add('on');
};

// «Что нового» — список изменений из релиза, в цвете текущей темы
let wnRelease = null;
function notesHtml(md) {
  const lines = String(md || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))
    .filter((l) => !/^что нового$/i.test(l)); // заголовок карточки уже стоит
  if (!lines.length) return '<p class="muted">Список изменений не указан.</p>';
  let out = '', list = false;
  for (const l of lines) {
    const m = l.match(/^[-*•]\s+(.*)/);
    if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${esc(m[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    out += `<p>${esc(l)}</p>`;
  }
  return out + (list ? '</ul>' : '');
}
function openWhatsNew(rel) {
  wnRelease = rel;
  $('#wnTitle').textContent = `Что нового · ${rel.tag}`;
  $('#wnNotes').innerHTML = `<p class="muted small">Установлено ${APP_VERSION} → новая ${rel.tag}${rel.size ? ' · ' + mb(rel.size) + ' МБ' : ''}</p>` + notesHtml(rel.notes);
  // сброс после прошлой попытки
  $('#wnGo').disabled = false;
  $('#wnGo').textContent = '⬇️ Скачать и установить';
  $('#wnProg').classList.add('hidden');
  $('#wnProg').firstElementChild.classList.remove('indet');
  show('#whatsNew');
}
$('#wnGo').addEventListener('click', () => { if (wnRelease) installRelease(wnRelease); });

// в APK скачиваем внутри приложения (нативная загрузка с прогрессом) и сразу ставим; в браузере — обычное скачивание
const mb = (b) => (b / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const setProg = (pct, bytes = 0, total = 0) => {
  const bar = $('#wnProg').firstElementChild;
  if (pct == null) { bar.classList.add('indet'); bar.style.width = ''; }
  else { bar.classList.remove('indet'); bar.style.width = pct + '%'; }
  $('#wnGo').textContent = pct == null
    ? '⬇️ Скачиваю…'
    : `⬇️ Скачиваю… ${pct}%${bytes ? ` · ${mb(bytes)} МБ` : ''}${total == 0 ? '' : ' из ' + mb(total)}`;
};
async function installRelease(rel) {
  const P = native();
  if (!P?.AppUpdater) { location.href = rel.url; return; } // сайт: обычное скачивание браузером
  const prog = $('#wnProg'), btn = $('#wnGo');
  prog.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = '⬇️ Начинаю скачивание…';
  setProg(null);
  const reset = () => {
    btn.disabled = false;
    btn.textContent = '⬇️ Скачать и установить';
    prog.classList.add('hidden');
    prog.firstElementChild.classList.remove('indet');
  };
  const onProg = (e) => {
    const total = e.total > 0 ? e.total : (rel.size || 0);
    const pct = total > 0 ? Math.min(100, Math.round((e.bytes / total) * 100)) : null;
    setProg(pct, e.bytes, total);
  };
  const onErr = (e) => {
    toast('Не удалось скачать обновление: ' + (e.message || 'неизвестная ошибка'));
    reset();
  };
  const onInstalling = () => { btn.textContent = 'Устанавливаю…'; };
  const handlers = await Promise.all([
    P.AppUpdater.addListener('progress', onProg),
    P.AppUpdater.addListener('error', onErr),
    P.AppUpdater.addListener('installing', onInstalling),
  ]).catch(() => []);
  try {
    await P.AppUpdater.downloadAndInstall({ url: rel.url });
  } catch (e) {
    onErr(e);
  }
  // страховка: если через полминуты ничего не пришло — вернуть кнопку
  setTimeout(() => { if (btn.textContent.includes('Начинаю')) { reset(); toast('Не удалось начать скачивание'); } }, 30000);
  setTimeout(() => handlers.forEach((h) => h?.remove?.()), 10 * 60 * 1000);
}
$('#wnLater').addEventListener('click', () => hide('#whatsNew'));

$('#updateBanner').addEventListener('click', () => {
  $('#updateBanner').classList.remove('on');
  if (release && newer(release.tag, APP_VERSION)) openWhatsNew(release); else checkUpdate(true);
});
async function checkUpdate(manual) {
  const btn = $('#updBtn');
  btn.classList.add('spin');
  let err = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const apk = j.assets?.find((a) => a.name.endsWith('.apk'));
    release = apk ? { tag: j.tag_name.replace(/^v/i, ''), url: apk.browser_download_url, notes: j.body || '', size: apk.size || 0 } : null;
    const fresh = release && newer(release.tag, APP_VERSION);
    $('#updDot').hidden = !fresh;
    if (fresh && !manual) showUpdateBanner(release.tag);
    else if (!fresh) $('#updateBanner').classList.remove('on'); // обновились — плашка больше не нужна
  } catch (e) {
    release = null; err = e;
  } finally {
    btn.classList.remove('spin');
  }
  if (!manual) return;
  if (err) return toast('Не удалось проверить обновления — нет интернета или GitHub недоступен');
  if (!release) return toast('В релизах на GitHub нет APK — скачать нечего');
  if (!newer(release.tag, APP_VERSION)) return toast(`У тебя последняя версия ${APP_VERSION}`);
  openWhatsNew(release);
}
$('#updBtn').addEventListener('click', () => checkUpdate(true));
checkUpdate(false);
// вернулся в приложение — проверяем ещё раз (не чаще 10 минут), чтобы плашка появилась без перезапуска
let lastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || Date.now() - lastCheck < 10 * 60 * 1000) return;
  lastCheck = Date.now();
  checkUpdate(false);
});

// ---------- старт ----------
renderDay();
// приветствие: яблоко режется ножом → поворот → название; ~2,4 с, тап пропускает
const splash = $('#splash');
const closeSplash = () => {
  if (!splash.isConnected) return;
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 400);
};
if (matchMedia('(prefers-reduced-motion: reduce)').matches) splash.remove();
else { setTimeout(closeSplash, 2300); splash.addEventListener('click', closeSplash); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
