/* ============================================================
cdek.js v8 — тестовая среда СДЭК, фронтенд (чистая сборка)
Маршрут: браузер -> твой прокси Yandex Cloud Functions -> api.edu.cdek.ru
Окна города и ПВЗ, карта Leaflet, демо-fallback если прокси недоступен
============================================================ */
window.CdekModule = (function () {
'use strict';
console.info('[cdek] v8: файл загружен');

const CDEK_BASE = 'https://api.edu.cdek.ru';
const CLIENT_ID = 'wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP';
const CLIENT_SECRET = 'RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5';
/* ТВОЙ прокси: URL HTTP-триггера Яндекс-функции + "?url=" в конце */
const CDEK_PROXY = 'https://functions.yandexcloud.net/d4ecvv0e7ph9pnpal32a?url=';
const SENDER = { code: 44, address: 'Москва, ул. Тверская, 1' };
const TARIFF_COURIER = 139;
const TARIFF_PVZ = 138;
const PKG = { weight: 500, length: 25, width: 18, height: 3 };
const POPULAR = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Краснодар'];

const DEMO_CITIES = [
  { code: 44, name: 'Москва', lat: 55.75, lon: 37.62 },
  { code: 136, name: 'Санкт-Петербург', lat: 59.94, lon: 30.31 },
  { code: 201, name: 'Екатеринбург', lat: 56.84, lon: 60.69 },
  { code: 88, name: 'Новосибирск', lat: 55.03, lon: 82.92 },
  { code: 66, name: 'Нижний Новгород', lat: 56.30, lon: 44.00 },
  { code: 30, name: 'Казань', lat: 55.79, lon: 49.12 },
  { code: 49, name: 'Краснодар', lat: 45.04, lon: 38.98 },
  { code: 75, name: 'Калининград', lat: 54.71, lon: 20.51 }
];

let ui = null, workMode = 'inline', map = null, cluster = null;
let cityTimer = null, demoMode = false;
const tokenCache = { value: null, expiresAt: 0 };
let state = {
  cityCode: null, cityName: '', pvzCode: null, pvzAddress: '',
  mode: 'courier', manualAddress: '', estimate: null, pvzCache: []
};

/* ---------- сеть: ВСЕ запросы идут только через твой прокси ---------- */
async function fetchFB(url, opts) {
  return fetch(CDEK_PROXY + encodeURIComponent(url), opts);
}

/* ---------- токен: параметры в query, как требует спецификация ---------- */
async function getToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt - 30000 > now) return tokenCache.value;
  const url = CDEK_BASE + '/v2/oauth/token'
    + '?grant_type=client_credentials'
    + '&client_id=' + encodeURIComponent(CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(CLIENT_SECRET);
  const res = await fetchFB(url, { method: 'POST' });
  if (!res.ok) throw new Error('token HTTP ' + res.status);
  const data = await res.json();
  if (!data.access_token) throw new Error('нет access_token');
  tokenCache.value = data.access_token;
  tokenCache.expiresAt = now + (data.expires_in || 3600) * 1000;
  return tokenCache.value;
}

async function cdekFetch(path, opts) {
  opts = opts || {};
  const token = await getToken();
  const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
  let body = opts.body;
  if (body && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetchFB(CDEK_BASE + path, { method: opts.method || 'GET', headers: headers, body: body });
  if (!res.ok) throw new Error('CDEK ' + path + ': HTTP ' + res.status);
  return res.json();
}

function enterDemo(reason) {
  if (!demoMode) { demoMode = true; console.warn('[cdek] API недоступен (' + reason + ') — демо-режим'); }
}

/* ---------- DOM-помощники ---------- */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function applyOverlay(m) {
  m.style.position = 'fixed';
  m.style.top = '0'; m.style.left = '0'; m.style.right = '0'; m.style.bottom = '0';
  m.style.zIndex = '160';
  m.style.background = 'var(--cream, #fff8ec)';
  m.style.overflowY = 'auto';
  m.style.opacity = '0';
  m.style.visibility = 'hidden';
}

function ensureCityModal(m) {
  const created = [];
  applyOverlay(m);
  if (!m.querySelector('.cdek-modal-head')) {
    const head = el('header', 'cdek-modal-head');
    head.appendChild(el('h3', 'cdek-modal-title', 'Куда доставить заказ'));
    const x = el('button', 'cdek-modal-close', '✕');
    x.type = 'button';
    x.setAttribute('data-cdek-close', 'city');
    x.setAttribute('aria-label', 'Закрыть');
    head.appendChild(x);
    m.prepend(head);
    created.push('шапка+крестик');
  }
  let wrap = m.querySelector('.cdek-city-search-wrap');
  if (!wrap) { wrap = el('div', 'cdek-city-search-wrap'); m.appendChild(wrap); created.push('обёртка поиска'); }
  if (!wrap.querySelector('.cdek-city-search')) {
    const i = el('input', 'cdek-city-search');
    i.type = 'text'; i.placeholder = 'Найти город'; i.autocomplete = 'off';
    wrap.prepend(i);
    created.push('поле поиска');
  }
  if (!wrap.querySelector('.cdek-citylist')) {
    const l = el('div', 'cdek-citylist');
    l.hidden = true;
    wrap.appendChild(l);
    created.push('список подсказок');
  }
  if (!m.querySelector('.cdek-popular')) {
    const p = el('div', 'cdek-popular');
    POPULAR.forEach((c) => {
      const b = el('button', null, c);
      b.type = 'button'; b.dataset.city = c;
      p.appendChild(b);
    });
    m.appendChild(p);
    created.push('популярные города');
  }
  if (created.length) console.info('[cdek] в окне города до-создано: ' + created.join(', '));
}

function ensurePvzModal(m) {
  const created = [];
  applyOverlay(m);
  if (!m.querySelector('.cdek-modal-head')) {
    const head = el('header', 'cdek-modal-head');
    head.appendChild(el('h3', 'cdek-modal-title cdek-pvz-title-city', 'Пункты выдачи'));
    const x = el('button', 'cdek-modal-close', '✕');
    x.type = 'button';
    x.setAttribute('data-cdek-close', 'pvz');
    x.setAttribute('aria-label', 'Закрыть');
    head.appendChild(x);
    m.prepend(head);
    created.push('шапка+крестик');
  }
  if (!m.querySelector('.cdek-pvz-search')) {
    const i = el('input', 'cdek-pvz-search');
    i.type = 'text'; i.placeholder = 'Поиск по адресу или коду'; i.autocomplete = 'off';
    m.appendChild(i);
    created.push('поиск ПВЗ');
  }
  if (!m.querySelector('#cdek-map')) {
    const d = el('div', 'cdek-map');
    d.id = 'cdek-map';
    m.appendChild(d);
    created.push('карта');
  }
  if (!m.querySelector('.cdek-pvz-toggle')) {
    const b = el('button', 'btn btn-ghost btn-small cdek-pvz-toggle', 'Показать списком');
    b.type = 'button';
    m.appendChild(b);
    created.push('тумблер карта/список');
  }
  if (!m.querySelector('.cdek-pvzlist')) { m.appendChild(el('div', 'cdek-pvzlist')); created.push('список ПВЗ'); }
  if (created.length) console.info('[cdek] в окне ПВЗ до-создано: ' + created.join(', '));
}

function ensurePvzControls() {
  if (!ui.pvzWrap) return;
  if (!ui.pvzWrap.querySelector('.cdek-open-pvz')) {
    const b = el('button', 'btn btn-ghost cdek-open-pvz', 'Выбрать пункт выдачи');
    b.type = 'button';
    ui.pvzWrap.prepend(b);
    console.info('[cdek] кнопка «Выбрать пункт выдачи» создана автоматически');
  }
  if (!ui.pvzWrap.querySelector('.cdek-pvz-chosen')) {
    ui.pvzWrap.appendChild(el('p', 'cdek-pvz-chosen'));
  }
}

function normalizeMode() {
  const checked = ui.modes.find((x) => x.checked);
  const v = checked ? checked.value : '';
  return v.indexOf('pvz') >= 0 ? 'pvz' : 'courier';
}

/* ---------- инициализация ---------- */
function init(elements) {
  const need = ['modes', 'cityInput', 'addressInput', 'courierWrap', 'pvzWrap', 'estimateBox'];
  const missing = need.filter((k) => !elements[k] || (Array.isArray(elements[k]) && !elements[k].length));
  if (missing.length) {
    console.error('[cdek] не хватает элементов:', missing.join(', '));
    if (elements.estimateBox) {
      elements.estimateBox.hidden = false;
      elements.estimateBox.innerHTML = '<div class="cdek-estimate cdek-error">Модуль СДЭК: не хватает элементов ' + missing.join(', ') + '</div>';
    }
    return;
  }
  ui = elements;
  const cityModal = document.getElementById('cdek-city-modal');
  const pvzModal = document.getElementById('cdek-pvz-modal');
  workMode = (cityModal && pvzModal) ? 'modal' : 'inline';
  ui.cityModal = cityModal;
  ui.pvzModal = pvzModal;
  if (workMode === 'modal') {
    ensureCityModal(cityModal);
    ensurePvzModal(pvzModal);
    ui.cityInput.setAttribute('readonly', 'readonly');
  } else {
    ui.cityInput.removeAttribute('readonly');
  }
  ensurePvzControls();
  ui.citySearch = cityModal ? cityModal.querySelector('.cdek-city-search') : null;
  ui.cityList = (cityModal && cityModal.querySelector('.cdek-citylist')) || document.querySelector('.cdek-citylist');
  ui.pvzList = (pvzModal && pvzModal.querySelector('.cdek-pvzlist')) || document.querySelector('.cdek-pvzlist');
  ui.mapEl = document.getElementById('cdek-map');
  ui.pvzToggle = pvzModal ? pvzModal.querySelector('.cdek-pvz-toggle') : null;
  ui.pvzSearch = pvzModal ? pvzModal.querySelector('.cdek-pvz-search') : null;
  ui.pvzTitle = pvzModal ? pvzModal.querySelector('.cdek-pvz-title-city') : null;
  ui.openPvz = document.querySelector('.cdek-open-pvz');
  ui.pvzChosen = document.querySelector('.cdek-pvz-chosen');
  ui.popular = cityModal ? cityModal.querySelector('.cdek-popular') : null;
  if (!ui.cityList) {
    ui.cityList = el('div', 'cdek-citylist');
    ui.cityList.hidden = true;
    ui.cityInput.parentNode.appendChild(ui.cityList);
  }
  if (!ui.pvzList) {
    ui.pvzList = el('div', 'cdek-pvzlist');
    ui.pvzWrap.appendChild(ui.pvzList);
  }
  try { bind(); } catch (e) { console.error('[cdek] ошибка привязок:', e); }
  state.mode = normalizeMode();
  renderMode();
  console.info('[cdek] v8 инициализирован, режим: ' + workMode);
}

function bind() {
  ui.modes.forEach((r) => r.addEventListener('change', () => {
    state.mode = normalizeMode();
    renderMode();
    recalculate();
  }));
  if (workMode === 'modal') {
    ui.cityInput.addEventListener('click', openCity);
    ui.cityInput.addEventListener('focus', openCity);
    if (ui.citySearch) ui.citySearch.addEventListener('input', () => queueSuggest(ui.citySearch.value, ui.cityList));
    if (ui.popular) ui.popular.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectByName(b.dataset.city)));
    const cc = ui.cityModal.querySelector('[data-cdek-close="city"]');
    const pc = ui.pvzModal.querySelector('[data-cdek-close="pvz"]');
    if (cc) cc.addEventListener('click', closeCity);
    if (pc) pc.addEventListener('click', closePvz);
    if (ui.pvzToggle) ui.pvzToggle.addEventListener('click', toggleView);
    if (ui.pvzSearch) ui.pvzSearch.addEventListener('input', () => renderPvz(filterPvz(ui.pvzSearch.value)));
  } else {
    ui.cityInput.addEventListener('input', () => queueSuggest(ui.cityInput.value, ui.cityList));
  }
  if (ui.openPvz) ui.openPvz.addEventListener('click', () => {
    if (!state.cityCode) {
      if (workMode === 'modal') openCity(); else ui.cityInput.focus();
      return;
    }
    if (workMode === 'modal') openPvz();
    else { ui.pvzWrap.hidden = false; if (!state.pvzCache.length) loadPvz(); }
  });
  ui.addressInput.addEventListener('input', () => {
    state.manualAddress = ui.addressInput.value.trim();
    recalculate();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || workMode !== 'modal') return;
    if (ui.cityModal && !ui.cityModal.hidden) { e.stopPropagation(); e.preventDefault(); closeCity(); }
    else if (ui.pvzModal && !ui.pvzModal.hidden) { e.stopPropagation(); e.preventDefault(); closePvz(); }
  }, true);
}

