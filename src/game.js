// Ballerburg 3D – Spiellogik: Burgen aufbauen, Züge, Schuss, Einschlag, Sieg, Computergegner.
import { WORLD, WEAPONS, WEAPON_ORDER, ECONOMY, RULES, PLAYER_NAMES_AI, PLAYER_NAMES_HOT } from './config.js';
import { castlePlan, toWorld, facingYaw, muzzle } from './castle.js';
import { createWorld, makeBlock, makeKing, explode, allAsleep, pointInBox, CANNON } from './physics.js';
import { launchVelocity, stepProjectile, simulate, solveShot, clamp } from './ballistics.js';
import { SFX } from './sound.js';
import { LINES, pick } from './lines.js';

const DT = 1 / 120;
const AI_NOISE = { leicht: { e: 6, y: 4, p: 0.09, learn: 0.8 }, mittel: { e: 3.5, y: 2.5, p: 0.05, learn: 0.7 }, schwer: { e: 1.6, y: 1.1, p: 0.025, learn: 0.55 } };

export class Battle {
  constructor(gfx, rig, opts, hooks = {}) {
    this.gfx = gfx; this.rig = rig; this.opts = opts; this.hooks = hooks;
    this.mode = opts.mode; // 'ai' | 'hot'
    this.plan = castlePlan();
    const q = gfx.q;
    const { world } = createWorld(q.solverIt); this.world = world;
    this.players = [0, 1].map(side => this.buildSide(side));
    this.allBlocks = [...this.players[0].blocks, ...this.players[1].blocks];
    this.turn = 0; this.round = 1; this.phase = 'aim'; this.proj = null; this.acc = 0;
    this.stats = { shots: [0, 0], destroyed: [0, 0] };
    this.newWind();
    this.startTurn(true);
  }
  buildSide(side) {
    const names = this.mode === 'ai' ? PLAYER_NAMES_AI : PLAYER_NAMES_HOT;
    const P = { side, name: names[side], human: this.mode === 'hot' || side === 0, gold: ECONOMY.startGold, weapon: 'kanone', aim: {}, weapons: {}, blocks: [], keyIndex: new Map() };
    this.plan.blocks.forEach((bl, i) => {
      const p = toWorld(side, bl.u, bl.v, bl.l + 0.5);
      const b = makeBlock(this.world, p); b.origin = p; b.side = side; P.blocks.push(b); P.keyIndex.set(`${bl.u},${bl.v},${bl.l}`, b);
    });
    const vis = this.gfx.buildCastle(side, this.plan.blocks, this.plan, toWorld);
    P.mesh = vis.mesh; P.flag = vis.flag;
    const kp = toWorld(side, this.plan.king.u, this.plan.king.v, this.plan.king.y);
    P.king = { body: makeKing(this.world, kp), mesh: this.gfx.makeKing(side), origin: { x: kp.x, y: kp.y + 0.5, z: kp.z }, dead: false };
    P.king.body.addEventListener('collide', e => { const v = e.contact.getImpactVelocityAlongNormal(); if (Math.abs(v) > 7 && this.phase !== 'aim') this.killKing(P); });
    for (const id of WEAPON_ORDER) {
      const w = this.plan.weapons[id], pos = toWorld(side, w.u, w.v, w.y);
      const g = this.gfx.makeWeapon(id, side); g.position.set(pos.x, pos.y, pos.z);
      if (id === 'katapult') g.scale.setScalar(0.75);
      const wp = WEAPONS[id];
      P.aim[id] = { elev: id === 'kanone' ? 12 : id === 'katapult' ? 50 : 65, yaw: 0, power: 0.75 };
      P.weapons[id] = { g, pos, alive: true, support: w.support.map(k => P.keyIndex.get(k.join(','))).filter(Boolean), arm: 0 };
      this.gfx.poseWeapon(g, facingYaw(side) + P.aim[id].yaw, P.aim[id].elev);
    }
    return P;
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
  canAfford(P, id) { return P.gold >= WEAPONS[id].cost; }
  // --- Flugbahn / Zielhilfe ---
  shotParams(P = this.cur) {
    const a = this.aimOf(P), wp = WEAPONS[P.weapon], yaw = this.absYaw(P, a);
    return { wp, origin: muzzle(P.side, this.plan, P.weapon, yaw, a.elev), vel: launchVelocity(wp, a.elev, yaw, a.power), yaw, a };
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
    const r = simulate(s.origin, s.vel, this.wind, s.wp, { dt: DT, maxT: 10, sampleEvery: 3, hitTest: (p, t) => this.hitTest(p, t, s.wp, s.origin) });
    return r;
  }
  // --- Ablauf ---
  startTurn(first = false) {
    const P = this.cur;
    if (!first) { P.gold += ECONOMY.incomeBase + Math.round(ECONOMY.incomePerIntact * this.integrity(P)); }
    if (!P.weapons[P.weapon].alive) P.weapon = WEAPON_ORDER.find(id => P.weapons[id].alive);
    this.phase = 'aim'; this.aimDirty = true;
    this.viewWeapon(first);
    this.hooks.onTurn?.(P);
    this.hooks.onHud?.();
    if (!P.human) { this.phase = 'ai'; this.aiTimer = 0; this.aiPlan = null; this.say(pick(LINES.aiTurn)); }
  }
  viewWeapon(instant = false) {
    // Blick von hinten-oben über die eigene Burg Richtung Gegner
    const P = this.cur, s = P.side === 0 ? 1 : -1, w = P.weapons[P.weapon];
    const t = { x: s * (-WORLD.castleX + 12), y: WORLD.plateau + 2, z: w.pos.z * 0.2 };
    this.rig.follow = null;
    this.rig.view(t, (s > 0 ? -Math.PI / 2 : Math.PI / 2) + 0.45, 1.12, 26, instant);
  }
  viewOverview() { this.rig.follow = null; this.rig.view({ x: 0, y: 4, z: 0 }, -0.05 + (this.turn ? 0.1 : -0.1), 1.05, 85); }
  viewEnemy() { const s = this.cur.side === 0 ? 1 : -1; this.rig.follow = null; this.rig.view({ x: s * WORLD.castleX, y: WORLD.plateau + 2, z: 0 }, s > 0 ? -Math.PI / 2 + 0.5 : Math.PI / 2 + 0.5, 1.0, 24); }
  fire() {
    if (this.phase !== 'aim' && this.phase !== 'ai') return false;
    const P = this.cur, wp = WEAPONS[P.weapon];
    if (!this.canAfford(P, P.weapon)) { this.hooks.onToast?.(`Nicht genug Gold für ${wp.name} (${wp.cost}).`); return false; }
    P.gold -= wp.cost;
    const s = this.shotParams();
    this.proj = { p: { ...s.origin }, v: { ...s.vel }, wp, origin: s.origin, t: 0, mesh: this.gfx.makeProjectile(wp), owner: P };
    this.proj.mesh.position.set(s.origin.x, s.origin.y, s.origin.z);
    this.phase = 'flight'; this.stats.shots[this.turn]++;
    this.gfx.smokePuff(s.origin);
    SFX[wp.id]?.();
    if (wp.id === 'katapult') { P.weapons.katapult.arm = 0.001; }
    if (this.opts.follow !== false) this.rig.follow = this.proj;
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
    const alive = WEAPON_ORDER.filter(id => P.weapons[id].alive && this.canAfford(P, id));
    let id = alive.includes('moerser') && Math.random() < 0.35 ? 'moerser' : alive.filter(x => x !== 'moerser')[Math.floor(Math.random() * alive.filter(x => x !== 'moerser').length)] || alive[0];
    P.weapon = id;
    const wp = WEAPONS[id], kp = F.king.body.position;
    const target = { x: kp.x, y: kp.y + (id === 'kanone' ? 0.3 : 0.6), z: kp.z };
    const a0 = P.aim[id];
    const origin = muzzle(P.side, this.plan, id, this.absYaw(P, a0), a0.elev);
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
      if (this.aiPlan) {
        const k = clamp((this.aiTimer - 0.9) / 1.4, 0, 1), e = k * k * (3 - 2 * k), A = this.aimOf(), { from, to } = this.aiPlan;
        A.elev = from.elev + (to.elev - from.elev) * e; A.yaw = from.yaw + (to.yaw - from.yaw) * e; A.power = from.power + (to.power - from.power) * e;
        this.aimDirty = true;
        if (k >= 1 && this.aiTimer > 2.6) this.fire();
      }
    }
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
