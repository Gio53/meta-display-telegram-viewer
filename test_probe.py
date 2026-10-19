"""Verify unionId fixed and getDialogs reaches Telegram (expect AUTH_KEY_UNREGISTERED)."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 600, "height": 600})
    page.on("pageerror", lambda e: print("[pageerror]", str(e)[:300]))
    page.goto("http://localhost:4173")
    page.wait_for_load_state("networkidle")

    result = page.evaluate(
        """async () => {
            const withTimeout = (p, ms, label) => Promise.race([
                p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + label)), ms)),
            ]);
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'vendor.js'; s.onload = res;
                s.onerror = () => rej(new Error('vendor load failed'));
                document.head.appendChild(s);
            });
            const out = {};
            out.unionId = TG.Helpers.unionId('InputPeer');
            out.unionIdOk = out.unionId === 3374092470;
            try {
                TG.Utils.getInputPeer(new TG.Api.InputPeerEmpty());
                out.getInputPeer = 'ok';
            } catch (e) { out.getInputPeer = 'THREW: ' + e.message; }
            const client = new TG.TelegramClient(
                new TG.StringSession(''), window.CONFIG.API_ID, window.CONFIG.API_HASH,
                { connectionRetries: 1, useWSS: true, networkSocket: TG.PromisedWebSockets, timeout: 15 }
            );
            await withTimeout(client.connect(), 30000, 'connect');
            try {
                const d = await withTimeout(client.getDialogs({ limit: 10 }), 30000, 'getDialogs');
                out.getDialogs = 'UNEXPECTED SUCCESS: ' + d.length;
            } catch (e) {
                out.getDialogs = (e && (e.errorMessage || e.message)) || String(e);
            }
            return out;
        }"""
    )
    print(result)
    b.close()
