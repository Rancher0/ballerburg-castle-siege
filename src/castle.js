// Ballerburg 3D – Burg-Bauplan (reine Daten). Lokales System: u = Richtung Gegner, v = seitlich.
import { WORLD } from './config.js';

// Liefert Blöcke {u,v,layer,kind} sowie Positionen von König und Waffen.
export function castlePlan() {
  const blocks = [];
  const has = new Set();
  const add = (u, v, l, kind) => { const k = `${u},${v},${l}`; if (has.has(k)) return; has.add(k); blocks.push({ u, v, l, kind }); };
  for (let u = -4; u <= 4; u++) for (let v = -4; v <= 4; v++) {
    const wall = Math.abs(u) === 4 || Math.abs(v) === 4;
    const tower = Math.abs(u) >= 3 && Math.abs(v) >= 3;
    const keep = Math.abs(u) <= 1 && Math.abs(v) <= 1;
    if (tower) {
      for (let l = 0; l < 7; l++) add(u, v, l, 'turm');
      if (Math.abs(u) === 4 && Math.abs(v) === 4 && !(u === 4 && v === 4) && !(u === -4 && v === -4)) add(u, v, 7, 'zinne'); // Plätze für Kanone/Mörser frei
    } else if (wall) {
      for (let l = 0; l < 4; l++) add(u, v, l, 'mauer');
      // Zinnen, aber Platz für die Kanone vorne in der Mitte
      const gate = u === 4 && Math.abs(v) <= 1;   // vorne Mitte ohne Zinnen (Schussfeld fürs Katapult)
      if (!gate && (u + v) % 2 === 0) add(u, v, 4, 'zinne');
    }
    if (keep) for (let l = (u === 0 && v === 0 ? 1 : 0); l < 6; l++) add(u, v, l, 'bergfried');  // Mitte unten = Thronsaal des Königs
  }
  return {
    blocks,
    king: { u: 0, v: 0, y: 0 },                  // Thronsaal ganz unten im Bergfried
    weapons: {
      // support: Blöcke, auf denen die Waffe steht (fallen sie weg, ist die Waffe hin)
      kanone: { u: 3.5, v: 3.5, y: 7, support: [[3, 3, 6], [4, 3, 6], [3, 4, 6], [4, 4, 6]] },  // auf dem vorderen Turm
      katapult: { u: 2.35, v: 0, y: 0, support: [] },                               // im Hof vor dem Bergfried
      moerser: { u: -3.5, v: -3.5, y: 7, support: [[-3, -3, 6], [-4, -3, 6], [-3, -4, 6], [-4, -4, 6]] }, // auf dem hinteren Turm
    },
    flag: { u: 0, v: 0, y: 6 },
  };
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
