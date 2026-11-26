// Ballerburg 3D – Kamera: Orbit (1 Finger/Maus), Pinch/Mausrad-Zoom, 2-Finger-Verschieben, Verfolgen.
import { THREE } from './scene.js';
import { clamp } from './ballistics.js';

export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.target = new THREE.Vector3(); this.goalTarget = new THREE.Vector3();
    this.theta = 0; this.phi = 1.1; this.radius = 40;
    this.goal = { theta: 0, phi: 1.1, radius: 40 };
    this.pointers = new Map(); this.userMoved = false; this.follow = null;
    dom.addEventListener('pointerdown', e => this.down(e));
    dom.addEventListener('pointermove', e => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) dom.addEventListener(ev, e => this.up(e));
    dom.addEventListener('wheel', e => { e.preventDefault(); this.goal.radius = clamp(this.goal.radius * (e.deltaY > 0 ? 1.1 : 0.9), 6, 160); this.userMoved = true; }, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());
  }
  down(e) { this.dom.setPointerCapture?.(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button }); this.pinch = null; }
  up(e) { this.pointers.delete(e.pointerId); this.pinch = null; }
  move(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (this.pointers.size === 1) {
      if (p.btn === 2 || e.shiftKey) this.pan(dx, dy);
      else { this.goal.theta -= dx * 0.006; this.goal.phi = clamp(this.goal.phi - dy * 0.005, 0.15, 1.5); }
      this.userMoved = true;
    } else if (this.pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.pinch) {
        this.goal.radius = clamp(this.goal.radius * this.pinch.d / Math.max(20, d), 6, 160);
        this.pan(mx - this.pinch.mx, my - this.pinch.my);
      }
      this.pinch = { d, mx, my }; this.userMoved = true; return;
    }
    p.x = e.clientX; p.y = e.clientY;
  }
  pan(dx, dy) {
    const k = this.radius * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta));
    const fwd = new THREE.Vector3(Math.sin(this.theta), 0, Math.cos(this.theta));
    this.goalTarget.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
    this.goalTarget.x = clamp(this.goalTarget.x, -90, 90); this.goalTarget.z = clamp(this.goalTarget.z, -70, 70);
  }
  // Sicht hinter einer Burg Richtung Gegner
  view(target, theta, phi, radius, instant = false) {
    this.goalTarget.copy(target); Object.assign(this.goal, { theta, phi, radius }); this.userMoved = false;
    if (instant) { this.target.copy(target); this.theta = theta; this.phi = phi; this.radius = radius; }
  }
  update(dt) {
    if (this.follow) {
      const f = this.follow; // Objekt mit position + Geschwindigkeit
      this.goalTarget.set(f.p.x, f.p.y, f.p.z);
      const vh = Math.hypot(f.v.x, f.v.z) || 1;
      this.goal.theta = Math.atan2(-f.v.x / vh, -f.v.z / vh) + 0.45; this.goal.phi = 1.2; this.goal.radius = 14;
    }
    const k = 1 - Math.exp(-dt * (this.follow ? 6 : 4));
    this.target.lerp(this.goalTarget, k);
    let dth = this.goal.theta - this.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    this.theta += dth * k; this.phi += (this.goal.phi - this.phi) * k; this.radius += (this.goal.radius - this.radius) * k;
    const sp = Math.sin(this.phi);
    this.cam.position.set(this.target.x + this.radius * sp * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * sp * Math.cos(this.theta));
    if (this.cam.position.y < 1.5) this.cam.position.y = 1.5;
    this.cam.lookAt(this.target);
  }
}