function queueSuggest(raw, listEl) {
  const q = (raw || '').trim();
  state.cityName = q;
  state.cityCode = null;
  state.pvzCode = null;
  if (!listEl) return;
  if (q.length < 2) { hideList(listEl); return; }
  clearTimeout(cityTimer);
  cityTimer = setTimeout(() => suggest(q, listEl), 300);
}

/* ---------- окна: видимость инлайн-стилями ---------- */
function showOverlay(m) {
  if (!m) return;
  m.hidden = false;
  m.style.opacity = '1';
  m.style.visibility = 'visible';
}

function hideOverlay(m) {
  if (!m) return;
  m.style.opacity = '0';
  m.style.visibility = 'hidden';
  setTimeout(() => { m.hidden = true; }, 300);
}

function openCity() {
  if (!ui.cityModal) return;
  ui.cityInput.blur();
  showOverlay(ui.cityModal);
  setTimeout(() => { if (ui.citySearch) ui.citySearch.focus(); }, 80);
}

function closeCity() { hideOverlay(ui.cityModal); }

function openPvz() {
  if (!ui.pvzModal) return;
  if (ui.pvzTitle) ui.pvzTitle.textContent = 'Пункты выдачи — ' + state.cityName;
  showOverlay(ui.pvzModal);
  setTimeout(() => { if (map) map.invalidateSize(); }, 250);
  if (!state.pvzCache.length) loadPvz(); else renderPvz(filterPvz(''));
}

