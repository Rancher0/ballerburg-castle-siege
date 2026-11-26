// Ballerburg 3D – Spiellogik: Burgen aufbauen, Züge, Schuss, Einschlag, Sieg, Computergegner.
import { WORLD, WEAPONS, WEAPON_ORDER, ECONOMY, SHOP, RULES, PLAYER_NAMES_AI, PLAYER_NAMES_HOT } from './config.js';
import { castlePlan, pickLayout, toWorld, facingYaw, muzzle } from './castle.js';
import { newEconomy, settleTurn } from './economy.js';
import { createWorld, makeBlock, makeKing, explode, allAsleep, pointInBox, CANNON } from './physics.js';
import { launchVelocity, stepProjectile, simulate, solveShot, clamp } from './ballistics.js';
import { SFX } from './sound.js';
import { LINES, pick } from './lines.js';

const DT = 1 / 120;
// Zielansicht: Abstand hinter / über / seitlich der Waffe
const AIM_CAM = { kanone: { back: 3.6, up: 2.6, side: 1.3 }, katapult: { back: 4.5, up: 4.5, side: 1.6 }, moerser: { back: 3.4, up: 2.6, side: 1.3 } };
const AI_NOISE = { leicht: { e: 6, y: 4, p: 0.09, learn: 0.8 }, mittel: { e: 3.5, y: 2.5, p: 0.05, learn: 0.7 }, schwer: { e: 1.6, y: 1.1, p: 0.025, learn: 0.55 } };

