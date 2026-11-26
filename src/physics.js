// Ballerburg 3D – Starrkörperphysik mit cannon-es (ohne three.js, in Node testbar).
import * as CANNON from '../lib/cannon-es.js';
import { WORLD, terrainHeight } from './config.js';
export { CANNON };

export const HALF = 0.49;

export function createWorld(solverIt = 9) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -WORLD.gravity, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = solverIt; world.solver.tolerance = 0.001;
  const dc = world.defaultContactMaterial;
  dc.friction = 0.9; dc.restitution = 0.02; dc.contactEquationStiffness = 5e7; dc.contactEquationRelaxation = 4;
  dc.frictionEquationStiffness = 5e7; dc.frictionEquationRelaxation = 4;
  // Gelände als Heightfield (gleiche Funktion wie Grafik)
  const es = 1, nx = WORLD.fieldHalfX * 2 / es + 1, nz = WORLD.fieldHalfZ * 2 / es + 1;
  const data = [];
  for (let i = 0; i < nx; i++) { const row = []; for (let j = 0; j < nz; j++) row.push(terrainHeight(-WORLD.fieldHalfX + i * es, WORLD.fieldHalfZ - j * es)); data.push(row); }
  const hf = new CANNON.Heightfield(data, { elementSize: es });
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(hf);
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.position.set(-WORLD.fieldHalfX, 0, WORLD.fieldHalfZ);
  world.addBody(ground);
  // Sicherheitsboden falls etwas aus dem Feld rollt
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); floor.position.set(0, -3, 0); world.addBody(floor);
  return { world, ground };
}

export function makeBlock(world, pos, mass = 1) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(HALF, 0.5, HALF)), linearDamping: 0.2, angularDamping: 0.4,
    allowSleep: true, sleepSpeedLimit: 0.5, sleepTimeLimit: 0.4 });  // etwas Dämpfung = "Mörtel", verhindert Kettenwackeln
  b.position.set(pos.x, pos.y, pos.z); world.addBody(b); b.sleep();
  return b;
}
export function makeKing(world, pos) {
  // Der König sitzt im Thronsaal: Kollisionskörper = ein Block, trägt den Bergfried mit
  const b = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(HALF, 0.5, HALF)), linearDamping: 0.2, angularDamping: 0.4, allowSleep: true, sleepSpeedLimit: 0.5, sleepTimeLimit: 0.4 });
  b.position.set(pos.x, pos.y + 0.5, pos.z); world.addBody(b); b.sleep();
  return b;
}

const _v = new CANNON.Vec3(), _l = new CANNON.Vec3();
export function pointInBox(body, p, pad = 0) {
  _v.set(p.x, p.y, p.z); body.pointToLocalFrame(_v, _l);
  const h = body.shapes[0].halfExtents;
  return Math.abs(_l.x) < h.x + pad && Math.abs(_l.y) < h.y + pad && Math.abs(_l.z) < h.z + pad;
}

// Explosion: Blöcke im Radius wegstoßen, sehr nahe zerstören. Liefert Liste entfernter Körper.
export function explode(world, bodies, c, weapon, dir, rnd = Math.random) {
  const removed = [], R = weapon.blast;
  for (const b of bodies) {
    if (!b.world) continue;
    const dx = b.position.x - c.x, dy = b.position.y - c.y, dz = b.position.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > R) continue;
    const k = 1 - d / R;
    if (d < R * weapon.destroy && rnd() < 0.55 + 0.45 * k) { world.removeBody(b); removed.push(b); continue; }
    const n = d > 1e-3 ? 1 / d : 0;
    const f = weapon.impulse * k * (b.mass || 1);
    _v.set(dx * n * f + dir.x * f * 0.3, dy * n * f + Math.abs(f) * 0.2, dz * n * f + dir.z * f * 0.3);
    b.wakeUp(); b.linearDamping = 0.05; b.angularDamping = 0.15;   // getroffene Steine fliegen frei
    b.applyImpulse(_v, new CANNON.Vec3((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4));  // Punkt relativ zum Schwerpunkt
  }
  return removed;
}
export const allAsleep = bodies => bodies.every(b => !b.world || b.sleepState === CANNON.Body.SLEEPING || b.velocity.lengthSquared() < 0.05);
