// Globals that whisky-tree.js and tier-maker.js (copied unchanged from the atlas app) expect from the atlas shell.
// The atlas saves boards on its server; here each browser keeps its own copy, seeded from boards-seed.js.
'use strict';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const safeImage = v => (typeof v === 'string' && /^(https:\/\/|assets\/|blob:)/.test(v) ? v : '');  // blob: = photos opened by sealed.js
const archiveGroups = window.DRINKS.style_groups;
const archiveClassification = r => ({group: '', subtype: r.style});
if (!crypto.randomUUID) crypto.randomUUID = () => Date.now().toString(36) + Math.random().toString(36).slice(2);  // file:// has no secure context

let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('p'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}

const BOARD_KEYS = {'/api/whisky-tree': ['st.whiskyTree', 'whisky'], '/api/tier-maker': ['st.tierMaker', 'tier']};
async function api(path, opts = {}) {
  const [key, seed] = BOARD_KEYS[path];
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = null; }
  const current = saved || {revision: 0, document: JSON.parse(JSON.stringify(window.BOARD_SEED[seed]))};
  if (!opts.method) return current;
  const body = JSON.parse(opts.body);
  if (body.revision !== current.revision) throw Error('다른 탭에서 보드가 바뀌었어요. JSON으로 내보낸 뒤 저장본을 불러오세요.');
  const next = {revision: current.revision + 1, document: body.document};
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { throw Error('이 브라우저에 저장할 수 없어요. JSON으로 내보내 백업하세요.'); }
  return {revision: next.revision};
}

// Restores a file saved with the board's own "JSON" export button (the modules only export).
async function importBoards(path, text) {
  let doc;
  try { const parsed = JSON.parse(text); doc = parsed.document || parsed; } catch { throw Error('JSON 파일을 읽지 못했어요.'); }
  const version = {'/api/whisky-tree': 3, '/api/tier-maker': 1}[path];
  if (doc?.version !== version || !Array.isArray(doc.boards) || !doc.boards.length) throw Error('이 화면의 백업 파일이 아니에요. 위스키 트리와 티어 메이커 백업은 서로 바꿔 쓸 수 없어요.');
  // the shape the modules read (same rules as the atlas server's validators), so a bad file never replaces good boards
  const text1 = v => typeof v === 'string' && v.trim() !== '';
  const board = path === '/api/tier-maker'
    ? b => text1(b?.id) && text1(b.name) && ['S', 'A', 'B', 'C', 'D'].every(r => Array.isArray(b.tiers?.[r]) && b.tiers[r].every(text1))
    : b => text1(b?.id) && text1(b.name) && Array.isArray(b.columns) && b.columns.every(c => text1(c?.id) && text1(c.name))
      && Array.isArray(b.levels) && b.levels.length === 6 && b.levels.every(l => typeof l?.name === 'string')
      && Array.isArray(b.nodes) && b.nodes.every(n => text1(n?.review_id) && b.columns.some(c => c.id === n.column_id)
        && Number.isInteger(n.level) && n.level >= 0 && n.level < 6 && Number.isInteger(n.slot) && n.slot >= 0 && n.slot < 10
        && (n.lineup == null || typeof n.lineup === 'string'));
  if (typeof doc.labels !== 'object' || doc.labels === null || !Object.values(doc.labels).every(text1)
    || !Array.isArray(doc.recommended ?? []) || !(doc.recommended ?? []).every(text1) || !doc.boards.every(board)) {
    throw Error('백업 파일 내용이 손상됐어요. 지금 보드는 그대로 두었어요.');
  }
  doc.recommended ??= [];
  const {revision} = await api(path);
  await api(path, {method: 'POST', body: JSON.stringify({revision, document: doc})});
}

// drink-tree items in the atlas record shape the two modules read.
function boardRecords() {
  let ratings = {};
  try { ratings = JSON.parse(localStorage.getItem('st.ratings')) || {}; } catch { ratings = {}; }
  const smoke = window.DRINKS.families.find(f => /피트/.test(f)) || '';
  return window.DRINKS.items.map(i => ({
    id: i.id, name: i.name, english: i.english, published: i.published, price: i.price, style: i.style,
    category: i.group, is_collection: i.is_collection, rating: ratings[i.id] ? {score: ratings[i.id].score} : null,
    catalog: {
      photo_url: i.photo, country: i.country, origin: i.country === '스코틀랜드' ? '스카치' : '', distillery: i.producer.name, sample_type: i.sample_type,
      primary_type: /에너지드링크/.test(i.style) ? '에너지드링크' : i.style,
      // shortcut: "peated" = non-US whisky with a smoke·peat score of 2+; switch to a real peat field if one is added.
      subtypes: i.group === '위스키' && i.country !== '미국' && (window.Engine.vector(i)[smoke] ?? 0) >= 2 ? ['피티드'] : [],  // bourbon char reads smoky but is not peat
    },
  }));
}
