// Ballerburg 3D – reine Ballistik (ohne three.js): Flugbahn, Zielhilfe, KI-Lösung. In Node testbar.
import { WORLD, terrainHeight } from './config.js';

const D2R = Math.PI / 180;

// Abschussvektor aus Winkel (Erhöhung), Seitenwinkel (absolut, Welt) und Kraft (0..1)
export function launchVelocity(weapon, elevDeg, yawDeg, power) {
  const v = weapon.speedMin + (weapon.speed - weapon.speedMin) * power;
  const e = elevDeg * D2R, y = yawDeg * D2R;
  return { x: Math.cos(e) * Math.cos(y) * v, y: Math.sin(e) * v, z: Math.cos(e) * Math.sin(y) * v };
}

// Ein Integrationsschritt (semi-implizit), Wind wirkt als Beschleunigung in x/z
export function stepProjectile(p, v, wind, weapon, dt) {
  v.x += wind.x * weapon.windFactor * dt;
  v.z += wind.z * weapon.windFactor * dt;
  v.y -= WORLD.gravity * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}

// Flugbahn simulieren bis Boden/Wasser/Grenze. hitTest(p) kann optional Kollisionen melden.
export function simulate(origin, vel, wind, weapon, { dt = 1 / 120, maxT = 12, hitTest = null, sampleEvery = 4 } = {}) {
  const p = { ...origin }, v = { ...vel }, pts = [{ ...p }];
  let t = 0, n = 0, hit = null;
  while (t < maxT) {
    stepProjectile(p, v, wind, weapon, dt); t += dt; n++;
    if (n % sampleEvery === 0) pts.push({ ...p });
    if (hitTest) { const h = hitTest(p, t); if (h) { hit = { type: h, ...p }; break; } }
    const g = terrainHeight(p.x, p.z);
    if (p.y - weapon.radius < g) { hit = { type: g < WORLD.waterLevel ? 'wasser' : 'boden', x: p.x, y: Math.max(g, p.y), z: p.z }; break; }
    if (Math.abs(p.x) > 140 || Math.abs(p.z) > 120 || p.y < -20) { hit = { type: 'aus', ...p }; break; }
  }
  pts.push({ ...p });
  return { pts, hit, t };
}

// KI: Winkel/Kraft/Seite suchen, die einen Zielpunkt treffen (Gitter + Verfeinerung).
export function solveShot(weapon, origin, target, wind, { preferHigh = false, blocker = null } = {}) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const baseYaw = Math.atan2(dz, dx) / D2R;
  let best = null;
  const err = (elev, yaw, pow) => {
    // kleinster Abstand der Flugbahn zum Ziel (bis Einschlag)
    let m = Infinity;
    simulate(origin, launchVelocity(weapon, elev, yaw, pow), wind, weapon, { dt: 1 / 90, sampleEvery: 1e9, hitTest: (p, t) => {
      const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z); if (d < m) m = d;
      return blocker ? blocker(p, t) : null;
    } });
    return m;
  };
  const elevs = [];
  const lo = weapon.elevMin, hi = weapon.elevMax;
  for (let e = lo; e <= hi; e += 4) elevs.push(e);
  for (const e of elevs) {
    if (preferHigh && e < (lo + hi) / 2 - 5) continue;
    for (let pw = 0.05; pw <= 1.0001; pw += 0.05) {
      const d = err(e, baseYaw, pw);
      if (!best || d < best.d) best = { elev: e, yaw: baseYaw, power: pw, d };
    }
  }
  // Verfeinern (Koordinatenabstieg)
  let step = { elev: 2, yaw: 2, power: 0.025 };
  for (let it = 0; it < 28; it++) {
    let improved = false;
    for (const k of ['elev', 'yaw', 'power']) {
      for (const s of [-1, 1]) {
        const c = { ...best, [k]: best[k] + s * step[k] };
        c.elev = Math.min(hi, Math.max(lo, c.elev)); c.power = Math.min(1, Math.max(0, c.power));
        const d = err(c.elev, c.yaw, c.power);
        if (d < best.d) { best = { ...c, d }; improved = true; }
      }
    }
    if (!improved) { step = { elev: step.elev / 2, yaw: step.yaw / 2, power: step.power / 2 }; }
    if (best.d < 0.15) break;
  }
  return best;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Joystick-Kennlinie mit Totzone: -1..1 -> -1..1 (sanfter Anstieg)
export function stickCurve(v, dead = 0.18) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  const t = (a - dead) / (1 - dead);
  return Math.sign(v) * t * t * 0.85 + Math.sign(v) * t * 0.15;
}

// Windpfeil relativ zur Kamera: Winkel (Grad, CSS-rotate, 0 = nach rechts, positiv = im Uhrzeigersinn)
// wind = {x,z}, camFwd = Blickrichtung der Kamera {x,z} (y wird ignoriert)
export function windScreenAngle(wind, camFwd) {
  const n = Math.hypot(camFwd.x, camFwd.z) || 1, fx = camFwd.x / n, fz = camFwd.z / n;
  const sx = wind.x * -fz + wind.z * fx;      // Anteil nach rechts
  const sy = wind.x * fx + wind.z * fz;       // Anteil nach vorn (= oben auf dem Bildschirm)
  return Math.atan2(-sy, sx) * 180 / Math.PI;
}