export class Battle {
  constructor(gfx, rig, opts, hooks = {}) {
    this.gfx = gfx; this.rig = rig; this.opts = opts; this.hooks = hooks;
    this.mode = opts.mode; // 'ai' | 'hot'
    const q = gfx.q;
    const { world } = createWorld(q.solverIt); this.world = world;
    const layouts = opts.layouts || [0, 1].map(() => pickLayout(opts.layout));
    this.players = [0, 1].map(side => this.buildSide(side, castlePlan(layouts[side])));
    this.camMode = opts.aimCam === false ? 'burg' : 'ziel';
    this.allBlocks = [...this.players[0].blocks, ...this.players[1].blocks];
    this.turn = 0; this.round = 1; this.phase = 'aim'; this.proj = null; this.acc = 0;
    this.stats = { shots: [0, 0], destroyed: [0, 0] };
    this.newWind();
    this.startTurn(true);
  }
  buildSide(side, plan) {
    const names = this.mode === 'ai' ? PLAYER_NAMES_AI : PLAYER_NAMES_HOT;
    const P = { side, plan, name: names[side], human: this.mode === 'hot' || side === 0, econ: newEconomy(), weapon: 'kanone', aim: {}, weapons: {}, blocks: [], keyIndex: new Map() };
    plan.blocks.forEach((bl, i) => {
      const p = toWorld(side, bl.u, bl.v, bl.l + 0.5);
      const b = makeBlock(this.world, p); b.origin = p; b.side = side; b.bl = bl; P.blocks.push(b); P.keyIndex.set(`${bl.u},${bl.v},${bl.l}`, b);
    });
    const vis = this.gfx.buildCastle(side, plan.blocks, plan, toWorld);
    P.mesh = vis.mesh; P.flag = vis.flag;
    const kp = toWorld(side, plan.king.u, plan.king.v, plan.king.y);
    P.king = { body: makeKing(this.world, kp), mesh: this.gfx.makeKing(side), origin: { x: kp.x, y: kp.y + 0.5, z: kp.z }, dead: false };
    P.king.body.addEventListener('collide', e => { const v = e.contact.getImpactVelocityAlongNormal(); if (Math.abs(v) > 9 && this.phase !== 'aim') this.killKing(P); });
    for (const id of WEAPON_ORDER) {
      P.aim[id] = { elev: id === 'kanone' ? 12 : id === 'katapult' ? 50 : 65, yaw: 0, power: 0.75 };
      this.makeWeaponVis(P, id);
    }
    return P;
  }
  makeWeaponVis(P, id) {
    const w = P.plan.weapons[id], pos = toWorld(P.side, w.u, w.v, w.y);
    const old = P.weapons[id]; if (old) this.gfx.scene.remove(old.g);
    const g = this.gfx.makeWeapon(id, P.side); g.position.set(pos.x, pos.y, pos.z);
    if (id === 'katapult') g.scale.setScalar(0.75);
    P.weapons[id] = { g, pos, alive: true, support: w.support.map(k => P.keyIndex.get(k.join(','))).filter(Boolean), arm: 0 };
    this.gfx.poseWeapon(g, facingYaw(P.side) + P.aim[id].yaw, P.aim[id].elev);
  }
  get cur() { return this.players[this.turn]; }
  get foe() { return this.players[1 - this.turn]; }
  newWind() {
    const a = Math.random() * Math.PI * 2, s = Math.random() * WORLD.maxWind * (this.opts.windOn === false ? 0 : 1);
    this.wind = { x: Math.cos(a) * s, z: Math.sin(a) * s * 0.6 };
    this.gfx.windX = this.wind.x;
  }
  aimOf(P = this.cur) { return P.aim[P.weapon]; }
  absYaw(P, a) { return facingYaw(P.side) + a.yaw; }  // +yaw = nach rechts (aus Sicht des Schützen)
  // --- Eingaben (Mensch) ---
  setAim(elev, power, yawRel) {
    const P = this.cur, w = WEAPONS[P.weapon], a = this.aimOf();
    if (elev != null) a.elev = clamp(elev, w.elevMin, w.elevMax);
    if (power != null) a.power = clamp(power, 0, 1);
    if (yawRel != null) a.yaw = clamp(yawRel, -w.yawRange, w.yawRange);
    this.aimDirty = true;
  }
  nudge(de, dy, dp) { const a = this.aimOf(); this.setAim(a.elev + de, a.power + dp, a.yaw + dy); }
  selectWeapon(id) {
    const P = this.cur; if (!P.weapons[id]?.alive || this.phase !== 'aim') return false;
    P.weapon = id; this.aimDirty = true; this.viewWeapon(); this.hooks.onHud?.(); return true;
  }
  hasAmmo(P, id) { return P.econ.ammo[id] > 0; }
  usable(P, id) { return P.weapons[id].alive && this.hasAmmo(P, id); }
  // --- Laden / Wirtschaft ---
  setTax(P, t) { P.econ.tax = clamp(Math.round(t), 0, ECONOMY.maxTax); this.hooks.onHud?.(); }
  canBuy(P, item) {
    if (P.econ.gold < item.price) return 'Zu wenig Gold';
    if (item.kind === 'repairWeapon' && !this.repairableWeapon(P)) return 'Keine reparierbare Waffe';
    if (item.kind === 'repairWall' && !this.restoreBlocks(P, 1, true)) return 'Nichts auszubessern';
    if (item.kind === 'fest' && P.econ.mood >= 100) return 'Volk ist schon begeistert';
    return null;
  }
  buy(P, itemId) {
    const item = SHOP.find(i => i.id === itemId); if (!item) return { ok: false, msg: 'Unbekannt' };
    const why = this.canBuy(P, item); if (why) return { ok: false, msg: why };
    let msg = '';
    if (item.kind === 'ammo') { P.econ.ammo[item.weapon] += item.qty; msg = `${item.name} gekauft`; }
    else if (item.kind === 'repairWall') { const n = this.restoreBlocks(P, item.qty); msg = `${n} Steine wieder eingesetzt`; }
    else if (item.kind === 'repairWeapon') { const id = this.repairableWeapon(P); this.makeWeaponVis(P, id); msg = `${WEAPONS[id].name} repariert`; }
    else if (item.kind === 'fest') { P.econ.mood = Math.min(100, P.econ.mood + item.mood); msg = 'Das Volk feiert!'; }
    P.econ.gold -= item.price;
    if (!this.usable(P, P.weapon)) { const alt = WEAPON_ORDER.find(id => this.usable(P, id)); if (alt) P.weapon = alt; }
    this.aimDirty = true; this.hooks.onHud?.();
    return { ok: true, msg };
  }
  repairableWeapon(P) {
    return WEAPON_ORDER.find(id => !P.weapons[id].alive && P.weapons[id].support.every(b => !this.isLoose(b)) && P.weapons[id].support.length === P.plan.weapons[id].support.length);
  }
  // Lose/zerstörte Steine von unten nach oben wieder an ihren Platz setzen (nur mit Unterbau und freiem Platz)
  restoreBlocks(P, n, dry = false) {
    let done = 0;
    const cand = P.blocks.filter(b => this.isLoose(b)).sort((a, b) => a.bl.l - b.bl.l);
    for (const b of cand) {
      if (done >= n) break;
      const { u, v, l } = b.bl;
      const below = l === 0 ? null : P.keyIndex.get(`${u},${v},${l - 1}`);
      const kingCell = l === 1 && u === P.plan.king.u && v === P.plan.king.v;
      if (l > 0 && !(kingCell ? !P.king.dead : below && !this.isLoose(below))) continue;
      const o = b.origin, blockers = [];
      let occupied = false;
      for (const q of [...this.allBlocks, this.players[0].king.body, this.players[1].king.body]) {
        if (q === b || !q.world) continue;
        if (Math.abs(q.position.x - o.x) < 0.9 && Math.abs(q.position.y - o.y) < 0.9 && Math.abs(q.position.z - o.z) < 0.9) {
          if (q.origin && this.isLoose(q)) blockers.push(q); else { occupied = true; break; }
        }
      }
      if (occupied) continue;
      done++;
      if (dry) return 1;
      for (const q of blockers) this.world.removeBody(q);   // Schutt wegräumen
      if (!b.world) this.world.addBody(b);
      b.position.set(o.x, o.y, o.z); b.quaternion.set(0, 0, 0, 1); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position); b.previousQuaternion.copy(b.quaternion); b.interpolatedQuaternion.copy(b.quaternion);
      b.linearDamping = 0.2; b.angularDamping = 0.4; b.aabbNeedsUpdate = true; b.sleep(); b._hidden = false; b._synced = false;
    }
    return done;
  }
  aiEconomy(P) {
    const E = P.econ, buy = id => this.buy(P, id).ok;
    E.tax = E.mood < 40 ? 15 : E.mood > 70 ? 40 : 30;
    if (E.mood < 25 && E.gold >= 40) buy('fest');
    if (!WEAPON_ORDER.every(id => P.weapons[id].alive) && E.gold >= 80) buy('rep_weapon');
    if (E.ammo.kanone < 3 && E.gold >= 15) buy('ammo_kanone');
    if (E.ammo.katapult < 3 && E.gold >= 10) buy('ammo_katapult');
    if (E.ammo.moerser < 1 && E.gold >= 60) buy('ammo_moerser');
    if (this.integrity(P) < 0.85 && E.gold >= 70) buy('rep_wall');
  }
  // --- Flugbahn / Zielhilfe ---
  shotParams(P = this.cur) {
    const a = this.aimOf(P), wp = WEAPONS[P.weapon], yaw = this.absYaw(P, a);
    return { wp, origin: muzzle(P.side, P.plan, P.weapon, yaw, a.elev), vel: launchVelocity(wp, a.elev, yaw, a.power), yaw, a };
  }
  hitTest(p, t, wp, origin) {
    const r = wp.radius;
    const nearOrigin = t < 0.45 && Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z) < 1.8;
    for (const b of this.allBlocks) {
      if (!b.world) continue;
      const dx = b.position.x - p.x, dy = b.position.y - p.y, dz = b.position.z - p.z;
      if (dx * dx + dy * dy + dz * dz > (0.87 + r) * (0.87 + r)) continue;
      if (nearOrigin) continue;
      if (pointInBox(b, p, r)) return 'block';
    }
    for (const P of this.players) {
      const k = P.king.body.position;
      if (!P.king.dead && Math.hypot(k.x - p.x, k.y - p.y, k.z - p.z) < 0.6 + r) return 'koenig';
      for (const id of WEAPON_ORDER) {
        const w = P.weapons[id]; if (!w.alive || (P === this.cur && id === P.weapon && t < 0.6)) continue;
        if (Math.hypot(w.pos.x - p.x, w.pos.y + 0.5 - p.y, w.pos.z - p.z) < 0.8 + r) return 'waffe';
      }
    }
    return null;
  }
  preview() {
    const s = this.shotParams();
    // Ziellinie bewusst OHNE Wind: zeigt die reine Flugbahn, den Wind muss man selbst einschätzen
    const r = simulate(s.origin, s.vel, { x: 0, z: 0 }, s.wp, { dt: DT, maxT: 10, sampleEvery: 2, hitTest: (p, t) => this.hitTest(p, t, s.wp, s.origin) });
    return r;
  }
  // --- Ablauf ---
  startTurn(first = false) {
    const P = this.cur;
    this.lastSettle = null;
    if (!first) {
      this.lastSettle = settleTurn(P.econ, this.integrity(P));
      if (P.econ.mood <= 0) { this.phase = 'over'; this.hooks.onEnd?.({ winner: this.foe, loser: P, reason: 'aufstand', stats: this.stats, round: this.round }); return; }
    }
    if (!P.human) this.aiEconomy(P);
    // Notration, damit niemand ohne Munition festhängt
    if (!WEAPON_ORDER.some(id => this.usable(P, id)) && P.econ.gold < 10) { P.econ.ammo.kanone += 2; P.econ.ammo.katapult += 2; this.hooks.onToast?.(`${P.name}: Die Schmiede liefert Notmunition.`); }
    if (!this.usable(P, P.weapon)) P.weapon = WEAPON_ORDER.find(id => this.usable(P, id)) || WEAPON_ORDER.find(id => P.weapons[id].alive);
    this.phase = 'aim'; this.aimDirty = true;
    this.viewWeapon(first);
    this.hooks.onTurn?.(P, this);
    this.hooks.onHud?.();
    if (!P.human) { this.phase = 'ai'; this.aiTimer = 0; this.aiPlan = null; this.say(pick(LINES.aiTurn)); }
  }
  // Zielansicht: knapp hinter und über der aktiven Waffe, Blick entlang des Rohrs zur Gegnerburg
  aimCamPose(P = this.cur) {
    const w = P.weapons[P.weapon], a = this.aimOf(P), y = this.absYaw(P, a) * Math.PI / 180;
    const dx = Math.cos(y), dz = Math.sin(y), sx = -dz, sz = dx;   // s = nach rechts
    const C = AIM_CAM[P.weapon] || AIM_CAM.kanone;
    const pos = { x: w.pos.x - dx * C.back + sx * C.side, y: w.pos.y + C.up, z: w.pos.z - dz * C.back + sz * C.side };
    // nicht in Mauern stecken: so lange anheben, bis frei
    for (let i = 0; i < 30 && P.blocks.some(b => b.world && Math.abs(b.position.x - pos.x) < 1.1 && Math.abs(b.position.y - pos.y) < 1.1 && Math.abs(b.position.z - pos.z) < 1.1); i++) pos.y += 0.5;
    const e = clamp(a.elev, 0, 60) * Math.PI / 180;
    const dist = 60, lift = Math.tan(e) * 11;                // leicht mit dem Winkel nach oben schwenken
    const look = { x: w.pos.x + dx * dist, y: WORLD.plateau + 1 + lift, z: w.pos.z + dz * dist };
    return { pos, look };
  }
  setCamMode(mode) {
    this.camMode = mode;
    if (mode === 'ziel') this.viewWeapon();
    else if (mode === 'burg') this.viewWeapon();
    else if (mode === 'uebersicht') this.viewOverview();
    else this.viewEnemy();
  }
  viewWeapon(instant = false) {
    const P = this.cur;
    if (this.camMode === 'ziel' && P.human) { this.rig.follow = null; this.rig.setFP(this.aimCamPose(P), instant); return; }
    // Blick von hinten-oben über die eigene Burg Richtung Gegner
    const s = P.side === 0 ? 1 : -1, w = P.weapons[P.weapon];
    const t = { x: s * (-WORLD.castleX + 12), y: WORLD.plateau + 2, z: w.pos.z * 0.2 };
    this.rig.follow = null;
    this.rig.view(t, (s > 0 ? -Math.PI / 2 : Math.PI / 2) + 0.45, 1.12, 26, instant);
  }
  viewOverview() { this.rig.follow = null; this.rig.view({ x: 0, y: 4, z: 0 }, -0.05 + (this.turn ? 0.1 : -0.1), 1.05, 85); }
  viewEnemy() { const s = this.cur.side === 0 ? 1 : -1; this.rig.follow = null; this.rig.view({ x: s * WORLD.castleX, y: WORLD.plateau + 2, z: 0 }, s > 0 ? -Math.PI / 2 + 0.5 : Math.PI / 2 + 0.5, 1.0, 24); }
  fire() {
    if (this.phase !== 'aim' && this.phase !== 'ai') return false;
    const P = this.cur, wp = WEAPONS[P.weapon];
    if (!P.weapons[P.weapon].alive) { this.hooks.onToast?.(`${wp.name} ist zerstört.`); return false; }
    if (!this.hasAmmo(P, P.weapon)) { this.hooks.onToast?.(`Keine ${wp.ammoName} mehr – im Laden 🛒 kaufen.`); return false; }
    P.econ.ammo[P.weapon]--;
    try { window.Android?.vibrate?.(40); } catch {}
    const s = this.shotParams();
    this.proj = { p: { ...s.origin }, v: { ...s.vel }, wp, origin: s.origin, t: 0, mesh: this.gfx.makeProjectile(wp), owner: P };
    this.proj.mesh.position.set(s.origin.x, s.origin.y, s.origin.z);
    this.phase = 'flight'; this.stats.shots[this.turn]++;
    this.gfx.smokePuff(s.origin);
    SFX[wp.id]?.();
    if (wp.id === 'katapult') { P.weapons.katapult.arm = 0.001; }
    if (this.opts.follow !== false) { this.rig.leaveFP(); this.rig.follow = this.proj; }
    this.hooks.onHud?.();
    return true;
  }
  impact(type) {
    const pr = this.proj, p = pr.p, wp = pr.wp;
    this.gfx.scene.remove(pr.mesh); pr.mesh.geometry.dispose();
    this.rig.follow = null;
    this.rig.view({ x: p.x, y: Math.max(p.y, WORLD.plateau * 0.5), z: p.z }, this.rig.theta, 1.05, 22);
    this.proj = null; this.phase = 'settle'; this.settleT = 0;
    if (type === 'wasser') { this.gfx.explosion(p, 1, true); SFX.splash(); this.say(pick(LINES.water)); return; }
    if (type === 'aus') { this.say(pick(LINES.miss)); return; }
    this.gfx.explosion(p, wp.blast, false); SFX.boom(wp.explosive);
    const before = this.players.map(P => this.looseCount(P));
    const vn = Math.hypot(pr.v.x, pr.v.y, pr.v.z) || 1, dir = { x: pr.v.x / vn, y: pr.v.y / vn, z: pr.v.z / vn };
    explode(this.world, this.allBlocks, p, wp, dir);
    for (const P of this.players) {
      const k = P.king.body.position;
      if (Math.hypot(k.x - p.x, k.y - p.y, k.z - p.z) < wp.blast * 0.6) this.killKing(P);
      for (const id of WEAPON_ORDER) { const w = P.weapons[id]; if (w.alive && Math.hypot(w.pos.x - p.x, w.pos.y + 0.5 - p.y, w.pos.z - p.z) < Math.min(1.4, wp.blast * 0.55)) this.breakWeapon(P, id); }
    }
    this.hitBefore = before; this.lastImpact = { ...p, type };
  }
  killKing(P) { if (P.king.dead) return; P.king.dead = true; P.king.body.wakeUp(); P.king.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2)); }
  breakWeapon(P, id) {
    const w = P.weapons[id]; if (!w.alive) return; w.alive = false;
    w.g.rotation.z = (Math.random() - 0.5) * 1.2; w.g.rotation.x = (Math.random() - 0.5) * 0.8; w.g.position.y -= 0.3;
    w.g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
    this.hooks.onToast?.(`${P.name}: ${WEAPONS[id].name} zerstört!`);
  }
  isLoose(b) { return !b.world || Math.hypot(b.position.x - b.origin.x, b.position.y - b.origin.y, b.position.z - b.origin.z) > RULES.blockLooseDist; }
  looseCount(P) { let n = 0; for (const b of P.blocks) if (this.isLoose(b)) n++; return n; }
  integrity(P) { return 1 - this.looseCount(P) / P.blocks.length; }
  endTurnChecks() {
    // Waffen ohne Unterbau fallen
    for (const P of this.players) for (const id of WEAPON_ORDER) {
      const w = P.weapons[id]; if (!w.alive || !w.support.length) continue;
      const lost = w.support.filter(b => this.isLoose(b)).length;
      if (lost >= Math.ceil(w.support.length / 2) + (w.support.length > 2 ? 1 : 0)) this.breakWeapon(P, id);
    }
    for (const P of this.players) {
      const k = P.king.body, o = P.king.origin;
      if (Math.hypot(k.position.x - o.x, k.position.y - o.y, k.position.z - o.z) > 0.7) this.killKing(P);
    }
    const lost = this.players.map(P => P.king.dead ? 'koenig' : this.integrity(P) < RULES.loseIntegrity ? 'burg' : !WEAPON_ORDER.some(id => P.weapons[id].alive) ? 'waffen' : null);
    const shooter = this.turn;
    if (this.hitBefore) {
      const d = this.players.map((P, i) => this.looseCount(P) - this.hitBefore[i]);
      this.stats.destroyed[shooter] += d[1 - shooter];
      this.players.forEach((P, i) => { P.econ.lostSince += Math.max(0, d[i]); });
      if (d[1 - shooter] >= 8) this.say(pick(this.cur.human ? LINES.bigHit : LINES.aiBigHit));
      else if (d[1 - shooter] > 0) this.say(pick(this.cur.human ? LINES.hit : LINES.aiHit));
      else if (d[shooter] > 0) this.say(pick(LINES.ownHit));
      else this.say(pick(LINES.miss));
      this.hitBefore = null;
    }
    if (lost[0] || lost[1]) {
      const loser = lost[1 - shooter] ? 1 - shooter : shooter;
      this.phase = 'over';
      const winner = this.players[1 - loser];
      this.hooks.onEnd?.({ winner, loser: this.players[loser], reason: lost[loser], stats: this.stats, round: this.round });
      return true;
    }
    return false;
  }
  say(text) { this.hooks.onLine?.(text); }
  // --- Computer ---
  aiThink() {
    const P = this.cur, F = this.foe, noise = AI_NOISE[this.opts.difficulty] || AI_NOISE.mittel;
    const alive = WEAPON_ORDER.filter(id => this.usable(P, id));
    if (!alive.length) { this.aiPlan = { skip: true }; return; }
    let id = alive.includes('moerser') && Math.random() < 0.35 ? 'moerser' : alive.filter(x => x !== 'moerser')[Math.floor(Math.random() * alive.filter(x => x !== 'moerser').length)] || alive[0];
    P.weapon = id;
    const wp = WEAPONS[id], kp = F.king.body.position;
    const target = { x: kp.x, y: kp.y + (id === 'kanone' ? 0.3 : 0.6), z: kp.z };
    const a0 = P.aim[id];
    const origin = muzzle(P.side, P.plan, id, this.absYaw(P, a0), a0.elev);
    const sol = solveShot(wp, origin, target, this.wind, { preferHigh: wp.aiPreferHigh });
    P.aiShots = (P.aiShots || 0) + 1;
    const f = Math.pow(noise.learn, Math.min(6, P.aiShots - 1));
    const rn = () => (Math.random() * 2 - 1);
    const yawRel = sol.yaw - facingYaw(P.side);
    const yawN = Math.atan2(Math.sin(yawRel * Math.PI / 180), Math.cos(yawRel * Math.PI / 180)) * 180 / Math.PI;
    this.aiPlan = { id, from: { ...a0 }, to: { elev: clamp(sol.elev + rn() * noise.e * f, wp.elevMin, wp.elevMax), yaw: clamp(yawN + rn() * noise.y * f, -wp.yawRange, wp.yawRange), power: clamp(sol.power + rn() * noise.p * f, 0, 1) } };
    this.viewWeapon(); this.hooks.onHud?.();
  }
  // --- Schleife ---
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.world.step(1 / 60, dt, 3);
    if (this.phase === 'ai') {
      this.aiTimer += dt;
      if (!this.aiPlan && this.aiTimer > 0.9) this.aiThink();
      if (this.aiPlan?.skip) { this.say('Wir haben nichts mehr zum Schießen …'); this.turn = 1 - this.turn; if (this.turn === 0) this.round++; this.newWind(); this.startTurn(); }
      else if (this.aiPlan) {
        const k = clamp((this.aiTimer - 0.9) / 1.4, 0, 1), e = k * k * (3 - 2 * k), A = this.aimOf(), { from, to } = this.aiPlan;
        A.elev = from.elev + (to.elev - from.elev) * e; A.yaw = from.yaw + (to.yaw - from.yaw) * e; A.power = from.power + (to.power - from.power) * e;
        this.aimDirty = true;
        if (k >= 1 && this.aiTimer > 2.6) this.fire();
      }
    }
    if (this.phase === 'aim' && this.camMode === 'ziel' && this.cur.human && this.rig.fp) this.rig.setFP(this.aimCamPose(), false);
    if (this.phase === 'flight' && this.proj) {
      const pr = this.proj; this.acc += dt; let hit = null;
      while (this.acc >= DT && !hit) {
        this.acc -= DT; stepProjectile(pr.p, pr.v, this.wind, pr.wp, DT); pr.t += DT;
        hit = this.hitTest(pr.p, pr.t, pr.wp, pr.origin);
        if (!hit) { const g = WORLD.waterLevel; const th = terrainAt(pr.p); if (pr.p.y - pr.wp.radius < th) hit = th < g ? 'wasser' : 'boden'; }
        if (!hit && (Math.abs(pr.p.x) > 140 || Math.abs(pr.p.z) > 120 || pr.t > 14)) hit = 'aus';
      }
      if (this.proj) { pr.mesh.position.set(pr.p.x, pr.p.y, pr.p.z); pr.mesh.rotation.x += dt * 5; }
      if (hit) { this.acc = 0; this.impact(hit); }
    } else this.acc = 0;
    if (this.phase === 'settle') {
      this.settleT += dt;
      if ((this.settleT > 1.3 && allAsleep(this.allBlocks)) || this.settleT > RULES.settleMax) {
        if (!this.endTurnChecks()) { this.turn = 1 - this.turn; if (this.turn === 0) this.round++; this.newWind(); this.startTurn(); }
      }
    }
    // Grafik abgleichen
    for (const P of this.players) {
      this.gfx.syncBlocks(P.mesh, P.blocks);
      const kb = P.king.body; P.king.mesh.position.set(kb.position.x, kb.position.y, kb.position.z); P.king.mesh.quaternion.set(kb.quaternion.x, kb.quaternion.y, kb.quaternion.z, kb.quaternion.w);
      this.gfx.waveFlag(P.flag, this.wind);
      for (const id of WEAPON_ORDER) {
        const w = P.weapons[id], a = P.aim[id]; if (!w.alive) continue;
        if (w.arm > 0) { w.arm = Math.min(1, w.arm + dt * 5); if (w.arm >= 1) w.arm = -1; }
        else if (w.arm < 0) { w.arm = Math.min(0, w.arm + dt * 0.8); }
        const armT = w.arm > 0 ? w.arm : -w.arm;
        if (w.g.userData.elev.userData.stone) w.g.userData.elev.userData.stone.visible = w.arm === 0;
        this.gfx.poseWeapon(w.g, this.absYaw(P, a), a.elev, armT);
      }
    }
    this.gfx.updateFx(dt);
  }
  dispose() {
    for (const P of this.players) { this.gfx.scene.remove(P.mesh, P.flag, P.king.mesh); for (const id of WEAPON_ORDER) this.gfx.scene.remove(P.weapons[id].g); }
    if (this.proj) this.gfx.scene.remove(this.proj.mesh);
  }
}
import { terrainHeight } from './config.js';
const terrainAt = p => terrainHeight(p.x, p.z);
