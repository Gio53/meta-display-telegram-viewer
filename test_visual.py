"""Visual check: render main screen with fake dialogs/messages, screenshot 600x600."""
from playwright.sync_api import sync_playwright

FAKE_SETUP = """
window.dialogsFake = [
  { id: '1', name: 'Ness', unread: 2 },
  { id: '2', name: 'BotFather', unread: 0 },
  { id: '3', name: 'Gianmarco Rios', unread: 1 },
  { id: '4', name: 'User Info Bot', unread: 0 },
];
window.msgsFake = [
  { text: 'hey dont touch anything but I cant seem to join my server', out: false, sender: 'Ness', date: Date.now() - 86400000 },
  { text: "The server's up and running. Hit refresh in your multiplayer list — it just needs a nudge.", out: true, sender: '', date: Date.now() - 86300000 },
  { text: 'working I was spamming refresh until I saw it pinged thanks', out: true, sender: '', date: Date.now() - 3600000 },
  { text: 'Tailscale IP refreshes sometimes — spamming refresh was the right move. Glad you are back in!', out: false, sender: 'Ness', date: Date.now() - 3500000 },
  { text: '/pc', out: true, sender: '', date: Date.now() - 60000 },
  { text: 'Waking DESKTOP-GHHR8M7. WoL magic packet sent to 192.168.1.255:9 (MAC D4:5D:64:50:C4:9B). Give it ~30-60s to boot.', out: false, sender: 'Ness', date: Date.now() - 30000 },
];
"""

INJECT = """
document.getElementById('login').classList.add('hidden');
document.getElementById('app').classList.remove('hidden');
document.getElementById('loading').classList.add('hidden');
document.getElementById('chat-title').textContent = 'Ness';
const cl = document.getElementById('contact-list');
cl.innerHTML = '';
window.dialogsFake.forEach((d, i) => {
  const item = document.createElement('div');
  item.className = 'contact' + (i === 0 ? ' selected' : '');
  const h = 0; let hh = 0;
  for (let k = 0; k < d.name.length; k++) hh = (hh * 31 + d.name.charCodeAt(k)) >>> 0;
  item.innerHTML = `<div class="avatar" style="background:linear-gradient(150deg,#65aadd,#4a8ec2)">${d.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
    <div class="name">${d.name}</div>
    ${d.unread ? `<div class="badge">${d.unread}</div>` : ''}`;
  cl.appendChild(item);
});
const msgs = document.getElementById('messages');
let html = '<div class="day-sep">Yesterday</div>';
html += `
 <div class="msg in"><div class="sender" style="color:#65aadd">Ness</div><div class="text">hey dont touch anything but I cant seem to join my server</div><div class="time">09:31</div></div>
 <div class="msg out first-in"><div class="text">The server's up and running. Hit refresh in your multiplayer list — it just needs a nudge.</div><div class="time">09:33</div></div>
 <div class="day-sep">Today</div>
 <div class="msg out"><div class="text">working I was spamming refresh until I saw it pinged thanks</div><div class="time">12:29</div></div>
 <div class="msg in"><div class="sender" style="color:#65aadd">Ness</div><div class="text">Tailscale IP refreshes sometimes — spamming refresh was the right move. Glad you are back in!</div><div class="time">12:30</div></div>
 <div class="msg out first-out"><div class="text">/pc</div><div class="time">12:30</div></div>
 <div class="msg in"><div class="sender" style="color:#65aadd">Ness</div><div class="text">Waking DESKTOP-GHHR8M7. WoL magic packet sent to 192.168.1.255:9 (MAC D4:5D:64:50:C4:9B). Give it ~30-60s to boot.</div><div class="time">12:30</div></div>`;
msgs.innerHTML = html;
"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 600, "height": 600})
    page.goto("http://localhost:4173")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)  # let boot() settle, then force main view
    page.evaluate(FAKE_SETUP + INJECT)
    page.wait_for_timeout(300)
    page.screenshot(path="shot_main.png")

    # login screen too
    page2 = b.new_page(viewport={"width": 600, "height": 600})
    page2.goto("http://localhost:4173")
    page2.wait_for_load_state("networkidle")
    page2.screenshot(path="shot_login.png")
    b.close()
