// Ballerburg 3D – Physik (cannon-es, ohne three.js, in Node testbar).
// v2.1: Intakte Burgsteine sind STATISCH ("vermörtelt") und liegen in einem Raster-Hash. Erst wenn ein Stein
// seinen Halt verliert oder herausgeschleudert wird, wird er dynamisch. Eine eigene Broadphase prüft nur
// dynamische Körper gegen ihre Nachbarzellen -> auch 1500+ Steine bleiben schnell.
import * as CANNON from '../lib/cannon-es.js';
import { WORLD, terrainHeight } from './config.js';
export { CANNON };

export const HALF = 0.49;
const STATIC = CANNON.Body.STATIC, DYNAMIC = CANNON.Body.DYNAMIC, SLEEPING = CANNON.Body.SLEEPING;
const cellKey = (x, y, z) => ((Math.floor(x) + 512) * 1024 + (Math.floor(y) + 64)) * 1024 + (Math.floor(z) + 512);

export class BlockBroadphase extends CANNON.Broadphase {
  constructor() { super(); this.cells = new Map(); this.big = []; this.dyn = new Set(); }
  addStatic(b) { const k = cellKey(b.position.x, b.position.y, b.position.z); let a = this.cells.get(k); if (!a) this.cells.set(k, a = []); a.push(b); b._cell = k; }
  removeStatic(b) { if (b._cell == null) return; const a = this.cells.get(b._cell); if (a) { const i = a.indexOf(b); if (i >= 0) a.splice(i, 1); } b._cell = null; }
  collisionPairs(world, p1, p2) {
    const dyn = [...this.dyn].filter(b => b.world);
    for (let i = 0; i < dyn.length; i++) {
      const d = dyn[i];
      if (d.aabbNeedsUpdate) d.updateAABB();
      for (const g of this.big) if (this.needBroadphaseCollision(d, g)) { p1.push(d); p2.push(g); }
      if (d.sleepState === SLEEPING) continue;
      const lo = d.aabb.lowerBound, hi = d.aabb.upperBound;
      for (let x = Math.floor(lo.x - 0.5); x <= Math.floor(hi.x + 0.5); x++)
        for (let y = Math.floor(lo.y - 0.5); y <= Math.floor(hi.y + 0.5); y++)
          for (let z = Math.floor(lo.z - 0.5); z <= Math.floor(hi.z + 0.5); z++) {
            const a = this.cells.get(((x + 512) * 1024 + (y + 64)) * 1024 + (z + 512)); if (!a) continue;
            for (const s of a) { if (s.world && s.type === STATIC) { if (s.aabbNeedsUpdate) s.updateAABB(); if (d.aabb.overlaps(s.aabb)) { p1.push(d); p2.push(s); } } }
          }
      for (let j = 0; j < dyn.length; j++) {
        if (j === i) continue; const e = dyn[j];
        if (e.sleepState !== SLEEPING && j < i) continue;      // Paar wach/wach nur einmal
        if (e.aabbNeedsUpdate) e.updateAABB();
        if (d.aabb.overlaps(e.aabb)) { p1.push(d); p2.push(e); }
      }
    }
  }
  aabbQuery(world, aabb, result = []) { for (const b of world.bodies) { if (b.aabbNeedsUpdate) b.updateAABB(); if (b.aabb.overlaps(aabb)) result.push(b); } return result; }
}

