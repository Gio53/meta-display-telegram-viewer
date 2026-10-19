# Meta Display Telegram Viewer

A Telegram web client built for **Meta Ray-Ban Display glasses** and for
desktop browsers.

- **Glasses app** (`docs/`, hosted on GitHub Pages) — runs fully client-side
  (MTProto over WebSocket), sized for the 600×600 additive display, with
  D-pad focus navigation for the EMG wristband.
- **Desktop/server viewer** (`server.js`) — the original Express + teleproto
  viewer with QR login, useful on a PC.

**Glasses app URL: https://gio53.github.io/meta-display-telegram-viewer/**

```
┌─────────┬──────────────────────────────┐
│ Contacts│                              │
│   ▼     │            Chat              │
│  [AB]   │                              │
│  Alice  │                              │
│  [CD]   ├──────────────────────────────┤
│  Bob    │        Type Message          │
└─────────┴──────────────────────────────┘
```

## Add it to your glasses

1. Open the **Meta AI app** on your phone
2. Go to **Devices → Display Glasses settings**
3. Navigate to **App connections → Web apps → Add a web app**
4. Enter the name `TG Viewer` and the URL above

On the glasses: sign in once with your Telegram phone number (the login code
arrives in Telegram on your phone — type it with the glasses voice/handwriting
input). The session is stored in the browser's `localStorage`, so you stay
signed in. 2FA is supported.

### Controls (D-pad / EMG wristband)

- **Left / Right** — move between regions: Contacts → Chat → Composer
- **Up / Down** — move through contacts (in Contacts) or scroll (in Chat)
- **Enter (pinch)** — open the selected contact / press Send
- Focus an input to type by voice; **Esc** leaves the input

### Display compliance (per Meta's Web App constraints)

- 600×600 responsive layout, true-black background (black is transparent on
  the additive display)
- Tiny shell first load (~40 KB, 5 requests); the MTProto engine (`vendor.js`)
  is lazy-loaded after first paint — the first load is slow (the glasses link
  is slow), but the browser caches it afterwards
- Arrow-key navigation mirrors D-pad input; Enter activates

## Development

### Glasses app (static, GitHub Pages)

```bash
npm install
npm run build:glasses   # bundles glasses/src + teleproto into docs/
npx node serve-docs.mjs # serve docs/ at http://localhost:4173
```

The bundle aliases Node built-ins to browser shims (`glasses/src/shims`):
`crypto` → WebCrypto entropy, `zlib` → pako inflate, plus stubs for fs/path/net
and friends that only file-upload/proxy code paths would use. API credentials
are written into `docs/config.js` — this is normal for Telegram web clients.

Pushing to `main` is enough: GitHub Pages serves the `docs/` folder.

### Desktop/server viewer (optional, for PC)

1. **Get Telegram API credentials** (free, one minute):
   - Go to <https://my.telegram.org> and log in.
   - Open **API development tools** and create an app.
   - Copy the `api_id` and `api_hash`.

2. **Configure and run:**

   ```bash
   npm install
   copy .env.example .env    # Windows (use `cp` on macOS/Linux)
   # edit .env and paste your TG_API_ID / TG_API_HASH
   npm start
   ```

3. Open `http://localhost:3000`, then scan the QR with
   **Telegram → Settings → Devices → Link Desktop Device**.

## Notes

- The desktop server binds to `0.0.0.0` so devices on your LAN can reach it.
  Keep it on a trusted network — anyone on the LAN could open the UI (it is
  your logged-in Telegram).
- Only text messages are rendered; media shows as `[media]`.
- `.env` and `data/` (session files) are gitignored and never committed.
