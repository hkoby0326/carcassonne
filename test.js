// ルールエンジンのテスト: node test.js
require('./engine.js');
const E = globalThis.CarcEngine;
let fails = 0, passes = 0;
function eq(a, b, msg) { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) passes++; else { fails++; console.log('FAIL', msg, '\n  got     ', JSON.stringify(a), '\n  expected', JSON.stringify(b)); } }
function ok(c, msg) { eq(!!c, true, msg); }
const seeded = (seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; });

// 1. 枚数
eq(E.BASE_DEFS.reduce((a, d) => a + d.n, 0), 72, 'base tiles 72');
eq(E.RIVER_DEFS.reduce((a, d) => a + d.n, 0), 12, 'river tiles 12');
{ const g = E.newGame({ players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }], river: false, rnd: seeded(1) }); eq(g.stack.length + 1 + 1, 72, 'stack 70 + start + hand'); }
{ const g = E.newGame({ players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }], river: true, rnd: seeded(1) }); eq(g.stack.length, 72, 'river game: full base stack'); eq(g.riverStack.length + 1 + 1, 12, 'river stack 10 + spring + hand'); eq(g.riverStack[0], 'r_lake', 'lake drawn last'); ok(g.river.active, 'river active'); }

// 2. 草原の分割
const nf = id => E.TYPES[id].feats.filter(f => f.type === 'field').length;
eq([nf('D'), nf('F'), nf('H'), nf('L'), nf('X'), nf('P'), nf('S'), nf('A'), nf('E'), nf('W'), nf('J'), nf('r_bridge'), nf('r_city_road'), nf('r_curve_city'), nf('r_cloister')], [2, 2, 1, 3, 4, 2, 2, 1, 1, 3, 2, 4, 3, 2, 3], 'field counts');
eq(E.TYPES['D'].feats.filter(f => f.type === 'field').map(f => f.adjCities.length), [1, 0], 'D: only the upper field touches the city');
eq(E.TYPES['H'].feats.filter(f => f.type === 'field')[0].adjCities.length, 2, 'H: field touches both cities');
eq(E.TYPES['F'].feats.filter(f => f.type === 'field').map(f => f.adjCities.length), [1, 1], 'F band: both fields touch the city');
eq(E.TYPES['L'].feats.filter(f => f.type === 'road').length, 3, 'L: junction = 3 roads');
eq(E.TYPES['V'].feats.filter(f => f.type === 'road').length, 1, 'V: curve = 1 road');

// ヘルパ: 制御されたゲーム
function game(players = 2) {
  const g = E.newGame({ players: Array.from({ length: players }, (_, i) => ({ name: 'p' + i, color: 'c' + i })), river: false, rnd: seeded(7) });
  g.stack = Array(40).fill('B'); // 常に置ける修道院で埋めておく
  return g;
}
function play(g, type, x, y, rot, fi) { g.tile = type; g.phase = 'place'; ok(E.canPlace(g, x, y, type, rot), `canPlace ${type}@${x},${y} r${rot}`); E.placeTile(g, x, y, rot); return E.placeMeeple(g, fi === undefined ? null : fi); }
const fiOf = (type, pred) => E.TYPES[type].feats.findIndex(pred);

// 3. 配置の合法性
{ const g = game(); ok(E.canPlace(g, 1, 0, 'U', 1), 'U rot1 fits east of D'); ok(!E.canPlace(g, 1, 0, 'U', 0), 'U rot0 does not fit'); ok(!E.canPlace(g, 0, 0, 'U', 1), 'occupied'); ok(!E.canPlace(g, 5, 5, 'U', 1), 'not adjacent'); ok(E.canPlace(g, 0, -1, 'E', 2), 'E city facing south fits north of D'); ok(!E.canPlace(g, 0, -1, 'E', 0), 'E rot0 field vs city'); }

