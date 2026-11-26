// Ballerburg 3D – Einstieg: Menüs, HUD, Touch-/Maus-/Tastatursteuerung, Hauptschleife.
import { DEFAULT_SETTINGS, WEAPONS, WEAPON_ORDER, SHOP, ECONOMY, LINE_COLORS } from './config.js';
import { forecast, moodWord, moodIcon } from './economy.js';
import { Scene3D } from './scene.js';
import { CameraRig } from './camera.js';
import { Battle } from './game.js';
import { stickCurve, clamp, windScreenAngle } from './ballistics.js';
import * as THREE from '../lib/three.module.min.js';
import { SFX, setSound } from './sound.js';

const $ = id => document.getElementById(id);
const STORE = 'ballerburg3d_v1';
const settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(STORE) || '{}').settings || {}) };
const save = () => localStorage.setItem(STORE, JSON.stringify({ settings }));
setSound(settings.sound);

const canvas = $('gl');
const gfx = new Scene3D(canvas, settings.quality);
const rig = new CameraRig(gfx.camera, canvas);
let battle = null, lastOpts = null, paused = false, rotateOk = false;
const CAM_MODES = ['ziel', 'burg', 'uebersicht', 'gegner'];
const CAM_NAMES = { ziel: 'Zielansicht', burg: 'Burgansicht', uebersicht: 'Übersicht', gegner: 'Gegnerburg' };
const IS_APP = location.host === 'appassets.androidplatform.net';
gfx.setLineStyle(LINE_COLORS[settings.lineColor] ?? LINE_COLORS.rot, settings.lineStyle);

const App = window.App = { gfx, rig, settings, get battle() { return battle; }, start, WEAPONS };

// ---------- Bildschirme ----------
const screens = ['menu', 'pause', 'settings', 'help', 'end', 'shop'];
let returnTo = 'menu';
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
function hideAll() { for (const s of screens) $(s).classList.add('hidden'); }

function demo() {
  battle?.dispose();
  battle = new Battle(gfx, rig, { mode: 'ai', difficulty: 'mittel', demo: true }, {});
  battle.phase = 'idle';
  rig.view({ x: 0, y: 6, z: 0 }, -0.6, 1.08, 80, true);
  $('hud').classList.add('hidden'); show('menu');
}
function start(opts) {
  battle?.dispose(); paused = false;
  lastOpts = { difficulty: settings.difficulty, follow: settings.follow, layout: settings.layout, aimCam: settings.aimCam, ...opts };
  battle = new Battle(gfx, rig, lastOpts, {
    onHud: hud, onTurn: onTurn, onLine: line, onToast: toast, onEnd: onEnd,
  });
  hideAll(); $('hud').classList.remove('hidden'); buildWeaponButtons(); hud();
  return battle;
}
function onTurn(P, B) {
  B.camMode = settings.aimCam ? 'ziel' : 'burg';
  if (P.human) B.viewWeapon();
  const st = B.lastSettle;
  if (st && P.human) toast(`${P.name}: +${st.income} Gold Steuern${st.events.length ? ' · ' + st.events.join(' · ') : ''}`, false);
}
function turnText() {
  const B = battle, P = B.cur, ai = B.mode === 'ai';
  const who = ai ? (P.human ? 'Du' : 'Computer') : P.name;
  if (B.phase === 'flight') return `💥 ${who}: ${WEAPONS[B.proj?.wp.id || P.weapon].name} feuert …`;
  if (B.phase === 'settle') return '⏳ Einschlag …';
  if (B.phase === 'ai') return 'Der Computer zielt …';
  if (B.phase === 'over') return 'Spielende';
  return ai ? 'Du bist dran' : `${P.name} ist dran`;
}
let lineT = 0, toastT = 0;
function line(t) { const el = $('line'); el.textContent = '„' + t + '“'; el.classList.remove('hidden'); lineT = 3.2; }
function toast(t, bad = true) { const el = $('toast'); el.textContent = t; el.classList.toggle('good', !bad); el.classList.remove('hidden'); toastT = 2.8; }
function onEnd(r) {
  const youWon = battle.mode === 'ai' ? r.winner.side === 0 : true;
  const why = { koenig: 'Der König wurde getroffen.', burg: 'Die Burg ist eingestürzt.', waffen: 'Alle Waffen sind zerstört.', aufstand: `Das Volk von ${r.loser.name} hat einen Aufstand gemacht!` }[r.reason];
  $('endTitle').textContent = battle.mode === 'ai' ? (youWon ? '🏆 Sieg!' : '💀 Niederlage') : `🏆 ${r.winner.name} gewinnt!`;
  $('endText').innerHTML = `${why}<br>Runden: ${r.round} · Schüsse: ${r.stats.shots[0]} / ${r.stats.shots[1]} · zerstörte Blöcke: ${r.stats.destroyed[0]} / ${r.stats.destroyed[1]}`;
  (youWon ? SFX.win : SFX.lose)();
  setTimeout(() => show('end'), 1600);
}

