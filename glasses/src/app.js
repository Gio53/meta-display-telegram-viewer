/* TG Viewer — client-side Telegram (MTProto over WebSocket, teleproto bundle).
   Built for the 600x600 D-pad display of Meta Ray-Ban Display glasses. */

/* eslint-env browser */
/* global CONFIG */

const $ = (id) => document.getElementById(id);

const el = {
  login: $('login'),
  hint: $('login-hint'),
  phone: $('phone'),
  btnCode: $('btn-code'),
  code: $('code'),
  password: $('password'),
  btnConfirm: $('btn-confirm'),
  status: $('login-status'),
  error: $('login-error'),
  loading: $('loading'),
  loadingText: $('loading-text'),
  app: $('app'),
  contactList: $('contact-list'),
  chatTitle: $('chat-title'),
  messages: $('messages'),
  composer: $('composer'),
  msgInput: $('msg-input'),
  btnSend: $('btn-send'),
};

let tg = null; // { TelegramClient, Api, StringSession, computeCheck, PromisedWebSockets }
let client = null;
let phoneCodeHash = null;
let currentPhone = '';
let dialogs = [];
let activeChatId = null;
let activeIndex = -1;
let msgTimer = null;
let dlgTimer = null;

const SESSION_KEY = 'tg_session';

// ---------------------------------------------------------------------------
// Engine loading (lazy: the MTProto bundle is big, keep first paint tiny)
// ---------------------------------------------------------------------------

let enginePromise = null;
function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    el.loadingText.textContent = 'Loading Telegram engine… (first load takes a while)';
    const s = document.createElement('script');
    s.src = 'vendor.js';
    s.onload = () => resolve(window.TG);
    s.onerror = () => reject(new Error('Failed to load vendor.js'));
    document.head.appendChild(s);
  });
  return enginePromise;
}

async function getClient() {
  if (client) return client;
  tg = await loadEngine();
  const saved = localStorage.getItem(SESSION_KEY) || '';
  client = new tg.TelegramClient(
    new tg.StringSession(saved),
    CONFIG.API_ID,
    CONFIG.API_HASH,
    {
      connectionRetries: 5,
      useWSS: true,
      networkSocket: tg.PromisedWebSockets,
      deviceModel: 'MRBD TG Viewer',
      systemVersion: 'web',
      appVersion: '1.0.0',
    }
  );
  await client.connect();
  return client;
}

