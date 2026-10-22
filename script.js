/* ============================================================
ВЕРА СКАЗКИНА — ДЕТСКИЕ КНИГИ
script.js — читалка + корзина + чекаут + FormToMail + СДЭК (чистая сборка)
============================================================ */
'use strict';
(function () {
const reader = document.getElementById('reader');
const checkout = document.getElementById('checkout');
const cartRoot = document.getElementById('cart');
const cartFab = document.getElementById('cart-fab');
if (!reader || !checkout || !cartRoot || !cartFab) return;

/* ---------- Читалка: элементы ---------- */
const books = Array.from(reader.querySelectorAll('.book3d'));
const closeBtn = reader.querySelector('.reader-close');
const nextBtn = reader.querySelector('.reader-next');
const counter = reader.querySelector('.reader-current');
const openBtns = Array.from(document.querySelectorAll('.btn-more'));
const readerAddBtn = reader.querySelector('.reader-add-cart');
const total = books.length;

/* ---------- Корзина: элементы ---------- */
const addCartBtns = Array.from(document.querySelectorAll('.add-cart'));
const cartBadges = Array.from(document.querySelectorAll('.cart-badge'));
const headerCart = document.querySelector('.header-cart');
const readerPrev = reader.querySelector('.reader-prev');
const cartClose = cartRoot.querySelector('.cart-close');
const cartEmpty = cartRoot.querySelector('.cart-empty');
const cartItemsEl = cartRoot.querySelector('.cart-items');
const cartFooter = cartRoot.querySelector('.cart-footer');
const cartTotalEl = cartRoot.querySelector('.cart-total');
const cartCheckout = cartRoot.querySelector('.cart-checkout');
const cartContinue = cartRoot.querySelector('.cart-continue');

/* ---------- Чекаут: элементы ---------- */
const chClose = checkout.querySelector('.checkout-close');
const chForm = checkout.querySelector('.checkout-grid');
const hpField = chForm.querySelector('.hp-field input');
let hpTriggered = false;
let hpOriginalHtml = '';
const sumItems = checkout.querySelector('.summary-items');
const sumSub = checkout.querySelector('.summary-subtotal');
const sumDel = checkout.querySelector('.summary-delivery');
const sumTotal = checkout.querySelector('.summary-total');
const chPayBtn = checkout.querySelector('.checkout-pay-btn');
const chSuccess = checkout.querySelector('.checkout-success');
const chOrderNo = checkout.querySelector('.order-number');
const chDone = checkout.querySelector('.checkout-done');
const steps = Array.from(checkout.querySelectorAll('.step'));
const stubStep = checkout.querySelector('.checkout-stub');
const stubBack = checkout.querySelector('.stub-back');
const chError = checkout.querySelector('.checkout-error');

const PAY_LABELS = {
  card: 'Картой онлайн (на стороне банка)',
  sbp: 'СБП (по QR-коду)',
  cod: 'Наличными/картой при получении',
  invoice: 'Банковский перевод для юрлиц'
};

/* ---------- Состояние ---------- */
const CART_KEY = 'vera-skazkina-cart';
let cart = loadCart();
let current = 0, isOpen = false, busy = false;
let checkoutOpen = false, checkoutBusy = false;
let cartOpen = false;
let lastFocused = null, checkoutOpener = null, cartOpener = null;
let lastTotal = 0, lastCount = 0, cdekPrice = 0;
const FREE_FROM = 3000;
const timers = [];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const d = (ms) => (reduced ? 60 : ms);
const after = (ms, fn) => { const id = setTimeout(fn, d(ms)); timers.push(id); return id; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
const fmt = (n) => n.toLocaleString('ru-RU') + ' ₽';
const val = (name) => (checkout.querySelector('input[name="' + name + '"]:checked') || {}).value;

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch (e) { return []; }
}
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };

const bookData = (i) => ({
  index: i,
  title: books[i].querySelector('.page-title').textContent.trim(),
  price: parseInt(books[i].querySelector('.page-price').textContent.replace(/\D/g, ''), 10) || 0,
  cover: books[i].querySelector('.face-front img').src
});

const inCart = (i) => cart.find((p) => p.index === i);
const cartCount = () => cart.reduce((s, p) => s + p.qty, 0);
const cartSum = () => cart.reduce((s, p) => s + p.qty * bookData(p.index).price, 0);

function deliveryBase() {
  return cdekPrice || 0;
}

function cdekLabel() {
  const st = window.CdekModule ? window.CdekModule.getState() : null;
  if (!st) return '—';
  const base = st.mode === 'pvz' ? 'СДЭК, пункт выдачи' : 'СДЭК, курьер';
  const price = (!cartSum() || cartSum() >= FREE_FROM) ? 'бесплатно' : fmt(cdekPrice);
  const days = st.estimate ? ', ' + st.estimate.daysMin + '–' + st.estimate.daysMax + ' дн.' : '';
  return base + ' — ' + price + days;
}

function cdekAddress() {
  const st = window.CdekModule ? window.CdekModule.getState() : null;
  if (!st || !st.cityName) return '—';
  return st.mode === 'pvz'
    ? st.cityName + ', ПВЗ: ' + (st.pvzAddress || st.pvzCode)
    : st.cityName + ', ' + st.manualAddress;
}

/* ============================================================
ЧИТАЛКА
============================================================ */
function resetAllBooks() {
  books.forEach((book) => {
    book.classList.remove('is-active', 'is-open', 'is-leaving', 'is-leaving-right', 'slide-in-right', 'slide-in-left');
    book.setAttribute('aria-hidden', 'true');
  });
}
const updateCounter = (i) => { counter.textContent = i + 1; };
const updateNextLabel = () => {
  nextBtn.textContent = current === total - 1
    ? 'Перейти к первой книге →'
    : 'Перейти к следующей книге →';
};

function openReader(index) {
  if (isOpen || busy) return;
  isOpen = true; busy = true;
  current = index;
  lastFocused = document.activeElement;
  document.body.classList.add('no-scroll');
  cartFab.classList.add('is-dim');
  resetAllBooks();
  updateCounter(current);
  updateNextLabel();
  syncCartButtons();
  reader.hidden = false;
  void reader.offsetHeight;
  reader.classList.add('is-visible');
  const book = books[current];
  book.setAttribute('aria-hidden', 'false');
  book.classList.add('is-active');
  after(550, () => {
    book.classList.add('is-open');
    busy = false;
    closeBtn.focus();
  });
}

function closeReader() {
  if (!isOpen || checkoutOpen || cartOpen) return;
  isOpen = false;
  busy = false;
  clearTimers();
  books.forEach((b) => b.classList.remove('is-open', 'is-leaving', 'is-leaving-right', 'slide-in-right', 'slide-in-left'));
  reader.classList.remove('is-visible');
  cartFab.classList.remove('is-dim');
  after(450, () => {
    reader.hidden = true;
    resetAllBooks();
    document.body.classList.remove('no-scroll');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  });
}

function goBook(dir) {
  if (!isOpen || busy) return;
  busy = true;
  const oldBook = books[current];
  const nextIndex = (current + dir + total) % total;
  const newBook = books[nextIndex];
  current = nextIndex;
  updateNextLabel();
  syncCartButtons();
  oldBook.classList.remove('is-open');
  oldBook.classList.add(dir === 1 ? 'is-leaving' : 'is-leaving-right');
  oldBook.setAttribute('aria-hidden', 'true');
  newBook.classList.remove('is-leaving', 'is-leaving-right', 'is-open');
  newBook.classList.add('is-active', dir === 1 ? 'slide-in-right' : 'slide-in-left');
  void newBook.offsetHeight;
  requestAnimationFrame(() => {
    newBook.classList.remove('slide-in-right', 'slide-in-left');
    newBook.classList.add('is-open');
    newBook.setAttribute('aria-hidden', 'false');
  });
  updateCounter(current);
  after(900, () => {
    oldBook.classList.remove('is-active', 'is-leaving', 'is-leaving-right');
    busy = false;
  });
}

/* ============================================================
КОРЗИНА
============================================================ */
function setCartBtn(btn, index) {
  const has = !!inCart(index);
  btn.textContent = has ? 'В корзине' : 'Добавить в корзину';
  btn.classList.toggle('is-in-cart', has);
}

function syncCartButtons() {
  addCartBtns.forEach((b) => setCartBtn(b, Number(b.dataset.index)));
  setCartBtn(readerAddBtn, current);
}

function syncCartUI(popBadge) {
  const count = cartCount();
  cartBadges.forEach((b) => { b.hidden = count === 0; b.textContent = count; });
  if (popBadge && count > lastCount) {
    cartBadges.forEach((b) => { b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop'); });
  }
  lastCount = count;
  syncCartButtons();
  if (cartOpen) renderCart();
}

function addToCart(index, btn) {
  const pos = inCart(index);
  if (pos) pos.qty = Math.min(10, pos.qty + 1);
  else cart.push({ index: index, qty: 1 });
  saveCart();
  syncCartUI(false);
  flyToCartAnim(index);
  if (btn) setCartBtn(btn, index);
}

function flyToCartAnim(index) {
  const isDesktop = window.innerWidth > 760;
  const target = isDesktop ? headerCart : cartFab;
  const needReveal = !isDesktop && isOpen;
  if (needReveal) cartFab.classList.add('is-revealed');
  const r = target.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'fly-cover';
  const img = document.createElement('img');
  img.src = bookData(index).cover;
  img.alt = '';
  fly.appendChild(img);
  fly.style.left = (r.left + r.width / 2) + 'px';
  fly.style.top = (r.top - 70) + 'px';
  document.body.appendChild(fly);
  setTimeout(() => {
    target.classList.add('is-bounce');
    cartBadges.forEach((b) => { b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop'); });
  }, d(760));
  setTimeout(() => {
    target.classList.remove('is-bounce');
    if (needReveal) cartFab.classList.remove('is-revealed');
  }, d(1650));
  fly.addEventListener('animationend', () => fly.remove(), { once: true });
}

function renderCart() {
  if (!cart.length) {
    cartEmpty.hidden = false;
    cartItemsEl.innerHTML = '';
    cartFooter.hidden = true;
    return;
  }
  cartEmpty.hidden = true;
  cartFooter.hidden = false;
  cartItemsEl.innerHTML = cart.map((p) => {
    const b = bookData(p.index);
    return `<div class="cart-item" data-index="${p.index}">
      <img src="${b.cover}" alt="" width="56" height="75" loading="lazy">
      <div class="cart-item-info">
        <strong>${b.title}</strong>
        <span>${fmt(b.price)} / шт.</span>
      </div>
      <div class="cart-item-controls">
        <button type="button" class="qty-btn ci-minus" aria-label="Меньше">−</button>
        <span class="qty-value">${p.qty}</span>
        <button type="button" class="qty-btn ci-plus" aria-label="Больше">+</button>
        <button type="button" class="cart-remove" aria-label="Удалить из корзины">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6.5 7l1 13h9l1-13"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
  cartTotalEl.textContent = fmt(cartSum());
}

function openCart(opener) {
  if (cartOpen || checkoutOpen) return;
  cartOpen = true;
  cartOpener = opener || document.activeElement;
  renderCart();
  cartRoot.hidden = false;
  void cartRoot.offsetHeight;
  cartRoot.classList.add('is-visible');
  cartClose.focus();
}

function closeCart() {
  if (!cartOpen) return;
  cartOpen = false;
  cartRoot.classList.remove('is-visible');
  setTimeout(() => {
    cartRoot.hidden = true;
    if (cartOpener && typeof cartOpener.focus === 'function') cartOpener.focus();
  }, d(300));
}

/* ============================================================
ЧЕКАУТ
============================================================ */
function recalc() {
  const subtotal = cartSum();
  const cdekReady = cdekPrice > 0;
  const delivery = (!subtotal || subtotal >= FREE_FROM) ? 0 : deliveryBase();
  const totalSum = subtotal + delivery;
  lastTotal = totalSum;
  sumSub.textContent = fmt(subtotal);
  if (!cdekReady && subtotal && subtotal < FREE_FROM) {
    sumDel.textContent = 'расчёт…';
    sumDel.classList.remove('is-free');
  } else if (delivery === 0) {
    sumDel.textContent = subtotal ? 'Бесплатно' : '—';
    sumDel.classList.add('is-free');
  } else {
    sumDel.textContent = fmt(delivery);
    sumDel.classList.remove('is-free');
  }
  sumTotal.textContent = fmt(totalSum);
  if (!checkoutBusy) chPayBtn.textContent = 'Подтвердить заказ · ' + fmt(totalSum);
}

function renderSummary() {
  sumItems.innerHTML = cart.map((p) => {
    const b = bookData(p.index);
    return `<div class="summary-item">
      <img src="${b.cover}" alt="" width="48" height="64" loading="lazy">
      <div class="summary-item-info">
        <strong>${b.title}</strong>
        <span>${p.qty} × ${fmt(b.price)}</span>
      </div>
      <b class="summary-item-total">${fmt(p.qty * b.price)}</b>
    </div>`;
  }).join('');
}

function setSteps(stateName) {
  steps.forEach((s) => s.classList.remove('is-done', 'is-current'));
  steps[0].classList.add('is-done');
  if (stateName === 'form') {
    steps[1].classList.add('is-current');
  } else {
    steps[1].classList.add('is-done');
    steps[2].classList.add('is-current');
  }
}

function openCheckout(opener) {
  if (checkoutOpen || checkoutBusy || !cart.length) return;
  checkoutOpen = true;
  checkoutOpener = opener || document.activeElement;
  renderSummary();
  checkoutBusy = false;
  chPayBtn.disabled = false;
  chPayBtn.hidden = false;
  chForm.hidden = false;
  chSuccess.hidden = true;
  stubStep.hidden = true;
  setSteps('form');
  recalc();
  checkout.hidden = false;
  void checkout.offsetHeight;
  checkout.classList.add('is-visible');
  checkout.scrollTop = 0;
  chClose.focus();
}

function closeCheckout() {
  if (!checkoutOpen || (checkoutBusy && !hpTriggered)) return;
  checkoutOpen = false;
  if (hpTriggered) {
    hpTriggered = false;
    checkoutBusy = false;
    chPayBtn.disabled = false;
    chPayBtn.innerHTML = hpOriginalHtml;
    if (hpField) hpField.value = '';
  }
  checkout.classList.remove('is-visible');
  setTimeout(() => {
    checkout.hidden = true;
    if (checkoutOpener && typeof checkoutOpener.focus === 'function') checkoutOpener.focus();
  }, d(300));
}

function submitOrder(e) {
  e.preventDefault();
  if (checkoutBusy) return;
  if (hpField && hpField.value.trim() !== '') {
    hpTriggered = true;
    checkoutBusy = true;
    hpOriginalHtml = chPayBtn.innerHTML;
    chPayBtn.disabled = true;
    chPayBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Отправляем заказ…';
    return;
  }
  if (!chForm.checkValidity()) { chForm.reportValidity(); return; }
  const cdekSt = window.CdekModule ? window.CdekModule.getState() : null;
  if (cdekSt && cdekSt.cityCode === null) {
    chError.textContent = 'Укажите город доставки — выберите его из подсказок.';
    chError.hidden = false;
    return;
  }
  if (cdekSt && cdekSt.mode === 'pvz' && !cdekSt.pvzCode) {
    chError.textContent = 'Выберите пункт выдачи из списка.';
    chError.hidden = false;
    return;
  }
  const method = val('pay-method');
  if (method === 'card' || method === 'sbp') { openStub(); return; }
  finishOrder(method, chPayBtn);
}

function openStub() {
  chForm.hidden = true;
  chSuccess.hidden = true;
  stubStep.hidden = false;
  checkout.scrollTop = 0;
  stubBack.focus();
}

function backToForm() {
  stubStep.hidden = true;
  chForm.hidden = false;
  chPayBtn.hidden = false;
  checkout.scrollTop = 0;
}

/* ---------- Реестр заказов: уникальные номера ---------- */
const orderStore = {
  storageKey: 'vera-skazkina-orders',
  _orders() {
    try { return JSON.parse(localStorage.getItem(this.storageKey)) || []; }
    catch (e) { return []; }
  },
  _save(list) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(list)); } catch (e) {}
  },
  nextNumber() {
    const orders = this._orders();
    let num;
    do {
      num = 1000 + (Date.now() + Math.floor(Math.random() * 9000)) % 9000;
    } while (orders.some((o) => o.number === num));
    orders.push({ number: num, savedAt: new Date().toISOString() });
    this._save(orders);
    return num;
  }
};

/* ---------- FormToMail ---------- */
const FORMTOMAIL_URL = 'https://api.formtomail.ru/send';
const FORMTOMAIL_KEY = 'rntvtp5fXeyuwgGE';

function sendOrderEmail(title, body, honeypotValue) {
  return fetch(FORMTOMAIL_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + FORMTOMAIL_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: title, body: body, honeypot: honeypotValue })
  })
  .then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, json: j })))
  .catch(() => ({ status: 0, json: {} }));
}

function buildCartHtml() {
  const row = (n, q, p, s) => n.padEnd(16) + ' | ' + q.padStart(3) + ' | ' + p.padStart(5) + ' | ' + s.padStart(5);
  const sep = '-'.repeat(38);
  const wrap = (text) => {
    const out = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (next.length <= 16) line = next;
      else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };
  const lines = [row('Товар', 'Кол', 'Цена', 'Сумма'), sep];
  let totalSum = 0;
  cart.forEach((p) => {
    const b = bookData(p.index);
    const sum = p.qty * b.price;
    totalSum += sum;
    wrap(b.title).forEach((part, i) => {
      lines.push(i === 0 ? row(part, String(p.qty), String(b.price), String(sum)) : row(part, '', '', ''));
    });
  });
  lines.push(sep, row('Итого', '', '', String(totalSum)));
  return '<pre>' + lines.join('\n') + '</pre>';
}

function finishOrder(method, btn) {
  if (checkoutBusy) return;
  checkoutBusy = true;
  const originalHtml = btn.innerHTML;
  const label =
    method === 'cod' ? 'Отправляем заказ…' :
    method === 'invoice' ? 'Выставляем счёт…' :
    'Проводим оплату…';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + label;
  chPayBtn.hidden = true;
  chError.hidden = true;
  const number = orderStore.nextNumber();
  const fd = new FormData(chForm);
  const get = (k) => (fd.get(k) || '').toString().trim();
  const body = {
    'Номер заказа': String(number),
    'Имя': get('firstname') + ' ' + get('lastname'),
    'Телефон': get('phone'),
    'Email': get('email'),
    'Доставка': cdekLabel(),
    'Адрес': cdekAddress(),
    'Оплата': PAY_LABELS[method] || method,
    'Корзина': buildCartHtml(),
    'Итого': fmt(lastTotal)
  };
  if (get('comment')) body['Примечание'] = get('comment');
  const hpValue = hpField ? hpField.value : '';
  Promise.all([
    sendOrderEmail('Новый заказ №' + number + ' — книги Веры Сказкиной', body, hpValue),
    new Promise((r) => setTimeout(r, d(900)))
  ]).then(([res]) => {
    console.info('FormToMail ←', res.status, res.json);
    if (res.status === 200) {
      chForm.hidden = true;
      stubStep.hidden = true;
      chSuccess.hidden = false;
      chOrderNo.textContent = number;
      setSteps('done');
      checkout.scrollTop = 0;
      cart = [];
      saveCart();
      syncCartUI(false);
      chDone.focus();
      if (window.CdekModule) {
        const st = window.CdekModule.getState();
        if (st.cityCode && st.estimate) {
          window.CdekModule.createOrder({
            ourNumber: number,
            recipientName: get('firstname') + ' ' + get('lastname'),
            recipientPhone: get('phone')
          }).then((cdek) => {
            const txt = checkout.querySelector('.checkout-success-text');
            if (cdek && cdek.cdek_number && txt) {
              txt.innerHTML = 'Заказ № <span class="order-number">' + number + '</span> принят. ' +
                'Отправление СДЭК: <b>' + cdek.cdek_number + '</b>. Чек уже летит на вашу почту!';
            }
          }).catch(() => {});
        }
        window.CdekModule.reset();
      }
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    } else {
      chError.textContent = (res.status === 400 && res.json && res.json.message)
        ? res.json.message
        : 'Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз.';
      chError.hidden = false;
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      chPayBtn.hidden = false;
    }
    checkoutBusy = false;
  });
}

/* ---------- Инициализация модуля СДЭК ---------- */
function initCdek() {
  if (!window.CdekModule) {
    console.warn('[cdek] CdekModule не найден — проверьте, что cdek.js подключён до script.js');
    return;
  }
  window.CdekModule.init({
    modes: Array.from(checkout.querySelectorAll('input[name="delivery"]')),
    cityInput: checkout.querySelector('.cdek-city'),
    addressInput: checkout.querySelector('.cdek-address'),
    cityList: document.querySelector('.cdek-citylist'),
    pvzList: document.querySelector('.cdek-pvzlist'),
    pvzWrap: checkout.querySelector('.cdek-pvz-wrap'),
    courierWrap: checkout.querySelector('.cdek-courier-wrap'),
    estimateBox: checkout.querySelector('.cdek-estimate-box'),
    onEstimate: (est) => { cdekPrice = est ? est.price : 0; recalc(); }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCdek);
} else {
  initCdek();
}

/* ============================================================
СОБЫТИЯ
============================================================ */
openBtns.forEach((btn) => btn.addEventListener('click', () => openReader(Number(btn.dataset.index) || 0)));
closeBtn.addEventListener('click', closeReader);
nextBtn.addEventListener('click', () => goBook(1));
readerPrev.addEventListener('click', () => goBook(-1));
if (headerCart) headerCart.addEventListener('click', () => openCart(headerCart));
readerAddBtn.addEventListener('click', () => addToCart(current, readerAddBtn));
reader.addEventListener('click', (e) => {
  if (e.target === reader || e.target.classList.contains('reader-scene')) closeReader();
});
addCartBtns.forEach((btn) => btn.addEventListener('click', () => addToCart(Number(btn.dataset.index), btn)));
cartFab.addEventListener('click', () => openCart(cartFab));
cartClose.addEventListener('click', closeCart);
cartContinue.addEventListener('click', closeCart);
cartRoot.addEventListener('click', (e) => { if (e.target === cartRoot) closeCart(); });
cartCheckout.addEventListener('click', () => {
  if (!cart.length) return;
  const opener = cartCheckout;
  closeCart();
  openCheckout(opener);
});
cartItemsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.cart-item');
  if (!row) return;
  const index = Number(row.dataset.index);
  const pos = inCart(index);
  if (!pos) return;
  if (e.target.closest('.ci-minus')) pos.qty = Math.max(1, pos.qty - 1);
  else if (e.target.closest('.ci-plus')) pos.qty = Math.min(10, pos.qty + 1);
  else if (e.target.closest('.cart-remove')) cart = cart.filter((p) => p.index !== index);
  else return;
  saveCart();
  syncCartUI(false);
});

let touchX = 0, touchY = 0;
reader.addEventListener('touchstart', (e) => {
  touchX = e.changedTouches[0].clientX;
  touchY = e.changedTouches[0].clientY;
}, { passive: true });
reader.addEventListener('touchend', (e) => {
  if (!isOpen || busy || checkoutOpen || cartOpen) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 60 || Math.abs(dy) > 60) return;
  goBook(dx < 0 ? 1 : -1);
}, { passive: true });

stubBack.addEventListener('click', backToForm);
checkout.querySelectorAll('input[name="delivery"], input[name="pay-method"]').forEach((r) => {
  r.addEventListener('change', recalc);
});
chClose.addEventListener('click', closeCheckout);
chDone.addEventListener('click', closeCheckout);
chForm.addEventListener('submit', submitOrder);

document.addEventListener('keydown', (e) => {
  if (checkoutOpen) {
    if (e.key === 'Escape') { closeCheckout(); return; }
    if (e.key === 'Tab') trapTab(e, checkout);
    return;
  }
  if (cartOpen) {
    if (e.key === 'Escape') { closeCart(); return; }
    if (e.key === 'Tab') trapTab(e, cartRoot);
    return;
  }
  if (!isOpen) return;
  if (e.key === 'Escape') { closeReader(); return; }
  if (e.key === 'Tab') trapTab(e, reader);
});

function trapTab(e, container) {
  const nodes = Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
  )).filter((el) => el.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

const navToggle = document.getElementById('nav-toggle');
if (navToggle) {
  document.querySelectorAll('.main-nav a').forEach((a) => {
    a.addEventListener('click', () => { navToggle.checked = false; });
  });
}

syncCartUI(false);
})();