// ---------- HUD ----------
function buildWeaponButtons() {
  const box = $('weapons'); box.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id], b = document.createElement('button');
    b.dataset.w = id; b.innerHTML = `<i>${w.icon}</i><span>${w.name}<b class="am"></b></span><small></small>`;
    b.addEventListener('click', () => { if (battle?.selectWeapon(id)) SFX.click(); });
    box.appendChild(b);
  }
}
// Windpfeil dreht sich mit der Kamera (jedes Bild)
const _fwd = new THREE.Vector3(); let _lastWindDeg = null;
function updateWindArrow() {
  if (!battle) return;
  gfx.camera.getWorldDirection(_fwd);
  if (Math.hypot(_fwd.x, _fwd.z) < 1e-3) return;              // senkrecht nach unten: letzte Richtung behalten
  const deg = Math.round(windScreenAngle(battle.wind, _fwd) * 2) / 2;
  if (deg !== _lastWindDeg) { _lastWindDeg = deg; $('windArrow').style.transform = `rotate(${deg}deg)`; App.windDeg = deg; }
}
function hud() {
  if (!battle || battle.phase === 'idle') return;
  const P = battle.cur;
  battle.players.forEach((p, i) => {
    $('n' + i).textContent = p.name; $('g' + i).textContent = '💰 ' + p.econ.gold;
    $('m' + i).textContent = `${moodIcon(p.econ.mood)} ${Math.round(p.econ.mood)} · 👥 ${p.econ.people} · Steuer ${p.econ.tax}%`;
    $('i' + i).style.width = Math.round(battle.integrity(p) * 100) + '%';
    document.querySelector('.pl' + i).classList.toggle('active', battle.turn === i);
  });
  for (const b of $('weapons').children) {
    const id = b.dataset.w, w = P.weapons[id];
    b.classList.toggle('on', P.weapon === id); b.classList.toggle('dead', !w.alive);
    const am = P.econ.ammo[id]; b.querySelector('.am').textContent = '×' + am; b.classList.toggle('empty', am <= 0);
    b.querySelector('small').textContent = !w.alive ? 'zerstört' : am <= 0 ? `keine ${WEAPONS[id].ammoName}` : `${am} ${WEAPONS[id].ammoName}`;
  }
  $('turnText').textContent = turnText();
  $('shopBtn').style.visibility = P.human && battle.phase === 'aim' ? 'visible' : 'hidden';
  $('aimPanel').classList.toggle('aimcam', battle.camMode === 'ziel');
  $('weapons').style.visibility = P.human ? 'visible' : 'hidden';
  // Wind aus Sicht des Schützen (rechts = Richtung Gegner)
  const strength = Math.hypot(battle.wind.x, battle.wind.z);
  updateWindArrow();
  $('windVal').textContent = strength < 0.2 ? 'still' : strength < 1.2 ? 'schwach' : strength < 2.3 ? 'mittel' : 'stark';
}
function aimText() {
  if (!battle || battle.phase === 'idle') return;
  const a = battle.aimOf();
  $('vElev').textContent = a.elev.toFixed(1) + '°';
  $('vYaw').textContent = (a.yaw > 0 ? '+' : '') + a.yaw.toFixed(1) + '°';
  $('vPow').textContent = Math.round(a.power * 100) + '%';
  $('powFill').style.height = (a.power * 100) + '%';
  const human = battle.cur.human && battle.phase === 'aim';
  $('aimPanel').classList.toggle('off', !human);
}

