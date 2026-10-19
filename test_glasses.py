"""Smoke-test the glasses webapp at 600x600 with step-level timeouts."""
from playwright.sync_api import sync_playwright

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 600, "height": 600})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto("http://localhost:4173")
    page.wait_for_load_state("networkidle")
    print("login screen visible:", page.locator("#login").is_visible())
    page.screenshot(path="shot_login.png")

    ok = page.evaluate(
        """async () => {
            const step = (m) => console.log('[test] ' + m);
            const withTimeout = (p, ms, label) => Promise.race([
                p,
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + label)), ms)),
            ]);
            try {
                step('loading vendor.js');
                await withTimeout(new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'vendor.js';
                    s.onload = res; s.onerror = () => rej(new Error('vendor.js failed to load'));
                    document.head.appendChild(s);
                }), 60000, 'vendor load');
                if (!window.TG) return 'window.TG missing';
                step('vendor loaded, creating client');
                const client = new TG.TelegramClient(
                    new TG.StringSession(''),
                    window.CONFIG.API_ID,
                    window.CONFIG.API_HASH,
                    { connectionRetries: 1, useWSS: true, networkSocket: TG.PromisedWebSockets,
                      timeout: 15 }
                );
                step('connecting…');
                await withTimeout(client.connect(), 30000, 'connect');
                step('connect() resolved, connected=' + client.connected);
                const connected = client.connected;
                try { await client.disconnect(); } catch (e) {}
                return connected ? 'CONNECTED' : 'NOT CONNECTED';
            } catch (e) {
                return 'ERROR: ' + (e && e.message ? e.message : String(e));
            }
        }"""
    )
    print("MTProto connection:", ok)

    if errors:
        print("console errors:")
        for e in errors[:10]:
            print("  -", e[:300])
    else:
        print("no console errors")

    browser.close()
