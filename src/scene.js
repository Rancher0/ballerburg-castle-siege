// Ballerburg 3D – Grafik (three.js): Himmel, Gelände, Wasser, Bäume, Burgen, Waffen, König, Effekte.
import * as THREE from '../lib/three.module.min.js';
import { WORLD, QUALITY, PLAYER_COLORS, terrainHeight } from './config.js';
export { THREE };

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  return t;
}
function stoneTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b9b0a2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 150 + Math.random() * 70 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 16},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    g.strokeStyle = 'rgba(70,62,52,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(0, 1); g.lineTo(w, 1);
    g.moveTo(w / 2, 0); g.lineTo(w / 2, h / 2); g.moveTo(1, h / 2); g.lineTo(1, h); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(4, 4, w / 2 - 8, h / 2 - 8);
  });
}

export class Scene3D {
  constructor(canvas, quality) {
    this.q = QUALITY[quality] || QUALITY.mittel;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'niedrig', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
    this.clockT = 0;
    this.buildSky(); this.buildLights(); this.buildTerrain(); this.buildWater(); this.buildTrees();
    this.stoneMap = stoneTexture();
    this.fx = [];
    this.setQuality(quality);
    // Ziellinie: Röhre (Kern) + dunkler Rand, immer sichtbar (depthTest aus), Farbe/Stil einstellbar
    this.trajCore = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, opacity: 0.95 }));
    this.trajEdge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.45, side: THREE.BackSide }));
    this.trajEdge.renderOrder = 9; this.trajCore.renderOrder = 10;
    for (const m of [this.trajEdge, this.trajCore]) { m.frustumCulled = false; m.visible = false; this.scene.add(m); }
    this.lineStyle = { color: 0xff2a2a, style: 'voll' };
    const ringG = new THREE.RingGeometry(0.9, 1.35, 32); ringG.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.marker.renderOrder = 11; this.scene.add(this.marker); this.marker.visible = false;
  }
  setQuality(quality) {
    this.q = QUALITY[quality] || QUALITY.mittel;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.renderer.shadowMap.enabled = this.q.shadows; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) { this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.trees.count = Math.min(this.treeMax, this.q.trees);
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  resize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  buildSky() {
    const g = new THREE.SphereGeometry(600, 32, 16);
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(0x3d7fd1) }, bot: { value: new THREE.Color(0xdcebf5) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float t = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bot,top,t),1.0); }' });
    this.sky = new THREE.Mesh(g, m); this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 120, 420);
    // Wolken
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 4, 10, 8), cloudMat); s.position.set(k * 5 - 8, Math.random() * 2, Math.random() * 4); s.scale.y = 0.55; c.add(s); }
      c.position.set(-250 + Math.random() * 500, 55 + Math.random() * 30, -220 + Math.random() * 300); this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.85));
    const s = new THREE.DirectionalLight(0xfff1d6, 2.2);
    s.position.set(-40, 80, 45); s.target.position.set(0, 0, 0);
    const c = s.shadow.camera; c.left = -60; c.right = 60; c.top = 30; c.bottom = -30; c.near = 10; c.far = 200;
    s.shadow.bias = -0.0005; s.shadow.normalBias = 0.03;
    this.scene.add(s, s.target); this.sun = s;
  }
  buildTerrain() {
    const W = 440, Dz = 380, sx = 220, sz = 190;
    const g = new THREE.PlaneGeometry(W, Dz, sx, sz); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainHeight(x, z); pos.setY(i, h);
      const n = Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.04;
      if (h < WORLD.waterLevel + 0.3) c.setRGB(0.76 + n, 0.70 + n, 0.52);         // Sand
      else if (h > 17) c.setRGB(0.52 + n, 0.5 + n, 0.47);                           // Fels
      else c.setRGB(0.33 + n + h * 0.006, 0.52 + n - h * 0.004, 0.22);               // Wiese
      const near = Math.abs(Math.abs(x) - WORLD.castleX) < 10 && Math.abs(z) < 10;
      if (near) c.setRGB(0.5 + n, 0.45 + n, 0.33);                                   // Burghof (Erde)
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrain.receiveShadow = true; this.scene.add(this.terrain);
  }
  buildWater() {
    const g = new THREE.PlaneGeometry(26, 380, 1, 1); g.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.78, shininess: 90, specular: 0x99ccff }));
    this.water.position.y = WORLD.waterLevel; this.scene.add(this.water);
  }
  buildTrees() {
    const trunkG = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 6); trunkG.translate(0, 0.8, 0);
    const crownG = new THREE.ConeGeometry(1.2, 3.4, 7); crownG.translate(0, 3.0, 0);
    const merged = mergeGeos([trunkG, crownG], [0x6b4a2b, 0x2f6a2c]);
    this.treeMax = 160;
    this.trees = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }), this.treeMax);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let n = 0, guard = 0;
    while (n < this.treeMax && guard++ < 5000) {
      const x = (Math.random() - 0.5) * 220, z = (Math.random() - 0.5) * 180;
      const ax = Math.abs(x);
      if (Math.abs(ax - WORLD.castleX) < 15 && Math.abs(z) < 16) continue;   // nicht in die Burg
      if (ax < 9) continue;                                                  // nicht ins Wasser
      if (Math.abs(z) < 8 && ax < 34) continue;                              // Schusslinie etwas frei
      const h = terrainHeight(x, z); if (h > 22) continue;
      const k = 0.7 + Math.random() * 0.8; s.set(k, k * (0.8 + Math.random() * 0.5), k);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.3);
      m.compose(new THREE.Vector3(x, h - 0.1, z), q, s); this.trees.setMatrixAt(n++, m);
    }
    this.trees.castShadow = true; this.scene.add(this.trees);
  }

  // ---------- Burg ----------
  buildCastle(side, blocks, plan, toWorld) {
    const geo = new THREE.BoxGeometry(0.98, 1, 0.98);
    const mat = new THREE.MeshLambertMaterial({ map: this.stoneMap });
    const im = new THREE.InstancedMesh(geo, mat, blocks.length);
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color(), tint = new THREE.Color(PLAYER_COLORS[side]), baseCols = [];
    blocks.forEach((b, i) => {
      const base = b.kind === 'bergfried' ? 0.93 : b.kind === 'turm' ? 0.86 : 0.98;
      const r = 0.92 + Math.random() * 0.1;
      c.setRGB(base * r, base * r * 0.97, base * r * 0.92);
      if (b.kind === 'zinne') c.lerp(tint, 0.18);
      im.setColorAt(i, c); baseCols.push(c.clone());
    });
    this.scene.add(im);
    // Risse: zweites InstancedMesh mit Riss-Textur, leicht größer als der Stein (nur für angeschlagene Steine sichtbar)
    const cracks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 1.02, 1.0), new THREE.MeshBasicMaterial({ map: this.crackMap(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), blocks.length);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < blocks.length; i++) cracks.setMatrixAt(i, zero);
    cracks.frustumCulled = false; this.scene.add(cracks);
    im.userData = { base: baseCols, cracks };
    // Fahne auf dem Bergfried
    const flag = new THREE.Group(); const fp = toWorld(side, plan.flag.u, plan.flag.v, plan.flag.y);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x5b4632 })); pole.position.y = 1.6;
    const clothG = new THREE.PlaneGeometry(1.6, 1, 8, 1); clothG.translate(0.8, 0, 0);
    const cloth = new THREE.Mesh(clothG, new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[side], side: THREE.DoubleSide }));
    cloth.position.y = 2.7; flag.add(pole, cloth); flag.position.set(fp.x, fp.y, fp.z); flag.userData.cloth = cloth;
    this.scene.add(flag);
    return { mesh: im, flag };
  }
  crackMap() {
    if (this._crackMap) return this._crackMap;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    g.strokeStyle = 'rgba(20,14,8,0.95)'; g.lineCap = 'round';
    const branch = (x, y, a, len, w, d) => { if (d > 4 || len < 6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); branch(x2, y2, a + (Math.random() - 0.5) * 1.2, len * 0.75, w * 0.75, d + 1); if (Math.random() < 0.6) branch(x2, y2, a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6), len * 0.55, w * 0.6, d + 2); };
    for (let k = 0; k < 5; k++) branch(64, 64, k * 1.26 + Math.random() * 0.5, 22 + Math.random() * 10, 4, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; this._crackMap = t; return t;
  }
  // Steine abgleichen: statische nur bei Änderung (_dirty), bewegte jedes Bild; Risse/Abdunklung nach Trefferpunkten
  syncBlocks(mesh, bodies) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), c = new THREE.Color();
    const { base, cracks } = mesh.userData; let mDirty = false, cDirty = false, kDirty = false;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const hpKey = b.state === 'ok' ? Math.round(b.hp * 4) : -1;
      if (b._hpKey !== hpKey) {
        b._hpKey = hpKey; const f = b.state === 'ok' ? b.hp / b.maxHp : 1;
        c.copy(base[i]).multiplyScalar(f < 1 ? 0.62 + 0.3 * f : 1); if (f < 1) c.r *= 1.05; mesh.setColorAt(i, c); cDirty = true;
        if (f < 1 && b.state === 'ok') { m.compose(p.set(b.position.x, b.position.y, b.position.z), q.identity(), one); cracks.setMatrixAt(i, m); b._crackShown = true; kDirty = true; }
        else if (b._crackShown) { m.compose(p.set(0, -50, 0), q.identity(), zero); cracks.setMatrixAt(i, m); b._crackShown = false; kDirty = true; }
      }
      if (!b.world) { if (!b._hidden) { m.compose(p.set(0, -50, 0), q.identity(), zero); mesh.setMatrixAt(i, m); b._hidden = true; mDirty = true; } continue; }
      if (b._hidden) { b._hidden = false; b._synced = false; }
      if (b._dirty) { b._dirty = false; b._synced = false; }
      if (b._synced && (b.type === 2 || b.sleepState === 2)) continue;
      p.set(b.position.x, b.position.y, b.position.z); q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      m.compose(p, q, one); mesh.setMatrixAt(i, m); b._synced = b.type === 2 || b.sleepState === 2; mDirty = true;
    }
    if (mDirty) mesh.instanceMatrix.needsUpdate = true;
    if (cDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (kDirty) cracks.instanceMatrix.needsUpdate = true;
  }
  // Gesteinssplitter (nur Grafik, keine Physik)
  debris(points) {
    if (!points?.length) return;
    const n = Math.min(28, points.length * 4), mat = new THREE.MeshLambertMaterial({ color: 0x9a9184, transparent: true });
    for (let i = 0; i < n; i++) {
      const pt = points[i % points.length], sz = 0.14 + Math.random() * 0.22;
      const s = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), i ? mat.clone() : mat);
      s.position.set(pt.x + (Math.random() - 0.5) * 0.8, pt.y + (Math.random() - 0.5) * 0.8, pt.z + (Math.random() - 0.5) * 0.8);
      s.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.scene.add(s);
      const a = Math.random() * 6.28, r = 1.5 + Math.random() * 4;
      this.fx.push({ m: s, v: new THREE.Vector3(Math.cos(a) * r, 2 + Math.random() * 5, Math.sin(a) * r), life: 1.1 + Math.random() * 0.6, t: 0, grow: 0, spin: true, ground: true });
    }
  }

  // ---------- Figuren & Waffen ----------
  makeKing(side) {
    const g = new THREE.Group(), color = PLAYER_COLORS[side];
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.6, 10), new THREE.MeshLambertMaterial({ color })); robe.position.y = -0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshLambertMaterial({ color: 0xf0c8a0 })); head.position.y = 0.3;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.14, 8, 1, true), new THREE.MeshPhongMaterial({ color: 0xffcc33, shininess: 120, side: THREE.DoubleSide })); crown.position.y = 0.48;
    g.add(robe, head, crown); g.traverse(o => { o.castShadow = true; }); this.scene.add(g); return g;
  }
  makeWeapon(id, side) {
    const g = new THREE.Group(), yaw = new THREE.Group(), elev = new THREE.Group();
    g.add(yaw); yaw.add(elev);
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5530 }), iron = new THREE.MeshPhongMaterial({ color: 0x2a2a2e, shininess: 60 }), team = new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[side] });
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    if (id === 'kanone') {
      const base = box(1.2, 0.3, 0.8, wood); base.position.y = 0.3; yaw.add(base);
      for (const z of [-0.45, 0.45]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), wood); w.rotation.x = Math.PI / 2; w.position.set(0, 0.32, z); yaw.add(w); }
      elev.position.y = 0.6;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.7, 14), iron); barrel.rotation.z = -Math.PI / 2; barrel.position.x = 0.45; elev.add(barrel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), team); ring.rotation.y = Math.PI / 2; ring.position.x = 1.25; elev.add(ring);
      elev.userData.muzzle = new THREE.Vector3(1.3, 0, 0);
    } else if (id === 'katapult') {
      const base = box(2.2, 0.25, 1.3, wood); base.position.y = 0.2; yaw.add(base);
      for (const z of [-0.5, 0.5]) { const p = box(0.18, 1.6, 0.18, wood); p.position.set(-0.1, 1.0, z); yaw.add(p); }
      const cross = box(0.25, 0.2, 1.2, team); cross.position.set(0.0, 1.75, 0); yaw.add(cross);
      elev.position.set(-0.1, 0.9, 0);
      const arm = box(2.6, 0.16, 0.18, wood); arm.position.x = -0.6; elev.add(arm);
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), wood); cup.rotation.z = Math.PI; cup.position.set(-1.85, 0.12, 0); elev.add(cup);
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshLambertMaterial({ color: 0x8a8378 })); stone.position.set(-1.85, 0.32, 0); elev.add(stone);
      elev.userData.stone = stone; elev.userData.kind = 'arm';
    } else {
      const base = box(1.1, 0.5, 1.1, wood); base.position.y = 0.25; yaw.add(base);
      elev.position.y = 0.6;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.9, 14), iron); barrel.rotation.z = -Math.PI / 2; barrel.position.x = 0.15; elev.add(barrel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 14), team); ring.rotation.y = Math.PI / 2; ring.position.x = 0.55; elev.add(ring);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData = { yaw, elev, id };
    this.scene.add(g); return g;
  }
  poseWeapon(g, yawDeg, elevDeg, armT = 0) {
    const { yaw, elev, id } = g.userData;
    yaw.rotation.y = -yawDeg * Math.PI / 180;
    if (id === 'katapult') elev.rotation.z = 0.35 - armT * 2.1;
    else elev.rotation.z = elevDeg * Math.PI / 180;
  }

  // ---------- Effekte ----------
  makeProjectile(weapon) {
    const g = weapon.id === 'katapult' ? new THREE.IcosahedronGeometry(weapon.radius, 1) : new THREE.SphereGeometry(weapon.radius, 14, 10);
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: weapon.color, shininess: 40 }));
    m.castShadow = true; this.scene.add(m); return m;
  }
  explosion(p, size = 2, water = false) {
    const n = water ? 18 : 26;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.35, 0), new THREE.MeshBasicMaterial({ color: water ? 0xbfe4ff : (i < 8 ? 0xffb040 : 0x8b8378), transparent: true, opacity: 0.95 }));
      s.position.set(p.x, p.y + 0.2, p.z);
      const a = Math.random() * 6.28, up = water ? 6 + Math.random() * 6 : 2 + Math.random() * 5, r = (water ? 1.2 : 2.5) * (0.4 + Math.random());
      this.scene.add(s); this.fx.push({ m: s, v: new THREE.Vector3(Math.cos(a) * r, up, Math.sin(a) * r), life: 0.8 + Math.random() * 0.7, t: 0, grow: size * 0.8 });
    }
    if (!water) {
      const flash = new THREE.PointLight(0xffaa44, 40, size * 8); flash.position.set(p.x, p.y + 1, p.z); this.scene.add(flash);
      this.fx.push({ light: flash, life: 0.25, t: 0 });
    }
  }
  smokePuff(p) {
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7 }));
      s.position.set(p.x, p.y, p.z); this.scene.add(s);
      this.fx.push({ m: s, v: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2), life: 1.0, t: 0, grow: 1.6, noGrav: true });
    }
  }
  updateFx(dt) {
    this.clockT += dt;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.life;
      if (f.light) { f.light.intensity = 40 * (1 - k); }
      if (f.m) {
        if (!f.noGrav) f.v.y -= (f.ground ? 18 : 9) * dt;
        if (f.spin) { f.m.rotation.x += dt * 6; f.m.rotation.y += dt * 4; }
        f.m.position.addScaledVector(f.v, dt); f.m.scale.setScalar(1 + k * f.grow); f.m.material.opacity = Math.max(0, 0.95 * (1 - k));
      }
      if (k >= 1) { if (f.m) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); } if (f.light) this.scene.remove(f.light); this.fx.splice(i, 1); }
    }
    this.clouds.children.forEach((c, i) => { c.position.x += dt * (0.6 + (i % 3) * 0.3) * (this.windX || 0.5); if (c.position.x > 260) c.position.x = -260; if (c.position.x < -260) c.position.x = 260; });
  }
  waveFlag(flag, wind) {
    const cloth = flag.userData.cloth, pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(this.clockT * 6 + x * 3) * 0.12 * x); }
    pos.needsUpdate = true;
    flag.rotation.y = -Math.atan2(wind.z, wind.x || 1e-4);
  }
  setLineStyle(color, style) {
    this.lineStyle = { color, style };
    this.trajCore.material.color.setHex(color); this.marker.material.color.setHex(color);
    // dunkler Rand bei hellen Farben, heller Rand bei Weiß nicht nötig
    this.trajEdge.material.color.setHex(0x000000);
  }
  showTrajectory(pts, frac) {
    if (!pts || frac <= 0) { this.trajCore.visible = this.trajEdge.visible = false; this.marker.visible = false; return; }
    const n = Math.max(2, Math.floor(pts.length * frac));
    const dist = this.camera.position.distanceTo(new THREE.Vector3(pts[0].x, pts[0].y, pts[0].z));
    const r = 0.09 + Math.min(0.1, dist * 0.003);                  // dicker, gut lesbar
    const st = this.lineStyle.style;
    const keep = i => st === 'voll' ? true : st === 'strich' ? (i % 6) < 4 : (i % 4) === 0;
    this.trajCore.geometry.dispose(); this.trajEdge.geometry.dispose();
    this.trajCore.geometry = tubeGeo(pts, n, r * (st === 'punkte' ? 1.6 : 1), keep);
    this.trajEdge.geometry = tubeGeo(pts, n, r * (st === 'punkte' ? 1.6 : 1) + 0.06, keep);
    this.trajCore.visible = this.trajEdge.visible = true;
    if (frac >= 1) { const e = pts[pts.length - 1]; this.marker.position.set(e.x, e.y + 0.1, e.z); this.marker.visible = true; } else this.marker.visible = false;
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

function mergeGeos(geos, colors) {
  const pos = [], nor = [], col = [], idx = []; let off = 0;
  geos.forEach((g, gi) => {
    const gg = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(colors[gi]);
    const p = gg.attributes.position, n = gg.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); idx.push(off + i); }
    off += p.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Röhre aus Segmenten (6-eckiger Querschnitt). keep(i) entscheidet, ob Segment i gezeichnet wird (Strich/Punkte).
function tubeGeo(pts, n, r, keep) {
  const pos = [], idx = [], S = 6;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n - 1; i++) {
    if (!keep(i)) continue;
    a.set(pts[i].x, pts[i].y, pts[i].z); b.set(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    d.subVectors(b, a); if (d.lengthSq() < 1e-8) continue; d.normalize();
    u.crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize(); w.crossVectors(d, u).normalize();
    const base = pos.length / 3;
    for (const c of [a, b]) for (let k = 0; k < S; k++) {
      const t = k / S * Math.PI * 2, cx = Math.cos(t) * r, cy = Math.sin(t) * r;
      pos.push(c.x + u.x * cx + w.x * cy, c.y + u.y * cx + w.y * cy, c.z + u.z * cx + w.z * cy);
    }
    for (let k = 0; k < S; k++) { const k2 = (k + 1) % S; idx.push(base + k, base + S + k, base + k2, base + k2, base + S + k, base + S + k2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
