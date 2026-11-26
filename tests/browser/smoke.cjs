// Headless-Chrome-Test: Seite lädt ohne Fehler, Szene rendert, Schuss zerstört Blöcke, Screenshots.
// Aufruf: (Server auf Port 8840 im Repo-Ordner) NODE_PATH=<puppeteer-core node_modules> node tests/browser/smoke.cjs <outdir>
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  // Sony Xperia 1 VI quer: ca. 892 x 412 CSS-Pixel
  await p.setViewport({ width: 892, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await p.evaluateOnNewDocument(() => localStorage.setItem('ballerburg3d_v1', JSON.stringify({ settings: { sound: false, quality: 'mittel', aimHelp: 'voll' } })));
  await p.goto('http://127.0.0.1:8840/index.html'); await sleep(3500);
  await p.screenshot({ path: out + '/01_menue.png' });
  const info = await p.evaluate(() => ({ calls: App.gfx.renderer.info.render.calls, tris: App.gfx.renderer.info.render.triangles }));
  console.log('Render:', info);
  await p.evaluate(() => App.start({ mode: 'ai', difficulty: 'mittel' }));
  await sleep(2500);
  // Mit der KI-Lösung zielen (Kanone auf den König -> trifft Mauer/Bergfried)
  const aim = await p.evaluate(async () => {
    const B = App.battle; B.wind = { x: 0, z: 0 };
    const m = await import('./src/ballistics.js'); const c = await import('./src/castle.js');
    const P = B.cur, F = B.foe, wp = App.WEAPONS.kanone; const a = P.aim.kanone;
    const o = c.muzzle(0, B.plan, 'kanone', B.absYaw(P, a), a.elev);
    const t = c.toWorld(1, 4.6, 0, 2.5); const s = m.solveShot(wp, o, t, B.wind, {}); // Frontmauer
    B.setAim(s.elev, s.power, s.yaw); return s;
  });
  console.log('Ziel:', aim);
  // Touch-Zielfeld: kurz nach oben ziehen -> Winkel steigt sanft
  const before = await p.evaluate(() => App.battle.aimOf().elev);
  const pr = await p.evaluate(() => { const r = document.getElementById('pad').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
  await p.touchscreen.touchStart(pr.x, pr.y); await p.touchscreen.touchMove(pr.x, pr.y - pr.h * 0.06); await sleep(400); // innerhalb Totzone
  const dead = await p.evaluate(() => App.battle.aimOf().elev);
  await p.touchscreen.touchMove(pr.x, pr.y - pr.h * 0.45); await sleep(600); await p.touchscreen.touchEnd();
  const after = await p.evaluate(() => App.battle.aimOf().elev);
  console.log('Touch-Zielen: vorher', before.toFixed(2), 'Totzone', dead.toFixed(2), 'nachher', after.toFixed(2));
  if (Math.abs(dead - before) > 0.01 || !(after > before)) errors.push('Touch-Zielen fehlerhaft');
  await p.evaluate(a => App.battle.setAim(a.elev, a.power, a.yaw), aim);
  await sleep(800);
  await p.screenshot({ path: out + '/02_zielen.png' });
  const fired = await p.evaluate(() => App.battle.fire());
  await sleep(700);
  await p.screenshot({ path: out + '/03_flug.png' });
  await p.waitForFunction(() => App.battle.phase === 'settle', { timeout: 30000 });
  await sleep(700);
  await p.screenshot({ path: out + '/04_einschlag.png' });
  await p.waitForFunction(() => App.battle.phase !== 'flight', { timeout: 30000 });
  await sleep(1500);
  const r1 = await p.evaluate(() => { const B = App.battle; return { phase: B.phase, turn: B.turn, loose: B.looseCount(B.players[1]), integ: B.integrity(B.players[1]).toFixed(3) }; });
  console.log('Nach Schuss:', fired, r1);
  // Computerzug abwarten (headless läuft langsamer)
  await p.waitForFunction(() => App.battle.stats.shots[1] >= 1 && App.battle.phase !== 'flight', { timeout: 60000 }).catch(() => {});
  const r2 = await p.evaluate(() => { const B = App.battle; return { phase: B.phase, turn: B.turn, round: B.round, looseOwn: B.looseCount(B.players[0]), shots: B.stats.shots }; });
  console.log('Nach KI-Zug:', r2);
  await p.evaluate(() => App.battle.viewOverview()); await sleep(2500);
  await p.screenshot({ path: out + '/05_uebersicht.png' });
  // Katapult wählen (Spieler wieder dran?)
  await p.waitForFunction(() => App.battle.phase === 'aim' && App.battle.turn === 0, { timeout: 60000 }).catch(() => {});
  const kat = await p.evaluate(() => { const B = App.battle; return B.selectWeapon('katapult') ? (B.setAim(55, 0.82, -2), true) : false; });
  await sleep(1500); await p.screenshot({ path: out + '/06_katapult.png' });
  console.log('Katapult gewählt:', kat);
  // Spielende erzwingen -> Endbildschirm
  await p.evaluate(() => { const B = App.battle; B.killKing(B.players[1]); B.phase = 'settle'; B.settleT = 99; });
  await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 20000 });
  console.log('Endbildschirm:', await p.evaluate(() => document.getElementById('endTitle').textContent));
  // Zwei-Spieler-Modus
  await p.evaluate(() => App.start({ mode: 'hot' })); await sleep(2000);
  const hot = await p.evaluate(() => App.battle.players.map(P => P.human + ':' + P.name).join(','));
  console.log('Hotseat:', hot); if (hot !== 'true:Blau,true:Rot') errors.push('Hotseat falsch');
  console.log(errors.length ? errors.join('\n') : 'Keine Konsolenfehler');
  await b.close();
  const ok = !errors.length && fired && r1.loose > 0 && r2.shots[1] >= 1;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL'); process.exit(ok ? 0 : 1);
})();
