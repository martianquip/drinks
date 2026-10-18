// Loader for the key-link build (scripts/export_sealed.py). The key arrives in the link (#key=…), which browsers never
// send to the server, so GitHub only ever serves ciphertext. The app scripts start after the data is decrypted.
'use strict';
(async () => {
  const me = document.currentScript, main = document.getElementById('main');
  const say = text => { main.innerHTML = `<p class="notice">${text}</p>`; };
  const AAD = 'MARTIANQUIP-drinks:v1:';
  const fromLink = location.hash.match(/key=([A-Za-z0-9_-]{43})/)?.[1];
  let key = fromLink;
  try { if (fromLink) localStorage.setItem('st.key', fromLink); else key = localStorage.getItem('st.key'); } catch { /* private mode: link only */ }
  if (fromLink) history.replaceState(null, '', location.pathname + location.search + '#/');  // the app routes on the hash
  if (!key) {
    addEventListener('hashchange', () => { if (/key=/.test(location.hash)) location.reload(); });  // key link pasted into this tab
    return say('키가 들어 있는 링크로 열어 주세요.');
  }

  const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const open = async name => {
    let res = await fetch(`data/${name}.bin`);
    if (!res.ok) res = await fetch(`data/${name}.bin`);  // GitHub Pages sometimes answers a burst of requests with 503
    if (!res.ok) throw Error(`missing ${name}`);
    const box = new Uint8Array(await res.arrayBuffer());
    return crypto.subtle.decrypt({name: 'AES-GCM', iv: box.slice(0, 12), additionalData: new TextEncoder().encode(AAD + name)}, aes, box.slice(12));
  };

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(await open(me.dataset.file))); } catch {
    try { localStorage.removeItem('st.key'); } catch { /* nothing stored */ }
    return say('링크의 키가 맞지 않아요. 받은 링크를 다시 열어 주세요.');
  }
  // The first screen (40 newest reviews) waits for its photos; the rest open in the background and show up on the next render.
  // shortcut: every photo is still fetched on the first visit (about 10MB); move to a service worker if the archive grows a lot.
  const items = payload.drinks.items.filter(i => i.photo).sort((a, b) => (a.published < b.published ? 1 : -1));
  const reveal = async i => {
    const name = i.photo;
    i.photo = '';
    try { i.photo = URL.createObjectURL(new Blob([await open(name)], {type: 'image/jpeg'})); } catch { /* card shows its placeholder */ }
  };
  say('사진 여는 중…');
  await Promise.all(items.slice(0, 40).map(reveal));
  items.slice(40).forEach(reveal);
  for (const i of payload.drinks.items) {  // extra photos of multi-product posts; only their detail pages show them
    const names = i.gallery || [];
    i.gallery = names.map(() => '');
    names.forEach((name, n) => open(name).then(b => { i.gallery[n] = URL.createObjectURL(new Blob([b], {type: 'image/jpeg'})); }, () => {}));
  }

  Object.assign(window, {DRINKS: payload.drinks, BOARD_SEED: payload.seed, SEALED: true});
  for (const src of me.dataset.load.split(' ')) {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
  }
})().catch(() => { document.getElementById('main').innerHTML = '<p class="notice">앱을 열지 못했어요. 새로고침해 주세요.</p>'; });