async function hasSavedSession() {
  return !!localStorage.getItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

function setLoginError(msg) {
  el.error.textContent = msg || '';
}

function showLogin() {
  stopTimers();
  el.app.classList.add('hidden');
  el.loading.classList.add('hidden');
  el.login.classList.remove('hidden');
}

function showApp() {
  el.login.classList.add('hidden');
  el.loading.classList.add('hidden');
  el.app.classList.remove('hidden');
  loadDialogs();
  dlgTimer = setInterval(loadDialogs, 15000);
}

async function boot() {
  if (!(await hasSavedSession())) {
    showLogin();
    return;
  }
  try {
    await getClient();
    showApp();
  } catch (e) {
    showLogin();
    setLoginError('Session expired: ' + e.message);
  }
}

el.btnCode.addEventListener('click', async () => {
  setLoginError('');
  try {
    currentPhone = el.phone.value.trim();
    if (!currentPhone) throw new Error('Enter your phone number');
    el.status.textContent = 'Requesting code from Telegram…';
    const c = await getClient();
    const r = await c.sendCode({ apiId: CONFIG.API_ID, apiHash: CONFIG.API_HASH }, currentPhone);
    phoneCodeHash = r.phoneCodeHash;
    el.status.textContent = 'Code sent — check Telegram on your phone';
    el.code.classList.remove('hidden');
    el.btnConfirm.classList.remove('hidden');
    el.btnCode.classList.add('hidden');
    el.phone.classList.add('hidden');
    el.code.focus();
  } catch (e) {
    el.status.textContent = '';
    setLoginError(e.message);
  }
});

el.btnConfirm.addEventListener('click', async () => {
  setLoginError('');
  try {
    const c = await getClient();

    if (!el.password.classList.contains('hidden')) {
      // 2FA step
      const pwdInfo = await c.invoke(new tg.Api.account.GetPassword());
      const check = await tg.computeCheck(pwdInfo, el.password.value);
      await c.invoke(new tg.Api.auth.CheckPassword({ password: check }));
    } else {
      await c.invoke(
        new tg.Api.auth.SignIn({
          phoneNumber: currentPhone,
          phoneCodeHash,
          phoneCode: el.code.value.trim(),
        })
      );
    }

    localStorage.setItem(SESSION_KEY, client.session.save());
    el.status.textContent = '';
    showApp();
  } catch (e) {
    if (e.message && e.message.includes('SESSION_PASSWORD_NEEDED')) {
      el.code.classList.add('hidden');
      el.password.classList.remove('hidden');
      el.password.focus();
      el.status.textContent = 'Two-factor password required';
      return;
    }
    setLoginError(e.message);
  }
});

// ---------------------------------------------------------------------------
// Contacts rail
// ---------------------------------------------------------------------------

async function loadDialogs() {
  try {
    const c = await getClient();
    const result = await c.getDialogs({ limit: 50 });
    dialogs = result.map((d) => ({
      id: d.id.toString(),
      name: d.name || d.title || 'Unknown',
      unread: d.unreadCount || 0,
    }));
    renderContacts();
    el.chatTitle.textContent =
      dialogs.length || activeChatId ? el.chatTitle.textContent : 'No chats found';
  } catch (e) {
    // Surface fetch errors instead of showing an empty list forever
    if (!dialogs.length) {
      el.chatTitle.textContent = 'Failed to load chats: ' + (e.errorMessage || e.message);
    }
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function initials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || '').join('').toUpperCase() || '?';
}

// Telegram's avatar palette + sender name colors
const AVATAR_COLORS = [
  ['#e17076', '#c94f4f'],
  ['#7bc862', '#57a341'],
  ['#e5ca77', '#c9a94e'],
  ['#65aadd', '#4a8ec2'],
  ['#a695e7', '#7f6ad1'],
  ['#ee7aae', '#d05590'],
  ['#faa774', '#e0854f'],
  ['#6ec9cb', '#4aa7a9'],
];

function colorHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function avatarHtml(name) {
  const [light, dark] = colorHash(name);
  return `
    <div class="avatar" style="background:linear-gradient(150deg, ${light}, ${dark})">
      ${initials(name)}
    </div>`;
}

const SENDER_COLORS = ['#e17076', '#7bc862', '#e5ca77', '#65aadd', '#a695e7', '#ee7aae', '#faa774', '#6ec9cb'];

function senderColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderContacts() {
  el.contactList.innerHTML = '';
  dialogs.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'contact' + (i === activeIndex ? ' selected' : '');
    item.dataset.index = i;
    item.innerHTML = `
      ${avatarHtml(d.name)}
      <div class="name">${escapeHtml(d.name)}</div>
      ${d.unread ? `<div class="badge">${d.unread}</div>` : ''}
    `;
    item.addEventListener('click', () => openChat(i));
    el.contactList.appendChild(item);
  });
  if (!dialogs.length) {
    el.contactList.innerHTML = '<div class="chat-empty"><p>No chats yet</p></div>';
  }
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function openChat(index) {
  if (!dialogs[index]) return;
  activeIndex = index;
  activeChatId = dialogs[index].id;
  el.chatTitle.textContent = dialogs[index].name;
  renderContacts();
  await loadMessages();
  clearInterval(msgTimer);
  msgTimer = setInterval(loadMessages, 3000);
}

