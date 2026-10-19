"""Reproduce the getDialogs failure in a browser:
connect with an empty (unauthorized) session and call getDialogs.
Expected: an RPC error like AUTH_KEY_UNREGISTERED.
Bug: a TypeError from the bundle/shims would show up instead.
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 600, "height": 600})
    page.on("console", lambda m: print("[console]", m.type, m.text[:300]))
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
            const client = new TG.TelegramClient(
                new TG.StringSession(''), window.CONFIG.API_ID, window.CONFIG.API_HASH,
                { connectionRetries: 1, useWSS: true, networkSocket: TG.PromisedWebSockets, timeout: 15 }
            );
            await withTimeout(client.connect(), 30000, 'connect');
            try {
                const dialogs = await withTimeout(client.getDialogs({ limit: 10 }), 30000, 'getDialogs');
                return 'UNEXPECTED SUCCESS: ' + dialogs.length + ' dialogs';
            } catch (e) {
                return 'getDialogs error: ' + (e && (e.errorMessage || e.message) || String(e));
            }
        }"""
    )
    print("RESULT:", result)
    b.close()
