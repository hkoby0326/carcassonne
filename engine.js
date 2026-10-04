// ENGINE-START
// カルカソンヌ ルールエンジン（UIから独立。Nodeでもテスト可能）
(function (root) {
  'use strict';
  // 辺: 0=N 1=E 2=S 3=W。スロット: 辺e のスロットは e*3+k (k=0 左,1 中央,2 右; 時計回り)
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const OPP = e => (e + 2) % 4;
  const neighborSlot = s => OPP(Math.floor(s / 3)) * 3 + (2 - (s % 3));
  const rotSlot = (s, r) => (s + 3 * r) % 12;
  const unrotSlot = (s, r) => (s - 3 * r + 12) % 12;

  // ---- タイル定義 ----
  // e: 辺 N,E,S,W  C=都市 R=道 F=草原 S=川
  // cities: 連結している都市辺のグループ（省略時は全都市辺が1グループ）
  // pennant: 紋章を持つ都市グループ番号
  const BASE_DEFS = [
    { id: 'A', e: 'FFRF', cloister: true, n: 2 },
    { id: 'B', e: 'FFFF', cloister: true, n: 4 },
    { id: 'C', e: 'CCCC', pennant: [0], n: 1 },
    { id: 'D', e: 'CRFR', n: 4, start: true },
    { id: 'E', e: 'CFFF', n: 5 },
    { id: 'F', e: 'CFCF', pennant: [0], n: 2 },
    { id: 'G', e: 'CFCF', n: 1 },
    { id: 'H', e: 'CFCF', cities: [[0], [2]], n: 3 },
    { id: 'I', e: 'CCFF', cities: [[0], [1]], n: 2 },
    { id: 'J', e: 'CRRF', n: 3 },
    { id: 'K', e: 'CFRR', n: 3 },
    { id: 'L', e: 'CRRR', n: 3 },
    { id: 'M', e: 'CCFF', pennant: [0], n: 2 },
    { id: 'N', e: 'CCFF', n: 3 },
    { id: 'O', e: 'CCRR', pennant: [0], n: 2 },
    { id: 'P', e: 'CCRR', n: 3 },
    { id: 'Q', e: 'CCFC', pennant: [0], n: 1 },
    { id: 'R', e: 'CCFC', n: 3 },
    { id: 'S', e: 'CCRC', pennant: [0], n: 2 },
    { id: 'T', e: 'CCRC', n: 1 },
    { id: 'U', e: 'RFRF', n: 8 },
    { id: 'V', e: 'FFRR', n: 9 },
    { id: 'W', e: 'FRRR', n: 4 },
    { id: 'X', e: 'RRRR', n: 1 },
  ];
  // 川（カルカソンヌ21同梱の12枚。実物の写真と照合済み。紋章なし）
  const RIVER_DEFS = [
    { id: 'r_spring', e: 'FFSF', river: 'spring', n: 1 },
    { id: 'r_lake', e: 'FFSF', river: 'lake', n: 1 },
    { id: 'r_straight', e: 'SFSF', n: 2 },                 // 直線
    { id: 'r_bridge', e: 'SRSR', n: 1 },                   // 直線 + 橋（道が横切る）
    { id: 'r_city_road', e: 'SCSR', n: 1 },                // 直線 + 東岸に都市、西から都市へ道
    { id: 'r_city', e: 'CSFS', n: 1 },                     // 直線 + 北岸に都市
    { id: 'r_cloister', e: 'FSRS', cloister: true, cloisterPos: [50, 24], n: 1 }, // 直線 + 北に修道院、南から修道院へ道（橋）
    { id: 'r_curve', e: 'FFSS', n: 2 },                    // カーブ
    { id: 'r_curve_city', e: 'SCCS', n: 1 },               // カーブ + 角の都市
    { id: 'r_curve_road', e: 'RSSR', n: 1 },               // カーブ + 反対の角に道のカーブ
  ];
  // 草原のミープル位置を手で調整したいタイル（そのスロットを含む草原 → 座標）
  const FIELD_MARKER_OVERRIDES = {
    A: { 0: [80, 52] }, B: { 0: [80, 52] },
    Q: { 6: [50, 86] }, R: { 6: [50, 86] }, O: { 6: [46, 54] }, P: { 6: [46, 54] },
    S: { 6: [70, 89], 8: [30, 89] }, T: { 6: [70, 89], 8: [30, 89] },
    r_spring: { 0: [26, 28] }, r_lake: { 0: [26, 28] },
    r_city_road: { 2: [63, 76] }, r_cloister: { 0: [20, 28] }, r_curve_city: { 2: [52, 48] },
  };

  // スロット位置（草原マーカー計算用）
  const SLOT_POS = [[22, 18], [50, 14], [78, 18], [82, 22], [86, 50], [82, 78], [78, 82], [50, 86], [22, 82], [18, 78], [14, 50], [18, 22]];

  function cityShape(edges) {
    const es = edges.slice().sort();
    if (es.length === 4) return { kind: 'full', rot: 0 };
    if (es.length === 3) { const miss = [0, 1, 2, 3].find(e => !es.includes(e)); return { kind: 'triple', rot: (miss + 2) % 4 }; }
    if (es.length === 2) {
      if ((es[1] - es[0]) === 2) return { kind: 'band', rot: es[0] };
      const a = es.includes(3) && es.includes(0) ? 3 : es[0];
      return { kind: 'corner', rot: a };
    }
    return { kind: 'cap', rot: es[0] };
  }
  function rotPt(p, r) { let [x, y] = p; for (let i = 0; i < r; i++) { [x, y] = [100 - y, x]; } return [x, y]; }

  function buildType(def) {
    const edges = def.e.split('');
    const feats = [];
    const slotFeat = new Array(12).fill(-1);
    const idx = ch => edges.map((c, i) => c === ch ? i : -1).filter(i => i >= 0);
    const cityEdges = idx('C');
    const cityGroups = def.cities || (cityEdges.length ? [cityEdges] : []);
    cityGroups.forEach((g, gi) => {
      const slots = []; g.forEach(e => slots.push(e * 3, e * 3 + 1, e * 3 + 2));
      const fi = feats.length;
      const shape = cityShape(g);
      const base = { full: [50, 50], triple: [50, 40], band: [50, 56], corner: [74, 26], cap: [50, 16] }[shape.kind];
      const pen = { full: [28, 44], triple: [28, 32], band: [50, 30], corner: [52, 20], cap: [28, 12] }[shape.kind];
      feats.push({ type: 'city', slots, edges: g, pennant: (def.pennant || []).includes(gi), shape, marker: rotPt(base, shape.rot), pennantPos: rotPt(pen, shape.rot) });
      slots.forEach(s => slotFeat[s] = fi);
    });
    const roadEdges = idx('R');
    const roadGroups = def.roads || (roadEdges.length <= 2 ? (roadEdges.length ? [roadEdges] : []) : roadEdges.map(e => [e]));
    roadGroups.forEach(g => {
      const slots = g.map(e => e * 3 + 1); const fi = feats.length;
      feats.push({ type: 'road', slots, edges: g, marker: pathMarker(g) });
      slots.forEach(s => slotFeat[s] = fi);
    });
    const riverEdges = idx('S');
    if (riverEdges.length) {
      const slots = riverEdges.map(e => e * 3 + 1); const fi = feats.length;
      feats.push({ type: 'river', slots, edges: riverEdges, marker: pathMarker(riverEdges), kind: def.river || null });
      slots.forEach(s => slotFeat[s] = fi);
    }
    if (def.cloister) feats.push({ type: 'cloister', slots: [], edges: [], marker: def.cloisterPos || [50, 52] });
    // 草原: 時計回りに走査し、道/川の中央スロット、または対辺を含む都市で区切る
    const fieldSlots = []; for (let s = 0; s < 12; s++) if (slotFeat[s] === -1) fieldSlots.push(s);
    if (fieldSlots.length) {
      const cutsBetween = (a, b) => { // a→b 時計回りの間にある非草原スロットで切れるか
        for (let s = (a + 1) % 12; s !== b; s = (s + 1) % 12) {
          const f = feats[slotFeat[s]];
          if (f.type === 'road' || f.type === 'river') return true;
          if (f.type === 'city') { const es = f.edges; if (es.some(e => es.includes((e + 2) % 4))) return true; }
        }
        return false;
      };
      const groups = [];
      let cur = [fieldSlots[0]];
      for (let i = 1; i < fieldSlots.length; i++) {
        if (cutsBetween(fieldSlots[i - 1], fieldSlots[i])) { groups.push(cur); cur = []; }
        cur.push(fieldSlots[i]);
      }
      groups.push(cur);
      if (groups.length > 1 && !cutsBetween(fieldSlots[fieldSlots.length - 1], fieldSlots[0])) {
        const last = groups.pop(); groups[0] = last.concat(groups[0]);
      }
      groups.forEach(g => {
        const fi = feats.length;
        const adjCities = [];
        feats.forEach((f, cfi) => { if (f.type !== 'city') return; if (g.some(s => f.slots.includes((s + 1) % 12) || f.slots.includes((s + 11) % 12))) adjCities.push(cfi); });
        let marker;
        const ovMap = FIELD_MARKER_OVERRIDES[def.id] || {};
        const ovSlot = Object.keys(ovMap).find(s => g.includes(Number(s)));
        const ov = ovSlot !== undefined ? ovMap[ovSlot] : null;
        if (ov) marker = ov.slice(); else {
          const pts = []; const seen = new Set();
          g.forEach(s => { const k = SLOT_POS[s].join(); if (!seen.has(k)) { seen.add(k); pts.push(SLOT_POS[s]); } });
          let x = pts.reduce((a, p) => a + p[0], 0) / pts.length, y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
          adjCities.forEach(cfi => feats[cfi].edges.forEach(e => {
            if (e === 0 && y < 40) y = 40; if (e === 2 && y > 60) y = 60; if (e === 1 && x > 60) x = 60; if (e === 3 && x < 40) x = 40;
          }));
          marker = [Math.round(x), Math.round(y)];
        }
        feats.push({ type: 'field', slots: g, edges: [], adjCities, marker });
        g.forEach(s => slotFeat[s] = fi);
      });
    }
    return { id: def.id, e: def.e, n: def.n, cloister: !!def.cloister, cloisterPos: def.cloisterPos || [50, 52], river: def.river || null, isRiver: riverEdges.length > 0, start: !!def.start, feats, slotFeat };
  }
  function pathMarker(g) {
    const mid = e => [[50, 0], [100, 50], [50, 100], [0, 50]][e];
    if (g.length === 1) { const m = mid(g[0]); return [m[0] + (50 - m[0]) * 0.5, m[1] + (50 - m[1]) * 0.5]; }
    if (g.length === 2) {
      const [a, b] = [mid(g[0]), mid(g[1])];
      if ((g[1] - g[0]) % 2 === 0) return [50, 50];
      // 2次ベジェ(制御点 50,50) の t=0.5
      return [0.25 * a[0] + 25 + 0.25 * b[0], 0.25 * a[1] + 25 + 0.25 * b[1]];
    }
    return [50, 50];
  }

  const TYPES = {};
  BASE_DEFS.concat(RIVER_DEFS).forEach(d => { TYPES[d.id] = buildType(d); });

  // ---- 盤面ユーティリティ ----
  const key = (x, y) => x + ',' + y;
  const parseKey = k => k.split(',').map(Number);
  function edgeType(tile, e) { return TYPES[tile.t].e[(e - tile.r + 4) % 4]; }
  function featAt(tile, slot) { // 盤面上の回転済みスロット → 特徴番号
    return TYPES[tile.t].slotFeat[unrotSlot(slot, tile.r)];
  }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  function newGame(opts) {
    const rnd = opts.rnd || Math.random;
    const players = opts.players.map((p, i) => ({ id: i, name: p.name, color: p.color, score: 0, meeples: 7 }));
    const stack = [];
    BASE_DEFS.forEach(d => { for (let i = 0; i < d.n; i++) stack.push(d.id); });
    const st = {
      players, current: 0, phase: 'place', options: { river: !!opts.river, farmers: opts.farmers !== false },
      board: {}, stack: [], riverStack: [], tile: null, last: null, log: [], discards: [], turn: 1,
      river: { lastTurn: null, active: false }, pendingPlacement: null,
    };
    if (opts.river) {
      st.board[key(0, 0)] = { t: 'r_spring', r: 0, meeples: [] };
      const rs = []; RIVER_DEFS.forEach(d => { if (d.river) return; for (let i = 0; i < d.n; i++) rs.push(d.id); });
      shuffle(rs, rnd);
      st.riverStack = ['r_lake'].concat(rs); // pop で取るので湖を底に
      st.river.active = true;
    } else {
      st.board[key(0, 0)] = { t: 'D', r: 0, meeples: [] };
      stack.splice(stack.indexOf('D'), 1);
    }
    shuffle(stack, rnd);
    st.stack = stack;
    drawTile(st);
    return st;
  }

  function neighborsOf(st, x, y) {
    return DIRS.map(([dx, dy], e) => ({ e, t: st.board[key(x + dx, y + dy)] }));
  }

  function canPlace(st, x, y, typeId, rot) {
    if (st.board[key(x, y)]) return false;
    const type = TYPES[typeId];
    const fake = { t: typeId, r: rot };
    let any = false, riverIn = -1;
    for (let e = 0; e < 4; e++) {
      const [dx, dy] = DIRS[e];
      const nb = st.board[key(x + dx, y + dy)];
      if (!nb) continue;
      any = true;
      const mine = edgeType(fake, e), theirs = edgeType(nb, OPP(e));
      if (mine !== theirs) return false;
      if (mine === 'S') riverIn = e;
    }
    if (!any) return false;
    if (type.isRiver) {
      if (riverIn < 0) return false;
      const rEdges = [0, 1, 2, 3].filter(e => edgeType(fake, e) === 'S');
      if (rEdges.length === 2) {
        const out = rEdges.find(e => e !== riverIn);
        const turn = (out - riverIn + 4) % 4; // 1=左 3=右 2=直進
        if (turn !== 2 && st.river.lastTurn === turn) return false;
        // 川の出口の先がすでに埋まっていたら不可。さらに出口のマスが必ず湖で閉じられるよう、
        // そのマスに接する他のタイルの辺はすべて草原でなければならない（川が行き止まりになるのを防ぐ）
        const [ox, oy] = DIRS[out];
        const ex = x + ox, ey = y + oy;
        if (st.board[key(ex, ey)]) return false;
        for (let e = 0; e < 4; e++) {
          const [dx, dy] = DIRS[e];
          if (ex + dx === x && ey + dy === y) continue;
          const nb = st.board[key(ex + dx, ey + dy)];
          if (nb && edgeType(nb, OPP(e)) !== 'F') return false;
        }
      }
    } else if (st.river.active) {
      return false;
    }
    return true;
  }

  function legalPlacements(st, typeId) {
    typeId = typeId || st.tile;
    const cells = new Set();
    Object.keys(st.board).forEach(k => { const [x, y] = parseKey(k); DIRS.forEach(([dx, dy]) => { const kk = key(x + dx, y + dy); if (!st.board[kk]) cells.add(kk); }); });
    const out = [];
    cells.forEach(k => {
      const [x, y] = parseKey(k);
      const rots = [0, 1, 2, 3].filter(r => canPlace(st, x, y, typeId, r));
      if (rots.length) out.push({ x, y, rots });
    });
    return out;
  }

  function drawTile(st) {
    st.tile = null;
    // 川: 置けない川タイルは山の下（湖の上）に戻して別のタイルを試す。どれも置けなければ川を終える
    let tries = st.riverStack.length;
    while (tries-- > 0) {
      const t = st.riverStack.pop();
      if (legalPlacements(st, t).length) { st.tile = t; st.phase = 'place'; return t; }
      if (st.riverStack[0] === 'r_lake') st.riverStack.splice(1, 0, t); else st.riverStack.unshift(t);
      st.log.push({ type: 'river-skip', tile: t });
    }
    if (st.riverStack.length) { st.discards.push(...st.riverStack); st.riverStack = []; st.log.push({ type: 'river-end' }); }
    st.river.active = false;
    while (st.stack.length) {
      const t = st.stack.pop();
      if (legalPlacements(st, t).length) { st.tile = t; st.phase = 'place'; return t; }
      st.discards.push(t);
      st.log.push({ type: 'discard', tile: t });
    }
    return null;
  }

  function placeTile(st, x, y, rot) {
    if (st.phase !== 'place' || !st.tile) throw new Error('not in place phase');
    if (!canPlace(st, x, y, st.tile, rot)) throw new Error('illegal placement');
    const type = TYPES[st.tile];
    st.board[key(x, y)] = { t: st.tile, r: rot, meeples: [] };
    st.last = { x, y };
    if (type.isRiver) {
      const fake = { t: st.tile, r: rot };
      const rEdges = [0, 1, 2, 3].filter(e => edgeType(fake, e) === 'S');
      if (rEdges.length === 2) {
        const riverIn = rEdges.find(e => { const [dx, dy] = DIRS[e]; return st.board[key(x + dx, y + dy)] && key(x + dx, y + dy) !== key(x, y); });
        const out = rEdges.find(e => e !== riverIn);
        const turn = (out - riverIn + 4) % 4;
        st.river.lastTurn = turn === 2 ? null : turn;
      }
      if (type.river === 'lake') st.river.active = false;
    }
    st.phase = 'meeple';
    st.tile = null;
  }

  // ---- 特徴（連結成分）の構築 ----
  function buildComponents(st) {
    const parent = {};
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    const fk = (k, fi) => k + '|' + fi;
    Object.keys(st.board).forEach(k => { TYPES[st.board[k].t].feats.forEach((f, fi) => { parent[fk(k, fi)] = fk(k, fi); }); });
    Object.keys(st.board).forEach(k => {
      const [x, y] = parseKey(k); const tile = st.board[k]; const type = TYPES[tile.t];
      type.feats.forEach((f, fi) => {
        f.slots.forEach(s => {
          const rs = rotSlot(s, tile.r);
          const e = Math.floor(rs / 3); const [dx, dy] = DIRS[e];
          const nk = key(x + dx, y + dy); const nb = st.board[nk];
          if (!nb) return;
          const nfi = featAt(nb, neighborSlot(rs));
          if (nfi >= 0) union(fk(k, fi), fk(nk, nfi));
        });
      });
    });
    const comps = {};
    Object.keys(st.board).forEach(k => {
      const [x, y] = parseKey(k); const tile = st.board[k]; const type = TYPES[tile.t];
      type.feats.forEach((f, fi) => {
        const root = find(fk(k, fi));
        let c = comps[root];
        if (!c) c = comps[root] = { id: root, type: f.type, members: [], tiles: new Set(), open: 0, pennants: 0, meeples: [], adjCities: new Set(), cx: 0, cy: 0 };
        c.members.push({ k, fi });
        c.tiles.add(k);
        if (f.pennant) c.pennants++;
        f.slots.forEach(s => { const rs = rotSlot(s, tile.r); const e = Math.floor(rs / 3); const [dx, dy] = DIRS[e]; if (!st.board[key(x + dx, y + dy)]) c.open++; });
        tile.meeples.forEach(m => { if (m.fi === fi) c.meeples.push({ player: m.player, k, fi }); });
        if (f.type === 'cloister') { c.cx = x; c.cy = y; }
        if (f.type === 'field') f.adjCities.forEach(cfi => c.adjCities.add(find(fk(k, cfi))));
      });
    });
    Object.values(comps).forEach(c => {
      if (c.type === 'cloister') { let n = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && st.board[key(c.cx + dx, c.cy + dy)]) n++; c.neighbors = n; c.complete = n === 8; }
      else if (c.type === 'city' || c.type === 'road') c.complete = c.open === 0;
      else c.complete = false;
    });
    return { comps, find, fk };
  }

  function compOfTile(C, k, fi) { return C.comps[C.find(C.fk(k, fi))]; }

  function meepleOptions(st) {
    if (st.phase !== 'meeple' || !st.last) return [];
    const p = st.players[st.current];
    if (p.meeples <= 0) return [];
    const k = key(st.last.x, st.last.y); const tile = st.board[k]; const type = TYPES[tile.t];
    const C = buildComponents(st);
    const out = [];
    type.feats.forEach((f, fi) => {
      if (f.type === 'river') return;
      if (f.type === 'field' && !st.options.farmers) return;
      const c = compOfTile(C, k, fi);
      if (c.meeples.length) return;
      out.push(fi);
    });
    return out;
  }

  function scoreValue(c, endGame) {
    if (c.type === 'city') return endGame ? c.tiles.size + c.pennants : 2 * c.tiles.size + 2 * c.pennants;
    if (c.type === 'road') return c.tiles.size;
    if (c.type === 'cloister') return 1 + c.neighbors;
    return 0;
  }
  function majority(c) {
    const cnt = {}; c.meeples.forEach(m => cnt[m.player] = (cnt[m.player] || 0) + 1);
    const max = Math.max(0, ...Object.values(cnt));
    return Object.keys(cnt).filter(p => cnt[p] === max).map(Number);
  }
  function awardAndReturn(st, c, pts, label) {
    const winners = majority(c);
    winners.forEach(p => { st.players[p].score += pts; });
    c.meeples.forEach(m => { const tile = st.board[m.k]; tile.meeples = tile.meeples.filter(mm => !(mm.fi === m.fi && mm.player === m.player)); st.players[m.player].meeples++; });
    st.log.push({ type: 'score', feature: c.type, points: pts, players: winners, label, turn: st.turn, tiles: c.tiles.size });
    return { winners, pts };
  }

  // ミープルを置く(fi=null で置かない) → 得点 → 次の手番
  function placeMeeple(st, fi) {
    if (st.phase !== 'meeple') throw new Error('not in meeple phase');
    const k = key(st.last.x, st.last.y);
    if (fi !== null && fi !== undefined) {
      if (!meepleOptions(st).includes(fi)) throw new Error('illegal meeple');
      st.board[k].meeples.push({ fi, player: st.current });
      st.players[st.current].meeples--;
    }
    // 得点計算
    const C = buildComponents(st);
    const done = new Set();
    const events = [];
    const type = TYPES[st.board[k].t];
    type.feats.forEach((f, i) => {
      if (f.type !== 'city' && f.type !== 'road') return;
      const c = compOfTile(C, k, i);
      if (done.has(c.id) || !c.complete) return; done.add(c.id);
      if (c.meeples.length) events.push(awardAndReturn(st, c, scoreValue(c, false), f.type));
    });
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nk = key(st.last.x + dx, st.last.y + dy); const nb = st.board[nk]; if (!nb) continue;
      TYPES[nb.t].feats.forEach((f, i) => {
        if (f.type !== 'cloister') return;
        const c = compOfTile(C, nk, i);
        if (done.has(c.id) || !c.complete) return; done.add(c.id);
        if (c.meeples.length) events.push(awardAndReturn(st, c, scoreValue(c, false), 'cloister'));
      });
    }
    st.lastEvents = events;
    // 次の手番
    st.turn++;
    st.current = (st.current + 1) % st.players.length;
    const t = drawTile(st);
    if (!t) finishGame(st);
    return events;
  }

  function finishGame(st) {
    const C = buildComponents(st);
    const events = [];
    Object.values(C.comps).forEach(c => {
      if (!c.meeples.length) return;
      let pts = 0;
      if (c.type === 'field') { let n = 0; c.adjCities.forEach(cid => { const cc = C.comps[cid]; if (cc && cc.complete) n++; }); pts = 3 * n; }
      else pts = scoreValue(c, true);
      events.push(awardAndReturn(st, c, pts, 'end:' + c.type));
    });
    st.phase = 'end'; st.tile = null; st.finalEvents = events;
    return events;
  }

  root.CarcEngine = { TYPES, BASE_DEFS, RIVER_DEFS, DIRS, key, parseKey, rotSlot, unrotSlot, rotPt, newGame, canPlace, legalPlacements, placeTile, meepleOptions, placeMeeple, buildComponents, compOfTile, finishGame, drawTile, edgeType, featAt };
})(typeof window !== 'undefined' ? window : globalThis);
// ENGINE-END
