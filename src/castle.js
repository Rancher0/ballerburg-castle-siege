// Ballerburg 3D – Burg-Bauplan (reine Daten). Lokales System: u = Richtung Gegner, v = seitlich.
import { WORLD } from './config.js';

// Burg-Layouts. Jedes liefert Blöcke {u,v,l,kind} sowie König, Waffenplätze (mit Unterbau) und Fahne.
export const LAYOUTS = {
  klassisch: { name: 'Klassisch', desc: 'Vier Türme, Bergfried in der Mitte' },
  festung:   { name: 'Festung', desc: 'Breit, doppelte Frontmauer, niedriger' },
  turmburg:  { name: 'Turmburg', desc: 'Hoher Bergfried, hohe Mauern' },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

function builder() {
  const blocks = [], has = new Set();
  const add = (u, v, l, kind) => { const k = `${u},${v},${l}`; if (has.has(k)) return; has.add(k); blocks.push({ u, v, l, kind }); };
  const col = (u, v, from, to, kind) => { for (let l = from; l < to; l++) add(u, v, l, kind); };
  return { blocks, add, col };
}
const towerTop = (u0, v0, l) => [[u0, v0, l], [u0 + 1, v0, l], [u0, v0 + 1, l], [u0 + 1, v0 + 1, l]];

function klassisch() {
  const { blocks, add, col } = builder();
  for (let u = -4; u <= 4; u++) for (let v = -4; v <= 4; v++) {
    const wall = Math.abs(u) === 4 || Math.abs(v) === 4;
    const tower = Math.abs(u) >= 3 && Math.abs(v) >= 3;
    const keep = Math.abs(u) <= 1 && Math.abs(v) <= 1;
    if (tower) {
      col(u, v, 0, 7, 'turm');
      if (Math.abs(u) === 4 && Math.abs(v) === 4 && !(u === 4 && v === 4) && !(u === -4 && v === -4)) add(u, v, 7, 'zinne'); // Plätze für Kanone/Mörser frei
    } else if (wall) {
      col(u, v, 0, 4, 'mauer');
      const gate = u === 4 && Math.abs(v) <= 1;   // vorne Mitte ohne Zinnen (Schussfeld fürs Katapult)
      if (!gate && (u + v) % 2 === 0) add(u, v, 4, 'zinne');
    }
    if (keep) col(u, v, u === 0 && v === 0 ? 1 : 0, 6, 'bergfried');  // Mitte unten = Thronsaal des Königs
  }
  return {
    blocks, king: { u: 0, v: 0, y: 0 }, flag: { u: 0, v: 0, y: 6 },
    weapons: {
      kanone: { u: 3.5, v: 3.5, y: 7, support: towerTop(3, 3, 6) },      // auf dem vorderen Turm
      katapult: { u: 2.35, v: 0, y: 0, support: [] },                    // im Hof vor dem Bergfried
      moerser: { u: -3.5, v: -3.5, y: 7, support: towerTop(-4, -4, 6) }, // auf dem hinteren Turm
    },
  };
}
function festung() {
  // 9 tief (u -4..4), 11 breit (v -5..5); doppelte, niedrige Frontmauer; Bergfried hinten
  const { blocks, add, col } = builder();
  for (let u = -4; u <= 4; u++) for (let v = -5; v <= 5; v++) {
    const tower = Math.abs(u) >= 3 && Math.abs(v) >= 4;
    const wall = Math.abs(u) === 4 || Math.abs(v) === 5;
    const inner = u === 3 && Math.abs(v) <= 3;                 // zweite Frontmauer
    const keep = Math.abs(u + 2) <= 1 && Math.abs(v) <= 1;       // Bergfried bei u = -2
    if (tower) { col(u, v, 0, 6, 'turm'); if ((u === -4 && v === 5) || (u === 4 && v === -5)) add(u, v, 6, 'zinne'); }
    else if (wall || inner) { col(u, v, 0, 3, 'mauer'); if (u !== 4 && u !== 3 && (u + v) % 2 === 0) add(u, v, 3, 'zinne'); }
    if (keep) col(u, v, u === -2 && v === 0 ? 1 : 0, 5, 'bergfried');
  }
  return {
    blocks, king: { u: -2, v: 0, y: 0 }, flag: { u: -2, v: 0, y: 5 },
    weapons: {
      kanone: { u: 3.5, v: 4.5, y: 6, support: towerTop(3, 4, 5) },
      katapult: { u: 1.3, v: 0, y: 0, support: [] },
      moerser: { u: -3.5, v: -4.5, y: 6, support: towerTop(-4, -5, 5) },
    },
  };
}
function turmburg() {
  // wie klassisch, aber hohe Mauern, nur vorne Türme, Bergfried 9 hoch mit Mörser oben
  const { blocks, add, col } = builder();
  for (let u = -4; u <= 4; u++) for (let v = -4; v <= 4; v++) {
    const wall = Math.abs(u) === 4 || Math.abs(v) === 4;
    const tower = u >= 3 && Math.abs(v) >= 3;
    const keep = Math.abs(u) <= 1 && Math.abs(v) <= 1;
    if (tower) { col(u, v, 0, 8, 'turm'); if (u === 4 && v === 4) add(u, v, 8, 'zinne'); }
    else if (wall) {
      const gate = u === 4 && Math.abs(v) <= 1;
      col(u, v, 0, gate ? 4 : 5, 'mauer');
      if (!gate && (u + v) % 2 === 0) add(u, v, 5, 'zinne');
    }
    if (keep) col(u, v, u === 0 && v === 0 ? 1 : 0, 9, 'bergfried');
  }
  return {
    blocks, king: { u: 0, v: 0, y: 0 }, flag: { u: 1, v: 1, y: 9 },
    weapons: {
      kanone: { u: 3.5, v: -3.5, y: 8, support: towerTop(3, -4, 7) },
      katapult: { u: 2.35, v: 0, y: 0, support: [] },
      moerser: { u: -0.5, v: -0.5, y: 9, support: towerTop(-1, -1, 8) },
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
