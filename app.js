'use strict';
// 마시는 큅 Sip Tree — card layout after the original Taste Atlas:
// 리뷰 서재 / 취향 추천(리스트·트리) / 별점 기록 / 나란히 비교 / 방문 통계 / 증류소별 제품 트리.
// No server: personal ratings, compare picks and visit counts live in this browser's localStorage.
(function () {
  const D = window.DRINKS, E = window.Engine;
  const items = D.items;
  const byId = new Map(items.map(i => [i.id, i]));
  const scored = items.filter(i => !i.is_collection);
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const won = v => (Number.isFinite(v) ? `${v.toLocaleString('ko-KR')}원` : null);
  const num = (v, u, d = 1) => (Number.isFinite(v) ? `${v.toLocaleString('ko-KR', {maximumFractionDigits: d})}${u}` : null);
  const ko = (a, b) => String(a).localeCompare(String(b), 'ko');
  const announce = t => { const l = $('#live'); l.textContent = ''; requestAnimationFrame(() => { l.textContent = t; }); };
  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

  const STAGES = [['n', 'N', '향'], ['p', 'P', '맛'], ['f', 'F', '여운']];
  const GRAINS = [['corn', '옥수수'], ['rye', '호밀'], ['wheat', '밀'], ['malt', '맥아']];
  const COLORS = ['var(--green)', 'var(--amber)', '#5a7d91', '#9a6b45'];
  const CAT_COLOR = {위스키: '#c68451', 전통주: '#5a7d91', 와인: '#a4596b', '기타 주류': '#b8a04a', 카페인: '#6f8f5a', 소다: '#4f9aa8', '기타 글': '#8a8f88'};
  const ICON = {
    lib: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    rec: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    ratings: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    compare: '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    distill: '<circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 6v5M12 11 5 17M12 11l7 6"/>',
    tier: '<path d="M3 5h4M3 12h4M3 19h4M10 5h11M10 12h7M10 19h4"/>',
  };
  const PAGES = [['lib', '#/', '리뷰 서재'], ['rec', '#/rec', '취향 추천'], ['ratings', '#/ratings', '별점 기록'],
    ['compare', '#/compare', '나란히 비교'], ['stats', '#/stats', '방문 통계'], ['distill', '#/distill', '위스키 트리'], ['tier', '#/tier', '티어 메이커']];
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

  // ---------- browser storage (conveniences; the app works without it) ----------
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const keep = key => new Set((store.get(key, []) || []).filter(id => byId.has(id)));
  const S = {
    filter: 'all', q: '', sort: 'newest', view: store.get('st.view', 'grid'), shown: 40, facets: {},
    liked: keep('st.liked'), disliked: keep('st.disliked'), compare: [...keep('st.compare')].slice(0, 4),
    ratings: store.get('st.ratings', {}) || {}, recMode: 'similar', recTab: 'list', sameGroup: true,
    stage: 'all', cmpStage: 'all', tree: null,
  };
  const save = () => [store.set('st.liked', [...S.liked]), store.set('st.disliked', [...S.disliked]),
    store.set('st.compare', S.compare), store.set('st.ratings', S.ratings)].every(Boolean);

  addEventListener('storage', e => {
    if (!['st.liked', 'st.disliked', 'st.compare', 'st.ratings'].includes(e.key)) return;
    Object.assign(S, {liked: keep('st.liked'), disliked: keep('st.disliked'), compare: [...keep('st.compare')].slice(0, 4), ratings: store.get('st.ratings', {}) || {}});
    if (route().page !== 'ratings') render();  // redrawing the rating form would throw away an unsaved draft
  });

  // ---------- visit log (this browser only) ----------
  function logView(page) {
    const v = store.get('st.visits', null) || {first: today(), days: {}};
    const d = (v.days[today()] ||= {views: 0, pages: {}, visit: 0});
    let fresh = false;
    try { fresh = !sessionStorage.getItem('st.session'); sessionStorage.setItem('st.session', '1'); } catch { fresh = false; }
    if (fresh) d.visit += 1;
    d.views += 1;
    d.pages[page] = (d.pages[page] || 0) + 1;
    store.set('st.visits', v);
  }
  const visits = () => store.get('st.visits', null) || {first: today(), days: {}};

  // ---------- shared pieces ----------
  const photo = (i, cls = '') => (i.photo
    ? `<img ${cls ? `class="${cls}"` : ''} src="${esc(i.photo)}" alt="" loading="lazy" decoding="async" onerror="this.outerHTML='<span class=&quot;ph ${cls}&quot;>사진 오류</span>'">`
    : `<span class="ph ${cls}">사진 없음</span>`);
  const tops = (i, n = 3) => (i.is_collection ? '' : E.topFamilies(i, n).map(([f]) => `<span class="tag">${esc(f)}</span>`).join(''));
  const sub = i => [i.style, num(i.abv, '%')].filter(Boolean).join(' · ');
  const myScore = i => S.ratings[i.id]?.score ?? null;
  const avgIntensity = i => { const v = STAGES.map(([s]) => i.npf[s].i).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  function card(i, extra = '') {
    const inCmp = S.compare.includes(i.id), liked = S.liked.has(i.id);
    return `<li class="card-item"><a href="#/item/${esc(i.id)}">
        <span class="card-photo">${photo(i)}</span>
        ${i.is_collection ? `<span class="card-flag">${esc(i.style)} 글</span>` : ''}${myScore(i) != null ? `<span class="card-star">★ ${myScore(i).toFixed(1)}</span>` : ''}
        <span class="card-body"><strong>${esc(i.name)}</strong><span class="muted">${esc(i.is_collection ? i.published : sub(i))}</span>
          ${i.price != null && !i.is_collection ? `<span class="card-price">${won(i.price)}</span>` : ''}<span class="tags">${tops(i)}</span>${extra}</span></a>
      ${i.is_collection ? '' : `<span class="card-tools"><button type="button" class="mini${liked ? ' on' : ''}" data-like="${esc(i.id)}" aria-pressed="${liked}">${liked ? '♥ 좋아요' : '♡ 좋아요'}</button>
        <button type="button" class="mini${inCmp ? ' on' : ''}" data-cmp="${esc(i.id)}" aria-pressed="${inCmp}">${inCmp ? '✓ 비교' : '+ 비교'}</button></span>`}
    </li>`;
  }

  function mashBar(m) {
    const g = m.grains || {}, total = GRAINS.reduce((s, [k]) => s + (g[k] || 0), 0);
    if (!total) return '';
    return `<span class="mash" role="img" aria-label="${esc(GRAINS.filter(([k]) => g[k]).map(([k, l]) => `${l} ${g[k]}%`).join(', '))}">${GRAINS
      .filter(([k]) => g[k]).map(([k]) => `<span class="m-${k}" style="width:${(g[k] / total) * 100}%"></span>`).join('')}</span>`;
  }

  function toggleLike(id) {
    S.liked.has(id) ? S.liked.delete(id) : (S.liked.add(id), S.disliked.delete(id));
    save(); announce(S.liked.has(id) ? '좋아요에 담았어요.' : '좋아요에서 뺐어요.');
  }
  function toggleCompare(id) {
    const k = S.compare.indexOf(id);
    if (k >= 0) S.compare.splice(k, 1);
    else if (S.compare.length >= 4) { announce('비교는 4개까지 담을 수 있어요.'); return false; }
    else S.compare.push(id);
    save(); announce(k >= 0 ? '비교에서 뺐어요.' : `비교에 담았어요 (${S.compare.length}/4).`);
    return true;
  }

  // ---------- radar at real pixel size (text never scales below CSS size) ----------
  const observers = new WeakMap();
  function radar(el, axes, series, {table = true} = {}) {
    observers.get(el)?.disconnect();
    let last = 0;
    const draw = width => {
      const size = Math.min(width, 420), labels = size >= 380, pad = labels ? 62 : 22;
      const r = size / 2 - pad, c = size / 2, n = axes.length, max = 5;
      const pt = (k, v) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / n; return [c + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)]; };
      let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="향미 레이더, 값은 아래 표에 있습니다">`;
      for (const step of [1, 2, 3, 4, 5]) out += `<polygon class="grid" points="${axes.map((_, k) => pt(k, step).join(',')).join(' ')}"/>`;
      axes.forEach((a, k) => {
        const [x, y] = pt(k, max), [lx, ly] = pt(k, max + (labels ? 0.75 : 0.5));
        const anchor = Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end';
        out += `<line class="axis" x1="${c}" y1="${c}" x2="${x}" y2="${y}"/><text class="${labels ? 'lbl' : 'num'}" x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle">${labels ? esc(a) : k + 1}</text>`;
      });
      series.forEach((s, k) => {
        const pts = axes.map((a, j) => (s.values[a] != null ? pt(j, s.values[a]) : null)).filter(Boolean);
        if (pts.length >= 3) out += `<polygon class="area" style="--c:${COLORS[k]}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
        pts.forEach(([x, y]) => { out += `<circle class="dot" style="--c:${COLORS[k]}" cx="${x}" cy="${y}" r="3.5"/>`; });
      });
      out += '</svg>';
      const head = series.length > 1 ? `<thead><tr><th></th>${series.map((s, k) => `<th scope="col"><span class="sw" style="--c:${COLORS[k]}"></span>${esc(s.label)}</th>`).join('')}</tr></thead>` : '';
      const body = axes.map((a, k) => `<tr><th scope="row">${labels ? '' : `<span class="axis-no" lang="en">${k + 1}</span>`}${esc(a)}</th>${series.map(s => `<td>${s.values[a] == null ? '<span class="muted">—</span>' : s.values[a].toFixed(1)}</td>`).join('')}</tr>`).join('');
      // The table is the readable form of the chart; when labels sit on the chart it may be visually hidden.
      el.innerHTML = `<div class="radar"><div class="radar-svg">${out}</div><table${!table && labels ? ' class="sr"' : ''}>${head}<tbody>${body}</tbody></table></div>`;
    };
    const ro = new ResizeObserver(() => { const w = Math.floor(el.clientWidth); if (w && w !== last) { last = w; draw(w); } });
    ro.observe(el); observers.set(el, ro);
  }
  const stageValues = (i, stage) => (stage === 'all' ? E.vector(i) : {...i.npf[stage].f});
  const axesFor = list => {
    const set = new Set();
    for (const i of list) for (const k of Object.keys(stageValues(i, 'all'))) set.add(k);
    return D.families.filter(f => set.has(f));
  };

  // ---------- shell ----------
  function renderShell(page) {
    const counts = g => items.filter(i => i.group === g).length;
    $('#side').innerHTML = `<a href="#/" class="brand"><img src="assets/brand/martianquip-mq.png" alt=""><span><b>마시는 큅</b><span lang="en">MARTIANQUIP</span></span></a>
      <p class="side-title" lang="en">YOUR COLLECTION</p>
      ${PAGES.map(([k, href, label]) => `<a class="side-link" href="${href}"${page === k ? ' aria-current="page"' : ''}>${svg(k)}${label}${k === 'compare' && S.compare.length ? ` <small>${S.compare.length}</small>` : ''}</a>`).join('')}
      <p class="side-title" lang="en">BY THE GLASS</p>
      ${Object.entries(D.sections).map(([name, groups]) => (groups.length > 1
        ? `<a class="side-cat" href="#/" data-filter="sec:${name}" style="--c:#c68451">${name}<small>${items.filter(i => i.section === name).length}</small></a>${groups.map(g => `<a class="side-cat sub" href="#/" data-filter="grp:${g}" style="--c:${CAT_COLOR[g]}">${g}<small>${counts(g)}</small></a>`).join('')}`
        : `<a class="side-cat" href="#/" data-filter="grp:${groups[0]}" style="--c:${CAT_COLOR[groups[0]]}">${name}<small>${counts(groups[0])}</small></a>`)).join('')}
      <p class="side-foot"><span lang="en">CURATED BY MARTIANQUIP</span></p>`;
    const v = visits(), t = v.days[today()] || {views: 0};
    const total = Object.values(v.days).reduce((s, d) => s + d.views, 0);
    $('#top').innerHTML = `<a href="#/" class="brand"><img src="assets/brand/martianquip-mq.png" alt="" width="40" height="40"><span><b>마시는 큅</b><span lang="en">MARTIANQUIP</span></span></a>
      <nav class="icons" aria-label="주요 메뉴">${PAGES.map(([k, href, label]) => `<a href="${href}" aria-label="${label}"${page === k ? ' aria-current="page"' : ''}>${svg(k)}</a>`).join('')}</nav>
      <p class="crumb"><span lang="en">My workspace</span> / <b>${esc((PAGES.find(p => p[0] === page) || [0, 0, '상세'])[2])}</b>
        <span class="muted"> · 조회 전체 ${total} · 오늘 ${t.views} (이 브라우저)</span>${window.SEALED ? "" : ' · <a href="MARTIANQUIP_DB.xlsx" download>엑셀 DB 받기</a>'}</p>`;  // the sealed build ships no plaintext Excel
  }

  // ---------- library ----------
  const searchHay = i => [i.name, i.english, i.producer.name, i.producer.en, i.country, i.region, i.style, i.kind, i.cask.raw, ...Object.keys(E.vector(i))].join(' ').toLowerCase();
  const inFilter = i => S.filter === 'all' || (S.filter.startsWith('sec:') ? i.section === S.filter.slice(4) : i.group === S.filter.slice(4));
  const FACETS = [
    ['style', '종류', i => [i.style]], ['country', '국가', i => [i.country]],
    ['mash', '매시빌', i => (i.group === '위스키' ? [i.mashbill.class] : [])], ['cask', '캐스크', i => i.cask.list.map(c => c.label)],
  ];
  const SORTS = [['newest', '최신 리뷰순'], ['oldest', '오래된순'], ['name', '이름순'], ['price_asc', '가격 낮은순'], ['price_desc', '가격 높은순'],
    ['intensity', '강도 높은순'], ['mine', '내 별점순']];

  function sorted(list) {
    const val = {price_asc: i => i.price, price_desc: i => i.price, intensity: avgIntensity, mine: myScore}[S.sort];
    const dir = S.sort === 'price_asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (S.sort === 'name') return ko(a.name, b.name);
      if (val) {
        const x = val(a), y = val(b);
        if ((x == null) !== (y == null)) return x == null ? 1 : -1; // unknown last
        if (x != null && x !== y) return dir * (x - y);
      }
      const d = a.published < b.published ? 1 : a.published > b.published ? -1 : ko(a.id, b.id);
      return S.sort === 'oldest' ? -d : d;
    });
  }

  function renderLibrary(main) {
    const base = items.filter(inFilter);
    const q = S.q.trim().toLowerCase();
    const matched = base.filter(i => (!q || q.split(/\s+/).every(t => searchHay(i).includes(t)))
      && FACETS.every(([k, , get]) => !S.facets[k]?.size || get(i).some(v => S.facets[k].has(v))));
    const list = sorted(matched), shown = list.slice(0, S.shown);
    const chips = [['all', '전체', items.length], ['sec:알콜', '알콜', items.filter(i => i.section === '알콜').length],
      ...D.sections['알콜'].map(g => [`grp:${g}`, g]), ['sep'], ['grp:카페인', '카페인'], ['grp:소다', '소다'], ['grp:기타 글', '기타 글']]
      .map(([v, l, n]) => (v === 'sep' ? '<span class="chip-sep" aria-hidden="true"></span>'
        : `<button type="button" class="chip" data-filter="${v}" aria-pressed="${S.filter === v}">${l} <small>${n ?? items.filter(i => i.group === v.slice(4)).length}</small></button>`)).join('');
    const facetHTML = FACETS.map(([k, label, get]) => {
      const cnt = new Map();
      for (const i of base) for (const v of new Set(get(i))) if (v) cnt.set(v, (cnt.get(v) || 0) + 1);
      if (cnt.size < 2) return '';
      const order = {style: Object.values(D.style_groups).flat(), mash: D.mash_order, cask: D.cask_labels}[k] || [];
      const pos = v => (order.indexOf(v) + 1 || 1e9);  // unlisted values go last, by count
      const opts = [...cnt].sort((a, b) => pos(a[0]) - pos(b[0]) || b[1] - a[1] || ko(a[0], b[0]));
      const head = v => (k === 'style' ? Object.keys(D.style_groups).find(h => D.style_groups[h].includes(v)) || '' : '');
      const split = new Set(opts.map(([v]) => head(v))).size > 1;
      return `<fieldset><legend>${label}</legend>${opts.map(([v, n], x) => `${split && head(v) !== head(opts[x - 1]?.[0] ?? null) ? `<p class="facet-sub">${head(v)}</p>` : ''}<label><input type="checkbox" data-facet="${k}" value="${esc(v)}"${S.facets[k]?.has(v) ? ' checked' : ''}>${esc(v)}<small>${n}</small></label>`).join('')}</fieldset>`;
    }).join('');
    const active = Object.values(S.facets).reduce((s, x) => s + x.size, 0);
    main.innerHTML = `
      <dl class="stats">
        <div><dt>기록한 리뷰</dt><dd>${items.length}<small>개</small></dd></div>
        <div><dt>테이스팅 프로파일</dt><dd>${scored.length}<small>개 · 향·맛·여운</small></dd></div>
        <div><dt>나의 별점</dt><dd>${Object.keys(S.ratings).length}<small>개 · 0.5점 단위</small></dd></div>
        <div><dt>증류소·생산자</dt><dd>${new Set(scored.map(i => i.producer.name)).size}<small>곳</small></dd></div>
      </dl>
      <div class="sec-head"><h2>리뷰 서재</h2><span class="serif" lang="en">The collection</span></div>
      <div class="chips scroll-x" role="group" aria-label="분류">${chips}</div>
      <div class="toolbar">
        <label class="search"><span class="sr">검색</span><input type="search" data-q value="${esc(S.q)}" placeholder="제품명, 증류소, 향미 키워드 검색" autocomplete="off"></label>
        <label><span class="sr">정렬</span><select data-sort>${SORTS.map(([v, l]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="seg" role="group" aria-label="보기 방식"><button type="button" data-view="grid" aria-pressed="${S.view === 'grid'}" aria-label="카드로 보기">▦</button><button type="button" data-view="list" aria-pressed="${S.view === 'list'}" aria-label="목록으로 보기">☰</button></span>
      </div>
      <div class="lib${S.view === 'list' ? ' list-view' : ''}">
        ${facetHTML ? `<details class="filters"${matchMedia('(min-width: 1100px)').matches || active ? ' open' : ''}><summary>레이어 필터${active ? ` <span class="tag">${active}</span>` : ''}</summary>${facetHTML}
          <button type="button" class="mini" data-clear>초기화</button><p class="muted small">레이어 안은 OR · 레이어 간은 AND</p></details>` : '<span></span>'}
        <div><p class="result-line"><span><b>${list.length}</b>개의 리뷰</span>${S.sort === 'mine' ? '<span>내 별점이 없는 리뷰는 맨 뒤</span>' : ''}${S.sort.startsWith('price') ? '<span>리뷰 당시 구매가 기준 · 미확인은 맨 뒤</span>' : ''}</p>
          <ul class="cards">${shown.map(i => card(i)).join('') || '<li class="empty">조건에 맞는 리뷰가 없어요.</li>'}</ul>
          ${shown.length < list.length ? `<button type="button" class="btn more" data-more>더 보기 (${shown.length} / ${list.length})</button>` : ''}</div>
      </div>`;
    const qi = $('[data-q]', main);
    const onQuery = e => { if (e.isComposing) return; S.q = e.target.value; S.shown = 40; const p = e.target.selectionStart; renderLibrary(main); const n = $('[data-q]', main); n.focus(); n.setSelectionRange(p, p); };
    qi.oninput = onQuery;
    qi.addEventListener('compositionend', onQuery);  // there is no oncompositionend property; Korean input renders once the syllable is done
    $('[data-sort]', main).onchange = e => { S.sort = e.target.value; S.shown = 40; renderLibrary(main); };
    main.onchange = e => {
      const t = e.target;
      if (!t.dataset.facet) return;
      const set = (S.facets[t.dataset.facet] ||= new Set());
      t.checked ? set.add(t.value) : set.delete(t.value);
      S.shown = 40; renderLibrary(main);
    };
    main.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.view) { S.view = b.dataset.view; store.set('st.view', S.view); renderLibrary(main); }
      if (b.hasAttribute('data-more')) { S.shown += 40; renderLibrary(main); }
      if (b.hasAttribute('data-clear')) { S.facets = {}; renderLibrary(main); }
    };
  }

  // ---------- detail ----------
  function renderDetail(main, id) {
    const i = byId.get(id);
    if (!i) { main.innerHTML = '<p class="empty">리뷰를 찾지 못했어요. <a href="#/">서재로</a></p>'; return; }
    document.title = `${i.name} · 마시는 큅`;
    const liked = S.liked.has(i.id), inCmp = S.compare.includes(i.id), mine = S.ratings[i.id];
    const hero = `<a href="#/" class="back" data-back>← 리뷰 서재</a>
      <header class="d-hero">${photo(i, 'd-photo')}
        <div><p class="eyebrow">${esc(i.section)} · ${esc(i.group)} · ${esc(i.published)} 리뷰</p><h1>${esc(i.name)}</h1>${i.english ? `<p class="muted" lang="en">${esc(i.english)}</p>` : ''}
          <div class="tags">${[i.style, i.country, i.region, i.producer.name].filter(x => x && x !== '미확인').map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
          <div class="actions">${i.is_collection ? '' : `<button type="button" class="btn${liked ? ' on' : ''}" data-like="${esc(i.id)}" aria-pressed="${liked}">${liked ? '♥ 좋아요' : '♡ 좋아요'}</button>
            <button type="button" class="btn${inCmp ? ' on' : ''}" data-cmp="${esc(i.id)}" aria-pressed="${inCmp}">${inCmp ? '✓ 비교에 담김' : '+ 비교'}</button>
            <a class="btn" href="#/ratings/${esc(i.id)}">★ ${mine ? `내 별점 ${mine.score != null ? mine.score.toFixed(1) : '—'}` : '별점 기록'}</a>
            <a class="btn primary" href="#/tree/${esc(i.id)}">추천 트리</a>`}
            ${i.url ? `<a class="btn" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">원글 ↗</a>` : ''}</div></div>
      </header>`;
    if (i.is_collection) {
      const shots = (i.gallery || []).filter(Boolean);
      main.innerHTML = hero + `<section class="panel"><h2>여러 제품을 다룬 글</h2><p>여러 제품을 함께 다루거나 결산·레시피·공지 글이라 향미 점수를 매기지 않았어요.</p>
        ${shots.length ? `<ul class="gallery">${shots.map((src, n) => `<li><img src="${esc(src)}" alt="${esc(i.name)} 사진 ${n + 2}" loading="lazy"></li>`).join('')}</ul>` : ''}</section>`;
      bindDetail(main); return;
    }
    const m = i.mashbill;
    const info = [['국가', i.country], ['지역', i.region], [i.producer.role || '생산자', esc(i.producer.name) + (i.producer.en ? ` <small lang="en">${esc(i.producer.en)}</small>` : '')],
      ['종류', esc(i.kind || i.style)], ['숙성', esc(i.age)], ['도수', num(i.abv, '%')], ['용량', num(i.volume, 'mL', 0)],
      ['구매가', won(i.price) && `${won(i.price)} <small>리뷰 당시</small>`], ['카페인', num(i.caffeine, 'mg', 0)], ['열량', num(i.calories, 'kcal', 0)]]
      .map(([k, v]) => [k, k === '국가' || k === '지역' ? esc(v) : v]).filter(([, v]) => v);
    const caskGroups = D.cask_groups.map(g => [g, i.cask.list.filter(c => c.group === g)]).filter(([, cs]) => cs.length);
    const LENGTH = {1: '매우 짧음', 2: '짧음', 3: '보통', 4: '김', 5: '매우 김'};
    const bar = (label, v, cls = '', hint = '') => `<li class="${cls}"><span>${label}</span><span class="track"><span style="width:${v == null ? 0 : (v / 5) * 100}%"></span></span><b>${v == null ? '—' : v.toFixed(1)}</b>${hint ? `<small>${hint}</small>` : ''}</li>`;
    main.innerHTML = hero + `<div class="d-grid">
      <section class="panel"><h2>제품 정보</h2><dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
      <section class="panel"><h2>향미 지도 <small>0–5</small></h2>
        <span class="seg" role="group" aria-label="단계">${[['all', '전체'], ...STAGES.map(([s, , l]) => [s, l])].map(([s, l]) => `<button type="button" data-stage="${s}" aria-pressed="${S.stage === s}">${l}</button>`).join('')}</span>
        <div data-radar style="margin-top:10px"></div></section>
      ${i.group === '위스키' ? `<section class="panel"><h2>매시빌 <small>${esc(m.class)}${m.estimated ? ' · 추정치' : ''}</small></h2>${mashBar(m)}
          ${Object.keys(m.grains).length ? `<ul class="legend">${GRAINS.filter(([k]) => m.grains[k]).map(([k, l]) => `<li><i class="m-${k}"></i>${l} ${m.grains[k]}%</li>`).join('')}</ul>` : ''}
          <p class="muted small">${esc(m.raw || '원문에 매시빌이 공개되지 않았어요.')}</p></section>
        <section class="panel"><h2>캐스크</h2>${caskGroups.map(([g, cs]) => `<div class="cask-row"><span class="muted small">${esc(g)}</span><span>${cs.map(c => `<span class="tag${c.rule ? ' rule' : ''}">${esc(c.label)}</span>`).join('')}</span></div>`).join('') || '<p class="muted">캐스크 정보 미공개</p>'}
          ${i.cask.raw ? `<p class="muted small">원문: ${esc(i.cask.raw)}</p>` : ''}${i.cask.list.some(c => c.rule) ? '<p class="muted small">미국 버번·라이는 새로 그을린 오크통 숙성이 법정 요건이라 따로 표시했어요.</p>' : ''}</section>` : ''}
      <section class="panel wide"><h2>NPF 점수 <small>원문을 읽고 0.5 단위로 매긴 값 · 빈칸은 언급 없음</small></h2><div class="stages">${STAGES.map(([s, letter, label]) => {
        const st = i.npf[s];
        return `<div class="stage"><h3><b lang="en">${letter}</b>${label}</h3>${st.notes.length ? `<ol class="notes">${st.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}
          <ul class="bars">${bar('강도', st.i, 'metric')}${s === 'p' ? bar('바디', st.b, 'metric') : ''}${s === 'f' ? bar('여운 길이', st.l, 'metric', st.l ? LENGTH[Math.round(st.l)] : '') : ''}
          ${Object.entries(st.f).sort((a, b) => b[1] - a[1] || ko(a[0], b[0])).map(([f, v]) => bar(esc(f), v)).join('')}</ul>
          <details class="raw"><summary>원문 보기</summary><p>${esc(st.text).replace(/\n/g, '<br>')}</p></details></div>`;
      }).join('')}</div></section>
      <section class="panel wide"><h2>비슷한 ${esc(i.group)}</h2><ul class="cards">${E.recommend(scored.filter(x => x.group === i.group), [i], {limit: 4})
        .map(r => card(r.item, `<span class="muted small">겹치는 향미 ${esc(r.shared.join(', '))} · ${r.score}</span>`)).join('') || '<li class="empty">겹치는 향미가 있는 제품이 없어요.</li>'}</ul></section>
    </div>`;
    const draw = () => radar($('[data-radar]', main), axesFor([i]), [{label: i.name, values: stageValues(i, S.stage)}]);
    draw();
    bindDetail(main, s => { S.stage = s; draw(); });
  }

  function bindDetail(main, onStage) {
    main.onclick = e => {
      if (e.target.closest('[data-back]')) { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = '#/'); return; }
      const b = e.target.closest('button[data-stage]');
      if (b && onStage) { main.querySelectorAll('[data-stage]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); onStage(b.dataset.stage); }
    };
  }

  // ---------- 취향 추천: list + tree ----------
  function picker(q, action) {
    const t = q.trim().toLowerCase();
    return t ? scored.filter(i => searchHay(i).includes(t)).slice(0, 8).map(i => `<li><button type="button" class="pick" data-${action}="${esc(i.id)}">${photo(i)}<span><strong>${esc(i.name)}</strong><span class="muted">${esc(sub(i))}</span></span><b aria-hidden="true">＋</b></button></li>`).join('') : '';
  }

  function renderRec(main) {
    const liked = [...S.liked].map(id => byId.get(id)), disliked = [...S.disliked].map(id => byId.get(id));
    const groups = new Set(liked.map(i => i.group));
    const pool = S.sameGroup && groups.size ? scored.filter(i => groups.has(i.group)) : scored;
    const results = E.recommend(pool, liked, {disliked, mode: S.recMode, limit: 16});
    const pills = (xs, set) => xs.map(i => `<li class="pill">${esc(i.name)} <button type="button" data-remove="${esc(i.id)}" data-set="${set}" aria-label="${esc(i.name)} 빼기">×</button></li>`).join('');
    main.innerHTML = `<p class="eyebrow" lang="en">FIND YOUR NEXT GLASS</p><h1>취향 추천</h1>
      <p class="muted">좋았던 음료를 담으면 향미가 겹치는 다음 한 잔을, 트리에서는 한 잔에서 다음 3잔씩 가지를 뻗어요.</p>
      <span class="seg" role="group" aria-label="추천 보기"><button type="button" data-tab="list" aria-pressed="${S.recTab === 'list'}">추천 리스트</button><button type="button" data-tab="tree" aria-pressed="${S.recTab === 'tree'}">추천 트리</button></span>
      <section class="panel" style="margin-top:14px">
        <label><span class="sr">음료 검색</span><input type="search" data-find placeholder="${S.recTab === 'list' ? '좋았던 음료 검색해서 담기' : '트리를 시작할 음료 검색'}" autocomplete="off" style="width:100%"></label>
        <ul class="picks" data-hits></ul>
        ${S.recTab === 'list' ? `<h3 style="margin-top:14px">좋았어요 <small class="muted">${liked.length}</small></h3><ul class="pills">${pills(liked, 'liked') || '<li class="muted small">카드의 ♡로도 담을 수 있어요.</li>'}</ul>
          <h3>안 맞았어요 <small class="muted">${disliked.length}</small></h3><ul class="pills">${pills(disliked, 'disliked') || '<li class="muted small">없음</li>'}</ul>
          <label class="check"><input type="checkbox" data-same${S.sameGroup ? ' checked' : ''}> 담은 음료와 같은 분류에서만 찾기</label>`
          : (liked.length ? `<h3 style="margin-top:14px">좋아요에서 시작</h3><ul class="pills">${liked.map(i => `<li class="pill" style="padding-right:12px"><a href="#/tree/${esc(i.id)}">${esc(i.name)}</a></li>`).join('')}</ul>` : '')}
      </section>
      ${S.recTab === 'list' ? `<span class="seg" role="group" aria-label="추천 방식"><button type="button" data-mode="similar" aria-pressed="${S.recMode === 'similar'}">비슷한 향미</button><button type="button" data-mode="explore" aria-pressed="${S.recMode === 'explore'}">취향 넓히기</button></span>
        ${liked.length ? `<ul class="cards" style="margin-top:14px">${results.map(r => card(r.item, `<span class="muted small">겹치는 향미 ${esc(r.shared.join(', '))} · 지수 ${r.score}${r.penalty ? ' · 감점' : ''}</span>`).replace('</li>', `<span class="card-tools"><button type="button" class="mini" data-dislike="${esc(r.item.id)}">안 맞을 것 같아요</button></span></li>`)).join('')}</ul>
          <p class="muted small" style="margin-top:10px">지수는 기록된 향미의 겹침 정도예요. 만족 확률이나 품질 점수가 아니에요.</p>` : '<p class="empty">좋았던 음료를 하나 이상 담아 주세요.</p>'}` : ''}`;
    const find = $('[data-find]', main);
    find.oninput = () => { $('[data-hits]', main).innerHTML = picker(find.value, S.recTab === 'list' ? 'add' : 'start'); };
    main.onchange = e => { if (e.target.matches('[data-same]')) { S.sameGroup = e.target.checked; renderRec(main); } };
    main.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) { S.recTab = b.dataset.tab; renderRec(main); }
      else if (b.dataset.add) { S.liked.add(b.dataset.add); S.disliked.delete(b.dataset.add); save(); renderRec(main); $('[data-find]', main).focus(); }
      else if (b.dataset.start) location.hash = `#/tree/${b.dataset.start}`;
      else if (b.dataset.remove) { S[b.dataset.set].delete(b.dataset.remove); save(); renderRec(main); }
      else if (b.dataset.dislike) { S.disliked.add(b.dataset.dislike); S.liked.delete(b.dataset.dislike); save(); renderRec(main); }
      else if (b.dataset.mode) { S.recMode = b.dataset.mode; renderRec(main); }
    };
  }

  function grow(id) {
    const t = S.tree, pool = scored.filter(i => i.group === byId.get(t.root).group);
    const next = E.children(pool, byId.get(id), t.used, {k: 3, mode: t.mode}).map(r => r.item.id);
    next.forEach(n => t.used.add(n)); t.open.set(id, next);
  }
  function treeNode(id) {
    const i = byId.get(id), kids = S.tree.open.get(id);
    return `<li><div class="node-row">${photo(i)}<a href="#/item/${esc(i.id)}"><strong>${esc(i.name)}</strong><span class="muted small">${esc(sub(i))}</span><span class="tags">${tops(i)}</span></a>
      ${kids ? `<button type="button" class="mini" data-fold="${esc(id)}" aria-expanded="true">접기</button>` : `<button type="button" class="mini primary" data-grow="${esc(id)}" aria-expanded="false">다음 3잔</button>`}</div>
      ${kids ? (kids.length ? `<ul class="branch">${kids.map(treeNode).join('')}</ul>` : '<p class="muted small" style="margin:6px 0 0 14px">겹치는 향미의 새 후보가 없어요.</p>') : ''}</li>`;
  }
  function renderTree(main, id) {
    if (!byId.has(id) || byId.get(id).is_collection) { S.recTab = 'tree'; location.hash = '#/rec'; return; }
    if (!S.tree || S.tree.root !== id) { S.tree = {root: id, mode: S.recMode, open: new Map(), used: new Set([id])}; grow(id); }
    main.innerHTML = `<a href="#/rec" class="back">← 취향 추천</a><h1>추천 트리</h1>
      <p class="muted">각 가지는 바로 위 음료와 향미가 가장 많이 겹치는 다음 3잔이에요. 한 번 나온 음료는 다시 나오지 않아요.</p>
      <span class="seg" role="group" aria-label="가지 방식"><button type="button" data-mode="similar" aria-pressed="${S.tree.mode === 'similar'}">비슷한 향미</button><button type="button" data-mode="explore" aria-pressed="${S.tree.mode === 'explore'}">취향 넓히기</button></span>
      <ul class="root" style="margin-top:14px">${treeNode(id)}</ul>`;
    main.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.grow) { grow(b.dataset.grow); renderTree(main, id); $(`[data-fold="${b.dataset.grow}"]`, main)?.focus(); }
      if (b.dataset.fold) {
        const drop = x => { for (const k of S.tree.open.get(x) || []) { drop(k); S.tree.used.delete(k); } S.tree.open.delete(x); };
        drop(b.dataset.fold); renderTree(main, id); $(`[data-grow="${b.dataset.fold}"]`, main)?.focus();
      }
      if (b.dataset.mode) { S.recMode = b.dataset.mode; S.tree = null; renderTree(main, id); }
    };
  }

  // ---------- 별점 기록 ----------
  const HALF = Array.from({length: 10}, (_, k) => (k + 1) / 2);
  const RATE_FIELDS = [['score', '총점'], ['n', '향'], ['p', '맛'], ['f', '여운'], ['value', '가성비']];
  function renderRatings(main, id) {
    const target = byId.get(id);
    const r = (target && S.ratings[target.id]) || {};
    const ratedNow = () => Object.entries(S.ratings).filter(([k]) => byId.has(k)).sort((a, b) => ko(b[1].updated || '', a[1].updated || ''));
    const rated = ratedNow();
    main.innerHTML = `<p class="eyebrow" lang="en">MY RATINGS</p><h1>별점 기록</h1>
      <p class="muted">리뷰와 별개로 내 평가를 남기는 기록장이에요. 이 브라우저에만 저장되니 가끔 JSON 백업을 받아 두세요.</p>
      <section class="panel">
        ${target && !target.is_collection ? `<div class="pick" style="cursor:default">${photo(target)}<span><strong>${esc(target.name)}</strong><span class="muted">${esc(sub(target))}</span></span><a class="mini" href="#/ratings">바꾸기</a></div>
          <form class="form-grid" data-rate style="margin-top:12px">${RATE_FIELDS.map(([k, l]) => `<label class="field">${l}<select name="${k}"><option value="">—</option>${HALF.map(v => `<option value="${v}"${r[k] === v ? ' selected' : ''}>${v.toFixed(1)}</option>`).join('')}</select></label>`).join('')}
            <label class="field">마신 날<input type="date" name="date" value="${esc(r.date || '')}"></label>
            <label class="field wide-f">메모<textarea name="memo" rows="3" maxlength="5000">${esc(r.memo || '')}</textarea></label>
            <span class="wide-f actions" style="margin:0"><button type="submit" class="btn primary">저장</button>${S.ratings[target.id] ? '<button type="button" class="btn" data-del>기록 삭제</button>' : ''}</span></form>`
          : '<label><span class="sr">음료 검색</span><input type="search" data-find placeholder="별점을 남길 음료 검색" autocomplete="off" style="width:100%"></label><ul class="picks" data-hits></ul>'}
      </section>
      <div class="sec-head"><h2>내 기록 <small>${rated.length}</small></h2>
        <span class="actions" style="margin:0"><button type="button" class="mini" data-export-csv>CSV 내보내기</button><button type="button" class="mini" data-export-json>JSON 백업</button>
        <label class="mini" style="display:inline-flex;align-items:center;cursor:pointer">JSON 가져오기<input type="file" accept="application/json" data-import class="sr"></label></span></div>
      <ul class="rating-list">${rated.map(([k, v]) => { const i = byId.get(k); return `<li>${photo(i)}<a href="#/ratings/${esc(k)}" style="text-decoration:none"><strong>${esc(i.name)}</strong><br><span class="muted small">${esc([v.date, v.memo].filter(Boolean).join(' · ').slice(0, 60))}</span></a><span class="score">${v.score != null ? v.score.toFixed(1) : '—'}</span></li>`; }).join('') || '<li class="empty" style="display:block;border:0;background:none">아직 기록이 없어요.</li>'}</ul>`;
    const find = $('[data-find]', main);
    if (find) find.oninput = () => { $('[data-hits]', main).innerHTML = picker(find.value, 'rate'); };
    main.onsubmit = e => {
      if (!e.target.matches('[data-rate]')) return;
      e.preventDefault();
      const fd = new FormData(e.target), rec = {};
      for (const [k] of RATE_FIELDS) { const v = fd.get(k); rec[k] = v === '' ? null : Number(v); }
      rec.memo = String(fd.get('memo') || '').slice(0, 5000);
      rec.date = /^\d{4}-\d{2}-\d{2}$/.test(fd.get('date')) ? fd.get('date') : '';
      rec.updated = new Date().toISOString();
      S.ratings[target.id] = rec;
      announce(save() ? '저장했어요.' : '저장하지 못했어요. 브라우저 저장소가 막혀 있어요.');
      renderRatings(main, target.id);
    };
    main.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rate) location.hash = `#/ratings/${b.dataset.rate}`;
      if (b.hasAttribute('data-del') && confirm('이 별점 기록을 지울까요?')) { delete S.ratings[target.id]; save(); location.hash = '#/ratings'; }
      if (b.hasAttribute('data-export-json')) download('sip-tree-ratings.json', JSON.stringify(S.ratings, null, 1), 'application/json');
      if (b.hasAttribute('data-export-csv')) {
        const q = v => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
        const rows = [['ID', '제품명', '분류', ...RATE_FIELDS.map(f => f[1]), '마신 날', '메모'],
          ...ratedNow().map(([k, v]) => [k, byId.get(k).name, byId.get(k).group, ...RATE_FIELDS.map(f => v[f[0]]), v.date, v.memo])];
        download('sip-tree-ratings.csv', '﻿' + rows.map(x => x.map(q).join(',')).join('\r\n'), 'text/csv');
      }
    };
    main.onchange = e => {
      if (!e.target.matches('[data-import]') || !e.target.files[0]) return;
      e.target.files[0].text().then(text => {
        const data = JSON.parse(text);
        let n = 0;
        for (const [k, v] of Object.entries(data)) {
          if (!byId.has(k) || typeof v !== 'object' || !v) continue;
          if (RATE_FIELDS.every(([f]) => v[f] == null || HALF.includes(v[f]))) { S.ratings[k] = {...v, memo: String(v.memo || '').slice(0, 5000)}; n += 1; }
        }
        save(); announce(`${n}개 기록을 가져왔어요.`); renderRatings(main);
      }).catch(() => announce('JSON 파일을 읽지 못했어요.'));
    };
  }
  function download(name, text, type) {
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([text], {type})), download: name});
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- 나란히 비교 ----------
  function renderCompare(main) {
    const xs = S.compare.map(id => byId.get(id)).filter(Boolean);
    if (!xs.length) {
      main.innerHTML = '<p class="eyebrow" lang="en">SIDE BY SIDE</p><h1>나란히 비교</h1><p class="muted">카드나 상세 화면의 <b>+ 비교</b>로 최대 4개까지 담아 주세요.</p><p><a class="btn" href="#/">리뷰 서재로</a></p>';
      return;
    }
    const topStage = (i, s) => Object.entries(i.npf[s].f).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, v]) => `${f} ${v.toFixed(1)}`).join(', ') || '—';
    const rows = [
      ['분류', i => esc(`${i.group} · ${i.style}`)], ['국가·생산자', i => esc([i.country, i.region, i.producer.name].filter(Boolean).join(' · '))],
      ['도수', i => num(i.abv, '%') || '—'], ['구매가', i => (won(i.price) ? `${won(i.price)}<br><small class="muted">리뷰 당시</small>` : '—')],
      ['매시빌', i => (i.group === '위스키' ? esc(i.mashbill.class) + mashBar(i.mashbill) : '—')], ['캐스크', i => esc(i.cask.list.map(c => c.label).join(' → ')) || '—'],
      ...STAGES.map(([s, , l]) => [l, i => `${esc(topStage(i, s))}<br><small class="muted">강도 ${i.npf[s].i != null ? i.npf[s].i.toFixed(1) : '—'}</small>`]),
      ['여운 길이', i => (i.npf.f.l != null ? i.npf.f.l.toFixed(1) : '—')], ['내 별점', i => (myScore(i) != null ? `★ ${myScore(i).toFixed(1)}` : '—')],
    ];
    main.innerHTML = `<p class="eyebrow" lang="en">SIDE BY SIDE</p><h1>나란히 비교</h1>
      <div class="actions" style="margin:0 0 14px"><a class="btn small" href="#/">제품 추가</a><button type="button" class="btn small" data-clear>모두 비우기</button></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="비교표, 옆으로 밀어 볼 수 있어요"><table class="cmp">
        <thead><tr><th scope="col"><span class="sr">항목</span></th>${xs.map(i => `<th scope="col"><a class="cmp-head" href="#/item/${esc(i.id)}">${photo(i)}<span>${esc(i.name)}</span></a><button type="button" class="mini" data-cmp="${esc(i.id)}">빼기</button></th>`).join('')}</tr></thead>
        <tbody>${rows.map(([l, f]) => `<tr><th scope="row">${l}</th>${xs.map(i => `<td>${f(i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <section class="panel" style="margin-top:16px"><h2>향미 겹쳐 보기 <small>같은 축 · 0–5 · 기록 없는 향미는 0으로 잇지 않음</small></h2>
        <span class="seg" role="group" aria-label="단계">${[['all', '전체'], ...STAGES.map(([s, , l]) => [s, l])].map(([s, l]) => `<button type="button" data-stage="${s}" aria-pressed="${S.cmpStage === s}">${l}</button>`).join('')}</span>
        <div data-radar style="margin-top:10px"></div></section>`;
    const draw = () => radar($('[data-radar]', main), axesFor(xs), xs.map(i => ({label: i.name, values: stageValues(i, S.cmpStage)})));
    draw();
    main.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.stage) { S.cmpStage = b.dataset.stage; main.querySelectorAll('[data-stage]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }
      if (b.hasAttribute('data-clear')) { S.compare = []; save(); render(); }
    };
  }

  // ---------- 방문 통계 ----------
  function renderStats(main) {
    const v = visits(), days = Object.entries(v.days).sort();
    const t = v.days[today()] || {views: 0, visit: 0, pages: {}};
    const total = days.reduce((s, [, d]) => s + d.views, 0), visitsTotal = days.reduce((s, [, d]) => s + (d.visit || 0), 0);
    const last30 = Array.from({length: 30}, (_, k) => { const d = new Date(); d.setDate(d.getDate() - 29 + k); const key = d.toLocaleDateString('sv-SE'); return [key, v.days[key] || {views: 0, visit: 0}]; });
    const peak = Math.max(1, ...last30.map(([, d]) => d.views));
    const pages = {};
    days.forEach(([, d]) => Object.entries(d.pages || {}).forEach(([p, n]) => { pages[p] = (pages[p] || 0) + n; }));
    const topPage = Math.max(1, ...Object.values(pages));
    const label = Object.fromEntries([...PAGES.map(([k, , l]) => [k, l]), ['item', '제품 상세'], ['tree', '추천 트리']]);
    main.innerHTML = `<p class="eyebrow" lang="en">VISITOR INSIGHTS</p><h1>방문 기록</h1>
      <p class="muted">이 브라우저에서 앱을 연 기록이에요. 서버가 없는 앱이라 다른 기기나 다른 방문자는 집계되지 않아요. 집계 시작: ${esc(v.first)}</p>
      <div class="kpis">
        <div class="kpi"><span>전체 방문</span><b>${visitsTotal}</b><small>브라우저를 새로 연 횟수</small></div>
        <div class="kpi"><span>오늘 방문</span><b>${t.visit || 0}</b><small>${esc(today())}</small></div>
        <div class="kpi"><span>전체 조회 수</span><b>${total}</b><small>화면 이동 기준 · 필터 조작은 제외</small></div>
        <div class="kpi"><span>오늘 조회 수</span><b>${t.views}</b><small>자정에 새로 셉니다</small></div>
      </div>
      <section class="panel"><h2>일별 조회 추이 <small>최근 30일 · 조회 / 방문</small></h2>
        <ul class="daily">${last30.map(([k, d]) => `<li><span>${k.slice(5)}</span><span class="track"><span style="width:${(d.views / peak) * 100}%"></span></span><b>${d.views} / ${d.visit || 0}</b></li>`).join('')}</ul></section>
      <section class="panel"><h2>화면별 조회</h2><ul class="daily">${Object.entries(pages).sort((a, b) => b[1] - a[1]).map(([p, n]) => `<li><span>${esc(label[p] || p)}</span><span class="track"><span style="width:${(n / topPage) * 100}%"></span></span><b>${n}</b></li>`).join('')}</ul>
        <div class="actions"><button type="button" class="mini" data-reset>기록 초기화</button></div></section>`;
    main.onclick = e => { if (e.target.closest('[data-reset]') && confirm('이 브라우저의 방문 기록을 지울까요?')) { store.set('st.visits', null); render(); } };
  }

  // ---------- 증류소별 제품 트리 ----------
  // Whisky tree and tier maker are the atlas modules; boards-shim.js supplies their storage and records.
  function mountBoard(main, id, module, path) {
    main.innerHTML = `<p class="board-import"><label class="btn small">JSON 백업 불러오기<input type="file" accept=".json,application/json" class="sr" data-import></label></p><div id="${id}"></div>`;
    $('[data-import]', main).onchange = async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file || !confirm('이 브라우저에 저장된 보드를 백업 파일 내용으로 바꿀까요?')) return;
      try { await importBoards(path, await file.text()); location.reload(); } catch (err) { toast(err.message); }
    };
    module.mount($(`#${id}`, main), boardRecords());
  }

  // ---------- routing (hash: works from file://) ----------
  const scrolls = new Map();
  let current = location.hash;
  function route() { const [page, id] = location.hash.replace(/^#\/?/, '').split('/'); return {page: page || 'lib', id}; }
  function render() {
    const {page, id} = route();
    const main = $('#main');
    main.onclick = main.onchange = main.onsubmit = null;
    const key = page === 'item' || page === 'tree' ? page : PAGES.some(p => p[0] === page) ? page : 'lib';
    renderShell(key === 'tree' ? 'rec' : key === 'item' ? '' : key);
    document.title = '마시는 큅 · MARTIANQUIP';
    ({item: () => renderDetail(main, id), rec: () => renderRec(main), tree: () => renderTree(main, id), ratings: () => renderRatings(main, id),
      compare: () => renderCompare(main), stats: () => renderStats(main), distill: () => mountBoard(main, 'whisky-tree-editor', WhiskyTree, '/api/whisky-tree'), tier: () => mountBoard(main, 'tier-maker-editor', TierMaker, '/api/tier-maker')}[key] || (() => renderLibrary(main)))();
    return key;
  }
  // Card/detail buttons and sidebar category links work on every page.
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      e.preventDefault(); S.filter = f.dataset.filter; S.facets = {}; S.shown = 40;
      if (route().page !== 'lib' && location.hash !== '' && location.hash !== '#/') location.hash = '#/'; else render();
      return;
    }
    const like = e.target.closest('[data-like]'), cmp = e.target.closest('[data-cmp]');
    if (like) { e.preventDefault(); toggleLike(like.dataset.like); render(); }
    if (cmp) { e.preventDefault(); if (toggleCompare(cmp.dataset.cmp)) render(); }
  });
  addEventListener('hashchange', () => {
    scrolls.set(current, scrollY);
    current = location.hash;
    const key = render();
    logView(key);
    requestAnimationFrame(() => scrollTo(0, key === 'item' ? 0 : scrolls.get(current) || 0));
  });
  logView(render());
})();