// ---------- Zielsteuerung ----------
const stick = { active: false, x: 0, y: 0, id: null };
const pad = $('pad'), knob = $('knob');
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); stick.active = true; stick.id = e.pointerId; padMove(e); });
pad.addEventListener('pointermove', e => { if (stick.active && e.pointerId === stick.id) padMove(e); });
for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, () => { stick.active = false; stick.x = stick.y = 0; knob.style.transform = ''; });
function padMove(e) {
  const r = pad.getBoundingClientRect(), R = r.width / 2;
  let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  stick.x = x; stick.y = y; knob.style.transform = `translate(${x * R * 0.62}px, ${y * R * 0.62}px)`;
}
// Feine Schritte mit Halten-Wiederholung (sanft beschleunigend)
const STEP = { 'e+': [0.5, 0, 0], 'e-': [-0.5, 0, 0], 'y+': [0, 0.5, 0], 'y-': [0, -0.5, 0], 'p+': [0, 0, 0.01], 'p-': [0, 0, -0.01] };
const hold = { key: null, t: 0, n: 0 };
document.querySelectorAll('[data-n]').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); hold.key = b.dataset.n; hold.t = 0; hold.n = 0; applyStep(hold.key, 1); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { hold.key = null; });
});
function applyStep(k, mult) { if (!canAim()) return; const [de, dy, dp] = STEP[k]; battle.nudge(de * mult, dy * mult, dp * mult); }
const canAim = () => battle && battle.phase === 'aim' && battle.cur.human && !paused;
// Kraftbalken: relatives Ziehen (kein Springen)
const track = $('powTrack'); let powDrag = null;
track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); powDrag = { y: e.clientY, p: battle?.aimOf().power ?? 0 }; });
track.addEventListener('pointermove', e => { if (!powDrag || !canAim()) return; const dy = powDrag.y - e.clientY; battle.setAim(null, powDrag.p + dy * 0.004 * settings.sensitivity, null); });
for (const ev of ['pointerup', 'pointercancel']) track.addEventListener(ev, () => { powDrag = null; });
$('fireBtn').addEventListener('click', () => { if (canAim()) battle.fire(); });

// Tastatur (PC)
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key);
  if (!canAim()) return;
  if (e.key === ' ') { e.preventDefault(); battle.fire(); }
  const i = ['1', '2', '3'].indexOf(e.key); if (i >= 0) battle.selectWeapon(WEAPON_ORDER[i]);
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

function aimInput(dt) {
  if (!canAim()) return;
  const sens = settings.sensitivity;
  const ex = stickCurve(stick.x), ey = stickCurve(stick.y);
  let de = -ey * 16 * sens * dt, dy = ex * 16 * sens * dt, dp = 0;
  if (keys.has('ArrowUp')) de += 10 * sens * dt; if (keys.has('ArrowDown')) de -= 10 * sens * dt;
  if (keys.has('ArrowRight')) dy += 10 * sens * dt; if (keys.has('ArrowLeft')) dy -= 10 * sens * dt;
  if (keys.has('w') || keys.has('W')) dp += 0.25 * sens * dt; if (keys.has('s') || keys.has('S')) dp -= 0.25 * sens * dt;
  if (de || dy || dp) battle.nudge(de, dy, dp);
  if (hold.key) {
    hold.t += dt;
    if (hold.t > 0.4) { const rate = Math.min(22, 6 + (hold.t - 0.4) * 12) * sens; hold.n += rate * dt; while (hold.n >= 1) { hold.n -= 1; applyStep(hold.key, 1); } }
  }
}