function renderMessages(list) {
  if (!list.length) {
    el.messages.innerHTML = `
      <div class="chat-empty">
        <div class="ring">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21.6 3.2 2.9 10.4c-1.1.4-1 1.9.1 2.2l4.6 1.4 1.8 5.5c.3 1 1.6 1.2 2.2.3l2.5-3.2 4.7 3.4c.8.6 2 .2 2.2-.8l3-14c.3-1.3-1.1-2.3-2.4-1.7ZM8.9 13.9l8.9-5.6c.4-.2.7.3.4.6l-7.3 6.6-.3 3-1.7-4.6Z" fill="#8774e1"/>
          </svg>
        </div>
        <p>No messages here yet.<br>Send one below to start the chat.</p>
      </div>`;
    return;
  }

  const parts = [];
  let lastDay = '';
  let prevOut = null;
  list.forEach((m) => {
    const day = new Date(m.date).toDateString();
    if (day !== lastDay) {
      parts.push(`<div class="day-sep">${dayLabel(m.date)}</div>`);
      lastDay = day;
      prevOut = null;
    }
    const first = m.out !== prevOut && prevOut !== null
      ? (m.out ? ' first-out' : ' first-in') : '';
    const sender = !m.out && m.sender
      ? `<div class="sender" style="color:${senderColor(m.sender)}">${escapeHtml(m.sender)}</div>`
      : '';
    parts.push(`
      <div class="msg ${m.out ? 'out' : 'in'}${first}">
        ${sender}
        <div class="text">${escapeHtml(m.text) || '<i>[media]</i>'}</div>
        <div class="time">${fmtTime(m.date)}</div>
      </div>`);
    prevOut = m.out;
  });

  const html = parts.join('');
  const nearBottom =
    el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 120;
  el.messages.innerHTML = html;
  if (nearBottom) el.messages.scrollTop = el.messages.scrollHeight;
}

async function loadMessages() {
  if (!activeChatId) return;
  try {
    const c = await getClient();
    const msgs = await c.getMessages(activeChatId, { limit: 30 });
    const list = [];
    for (const m of msgs) {
      let senderName = '';
      try {
        const s = await m.getSender();
        if (s) {
          senderName =
            [s.firstName, s.lastName].filter(Boolean).join(' ') || s.title || s.username || '';
        }
      } catch (e) { /* sender unavailable */ }
      list.push({
        id: m.id.toString(),
        text: m.message || '',
        out: !!m.out,
        sender: senderName,
        date: (m.date || 0) * 1000,
      });
    }
    renderMessages(list.reverse());
  } catch (e) { /* transient */ }
}

el.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.msgInput.value.trim();
  if (!text || !activeChatId) return;
  try {
    const c = await getClient();
    await c.sendMessage(activeChatId, { message: text });
    el.msgInput.value = '';
    await loadMessages();
  } catch (err) {
    el.chatTitle.textContent = err.message;
  }
});

// ---------------------------------------------------------------------------
// D-pad navigation
// Regions: contacts -> chat -> composer. Left/Right switch regions,
// Up/Down move within a region, Enter (pinch) activates.
// ---------------------------------------------------------------------------

const dp = { region: 'contacts' };

function setRegion(region) {
  dp.region = region;
  el.contactList.classList.toggle('dp-focus', region === 'contacts');
  el.messages.classList.toggle('dp-focus', region === 'chat');
  el.composer.classList.toggle('dp-focus', region === 'composer');
  if (region === 'chat') el.messages.focus();
}

function highlightContact(i) {
  activeIndex = Math.max(0, Math.min(i, dialogs.length - 1));
  renderContacts();
  const sel = el.contactList.children[activeIndex];
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

const REGIONS = ['contacts', 'chat', 'composer'];

document.addEventListener('keydown', (e) => {
  if (!el.app.classList.contains('hidden')) {
    if (document.activeElement === el.msgInput) {
      // typing on the glasses input: let arrows behave natively, Esc exits
      if (e.key === 'Escape') { el.msgInput.blur(); setRegion('composer'); }
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const i = REGIONS.indexOf(dp.region);
      setRegion(REGIONS[(i + dir + REGIONS.length) % REGIONS.length]);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (dp.region === 'contacts') {
        if (activeIndex === -1 && dialogs.length) activeIndex = 0;
        highlightContact((activeIndex === -1 ? 0 : activeIndex) + dir);
      } else if (dp.region === 'chat') {
        el.messages.scrollTop += dir * 120;
      }
    } else if (e.key === 'Enter' && dp.region === 'contacts') {
      e.preventDefault();
      if (activeIndex >= 0) openChat(activeIndex);
    }
  }
});

// ---------------------------------------------------------------------------

function stopTimers() {
  clearInterval(msgTimer);
  clearInterval(dlgTimer);
}

boot();
