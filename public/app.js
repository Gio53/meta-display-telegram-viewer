/* Meta Display Telegram Viewer — frontend logic */

const $ = (id) => document.getElementById(id);

const el = {
  loginOverlay: $('login-overlay'),
  loginQrView: $('login-qr-view'),
  loginPhoneView: $('login-phone-view'),
  qrImg: $('qr-img'),
  qrStatus: $('qr-status'),
  btnQrRefresh: $('btn-qr-refresh'),
  btnShowPhone: $('btn-show-phone'),
  phoneInput: $('phone-input'),
  btnSendCode: $('btn-send-code'),
  codeRow: $('code-row'),
  codeInput: $('code-input'),
  btnConfirmCode: $('btn-confirm-code'),
  passwordRow: $('password-row'),
  passwordInput: $('password-input'),
  btnConfirmPassword: $('btn-confirm-password'),
  loginError: $('login-error'),
  app: $('app'),
  contactList: $('contact-list'),
  chatTitle: $('chat-title'),
  chatStatus: $('chat-status'),
  messages: $('messages'),
  composer: $('composer'),
  msgInput: $('msg-input'),
  btnLogout: $('btn-logout'),
};

let currentPhone = '';
let activeChatId = null;
let dialogs = [];
let lastMessageHtml = '';
let messageTimer = null;
let dialogTimer = null;
let qrTimer = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showLogin() {
  el.loginOverlay.classList.remove('hidden');
  el.app.classList.add('hidden');
  stopTimers();
}

function showApp() {
  el.loginOverlay.classList.add('hidden');
  el.app.classList.remove('hidden');
  loadDialogs();
  dialogTimer = setInterval(loadDialogs, 10000);
}

function stopTimers() {
  clearInterval(messageTimer);
  clearInterval(dialogTimer);
  clearTimeout(qrTimer);
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function initials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || '').join('').toUpperCase() || '?';
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

async function checkSession() {
  try {
    const s = await api('/api/session');
    if (s.status === 'authorized') {
      showApp();
    } else {
      showLogin();
      startQrLogin();
    }
  } catch (e) {
    showLogin();
  }
}

async function startQrLogin() {
  el.loginError.textContent = '';
  el.qrStatus.textContent = 'Waiting for scan…';
  try {
    const data = await api('/api/login/qr/start', { method: 'POST' });
    if (data.status === 'authorized') return showApp();
    el.qrImg.src = data.qr;
    pollQrStatus();
  } catch (e) {
    el.loginError.textContent = e.message;
  }
}

async function pollQrStatus() {
  clearTimeout(qrTimer);
  try {
    const data = await api('/api/login/qr/status');
    if (data.status === 'authorized') return showApp();
    if (data.status === 'expired') {
      el.qrStatus.textContent = 'QR expired — refreshing…';
      return setTimeout(startQrLogin, 1500);
    }
  } catch (e) {
    // transient network/API errors: keep polling
  }
  qrTimer = setTimeout(pollQrStatus, 2000);
}

el.btnQrRefresh.addEventListener('click', startQrLogin);

el.btnShowPhone.addEventListener('click', () => {
  el.loginPhoneView.classList.toggle('hidden');
});

el.btnSendCode.addEventListener('click', async () => {
  el.loginError.textContent = '';
  try {
    currentPhone = el.phoneInput.value.trim();
    await api('/api/login/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone }),
    });
    el.codeRow.classList.remove('hidden');
    el.codeInput.focus();
  } catch (e) {
    el.loginError.textContent = e.message;
  }
});

el.btnConfirmCode.addEventListener('click', async () => {
  el.loginError.textContent = '';
  try {
    const s = await api('/api/login/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, code: el.codeInput.value.trim() }),
    });
    if (s.status === 'authorized') return showApp();
    if (s.status === 'need-password') el.passwordRow.classList.remove('hidden');
  } catch (e) {
    el.loginError.textContent = e.message;
  }
});