// ---------- Kamera-Taste ----------
$('camBtn').addEventListener('click', () => {
  if (!battle || battle.phase === 'idle') return;
  const next = CAM_MODES[(CAM_MODES.indexOf(battle.camMode) + 1) % CAM_MODES.length];
  battle.setCamMode(next); toast('🎥 ' + CAM_NAMES[next], false); hud();
});
$('pauseBtn').addEventListener('click', () => { paused = true; returnTo = 'pause'; show('pause'); });
$('aimFold').addEventListener('click', () => { const f = $('aimPanel').classList.toggle('folded'); localStorage.setItem(STORE + '_fold', f ? '1' : ''); });
if (localStorage.getItem(STORE + '_fold')) $('aimPanel').classList.add('folded');

// ---------- Laden / Burgverwaltung ----------
$('shopBtn').addEventListener('click', () => { if (canAim()) openShop(); });
function openShop() { paused = true; renderShop(); show('shop'); }
function renderShop(msg) {
  const P = battle.cur, E = P.econ;
  $('shopName').textContent = P.name;
  $('sGold').textContent = E.gold; $('sPeople').textContent = E.people; $('sMood').textContent = Math.round(E.mood);
  $('sMoodIcon').textContent = moodIcon(E.mood); $('sMoodWord').textContent = moodWord(E.mood);
  $('sTax').value = E.tax; $('sTaxVal').textContent = E.tax + ' %';
  const f = forecast(E, battle.integrity(P));
  $('sForecast').textContent = `Nächste Runde: +${f.income} Gold, Stimmung ${f.moodDelta >= 0 ? '+' : ''}${f.moodDelta}` + (E.mood + f.moodDelta <= 15 ? ' – Vorsicht, Aufstand droht!' : '');
  $('sAmmo').innerHTML = WEAPON_ORDER.map(id => `${WEAPONS[id].icon} ${WEAPONS[id].ammoName}: <b>${E.ammo[id]}</b>${P.weapons[id].alive ? '' : ' (Waffe zerstört)'}`).join(' · ');
  const box = $('sItems'); box.innerHTML = '';
  for (const it of SHOP) {
    const b = document.createElement('button'), why = battle.canBuy(P, it);
    b.innerHTML = `<span>${it.icon} ${it.name}</span><b>${it.price} Gold</b>${why ? `<small>${why}</small>` : ''}`;
    b.disabled = !!why;
    b.addEventListener('click', () => { const r = battle.buy(P, it.id); SFX.click(); renderShop(r.msg); hud(); });
    box.appendChild(b);
  }
  $('sMsg').textContent = msg || '\u00a0';
}
$('sTax').addEventListener('input', e => { battle.setTax(battle.cur, +e.target.value); renderShop(); });

