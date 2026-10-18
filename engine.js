// Pure recommendation logic on the 0–5 NPF scores. Works as a browser global and as a Node module.
// Scores are overlap of the author's recorded notes — not a probability of liking.
(function (root) {
  const STAGES = ['n', 'p', 'f'];

  // Mean of the stages where a family was scored above 0; unscored stages are not zeros.
  function vector(item) {
    const sums = {};
    for (const s of STAGES) {
      for (const [fam, v] of Object.entries(item.npf[s].f)) {
        if (v > 0) { (sums[fam] ||= []).push(v); }
      }
    }
    return Object.fromEntries(Object.entries(sums).map(([k, vs]) => [k, vs.reduce((a, b) => a + b, 0) / vs.length]));
  }

  function topFamilies(item, n = 3) {
    return Object.entries(vector(item)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, n);
  }

  function similarity(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    const common = ka.filter(k => b[k] > 0);
    if (!common.length) return null;
    const dot = common.reduce((s, k) => s + a[k] * b[k], 0);
    const na = Math.sqrt(ka.reduce((s, k) => s + a[k] ** 2, 0)), nb = Math.sqrt(kb.reduce((s, k) => s + b[k] ** 2, 0));
    const union = new Set([...ka, ...kb]).size;
    const shared = common.sort((x, y) => a[y] * b[y] - a[x] * b[x] || x.localeCompare(y, 'ko')).slice(0, 4);
    return {score: 100 * (0.7 * dot / (na * nb) + 0.3 * common.length / union), shared};
  }

  const clamp = v => Math.round(Math.max(0, Math.min(100, v)));
  const byId = (a, b) => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);
  const explore = s => 100 - 1.5 * Math.abs(s - 65);

  function average(vectors) {
    const acc = {};
    for (const v of vectors) for (const [k, x] of Object.entries(v)) (acc[k] ||= []).push(x);
    // A family missing from one liked item counts as 0 there: favours notes shared by all likes.
    return Object.fromEntries(Object.entries(acc).map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / vectors.length]));
  }

  /**
   * liked / disliked: arrays of items. opts.pool: candidate items. mode: 'similar' | 'explore'.
   */
  function recommend(pool, liked, {disliked = [], mode = 'similar', limit = 20} = {}) {
    const anchors = liked.map(vector).filter(v => Object.keys(v).length);
    if (!anchors.length) return [];
    const anchor = average(anchors);
    const negatives = disliked.map(vector).filter(v => Object.keys(v).length);
    const skip = new Set([...liked, ...disliked].map(i => i.id));
    const out = [];
    for (const item of pool) {
      if (skip.has(item.id)) continue;
      const v = vector(item);
      const m = similarity(anchor, v);
      if (!m) continue;
      const penalty = negatives.length ? Math.max(...negatives.map(n => similarity(n, v)?.score || 0)) * 0.3 : 0;
      out.push({item, score: clamp((mode === 'explore' ? explore(m.score) : m.score) - penalty), shared: m.shared, penalty});
    }
    return out.sort((a, b) => b.score - a.score || byId(a, b)).slice(0, limit);
  }

  // Tree step: the next k items from one node, never repeating anything already in the tree.
  function children(pool, node, used, {k = 3, mode = 'similar'} = {}) {
    return recommend(pool.filter(i => !used.has(i.id)), [node], {mode, limit: k});
  }

  const api = {vector, topFamilies, similarity, recommend, children};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