el.btnConfirmPassword.addEventListener('click', async () => {
  el.loginError.textContent = '';
  try {
    const s = await api('/api/login/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: el.passwordInput.value }),
    });
    if (s.status === 'authorized') showApp();
  } catch (e) {
    el.loginError.textContent = e.message;
  }
});

// ---------------------------------------------------------------------------
// Contacts rail
// ---------------------------------------------------------------------------

async function loadDialogs() {
  try {
    dialogs = await api('/api/dialogs');
    renderContacts();
  } catch (e) {
    if (e.message && e.message.includes('Not logged in')) {
      showLogin();
      startQrLogin();
    }
  }
}

function renderContacts() {
  el.contactList.innerHTML = '';
  dialogs.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'contact' + (d.id === activeChatId ? ' active' : '');
    item.setAttribute('role', 'option');
    item.innerHTML = `
      <div class="avatar">${initials(d.name)}</div>
      <div class="name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
      ${d.unread ? `<div class="badge">${d.unread}</div>` : ''}
    `;
    item.addEventListener('click', () => selectChat(d.id));
    el.contactList.appendChild(item);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

async function selectChat(chatId) {
  activeChatId = chatId;
  const d = dialogs.find((x) => x.id === chatId);
  el.chatTitle.textContent = d ? d.name : 'Chat';
  renderContacts();
  await loadMessages();
  clearInterval(messageTimer);
  messageTimer = setInterval(loadMessages, 2500);
  el.msgInput.focus();
}

function renderMessages(list) {
  const html = list
    .map((m) => {
      const sender = !m.out && m.sender ? `<div class="sender">${escapeHtml(m.sender)}</div>` : '';
      return `
        <div class="msg ${m.out ? 'out' : 'in'}">
          ${sender}
          <div class="text">${escapeHtml(m.text) || '<i>[media]</i>'}</div>
          <div class="time">${fmtTime(m.date)}</div>
        </div>`;
    })
    .join('');

  // Only scroll when content actually changed, so reading position is kept
  if (html !== lastMessageHtml) {
    const nearBottom =
      el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 120;
    el.messages.innerHTML = html;
    if (nearBottom || lastMessageHtml === '') {
      el.messages.scrollTop = el.messages.scrollHeight;
    }
    lastMessageHtml = html;
  }
}

async function loadMessages() {
  if (!activeChatId) return;
  try {
    const list = await api('/api/messages?chatId=' + encodeURIComponent(activeChatId));
    renderMessages(list);
    el.chatStatus.textContent = list.length + ' messages';
  } catch (e) {
    el.chatStatus.textContent = e.message;
  }
}

el.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.msgInput.value.trim();
  if (!text || !activeChatId) return;
  try {
    await api('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: activeChatId, text }),
    });
    el.msgInput.value = '';
    await loadMessages();
  } catch (err) {
    el.chatStatus.textContent = err.message;
  }
});

// ---------------------------------------------------------------------------
// Keyboard navigation (handy for glasses one-hand / voice-pointer control)
// ArrowUp/ArrowDown move through contacts, Enter opens the selected one
// ---------------------------------------------------------------------------

let contactIndex = -1;

document.addEventListener('keydown', (e) => {
  if (el.app.classList.contains('hidden') || !dialogs.length) return;
  if (document.activeElement === el.msgInput || document.activeElement === el.phoneInput) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    contactIndex = e.key === 'ArrowDown'
      ? Math.min(contactIndex + 1, dialogs.length - 1)
      : Math.max(contactIndex - 1, 0);
    const items = el.contactList.querySelectorAll('.contact');
    items.forEach((n, i) => n.classList.toggle('active', i === contactIndex));
    if (items[contactIndex]) items[contactIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && contactIndex >= 0 && dialogs[contactIndex]) {
    selectChat(dialogs[contactIndex].id);
  }
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

el.btnLogout.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (e) { /* ignore */ }
  activeChatId = null;
  lastMessageHtml = '';
  el.messages.innerHTML = '';
  el.chatTitle.textContent = 'Select a contact';
  showLogin();
  startQrLogin();
});

// ---------------------------------------------------------------------------

checkSession();