export function createWorld(solverIt = 9) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -WORLD.gravity, 0), allowSleep: true });
  const bp = new BlockBroadphase(); world.broadphase = bp; bp.setWorld(world);
  // Objekt-Kollisionsmatrix statt N²-Array (sonst kostet jeder Schritt bei 1700 Körpern ~10 ms)
  world.collisionMatrix = new CANNON.ObjectCollisionMatrix(); world.collisionMatrixPrevious = new CANNON.ObjectCollisionMatrix();
  world.solver.iterations = solverIt; world.solver.tolerance = 0.001;
  const dc = world.defaultContactMaterial;
  dc.friction = 0.8; dc.restitution = 0.05; dc.contactEquationStiffness = 5e7; dc.contactEquationRelaxation = 4;
  dc.frictionEquationStiffness = 5e7; dc.frictionEquationRelaxation = 4;
  const es = 1, nx = WORLD.fieldHalfX * 2 / es + 1, nz = WORLD.fieldHalfZ * 2 / es + 1, data = [];
  for (let i = 0; i < nx; i++) { const row = []; for (let j = 0; j < nz; j++) row.push(terrainHeight(-WORLD.fieldHalfX + i * es, WORLD.fieldHalfZ - j * es)); data.push(row); }
  const ground = new CANNON.Body({ mass: 0 }); ground.addShape(new CANNON.Heightfield(data, { elementSize: es }));
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); ground.position.set(-WORLD.fieldHalfX, 0, WORLD.fieldHalfZ);
  world.addBody(ground);
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); floor.position.set(0, -3, 0); world.addBody(floor);
  bp.big.push(ground, floor);
  return { world, ground };
}
const bpOf = world => world.broadphase;

// Intakter Stein: statisch, im Raster
export function makeBlock(world, pos) {
  const b = new CANNON.Body({ mass: 0, type: STATIC, shape: new CANNON.Box(new CANNON.Vec3(HALF, 0.5, HALF)), allowSleep: true, sleepSpeedLimit: 0.4, sleepTimeLimit: 0.5 });
  b.position.set(pos.x, pos.y, pos.z); world.addBody(b); bpOf(world).addStatic(b);
  return b;
}
export function makeKing(world, pos) { return makeBlock(world, { x: pos.x, y: pos.y + 0.5, z: pos.z }); }
export const isDynamic = b => b.type === DYNAMIC;

// Stein löst sich: wird dynamisch (fällt / fliegt)
export function makeDynamic(world, b, impulse = null) {
  if (!b.world) return;
  bpOf(world).removeStatic(b);
  b.type = DYNAMIC; b.mass = 1; b.linearDamping = 0.05; b.angularDamping = 0.15; b.updateMassProperties();
  b.aabbNeedsUpdate = true; b.wakeUp(); bpOf(world).dyn.add(b);
  if (impulse) b.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), new CANNON.Vec3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
}
// Stein entfernen (zersplittert)
export function removeBlock(world, b) { bpOf(world).removeStatic(b); bpOf(world).dyn.delete(b); if (b.world) world.removeBody(b); }
// Stein wieder einsetzen (Reparatur): statisch an seinem Platz
export function makeStatic(world, b, pos) {
  bpOf(world).dyn.delete(b); bpOf(world).removeStatic(b);
  if (!b.world) world.addBody(b);
  b.type = STATIC; b.mass = 0; b.updateMassProperties();
  b.position.set(pos.x, pos.y, pos.z); b.quaternion.set(0, 0, 0, 1); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
  b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position); b.previousQuaternion.copy(b.quaternion); b.interpolatedQuaternion.copy(b.quaternion);
  b.aabbNeedsUpdate = true; bpOf(world).addStatic(b);
}
export function dynamicBodies(world) { return [...bpOf(world).dyn].filter(b => b.world); }

const _v = new CANNON.Vec3(), _l = new CANNON.Vec3();
export function pointInBox(body, p, pad = 0) {
  _v.set(p.x, p.y, p.z); body.pointToLocalFrame(_v, _l);
  const h = body.shapes[0].halfExtents;
  return Math.abs(_l.x) < h.x + pad && Math.abs(_l.y) < h.y + pad && Math.abs(_l.z) < h.z + pad;
}
// Druckwelle auf bereits lose (dynamische) Steine
export function pushDynamic(world, c, R, strength) {
  for (const b of dynamicBodies(world)) {
    const dx = b.position.x - c.x, dy = b.position.y - c.y, dz = b.position.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d > R || d < 1e-3) continue;
    const f = strength * (1 - d / R) / d; b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx * f, dy * f + strength * 0.2, dz * f));
  }
}
export const allAsleep = world => dynamicBodies(world).every(b => b.sleepState === SLEEPING || b.velocity.lengthSquared() < 0.05);