function closePvz() { hideOverlay(ui.pvzModal); }

function toggleView() {
  if (!ui.pvzList || !ui.mapEl) return;
  const listHidden = ui.pvzList.classList.contains('is-hidden');
  ui.pvzList.classList.toggle('is-hidden', !listHidden);
  ui.mapEl.classList.toggle('is-hidden', listHidden);
  if (ui.pvzToggle) ui.pvzToggle.textContent = listHidden ? 'Показать списком' : 'Показать на карте';
  if (listHidden && map) setTimeout(() => map.invalidateSize(), 100);
}

/* ---------- подсказки городов ---------- */
async function suggest(q, listEl) {
  let items = [];
  if (!demoMode) {
    try {
      const data = await cdekFetch('/v2/location/suggest/cities?name=' + encodeURIComponent(q) + '&country_code=RU');
      items = (Array.isArray(data) ? data : (data.items || [data]))
        .filter((c) => c && c.code)
        .map((c) => ({ code: c.code, name: c.full_name || c.city || q }));
    } catch (e) { enterDemo('подсказки города'); }
  }
  if (!items.length) {
    const ql = q.toLowerCase();
    items = DEMO_CITIES.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ code: c.code, name: c.name }));
  }
  renderSuggest(items.slice(0, 8), q, listEl);
}

