// Node-Tests: Burgstabilität, Explosion, Ballistik/KI. Aufruf: node tests/logic.test.mjs
import { createWorld, makeBlock, explode, allAsleep } from '../src/physics.js';
import { castlePlan, toWorld } from '../src/castle.js';
import { WEAPONS, WORLD } from '../src/config.js';
import { solveShot, simulate, launchVelocity } from '../src/ballistics.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fail++; };

const { world } = createWorld(9);
const plan = castlePlan();
const bodies = [[], []];
for (const side of [0, 1]) for (const bl of plan.blocks) {
  const p = toWorld(side, bl.u, bl.v, bl.l + 0.5);
  const b = makeBlock(world, p); b.origin = { ...p }; bodies[side].push(b);
}
console.log('Blöcke pro Burg:', plan.blocks.length);
for (const b of bodies[0]) b.wakeUp();
for (let i = 0; i < 180; i++) world.step(1 / 60);
const moved = bodies[0].filter(b => Math.hypot(b.position.x - b.origin.x, b.position.y - b.origin.y, b.position.z - b.origin.z) > 0.25).length;
ok(moved === 0, `Burg steht stabil (verschoben: ${moved})`);

// Explosion an der Frontmauer der rechten Burg
const c = toWorld(1, 4.6, 0, 2);
const removed = explode(world, bodies[1], c, WEAPONS.kanone, { x: 1, y: 0, z: 0 }, () => 0.3);
for (let i = 0; i < 240; i++) world.step(1 / 60);
const loose = bodies[1].filter(b => !b.world || Math.hypot(b.position.x - b.origin.x, b.position.y - b.origin.y, b.position.z - b.origin.z) > 0.7).length;
ok(removed.length > 0 && loose > removed.length, `Explosion zerstört Blöcke (entfernt ${removed.length}, lose ${loose})`);
let t = 0; while (!allAsleep(bodies[1]) && t < 600) { world.step(1 / 60); t++; }
ok(t < 600, `Trümmer kommen zur Ruhe (${(t / 60).toFixed(1)} s)`);

// KI-Lösung trifft Ziel
for (const id of ['kanone', 'katapult', 'moerser']) {
  const w = WEAPONS[id];
  const o = toWorld(0, plan.weapons[id].u, plan.weapons[id].v, plan.weapons[id].y + w.launchHeight);
  const target = toWorld(1, 0, 0, 3);
  const wind = { x: -1.5, z: 0.8 };
  const s = solveShot(w, o, target, wind, { preferHigh: w.aiPreferHigh });
  const r = simulate(o, launchVelocity(w, s.elev, s.yaw, s.power), wind, w);
  ok(s.d < 1.5, `${w.name}: Lösung elev=${s.elev.toFixed(1)} yaw=${s.yaw.toFixed(1)} kraft=${(s.power * 100).toFixed(0)}% Fehler ${s.d.toFixed(2)} (Flug ${r.t.toFixed(1)} s)`);
}
// Eigene Burg darf bei keinem erlaubten Winkel im Weg sein (ab 40 % Kraft)
import { muzzle } from '../src/castle.js';
import { pointInBox } from '../src/physics.js';
const { world: w2 } = createWorld(9); const own = [];
for (const bl of plan.blocks) own.push(makeBlock(w2, toWorld(0, bl.u, bl.v, bl.l + 0.5)));
for (const id of ['kanone', 'katapult', 'moerser']) {
  const wp = WEAPONS[id]; let bad = [];
  for (let e = wp.elevMin; e <= wp.elevMax; e += 2.5) for (const yaw of [-15, 0, 15]) for (const pw of [0.4, 0.7, 1]) {
    const o = muzzle(0, plan, id, yaw, e);
    const r = simulate(o, launchVelocity(wp, e, yaw, pw), { x: 0, z: 0 }, wp, { hitTest: (p, t) => {
      if (t < 0.45 && Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) < 1.8) return null;
      return own.some(b => Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z) < 0.87 + wp.radius && pointInBox(b, p, wp.radius)) ? 'eigen' : null; } });
    if (r.hit?.type === 'eigen') bad.push(`${e}°/${yaw}/${pw}`);
  }
  ok(bad.length === 0, `${wp.name}: eigene Burg nie im Weg ${bad.length ? '(' + bad.slice(0, 6).join(', ') + ' …' + bad.length + ')' : ''}`);
}
process.exit(fail ? 1 : 0);
