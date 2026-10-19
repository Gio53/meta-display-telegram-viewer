require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { TelegramClient, Api } = require('teleproto');
const { StringSession } = require('teleproto/sessions');
const { computeCheck } = require('teleproto/Password');

const API_ID = parseInt(process.env.TG_API_ID, 10);
const API_HASH = process.env.TG_API_HASH;
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'session.txt');

if (!API_ID || !API_HASH) {
  console.error('\nMissing Telegram API credentials.');
  console.error('Copy .env.example to .env and fill in TG_API_ID and TG_API_HASH');
  console.error('Get them free at https://my.telegram.org (API development tools)\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Telegram client
// ---------------------------------------------------------------------------

fs.mkdirSync(DATA_DIR, { recursive: true });

const savedSession = fs.existsSync(SESSION_FILE)
  ? fs.readFileSync(SESSION_FILE, 'utf8').trim()
  : '';

const client = new TelegramClient(new StringSession(savedSession), API_ID, API_HASH, {
  connectionRetries: 5,
});

function saveSession() {
  fs.writeFileSync(SESSION_FILE, client.session.save());
}
function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

const state = {
  status: 'logged-out', // logged-out | qr-pending | code-sent | need-password | authorized
  me: null,
  error: null,
};

let phoneCodeHash = null;

async function authorize() {
  const me = await client.getMe();
  state.me = {
    id: me.id.toString(),
    name: [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username,
    username: me.username || null,
    phone: me.phone || null,
  };
  state.status = 'authorized';
  saveSession();
  console.log('Logged in as', state.me.name);
}

async function start() {
  if (savedSession.length > 0) {
    try {
      await client.connect();
      if (await client.checkAuthorization()) {
        await authorize();
      } else {
        clearSession();
        state.status = 'logged-out';
      }
    } catch (err) {
      console.error('Could not restore previous session:', err.message);
      state.status = 'logged-out';
    }
  }
}

start();

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (state.status !== 'authorized') {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function publicState() {
  return { status: state.status, me: state.me, error: state.error };
}

app.get('/api/session', (req, res) => {
  res.json(publicState());
});

// ---- QR login (recommended: scan from the Telegram app on your phone) -----

async function exportLoginToken() {
  return client.invoke(
    new Api.auth.ExportLoginToken({ apiId: API_ID, apiHash: API_HASH, exceptIds: [] })
  );
}

async function finishLogin(authorization, res) {
  try {
    await authorize();
    res.json(publicState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/login/qr/start', async (req, res) => {
  try {
    await client.connect();
    const result = await exportLoginToken();

    if (result instanceof Api.auth.LoginTokenSuccess) {
      return finishLogin(result.authorization, res);
    }

    const token = Buffer.from(result.token).toString('base64url');
    const url = 'tg://login?token=' + token;
    const qr = await QRCode.toDataURL(url, { width: 512, margin: 2 });

    state.status = 'qr-pending';
    state.error = null;
    res.json({ status: 'qr-pending', qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/login/qr/status', async (req, res) => {
  if (state.status === 'authorized') return res.json(publicState());
  try {
    const result = await exportLoginToken();

    if (result instanceof Api.auth.LoginToken) {
      return res.json({ status: 'qr-pending' });
    }
    if (result instanceof Api.auth.LoginTokenSuccess) {
      return finishLogin(result.authorization, res);
    }
    if (result instanceof Api.auth.LoginTokenMigrateTo) {
      await client._switchDC(result.dcId);
      const imported = await client.invoke(
        new Api.auth.ImportLoginToken({ token: result.token })
      );
      if (imported instanceof Api.auth.LoginTokenSuccess) {
        return finishLogin(imported.authorization, res);
      }
      return res.json({ status: 'qr-pending' });
    }
    if (result instanceof Api.auth.LoginTokenExpired) {
      state.status = 'logged-out';
      return res.json({ status: 'expired' });
    }
    res.json({ status: 'qr-pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Phone number login (fallback) ----------------------------------------

app.post('/api/login/phone', async (req, res) => {
  try {
    await client.connect();
    const phone = String(req.body.phone || '').trim();
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    phoneCodeHash = result.phoneCodeHash;
    state.status = 'code-sent';
    res.json({ status: 'code-sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login/code', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    if (!code || !phoneCodeHash) return res.status(400).json({ error: 'Code required' });

    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: req.body.phone,
        phoneCodeHash,
        phoneCode: code,
      })
    );
    await authorize();
    res.json(publicState());
  } catch (err) {
    if (err.message && err.message.includes('SESSION_PASSWORD_NEEDED')) {
      state.status = 'need-password';
      return res.json({ status: 'need-password' });
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/login/password', async (req, res) => {
  try {
    const password = String(req.body.password || '');
    const pwdInfo = await client.invoke(new Api.account.GetPassword());
    const check = await computeCheck(pwdInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: check }));
    await authorize();
    res.json(publicState());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Chat data -------------------------------------------------------------

app.post('/api/logout', async (req, res) => {
  try {
    await client.invoke(new Api.auth.LogOut());
  } catch (err) {
    // ignore — clearing local state regardless
  }
  clearSession();
  state.status = 'logged-out';
  state.me = null;
  res.json(publicState());
});

app.get('/api/dialogs', requireAuth, async (req, res) => {
  try {
    const dialogs = await client.getDialogs({ limit: 50 });
    const list = dialogs.map((d) => ({
      id: d.id.toString(),
      name: d.name || d.title || 'Unknown',
      isUser: d.isUser,
      isGroup: d.isGroup,
      isChannel: d.isChannel,
      lastMessage: d.message ? d.message.message || '[media]' : '',
      lastDate: d.date ? d.date * 1000 : null,
      unread: d.unreadCount || 0,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '');
    if (!chatId) return res.status(400).json({ error: 'chatId required' });

    const msgs = await client.getMessages(chatId, { limit: 50 });
    const list = [];
    for (const m of msgs) {
      let senderName = '';
      try {
        const s = await m.getSender();
        if (s) {
          senderName =
            [s.firstName, s.lastName].filter(Boolean).join(' ') || s.title || s.username || '';
        }
      } catch (e) {
        senderName = '';
      }
      list.push({
        id: m.id.toString(),
        text: m.message || '',
        out: !!m.out,
        sender: senderName,
        date: (m.date || 0) * 1000,
      });
    }
    list.reverse(); // oldest first for display
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send', requireAuth, async (req, res) => {
  try {
    const { chatId, text } = req.body;
    if (!chatId || !text) return res.status(400).json({ error: 'chatId and text required' });
    await client.sendMessage(chatId, { message: String(text) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  console.log(`Meta Display Telegram Viewer running at http://${HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log('On your glasses/phone browser, use http://<this-pc-ip>:' + PORT);
  }
});
