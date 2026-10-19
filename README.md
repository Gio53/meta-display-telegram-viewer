# Meta Display Telegram Viewer

A Telegram web client designed for the tiny, monocular display of Meta
Ray-Ban Display glasses: a narrow **Contacts** rail on the left, a large
**Chat** panel, and a **Type Message** bar at the bottom — all dark,
high-contrast, and oversized so it stays readable through the glasses.

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

## How you connect your account from the glasses

The app talks to Telegram directly via MTProto (teleproto, the maintained
GramJS fork). You link your
account by scanning a **QR code** — no password ever passes through this
server:

1. Open the app on your glasses / paired phone browser.
2. Telegram on your phone → **Settings → Devices → Link Desktop Device**.
3. Scan the QR shown by the app. Done — the session is saved on the server
   and persists across restarts.

A phone-number + code login (with 2FA support) is included as a fallback.

## Setup

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

3. **Open it on your glasses:**
   - On the same Wi-Fi as this PC, open `http://<this-pc-ip>:3000` in a
     browser on the phone/device paired with your glasses.
   - Find your PC IP with `ipconfig` (look for IPv4 Address, e.g.
     `http://192.168.1.42:3000`).

## Features

- QR-code login (session persisted in `data/session.txt`, gitignored)
- Contact rail with unread badges; arrow-key navigation (↑/↓ to move,
  Enter to open) for hands-free/voice-pointer control
- Live chat: messages poll every 2.5 s, send works instantly
- Phone-number login fallback with 2FA password support
- Dark, high-contrast UI sized for a small monocular display

## Notes

- The server binds to `0.0.0.0` so devices on your LAN can reach it. Keep
  it on a trusted network — anyone on the LAN could open the UI (it is
  your logged-in Telegram).
- Deploying publicly (Render/Railway/Fly): set `TG_API_ID`, `TG_API_HASH`,
  and keep `data/` on a persistent disk, since it holds your session.
- Only text messages are rendered; media shows as `[media]`.