// 4. 道の完成: 6枚のループ
{ const g = game();
  const roadV = fiOf('V', f => f.type === 'road'), roadU = fiOf('U', f => f.type === 'road');
  let ev = play(g, 'V', 1, 0, 0, roadV); eq(ev.length, 0, 'road not complete yet'); eq(g.players[0].meeples, 6, 'meeple used');
  play(g, 'V', -1, 0, 3);
  play(g, 'V', -1, 1, 2);
  play(g, 'V', 1, 1, 1);
  ok(!E.canPlace(g, 0, 1, 'U', 0), 'U vertical does not close the loop');
  ev = play(g, 'U', 0, 1, 1);
  eq(ev.length, 1, 'road completed'); eq(g.players[0].score, 6, 'road loop = 6 points'); eq(g.players[0].meeples, 7, 'meeple returned');
}
// 5. 都市 + 紋章、置いた瞬間の完成
{ const g = game(); const cityE = fiOf('E', f => f.type === 'city');
  const ev = play(g, 'E', 0, -1, 2, cityE); eq(ev.length, 1, 'city completes on placement'); eq(g.players[0].score, 4, '2 tiles city = 4');
  // 紋章付き: F(CFCF 紋章) を縦に、両端を E で閉じる → 3枚+紋章1 = 8
  const g2 = game(); const cityF = fiOf('F', f => f.type === 'city');
  play(g2, 'F', 0, -1, 0, cityF); // 都市 N-S（D の都市と連結）
  const ev2 = play(g2, 'E', 0, -2, 2); // 北を閉じる
  eq(ev2.length, 1, 'pennant city completes'); eq(g2.players[0].score, 8, '3 tiles + pennant = 8');
}
// 6. 修道院 9点
{ // 修道院を正しく囲む: 周囲8枚
  const g = game(); const clB = fiOf('B', f => f.type === 'cloister');
  // D(0,0) の下に B を置き、B の周囲を埋める。D の東西は道なので U 横で延長
  play(g, 'B', 0, 1, 0, clB);
  play(g, 'U', 1, 0, 1); play(g, 'U', -1, 0, 1);
  [[-1, 1], [1, 1], [-1, 2], [0, 2]].forEach(([x, y]) => play(g, 'B', x, y, 0));
  const ev = play(g, 'B', 1, 2, 0);
  eq(ev.length, 1, 'cloister complete'); eq(g.players[0].score, 9, 'cloister = 9'); eq(g.players[0].meeples, 7, 'cloister meeple returned');
}
// 7. 農夫: 完成都市1つ = 3点、未完成都市は 0
{ const g = game(); const upperField = fiOf('D', f => f.type === 'field' && f.adjCities.length === 1);
  const cityE = fiOf('E', f => f.type === 'city');
  // D の上側草原に農夫 → 都市を E で閉じる
  const g1 = game(); g1.board['0,0'].meeples.push({ fi: upperField, player: 1 }); g1.players[1].meeples--;
  play(g1, 'E', 0, -1, 2); E.finishGame(g1);
  eq(g1.players[1].score, 3, 'farmer: 1 completed city = 3');
  // 未完成なら 0
  const g2 = game(); g2.board['0,0'].meeples.push({ fi: upperField, player: 1 }); E.finishGame(g2);
  eq(g2.players[1].score, 0, 'farmer: incomplete city = 0');
  // 下側草原は都市に接しない
  const lowerField = fiOf('D', f => f.type === 'field' && f.adjCities.length === 0);
  const g3 = game(); g3.board['0,0'].meeples.push({ fi: lowerField, player: 1 }); play(g3, 'E', 0, -1, 2); E.finishGame(g3);
  eq(g3.players[1].score, 0, 'farmer on far field = 0');
}
// 8. ゲーム終了時の未完成得点
{ const g = game(); const cityE = fiOf('E', f => f.type === 'city'); const roadU = fiOf('U', f => f.type === 'road');
  play(g, 'U', 1, 0, 1, roadU); // 未完成の道 2枚
  g.board['0,0'].meeples.push({ fi: fiOf('D', f => f.type === 'city'), player: 1 });
  E.finishGame(g);
  eq(g.players[0].score, 2, 'end: incomplete road 2 tiles = 2'); eq(g.players[1].score, 1, 'end: incomplete city 1 tile = 1'); eq(g.phase, 'end', 'phase end');
}
// 9. 多数決と同数
{ const g = game(); const roadU = fiOf('U', f => f.type === 'road');
  play(g, 'U', 1, 0, 1, roadU); // p0 道
  g.tile = 'U'; g.phase = 'place'; E.placeTile(g, -1, 0, 1); // 同じ道（D を貫通）
  ok(!E.meepleOptions(g).includes(roadU), 'cannot place on occupied road');
  E.placeMeeple(g, null);
}
{ const g = game(); const roadU = fiOf('U', f => f.type === 'road'); const roadV = fiOf('V', f => f.type === 'road');
  // 道 A: D(0,0) 東へ。V(1,0) rot0 (S,W): 西で D に接続、南へ (1,1)
  play(g, 'V', 1, 0, 0, roadV); // p0 道 A
  // 道 B: (1,2) に U 横 (E,W)。(1,1) は空なので隣接が必要 → 先に (0,1),(0,2) を B で埋める
  play(g, 'B', 0, 1, 0);           // p1
  play(g, 'B', 0, 2, 0);           // p0
  play(g, 'V', 1, 2, 2, roadV);    // p1: (1,2) N,E 道。西は B(0,2) E=F ✓, 北 (1,1) 空 → 道 B（p1）
  // (1,1) に U 縦 (N,S) → 道 A と B が結合 → p0,p1 同数、未完成（東端 (2,2) 開）
  const ev = play(g, 'U', 1, 1, 0);
  eq(ev.length, 0, 'merged road still open');
  E.finishGame(g);
  eq([g.players[0].score, g.players[1].score], [4, 4], 'tie: both score road 4 tiles at end');
}
// 10. 川: U ターン禁止、湖が最後、川の上は置けない
{ const g = E.newGame({ players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }], river: true, rnd: seeded(3) });
  eq(g.board['0,0'].t, 'r_spring', 'spring placed');
  // 泉 FFSF: 川は南へ。カーブ FFSS(S,W) を (0,1) に: 北で接続するには rot2 (N,E) か rot1 (W,N)
  g.tile = 'r_curve'; ok(E.canPlace(g, 0, 1, 'r_curve', 2), 'curve N→E ok'); ok(E.canPlace(g, 0, 1, 'r_curve', 1), 'curve N→W ok'); ok(!E.canPlace(g, 0, 1, 'r_curve', 0), 'curve wrong side');
  ok(!E.canPlace(g, 0, 1, 'U', 0), 'normal tile not allowed during river');
  E.placeTile(g, 0, 1, 2); // 流れ: 南向きに進入 → 東へ出る = 左折? 進入辺 N(0), 出口 E(1) → turn 1
  eq(g.river.lastTurn, 1, 'turn recorded');
  g.riverStack.push('r_curve'); E.placeMeeple(g, null);
  eq(g.tile, 'r_curve', 'next is curve');
  // (1,1) に接続: 西から進入。同じ向き(turn 1)は W→? 進入 W(3), 出口 N(0): (0-3+4)%4=1 → 禁止。出口 S(2): (2-3+4)%4=3 → OK
  const rots = [0, 1, 2, 3].filter(r => E.canPlace(g, 1, 1, 'r_curve', r));
  eq(rots.length, 1, 'only one curve rotation allowed after same-direction turn');
  const fake = { t: 'r_curve', r: rots[0] }; eq([E.edgeType(fake, 3), E.edgeType(fake, 2)], ['S', 'S'], 'allowed curve exits south');
  // 川の上にはコマを置けない
  E.placeTile(g, 1, 1, rots[0]);
  const opts = E.meepleOptions(g); ok(!opts.some(fi => E.TYPES['r_curve'].feats[fi].type === 'river'), 'no meeple on river');
  ok(opts.some(fi => E.TYPES['r_curve'].feats[fi].type === 'field'), 'field on river tile allowed');
}
{ // 川を最後まで流す（最初の候補を選ぶ最悪ケース）: 湖が最後に置かれ、川が閉じる
  let skipped = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = E.newGame({ players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }], river: true, rnd: seeded(seed) });
    let n = 1, lastT = null, guard = 0;
    while (g.river.active && g.phase === 'place' && guard++ < 20) {
      const lp = E.legalPlacements(g); if (!lp.length) break;
      const c = lp[0]; lastT = g.tile; E.placeTile(g, c.x, c.y, c.rots[0]); n++; E.placeMeeple(g, null);
    }
    const lakeLast = lastT === 'r_lake';
    const C = E.buildComponents(g); const openRiver = Object.values(C.comps).filter(c => c.type === 'river' && c.open > 0).length;
    skipped += 12 - n;
    if (!(lakeLast && openRiver === 0 && !g.river.active)) { fails++; console.log('FAIL river seed', seed, n, lakeLast, openRiver, g.discards); } else passes++;
  }
  console.log('river: skipped tiles over 60 greedy games =', skipped);
}
// 11. 置けないタイルは捨てられる
{ const g = game(); g.stack = ['B', 'C']; // pop で C が先に引かれる
  g.tile = 'E'; E.placeTile(g, 0, -1, 2); E.placeMeeple(g, null); // D の都市を閉じると C(全都市) はどこにも置けない
  eq(g.discards, ['C'], 'unplaceable tile discarded'); eq(g.tile, 'B', 'next tile drawn');
}
// 12. フルゲームをランダムに通す（例外なし・最後に end）
{ for (let seed = 1; seed <= 20; seed++) {
    const g = E.newGame({ players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'blue' }, { name: 'c', color: 'yellow' }], river: seed % 2 === 0, rnd: seeded(seed * 11) });
    let guard = 0;
    while (g.phase !== 'end' && guard++ < 200) {
      const lp = E.legalPlacements(g); const c = lp[Math.floor(seeded(seed + guard)() * lp.length)];
      E.placeTile(g, c.x, c.y, c.rots[0]);
      const opts = E.meepleOptions(g); E.placeMeeple(g, opts.length && guard % 2 ? opts[0] : null);
    }
    const tiles = Object.keys(g.board).length + g.discards.length;
    const totalMeeples = g.players.reduce((a, p) => a + p.meeples, 0);
    if (!(g.phase === 'end' && tiles === (g.options.river ? 84 : 72) && totalMeeples === 21)) { fails++; console.log('FAIL full game seed', seed, g.phase, tiles, totalMeeples); } else passes++;
  }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
