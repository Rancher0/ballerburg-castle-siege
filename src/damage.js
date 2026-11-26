// Ballerburg 3D – Schadensmodell v2.1 (ohne Grafik, in Node testbar).
// Steine haben Trefferpunkte: leichte Treffer lassen sie nur reißen, starke zersplittern sie.
// Danach prüft ein Halt-Durchlauf von unten nach oben: Ein Stein bleibt stehen, wenn unter ihm ein Stein ist
// ODER mindestens zwei waagerechte Nachbarn selbst direkt aufliegen (Bogen über einem Loch).
// Sonst wird er dynamisch und fällt. So bleiben Löcher stehen; erst mehrere Treffer bringen Mauern zum Einsturz.
import { WORLD, BLOCK_HP } from './config.js';
import { toWorld } from './castle.js';
import { makeBlock, makeKing, makeDynamic, removeBlock, makeStatic, isDynamic } from './physics.js';

export const keyOf = (u, v, l) => `${u},${v},${l}`;
export function toLocal(side, p) { const s = side === 0 ? 1 : -1; return { u: s * p.x + WORLD.castleX, v: s * p.z, y: p.y - WORLD.plateau }; }

// Burg-Zustand für eine Seite aufbauen
export function buildCastleState(world, side, plan) {
  const C = { side, plan, blocks: [], grid: new Map() };
  plan.blocks.forEach((bl, i) => {
    const p = toWorld(side, bl.u, bl.v, bl.l + 0.5);
    const b = makeBlock(world, p);
    Object.assign(b, { origin: p, side, bl, idx: i, maxHp: BLOCK_HP[bl.kind] ?? 2, state: 'ok' }); b.hp = b.maxHp;
    C.blocks.push(b); C.grid.set(keyOf(bl.u, bl.v, bl.l), b);
  });
  const kp = toWorld(side, plan.king.u, plan.king.v, plan.king.y);
  const kb = makeKing(world, kp);
  C.king = { body: kb, origin: { x: kp.x, y: kp.y + 0.5, z: kp.z }, hp: BLOCK_HP.koenig, dead: false, u: plan.king.u, v: plan.king.v };
  return C;
}
export const isIntact = b => b.state === 'ok';

function damageBlock(C, b, amount, out) {
  if (!isIntact(b) || amount <= 0.05) return;
  b.hp -= amount;
  if (b.hp <= 0) { b.state = 'gone'; C.grid.delete(keyOf(b.bl.u, b.bl.v, b.bl.l)); out.destroyed.push(b); }
  else if (!out.cracked.includes(b)) out.cracked.push(b);
}

// Treffer anwenden. p = Einschlagpunkt, dir = Flugrichtung (normiert), hitBlock = getroffener Stein (falls bekannt)
export function applyHit(C, world, p, weapon, dir, hitBlock = null, rnd = Math.random) {
  const out = { destroyed: [], cracked: [], ejected: [], fallen: [], kingHit: false };
  const base = (!weapon.atImpact && hitBlock && hitBlock.side === C.side) ? hitBlock.position : p;
  for (const [off, dm, rm] of weapon.pen) {
    const c = { x: base.x + dir.x * off, y: base.y + dir.y * off, z: base.z + dir.z * off };
    const R = weapon.dmgR * rm, D = weapon.dmg * dm, L = toLocal(C.side, c);
    for (let u = Math.floor(L.u - R); u <= Math.ceil(L.u + R); u++)
      for (let v = Math.floor(L.v - R); v <= Math.ceil(L.v + R); v++)
        for (let l = Math.floor(L.y - R - 0.5); l <= Math.ceil(L.y + R); l++) {
          const b = C.grid.get(keyOf(u, v, l)); if (!b) continue;
          const d = Math.hypot(b.position.x - c.x, b.position.y - c.y, b.position.z - c.z);
          if (d < R) damageBlock(C, b, D * (1 - (d / R) * (d / R)), out);
        }
    const K = C.king;
    if (!K.dead) { const d = Math.hypot(K.body.position.x - c.x, K.body.position.y - c.y, K.body.position.z - c.z); if (d < R) { K.hp -= D * (1 - (d / R) * (d / R)); if (K.hp <= 0) out.kingHit = true; } }
  }
  // Zerstörte Steine: einige fliegen heraus, der Rest zerspringt
  const sorted = out.destroyed.slice().sort((a, b) => Math.hypot(b.position.x - p.x, b.position.z - p.z) - Math.hypot(a.position.x - p.x, a.position.z - p.z));
  let ej = 0;
  for (const b of sorted) {
    if (ej < (weapon.eject || 0) && rnd() < 0.6) {
      ej++; b.state = 'loose';
      const dx = b.position.x - p.x, dy = b.position.y - p.y, dz = b.position.z - p.z, d = Math.hypot(dx, dy, dz) || 1, f = weapon.push || 8;
      makeDynamic(world, b, { x: (dx / d + dir.x * 0.5) * f, y: Math.abs(dy / d) * f * 0.5 + f * 0.3, z: (dz / d + dir.z * 0.5) * f });
      out.ejected.push(b);
    } else removeBlock(world, b);
  }
  out.fallen = supportPass(C, world);
  return out;
}