// ---------- Menü-Aktionen ----------
document.body.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  SFX.click();
  const act = b.dataset.act;
  if (act === 'start-ai') start({ mode: 'ai' });
  else if (act === 'start-hot') start({ mode: 'hot' });
  else if (act === 'settings') { returnTo = $('pause').classList.contains('hidden') ? 'menu' : 'pause'; syncSettings(); show('settings'); }
  else if (act === 'close-settings') { save(); show(returnTo === 'pause' && battle?.phase !== 'idle' ? 'pause' : 'menu'); }
  else if (act === 'help') { returnTo = $('pause').classList.contains('hidden') ? 'menu' : 'pause'; show('help'); }
  else if (act === 'close-help') show(returnTo === 'pause' && battle?.phase !== 'idle' ? 'pause' : 'menu');
  else if (act === 'resume') { paused = false; hideAll(); }
  else if (act === 'close-shop') { paused = false; hideAll(); battle.aimDirty = true; }
  else if (act === 'quit') { paused = false; demo(); }
  else if (act === 'again') start(lastOpts);
  else if (act === 'rotate-ok') { rotateOk = true; checkRotate(); }
});
document.querySelectorAll('#diff [data-diff]').forEach(b => b.addEventListener('click', () => { settings.difficulty = b.dataset.diff; save(); syncSettings(); }));
document.querySelectorAll('[data-set]').forEach(group => group.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  const k = group.dataset.set; let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
  settings[k] = v; save(); syncSettings();
  if (k === 'quality') { gfx.setQuality(v); resize(); }
  if (k === 'sound') setSound(v);
  if (k === 'follow' && battle) battle.opts.follow = v;
  if (k === 'aimHelp' && battle) battle.aimDirty = true;
  if (k === 'lineColor' || k === 'lineStyle') { gfx.setLineStyle(LINE_COLORS[settings.lineColor], settings.lineStyle); if (battle) battle.aimDirty = true; }
  if (k === 'aimCam' && battle && battle.phase !== 'idle') { battle.camMode = v ? 'ziel' : 'burg'; }
})));
$('sens').addEventListener('input', e => { settings.sensitivity = +e.target.value; $('sensVal').textContent = settings.sensitivity.toFixed(2) + '×'; save(); });
function syncSettings() {
  document.querySelectorAll('#diff [data-diff]').forEach(b => b.classList.toggle('on', b.dataset.diff === settings.difficulty));
  document.querySelectorAll('[data-set]').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[g.dataset.set]) === b.dataset.v)));
  $('sens').value = settings.sensitivity; $('sensVal').textContent = (+settings.sensitivity).toFixed(2) + '×';
}

// ---------- Größe / Ausrichtung ----------
function resize() { gfx.resize(innerWidth, innerHeight); checkRotate(); }
function checkRotate() { $('rotate').classList.toggle('hidden', rotateOk || innerWidth >= innerHeight || !matchMedia('(pointer: coarse)').matches); }
addEventListener('resize', resize);
screen.orientation?.lock?.('landscape').catch(() => {});

// ---------- Schleife ----------
let last = performance.now(), hudT = 0, menuSpin = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (battle && !paused) {
    aimInput(dt);
    battle.update(dt);
    if (battle.phase === 'idle') { menuSpin += dt * 0.06; rig.goal.theta = -0.6 + Math.sin(menuSpin) * 0.5; }
    if (battle.aimDirty && (battle.phase === 'aim' || battle.phase === 'ai')) {
      battle.aimDirty = false; aimText();
      const help = battle.cur.human ? settings.aimHelp : 'aus';
      if (help === 'aus') gfx.showTrajectory(null, 0);
      else { const r = battle.preview(); gfx.showTrajectory(r.pts, help === 'voll' ? 1 : 0.35); }
    } else if (battle.phase !== 'aim' && battle.phase !== 'ai') { gfx.showTrajectory(null, 0); $('aimPanel').classList.add('off'); }
    hudT += dt; if (hudT > 0.5) { hudT = 0; hud(); }
  }
  if (lineT > 0 && (lineT -= dt) <= 0) $('line').classList.add('hidden');
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.add('hidden');
  rig.update(dt);
  updateWindArrow();
  gfx.render();
  requestAnimationFrame(frame);
}
resize(); syncSettings(); demo();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

// Android-Zurück-Taste (APK): Overlays schließen bzw. Pause öffnen; false = App beenden
window.__onBack = () => {
  if (!$('shop').classList.contains('hidden')) { paused = false; hideAll(); return true; }
  if (!$('settings').classList.contains('hidden') || !$('help').classList.contains('hidden')) { show(returnTo === 'pause' && battle?.phase !== 'idle' ? 'pause' : 'menu'); return true; }
  if (!$('pause').classList.contains('hidden')) { paused = false; hideAll(); return true; }
  if (battle && battle.phase !== 'idle' && $('end').classList.contains('hidden')) { paused = true; returnTo = 'pause'; show('pause'); return true; }
  if (battle && battle.phase !== 'idle') { demo(); return true; }
  return false;
};
window.__onPause = () => { if (battle && battle.phase !== 'idle' && $('menu').classList.contains('hidden') && $('end').classList.contains('hidden')) { paused = true; show('pause'); } };
if (!IS_APP && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