function renderSuggest(items, q, listEl) {
  if (!listEl) return;
  if (!items.length) { hideList(listEl); return; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
  listEl.innerHTML = items.map((c) =>
    '<button type="button" class="cdek-city-option" data-code="' + c.code + '" data-name="' + esc(c.name) + '">' +
    esc(c.name).replace(rx, '<mark>$1</mark>') + '</button>'
  ).join('');
  listEl.hidden = false;
  listEl.querySelectorAll('.cdek-city-option').forEach((b) => {
    b.addEventListener('click', () => selectCity(Number(b.dataset.code), b.dataset.name));
  });
}

function hideList(listEl) {
  if (listEl) { listEl.innerHTML = ''; listEl.hidden = true; }
}

async function selectByName(name) {
  if (ui.citySearch) ui.citySearch.value = name;
  await suggest(name, ui.cityList);
  const first = ui.cityList ? ui.cityList.querySelector('.cdek-city-option') : null;
  if (first) selectCity(Number(first.dataset.code), first.dataset.name);
}

function selectCity(code, name) {
  state.cityCode = code;
  state.cityName = name;
  state.pvzCode = null;
  state.pvzCache = [];
  ui.cityInput.value = name;
  hideList(ui.cityList);
  closeCity();
  renderMode();
  loadPvz();
  recalculate();
}

/* ---------- ПВЗ ---------- */
async function loadPvz() {
  if (!state.cityCode) return;
  if (workMode === 'inline' && ui.pvzList) ui.pvzList.innerHTML = '<p class="cdek-loading">Загружаем пункты выдачи…</p>';
  let list = null;
  if (!demoMode) {
    try {
      const raw = await cdekFetch('/v2/deliverypoints?city_code=' + state.cityCode + '&status=ACTIVE');
      list = Array.isArray(raw) ? raw : [];
    } catch (e) { enterDemo('ПВЗ'); }
  }
  if (list === null) list = demoPvz();
  state.pvzCache = list;
  renderPvz(filterPvz(''));
}

function demoPvz() {
  const base = DEMO_CITIES.find((c) => c.code === state.cityCode) || DEMO_CITIES[0];
  return [0, 1, 2, 3, 4, 5].map((i) => ({
    code: 'DEMO-' + base.code + '-' + i,
    location: {
      address_full: base.name + ', демо-адрес ПВЗ №' + (i + 1),
      latitude: base.lat + (i - 2) * 0.02,
      longitude: base.lon + (i - 2) * 0.02
    },
    work_time: 'пн–пт 09:00–20:00'
  }));
}

function pvzAddr(p) { return (p.location && p.location.address_full) || ''; }

function filterPvz(q) {
  if (!q) return state.pvzCache;
  const ql = String(q).toLowerCase();
  return state.pvzCache.filter((p) => (pvzAddr(p) + ' ' + p.code).toLowerCase().includes(ql));
}

function renderPvz(list) {
  if (!ui.pvzList) return;
  if (!list.length) {
    ui.pvzList.innerHTML = '<p class="cdek-empty">Ничего не найдено</p>';
  } else {
    ui.pvzList.innerHTML = list.slice(0, 40).map((p) =>
      '<button type="button" class="cdek-pvz' + (p.code === state.pvzCode ? ' is-selected' : '') + '" data-code="' + p.code + '">' +
      '<strong>' + p.code + '</strong> <span>' + pvzAddr(p) + '</span>' +
      '<small>⏰ ' + (p.work_time || '—') + '</small></button>'
    ).join('');
    ui.pvzList.querySelectorAll('.cdek-pvz').forEach((b) => {
      b.addEventListener('click', () => selectPvz(b.dataset.code, list.find((p) => p.code === b.dataset.code)));
    });
  }
  renderMarkers(list);
}

function selectPvz(code, office) {
  state.pvzCode = code;
  state.pvzAddress = office ? pvzAddr(office) : code;
  if (ui.pvzChosen) ui.pvzChosen.textContent = 'ПВЗ ' + code + ': ' + state.pvzAddress;
  closePvz();
  recalculate();
}

/* ---------- карта Leaflet ---------- */
function initMap() {
  if (map || !ui.mapEl) return;
  if (!window.L) { ui.mapEl.classList.add('is-hidden'); return; }
  map = L.map('cdek-map', { scrollWheelZoom: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  cluster = L.markerClusterGroup ? L.markerClusterGroup() : L.layerGroup();
  map.addLayer(cluster);
}

function renderMarkers(list) {
  if (!ui.mapEl) return;
  initMap();
  if (!map) return;
  cluster.clearLayers();
  const bounds = [];
  list.forEach((p) => {
    const lat = p.location && p.location.latitude;
    const lon = p.location && p.location.longitude;
    if (lat == null || lon == null) return;
    const m = L.marker([lat, lon]);
    const div = document.createElement('div');
    div.className = 'cdek-pvz-popup';
    div.innerHTML = '<div>' + pvzAddr(p) + '</div>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-small';
    btn.textContent = 'Выбрать';
    btn.addEventListener('click', () => selectPvz(p.code, p));
    div.appendChild(btn);
    m.bindPopup(div);
    cluster.addLayer(m);
    bounds.push([lat, lon]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

/* ---------- режимы и расчёт ---------- */
function renderMode() {
  const courier = state.mode === 'courier';
  ui.courierWrap.hidden = !courier;
  ui.pvzWrap.hidden = courier || !state.cityCode;
  ui.addressInput.required = courier;
}

async function recalculate() {
  if (!state.cityCode) { showEstimate(null); return; }
  if (state.mode === 'courier' && !state.manualAddress) { showEstimate(null); return; }
  if (state.mode === 'pvz' && !state.pvzCode) { showEstimate(null); return; }
  const tariff = state.mode === 'courier' ? TARIFF_COURIER : TARIFF_PVZ;
  showEstimate('loading');
  if (!demoMode) {
    try {
      const payload = {
        date: new Date().toISOString().slice(0, 10),
        type: 1,
        lang: 'rus',
        from_location: { code: SENDER.code, address: SENDER.address },
        to_location: { code: state.cityCode },
        tariff_code: tariff,
        packages: [PKG]
      };
      if (state.mode === 'pvz') payload.delivery_point = state.pvzCode;
      const res = await cdekFetch('/v2/calculator/tariff', { method: 'POST', body: payload });
      if (res.errors) console.warn('[cdek] калькулятор вернул ошибки:', JSON.stringify(res.errors));
      if (!res.errors && (res.delivery_sum || res.total_sum)) {
        state.estimate = {
          price: Number(res.delivery_sum || res.total_sum || 0),
          daysMin: Number(res.period_min || 1),
          daysMax: Number(res.period_max || Number(res.period_min || 1)),
          tariff: tariff,
          demo: false
        };
        showEstimate(state.estimate);
        if (ui.onEstimate) ui.onEstimate(state.estimate);
        return;
      }
    } catch (e) { enterDemo('калькулятор'); }
  }
  state.estimate = demoEstimate();
  showEstimate(state.estimate);
  if (ui.onEstimate) ui.onEstimate(state.estimate);
}

function demoEstimate() {
  const c = state.mode === 'courier';
  return {
    price: c ? 450 : 290,
    daysMin: c ? 2 : 3,
    daysMax: c ? 4 : 6,
    tariff: c ? TARIFF_COURIER : TARIFF_PVZ,
    demo: true
  };
}

function showEstimate(data) {
  if (!ui.estimateBox) return;
  ui.estimateBox.hidden = false;
  if (data === 'loading') { ui.estimateBox.innerHTML = '<div class="cdek-estimate cdek-loading">Рассчитываем стоимость…</div>'; return; }
  if (!data) { ui.estimateBox.innerHTML = '<div class="cdek-estimate cdek-hint">Выберите город и адрес (или ПВЗ) — покажем стоимость и сроки</div>'; return; }
  if (data.error) { ui.estimateBox.innerHTML = '<div class="cdek-estimate cdek-error">' + data.error + '</div>'; return; }
  const days = data.daysMin === data.daysMax ? data.daysMin + ' дн.' : data.daysMin + '–' + data.daysMax + ' дн.';
  ui.estimateBox.innerHTML =
    '<div class="cdek-estimate"><div><strong>' + (data.price || 0).toLocaleString('ru-RU') + ' ₽</strong></div>' +
    '<div class="cdek-days">' + days + (data.demo ? ' · демо' : '') + '</div></div>';
}

/* ---------- создание заказа в СДЭК ---------- */
async function createOrder(opts) {
  if (!state.cityCode || !state.estimate || state.estimate.demo) return null;
  const digits = (opts.recipientPhone || '').replace(/\D/g, '');
  const phone = '+' + (digits[0] === '8' ? '7' + digits.slice(1) : (digits[0] === '7' ? digits : '7' + digits));
  const base = {
    number: 'VS' + Date.now() + '-' + opts.ourNumber,
    tariff_code: state.estimate.tariff,
    type: 1,
    comment: 'Заказ книг «Вера Сказкина» №' + opts.ourNumber,
    from_location: { code: SENDER.code, address: SENDER.address, country_code: 'RU' },
    packages: [{ number: '1', weight: PKG.weight, length: PKG.length, width: PKG.width, height: PKG.height }],
    recipient: { name: opts.recipientName, phones: [{ number: phone }] }
  };
  if (state.mode === 'pvz') base.delivery_point = state.pvzCode;
  else base.to_location = { code: state.cityCode, address: state.manualAddress, country_code: 'RU' };
  /* запасная попытка типом «доставка», если тестовая учётка отклонит тип «ИМ» */
  const second = Object.assign({}, base, {
    type: 2,
    sender: { name: 'Вера Сказкина', phones: [{ number: '+79000000000' }] },
    packages: [{ number: '1', weight: PKG.weight, length: PKG.length, width: PKG.width, height: PKG.height, comment: 'Книги в картонной упаковке' }]
  });
  for (const order of [base, second]) {
    try {
      const res = await cdekFetch('/v2/orders', { method: 'POST', body: order });
      const req = Array.isArray(res.requests) ? res.requests[0] : null;
      if (!req || !req.request_uuid) continue;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await cdekFetch('/v2/orders/' + req.request_uuid);
        const ent = st.entity || {};
        if (ent.cdek_number) return { uuid: req.request_uuid, cdek_number: ent.cdek_number };
        const rq = Array.isArray(st.requests) ? st.requests[0] : null;
        if (rq && rq.state === 'INVALID') {
          console.warn('[cdek] заказ INVALID (тип ' + order.type + '):', JSON.stringify(rq.errors));
          break;
        }
      }
    } catch (e) {
      console.warn('[cdek] попытка создания заказа не удалась:', e);
    }
  }
  return null;
}

/* ---------- сброс ---------- */
function reset() {
  state = {
    cityCode: null, cityName: '', pvzCode: null, pvzAddress: '',
    mode: 'courier', manualAddress: '', estimate: null, pvzCache: []
  };
  if (ui) {
    if (ui.modes[0]) ui.modes[0].checked = true;
    ui.cityInput.value = '';
    ui.addressInput.value = '';
    if (ui.pvzChosen) ui.pvzChosen.textContent = '';
    hideList(ui.cityList);
    renderMode();
    if (ui.estimateBox) ui.estimateBox.hidden = true;
    if (ui.onEstimate) ui.onEstimate(null);
  }
}

return { init: init, createOrder: createOrder, reset: reset, getState: () => state, isDemo: () => demoMode };
})();