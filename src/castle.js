// Ballerburg 3D – Burg-Bauplan (reine Daten). Lokales System: u = Richtung Gegner, v = seitlich.
import { WORLD } from './config.js';

// Burg-Layouts. Jedes liefert Blöcke {u,v,l,kind} sowie König, Waffenplätze (mit Unterbau) und Fahne.
export const LAYOUTS = {
  klassisch: { name: 'Klassisch', desc: 'Vier Türme, Bergfried in der Mitte, Mauern 2 dick' },
  festung:   { name: 'Festung', desc: 'Breit und niedrig, Frontmauer 3 dick' },
  turmburg:  { name: 'Turmburg', desc: 'Hoher Bergfried, hohe Mauern' },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

function builder() {
  const blocks = [], has = new Set();
  const add = (u, v, l, kind) => { const k = `${u},${v},${l}`; if (has.has(k)) return; has.add(k); blocks.push({ u, v, l, kind }); };
  const col = (u, v, from, to, kind) => { for (let l = from; l < to; l++) add(u, v, l, kind); };
  return { blocks, add, col };
}
const towerTop = (u0, v0, l) => [[u0, v0, l], [u0 + 1, v0, l], [u0 - 1, v0, l], [u0, v0 + 1, l], [u0, v0 - 1, l]];  // Mitte + 4 Nachbarn
const A = Math.abs;

// v2.1: größere Burgen, Mauern 2–3 Steine dick (äußere Schichten platzen zuerst weg)
function klassisch() {
  // 13 × 13, Ring 2 dick und 5 hoch, Tor vorne niedriger, Ecktürme 3 × 3 (8 hoch), Bergfried 5 × 5 (7 hoch)
  const { blocks, add, col } = builder();
  for (let u = -6; u <= 6; u++) for (let v = -6; v <= 6; v++) {
    const ring = Math.max(A(u), A(v)) >= 5, outer = Math.max(A(u), A(v)) === 6;
    const tower = A(u) >= 4 && A(v) >= 4;
    const gate = u >= 5 && A(v) <= 1;
    const keep = A(u) <= 2 && A(v) <= 2;
    if (tower) {
      col(u, v, 0, 8, 'turm');
      const weaponTop = (u >= 4 && v >= 4) || (u <= -4 && v <= -4);
      if (!weaponTop && (A(u) === 6 || A(v) === 6) && (u + v) % 2 === 0) add(u, v, 8, 'zinne');
    } else if (ring) {
      col(u, v, 0, gate ? 3 : 5, 'mauer');
      if (outer && !gate && (u + v) % 2 === 0) add(u, v, 5, 'zinne');
    }
    if (keep) col(u, v, u === 0 && v === 0 ? 1 : 0, 7, 'bergfried');  // Mitte unten = Thronsaal des Königs
  }
  return {
    blocks, king: { u: 0, v: 0, y: 0 }, flag: { u: 2, v: 2, y: 7 },
    weapons: {
      kanone: { u: 5, v: 5, y: 8, support: towerTop(5, 5, 7) },          // auf dem vorderen Turm
      katapult: { u: 3.5, v: 0, y: 0, support: [] },                     // im Hof vor dem Bergfried
      moerser: { u: -5, v: -5, y: 8, support: towerTop(-5, -5, 7) },     // auf dem hinteren Turm
    },
  };
}
function festung() {
  // 13 tief × 15 breit, Frontmauer 3 dick, sonst 2, 4 hoch; Ecktürme 3 × 3 (7 hoch); Bergfried 5 × 5 hinten
  const { blocks, add, col } = builder();
  for (let u = -6; u <= 6; u++) for (let v = -7; v <= 7; v++) {
    const front = u >= 4, back = u <= -5, side = A(v) >= 6;
    const ring = front || back || side;
    const tower = A(u) >= 4 && A(v) >= 5 && !(u > -4 && u < 4);
    const gate = front && A(v) <= 1;
    const keep = u >= -4 && u <= 0 && A(v) <= 2;
    if (tower) {
      col(u, v, 0, 7, 'turm');
      const weaponTop = (u >= 4 && v >= 5) || (u <= -4 && v <= -5);
      if (!weaponTop && (A(u) === 6 || A(v) === 7) && (u + v) % 2 === 0) add(u, v, 7, 'zinne');
    } else if (ring) {
      col(u, v, 0, gate ? 3 : 4, 'mauer');
      const outer = u === 6 || u === -6 || A(v) === 7;
      if (outer && !gate && u !== 6 && (u + v) % 2 === 0) add(u, v, 4, 'zinne');
    }
    if (keep) col(u, v, u === -2 && v === 0 ? 1 : 0, 6, 'bergfried');
  }
  return {
    blocks, king: { u: -2, v: 0, y: 0 }, flag: { u: -1, v: 1, y: 6 },
    weapons: {
      kanone: { u: 5, v: 6, y: 7, support: towerTop(5, 6, 6) },
      katapult: { u: 2.3, v: 0, y: 0, support: [] },
      moerser: { u: -5, v: -6, y: 7, support: towerTop(-5, -6, 6) },
    },
  };
}
function turmburg() {
  // 13 × 13, Ring 2 dick und 6 hoch, nur vorne Türme (3 × 3, 9 hoch), Bergfried 5 × 5 und 11 hoch mit Mörser oben
  const { blocks, add, col } = builder();
  for (let u = -6; u <= 6; u++) for (let v = -6; v <= 6; v++) {
    const ring = Math.max(A(u), A(v)) >= 5, outer = Math.max(A(u), A(v)) === 6;
    const tower = u >= 4 && A(v) >= 4;
    const gate = u >= 5 && A(v) <= 2;   // breites Tor: Katapult schießt flach heraus
    const keep = A(u) <= 2 && A(v) <= 2;
    if (tower) { col(u, v, 0, 9, 'turm'); if (!(v <= -4) && (A(u) === 6 || A(v) === 6) && (u + v) % 2 === 0) add(u, v, 9, 'zinne'); }
    else if (ring) { col(u, v, 0, gate ? 3 : 6, 'mauer'); if (outer && !gate && (u + v) % 2 === 0) add(u, v, 6, 'zinne'); }
    if (keep) col(u, v, u === 0 && v === 0 ? 1 : 0, 11, 'bergfried');
  }
  return {
    blocks, king: { u: 0, v: 0, y: 0 }, flag: { u: 2, v: 2, y: 11 },
    weapons: {
      kanone: { u: 5, v: -5, y: 9, support: towerTop(5, -5, 8) },
      katapult: { u: 3.5, v: 0, y: 0, support: [] },
      moerser: { u: 0, v: 0, y: 11, support: towerTop(0, 0, 10) },
    },
  };
}
const BUILDERS = { klassisch, festung, turmburg };
export function castlePlan(layout = 'klassisch') {
  const plan = (BUILDERS[layout] || klassisch)();
  plan.layout = BUILDERS[layout] ? layout : 'klassisch';
  return plan;
}
export function pickLayout(choice, rnd = Math.random) {
  return LAYOUT_IDS.includes(choice) ? choice : LAYOUT_IDS[Math.floor(rnd() * LAYOUT_IDS.length)];
}

// Lokal -> Welt. side 0 = links (schaut nach +x), side 1 = rechts (schaut nach -x)
export function toWorld(side, u, v, y = 0) {
  const s = side === 0 ? 1 : -1;
  return { x: s * -WORLD.castleX + s * u, y: WORLD.plateau + y, z: s * v };
}
export const facingYaw = side => (side === 0 ? 0 : 180);

// Abschusspunkt einer Waffe (Welt), abhängig von Seitenwinkel und Erhöhung
import { WEAPONS } from './config.js';
const MUZZLE_FWD = { kanone: 1.3, katapult: 0.4, moerser: 0.6 };
export function muzzle(side, plan, id, yawDeg, elevDeg) {
  const w = plan.weapons[id], wp = WEAPONS[id];
  const p = toWorld(side, w.u, w.v, w.y + wp.launchHeight);
  const e = elevDeg * Math.PI / 180, y = yawDeg * Math.PI / 180;
  const f = (MUZZLE_FWD[id] ?? 0.5) * (id === 'katapult' ? 1 : Math.cos(e));
  p.x += Math.cos(y) * f; p.z += Math.sin(y) * f; if (id !== 'katapult') p.y += Math.sin(e) * (MUZZLE_FWD[id] ?? 0.5);
  return p;
}
