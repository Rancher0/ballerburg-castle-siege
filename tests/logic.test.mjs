// Node-Tests: Burgstabilität (alle Layouts), Explosion, Ballistik/KI, eigene Burg nie im Weg, Wirtschaft.
// Aufruf: node tests/logic.test.mjs
import { createWorld, makeBlock, makeKing, explode, allAsleep, pointInBox } from '../src/physics.js';
import { castlePlan, toWorld, muzzle, LAYOUT_IDS } from '../src/castle.js';
import { WEAPONS } from '../src/config.js';
import { solveShot, simulate, launchVelocity } from '../src/ballistics.js';
import { newEconomy, settleTurn, forecast } from '../src/economy.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fail++; };
const dist = (b) => Math.hypot(b.position.x - b.origin.x, b.position.y - b.origin.y, b.position.z - b.origin.z);

function build(world, side, plan) {
  const bodies = [];
  for (const bl of plan.blocks) { const p = toWorld(side, bl.u, bl.v, bl.l + 0.5); const b = makeBlock(world, p); b.origin = { ...p }; bodies.push(b); }
  const k = makeKing(world, toWorld(side, plan.king.u, plan.king.v, plan.king.y));
  return { bodies, king: k };
}

for (const layout of LAYOUT_IDS) {
  const plan = castlePlan(layout);
  console.log(`--- Layout ${layout}: ${plan.blocks.length} Blöcke`);
  // Unterbau der Waffen existiert
  const keys = new Set(plan.blocks.map(b => `${b.u},${b.v},${b.l}`));
  for (const [id, w] of Object.entries(plan.weapons)) ok(w.support.every(k => keys.has(k.join(','))), `${layout}: Unterbau für ${WEAPONS[id].name} vorhanden`);
  // Stabilität (alle Blöcke wach)
  const { world } = createWorld(10);
  const L = build(world, 0, plan), R = build(world, 1, plan);
  for (const b of L.bodies) b.wakeUp();
  for (let i = 0; i < 240; i++) world.step(1 / 60);
  const mv = L.bodies.filter(b => dist(b) > 0.25);
  ok(mv.length === 0, `${layout}: Burg steht stabil ${mv.length ? mv.length + " verschoben, max " + Math.max(...mv.map(dist)).toFixed(2) : ""}`);
  // Explosion an der Front der rechten Burg
  const removed = explode(world, R.bodies, toWorld(1, plan.weapons.katapult.u + 2.3, 0, 2.5), WEAPONS.kanone, { x: 1, y: 0, z: 0 }, () => 0.3);
  for (let i = 0; i < 300; i++) world.step(1 / 60);
  const loose = R.bodies.filter(b => !b.world || dist(b) > 0.7).length;
  ok(removed.length > 0 && loose >= removed.length, `${layout}: Explosion zerstört Blöcke (entfernt ${removed.length}, lose ${loose})`);
  let t = 0; while (!allAsleep(R.bodies) && t < 600) { world.step(1 / 60); t++; }
  ok(t < 600, `${layout}: Trümmer kommen zur Ruhe`);
  // KI-Lösung trifft den König (Bahn) für jede Waffe
  for (const id of ['kanone', 'katapult', 'moerser']) {
    const w = WEAPONS[id], o = muzzle(0, plan, id, 0, 45);
    const s = solveShot(w, o, toWorld(1, plan.king.u, plan.king.v, 3), { x: -1.5, z: 0.8 }, { preferHigh: w.aiPreferHigh });
    ok(s.d < 1.5, `${layout}: ${w.name} KI-Lösung (Fehler ${s.d.toFixed(2)})`);
  }
  // eigene Burg darf bei keinem erlaubten Winkel im Weg sein
  const { world: w2 } = createWorld(9); const own = build(w2, 0, plan).bodies;
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
// Wirtschaft
const E = newEconomy(); E.tax = 30; const g0 = E.gold, m0 = E.mood;
const r1 = settleTurn(E, 1);
ok(E.gold === g0 + r1.income && r1.income === 30 && E.mood < m0, `Wirtschaft: 30 % Steuer bringt ${r1.income} Gold, Stimmung ${m0} -> ${E.mood}`);
E.tax = 70; ok(forecast(E, 1).moodDelta < -5, 'Wirtschaft: hohe Steuern machen wütend');
E.tax = 0; const m1 = E.mood; settleTurn(E, 1); ok(E.mood > m1, 'Wirtschaft: keine Steuern machen froh');
process.exit(fail ? 1 : 0);