// Halt prüfen (von unten nach oben). Liefert die Steine, die ihren Halt verloren haben (jetzt dynamisch).
export function supportPass(C, world) {
  const fallen = [], g = C.grid, K = C.king;
  const below = (u, v, l) => l === 0 || g.has(keyOf(u, v, l - 1)) || (l - 1 === 0 && u === K.u && v === K.v && !K.dead);
  const intact = C.blocks.filter(isIntact).sort((a, b) => a.bl.l - b.bl.l);
  for (const b of intact) {
    const { u, v, l } = b.bl;
    if (below(u, v, l)) continue;
    let n = 0;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.has(keyOf(u + du, v + dv, l)) && below(u + du, v + dv, l)) n++;
    if (n >= 2) continue;
    b.state = 'loose'; g.delete(keyOf(u, v, l)); makeDynamic(world, b); fallen.push(b);
  }
  return fallen;
}
export function killKing(C, world) {
  if (C.king.dead) return false;
  C.king.dead = true; makeDynamic(world, C.king.body, { x: (Math.random() - 0.5) * 2, y: 3, z: (Math.random() - 0.5) * 2 });
  supportPass(C, world);
  return true;
}

// Reparatur: erst Risse heilen, dann fehlende Steine von unten nach oben einsetzen (Unterbau nötig, Schutt wird weggeräumt).
// Liefert Anzahl reparierter Steine. dry = nur prüfen.
export function repairCastle(C, world, n, others = [], dry = false) {
  let done = 0;
  for (const b of C.blocks) { if (done >= n) break; if (isIntact(b) && b.hp < b.maxHp) { if (dry) return 1; b.hp = b.maxHp; b._dirty = true; done++; } }
  const K = C.king, g = C.grid;
  const cand = C.blocks.filter(b => !isIntact(b)).sort((a, b) => a.bl.l - b.bl.l);
  for (const b of cand) {
    if (done >= n) break;
    const { u, v, l } = b.bl;
    const ok = l === 0 || g.has(keyOf(u, v, l - 1)) || (l === 1 && u === K.u && v === K.v && !K.dead);
    if (!ok) continue;
    const o = b.origin;
    const blockers = others.filter(q => q !== b && q.world && isDynamic(q) && Math.abs(q.position.x - o.x) < 0.95 && Math.abs(q.position.y - o.y) < 0.95 && Math.abs(q.position.z - o.z) < 0.95);
    if (blockers.some(q => !q.origin)) continue;          // z. B. König liegt im Weg
    if (dry) return 1;
    for (const q of blockers) { q.state = 'gone'; removeBlock(world, q); q._dirty = true; }
    makeStatic(world, b, o); b.state = 'ok'; b.hp = b.maxHp; b._dirty = true; g.set(keyOf(u, v, l), b); done++;
  }
  return done;
}
