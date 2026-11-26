// Node-Simulation: Computer gegen Computer bis zum Sieg (ohne Grafik). Aufruf: node tests/sim.test.mjs [Spiele]
import { Battle } from '../src/game.js';
const noop = () => {};
const obj = () => ({ position: { set: noop, x: 0, y: 0, z: 0 }, quaternion: { set: noop }, scale: { setScalar: noop }, rotation: {}, traverse: noop, userData: { elev: { userData: {} } } });
const gfx = { q: { solverIt: 10 }, buildCastle: () => ({ mesh: {}, flag: {} }), makeKing: obj, makeWeapon: obj, poseWeapon: noop, syncBlocks: noop, waveFlag: noop, updateFx: noop,
  makeProjectile: () => ({ position: { set: noop }, rotation: { x: 0 }, geometry: { dispose: noop } }), smokePuff: noop, explosion: noop, scene: { remove: noop } };
const rig = { view: noop, follow: null, theta: 0 };
const games = +(process.argv[2] || 3); let fail = 0;
for (let g = 0; g < games; g++) {
  let end = null; const t0 = Date.now();
  const B = new Battle(gfx, rig, { mode: 'ai', difficulty: 'mittel' }, { onEnd: r => end = r });
  B.players[0].human = false; B.phase = 'ai'; B.aiTimer = 0; B.aiPlan = null;
  let steps = 0;
  while (!end && steps < 60 * 60 * 40) { B.update(1 / 30); steps++; }
  const shots = B.stats.shots[0] + B.stats.shots[1];
  console.log(end ? `Spiel ${g + 1}: ${end.winner.name} gewinnt (${end.reason}) nach ${shots} Schüssen, Runde ${end.round}, Burgen ${B.players.map(p => Math.round(B.integrity(p) * 100) + '%').join('/')} [${((Date.now() - t0) / 1000).toFixed(1)} s]` : `Spiel ${g + 1}: kein Ende nach ${shots} Schüssen`);
  if (!end) fail++;
}
process.exit(fail ? 1 : 0);
