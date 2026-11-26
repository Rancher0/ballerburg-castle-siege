// Node-Tests: Burgen (alle Layouts), Schadensmodell (Loch statt Einsturz, 2 Treffer = Einsturz), Windpfeil,
// Ballistik/KI, eigene Burg nie im Weg, Wirtschaft.   Aufruf: node tests/logic.test.mjs
import { createWorld, allAsleep, dynamicBodies, pointInBox } from '../src/physics.js';
import { castlePlan, toWorld, muzzle, LAYOUT_IDS } from '../src/castle.js';
import { WEAPONS } from '../src/config.js';
import { solveShot, simulate, launchVelocity, windScreenAngle } from '../src/ballistics.js';
import { newEconomy, settleTurn, forecast } from '../src/economy.js';
import { buildCastleState, applyHit, supportPass, repairCastle, keyOf } from '../src/damage.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fail++; };
const rnd = () => 0.3;

for (const layout of LAYOUT_IDS) {
  const plan = castlePlan(layout);
  console.log(`--- Layout ${layout}: ${plan.blocks.length} Blöcke`);
  ok(plan.blocks.length >= 650, `${layout}: große Burg (${plan.blocks.length} Steine)`);
  const keys = new Set(plan.blocks.map(b => `${b.u},${b.v},${b.l}`));
  for (const [id, w] of Object.entries(plan.weapons)) ok(w.support.every(k => keys.has(k.join(','))), `${layout}: Unterbau für ${WEAPONS[id].name} vorhanden`);
  // Mauer mindestens 2 Steine dick (Front, mittlere Höhe)
  const front = Math.max(...plan.blocks.map(b => b.u));
  ok(keys.has(`${front},3,1`) && keys.has(`${front - 1},3,1`), `${layout}: Frontmauer mehrschichtig`);
  const { world } = createWorld(10);
  const L = buildCastleState(world, 0, plan), R = buildCastleState(world, 1, plan);
  ok(supportPass(L, world).length === 0 && supportPass(R, world).length === 0, `${layout}: intakte Burg trägt sich vollständig`);
  // Kanonentreffer in die Frontmauer der rechten Burg (Flug Richtung +x)
  const hitAt = (C, v, l, wid = 'kanone') => { const b = C.grid.get(keyOf(front, v, l)); if (!b) return null; return applyHit(C, world, { x: b.position.x - 0.8, y: b.position.y, z: b.position.z }, WEAPONS[wid], { x: 1, y: -0.08, z: 0 }, b, rnd); };
  const r1 = hitAt(R, 3, 1);
  ok(r1 && r1.fallen.length === 0, `${layout}: ein Treffer bringt die Mauer nicht zum Einsturz (gefallen ${r1?.fallen.length})`);
  ok(!R.grid.has(keyOf(front, 3, 1)) && R.grid.has(keyOf(front, 3, 2)) && R.grid.has(keyOf(front, 3, 3)), `${layout}: Loch in der Mauer, darüber bleibt sie stehen`);
  ok(r1.cracked.length >= 3, `${layout}: Nachbarsteine bekommen Risse (${r1.cracked.length})`);
  for (let i = 0; i < 120; i++) world.step(1 / 60);
  const r2 = hitAt(R, 4, 1);
  ok(r2 && r2.fallen.length >= 2, `${layout}: zweiter Volltreffer daneben lässt den Abschnitt einstürzen (${r2?.fallen.length} Steine fallen)`);
  let t = 0; while (!allAsleep(world) && t < 900) { world.step(1 / 60); t++; }
  ok(t < 900, `${layout}: Trümmer kommen zur Ruhe (${t} Schritte, ${dynamicBodies(world).length} lose Körper)`);
  // Katapult: breites, flaches Loch – äußere Schicht platzt ab, innere bleibt
  const K = buildCastleState(createWorld(9).world, 1, plan);
  const bk = K.grid.get(keyOf(front, -3, 2)), wk = createWorld(9).world;
  const rk = applyHit(K, wk, { x: bk.position.x - 0.9, y: bk.position.y, z: bk.position.z }, WEAPONS.katapult, { x: 1, y: -0.2, z: 0 }, bk, rnd);
  ok(rk.destroyed.length >= 3 && K.grid.has(keyOf(front - 1, -3, 2)), `${layout}: Katapult reißt ${rk.destroyed.length} Steine der Außenschicht weg, innere Schicht hält`);
  // Reparatur heilt Risse und setzt Steine wieder ein
  const before = R.blocks.filter(b => b.state !== 'ok').length;
  const n = repairCastle(R, world, 40, dynamicBodies(world));
  ok(n > 0 && R.blocks.filter(b => b.state !== 'ok').length < before, `${layout}: Reparatur (${n} Steine/Risse)`);
  // KI-Lösung trifft den König (Bahn) für jede Waffe
  for (const id of ['kanone', 'katapult', 'moerser']) {
    const w = WEAPONS[id], o = muzzle(0, plan, id, 0, 45);
    const s = solveShot(w, o, toWorld(1, plan.king.u, plan.king.v, 3), { x: -1.5, z: 0.8 }, { preferHigh: w.aiPreferHigh });
    ok(s.d < 1.5, `${layout}: ${w.name} KI-Lösung (Fehler ${s.d.toFixed(2)})`);
  }
  // eigene Burg darf bei keinem erlaubten Winkel im Weg sein
  const { world: w2 } = createWorld(9); const own = buildCastleState(w2, 0, plan).blocks;
  for (const id of ['kanone', 'katapult', 'moerser']) {
    const wp = WEAPONS[id]; const bad = [];
    for (let e = wp.elevMin; e <= wp.elevMax; e += 2.5) for (const yaw of [-15, 0, 15]) for (const pw of [0.4, 0.7, 1]) {
      const o = muzzle(0, plan, id, yaw, e);
      const r = simulate(o, launchVelocity(wp, e, yaw, pw), { x: 0, z: 0 }, wp, { hitTest: (p, tt) => {
        if (tt < 0.45 && Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) < 1.8) return null;
        return own.some(b => Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z) < 0.87 + wp.radius && pointInBox(b, p, wp.radius)) ? 'eigen' : null; } });
      if (r.hit?.type === 'eigen') bad.push(`${e}°/${yaw}/${pw}`);
    }
    ok(bad.length === 0, `${layout}: ${wp.name} – eigene Burg nie im Weg ${bad.length ? '(' + bad.slice(0, 5).join(', ') + ' … ' + bad.length + ')' : ''}`);
  }
}
// Windpfeil dreht mit der Kamera
const W = { x: 2, z: 0 };   // Wind nach +x
ok(Math.abs(windScreenAngle(W, { x: 1, z: 0 }) - -90) < 1e-6, 'Wind: Blick mit dem Wind -> Pfeil zeigt nach oben (vom Betrachter weg)');
ok(Math.abs(Math.abs(windScreenAngle(W, { x: -1, z: 0 })) - 90) < 1e-6 && windScreenAngle(W, { x: -1, z: 0 }) > 0, 'Wind: Blick gegen den Wind -> Pfeil zeigt nach unten');
ok(Math.abs(windScreenAngle(W, { x: 0, z: -1 })) < 1e-6, 'Wind: Blick nach -z -> Wind von links nach rechts (0°)');
ok(Math.abs(Math.abs(windScreenAngle(W, { x: 0, z: 1 })) - 180) < 1e-6, 'Wind: Blick nach +z -> Pfeil nach links (180°)');
const a1 = windScreenAngle({ x: 1.3, z: -0.7 }, { x: 0.6, z: 0.8 }), a2 = windScreenAngle({ x: 1.3, z: -0.7 }, { x: -0.8, z: 0.6 });
ok(Math.abs(((a2 - a1 + 540) % 360) - 180 - 90) < 1e-6 || Math.abs(((a2 - a1 + 540) % 360) - 180 + 90) < 1e-6, `Wind: Kamera 90° gedreht -> Pfeil 90° gedreht (${a1.toFixed(1)}° -> ${a2.toFixed(1)}°)`);
// Wirtschaft
const E = newEconomy(); E.tax = 30; const g0 = E.gold, m0 = E.mood;
const r1 = settleTurn(E, 1);
ok(E.gold === g0 + r1.income && r1.income === 30 && E.mood < m0, `Wirtschaft: 30 % Steuer bringt ${r1.income} Gold, Stimmung ${m0} -> ${E.mood}`);
E.tax = 70; ok(forecast(E, 1).moodDelta < -5, 'Wirtschaft: hohe Steuern machen wütend');
E.tax = 0; const m1 = E.mood; settleTurn(E, 1); ok(E.mood > m1, 'Wirtschaft: keine Steuern machen froh');
process.exit(fail ? 1 : 0);
