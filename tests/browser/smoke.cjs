// Headless-Chrome-Test v2.1: Laden ohne Fehler, Windpfeil dreht mit der Kamera, Loch statt Einsturz, Risse, Zielansicht + Ziellinie (ohne Wind), Schuss zerstört Blöcke,
// Kopfzeile während des Schusses, Laden/Wirtschaft, Linienfarbe, Burg-Layouts, Endbildschirm, Zwei-Spieler.
// Aufruf: NODE_PATH=<node_modules mit puppeteer-core> node tests/browser/smoke.cjs <ausgabeordner> [url]
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
const url = process.argv[3] || 'http://127.0.0.1:8840/index.html';
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 892, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });  // Xperia 1 VI quer
  const errors = [], shot = async n => { await p.screenshot({ path: `${out}/${n}.png` }); console.log('Screenshot', n); };
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.setItem('ballerburg3d_v1', JSON.stringify({ settings: { sound: false, quality: 'mittel', aimHelp: 'voll', lineColor: 'rot', layout: 'klassisch' } })); } });
  await p.goto(url); await sleep(3500);
  await shot('01_menue');
  await p.evaluate(() => App.start({ mode: 'ai', layouts: ['klassisch', 'klassisch'] }));
  await sleep(2500);
  // Zielen mit der KI-Lösung auf die Frontmauer (windstill)
  const aim = await p.evaluate(async () => {
    const B = App.battle; B.wind = { x: 0, z: 0 };
    const m = await import('./src/ballistics.js'); const c = await import('./src/castle.js');
    const P = B.cur, a = P.aim.kanone, o = c.muzzle(0, P.plan, 'kanone', B.absYaw(P, a), a.elev);
    const s = m.solveShot(App.WEAPONS.kanone, o, c.toWorld(1, 6.6, 3, 2.5), B.wind, {}); B.setAim(s.elev, s.power, s.yaw); return s;
  });
  // Ziellinie ignoriert Wind
  const windFree = await p.evaluate(() => { const B = App.battle; B.wind = { x: 3, z: 1 }; const a = B.preview().pts.at(-1); B.wind = { x: -3, z: -1 }; const c = B.preview().pts.at(-1); B.wind = { x: 0, z: 0 }; return Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z); });
  console.log('Ziellinie Wind-Unterschied:', windFree.toFixed(4)); if (windFree > 1e-6) errors.push('Ziellinie hängt vom Wind ab');
  // Touch-Zielfeld: Totzone + sanftes Zielen
  const before = await p.evaluate(() => App.battle.aimOf().elev);
  const pr = await p.evaluate(() => { const r = document.getElementById('pad').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
  await p.touchscreen.touchStart(pr.x, pr.y); await p.touchscreen.touchMove(pr.x, pr.y - pr.h * 0.06); await sleep(400);
  const dead = await p.evaluate(() => App.battle.aimOf().elev);
  await p.touchscreen.touchMove(pr.x, pr.y - pr.h * 0.45); await sleep(600); await p.touchscreen.touchEnd();
  const after = await p.evaluate(() => App.battle.aimOf().elev);
  console.log('Touch-Zielen: vorher', before.toFixed(2), 'Totzone', dead.toFixed(2), 'nachher', after.toFixed(2));
  if (Math.abs(dead - before) > 0.01 || !(after > before)) errors.push('Touch-Zielen fehlerhaft');
  await p.evaluate(a => App.battle.setAim(a.elev, a.power, a.yaw), aim);
  const cam = await p.evaluate(() => ({ mode: App.battle.camMode, fp: !!App.rig.fp, line: App.gfx.trajCore.visible, color: App.gfx.trajCore.material.color.getHexString() }));
  console.log('Zielansicht:', cam); if (cam.mode !== 'ziel' || !cam.fp || !cam.line || cam.color !== 'ff2a2a') errors.push('Zielansicht/rote Linie fehlt');
  await sleep(1500); await shot('02_zielansicht_rot');
  // Schuss
  const fired = await p.evaluate(() => App.battle.fire());
  await sleep(600);
  const head = await p.evaluate(() => document.getElementById('turnText').textContent);
  console.log('Kopfzeile im Flug:', head); if (!/feuert/.test(head)) errors.push('Kopfzeile im Flug falsch');
  await shot('03_flug');
  await p.waitForFunction(() => App.battle.phase === 'settle', { timeout: 30000 }); await sleep(700);
  await shot('04_einschlag');
  const closeUp = async (n, v, l) => { await p.evaluate((v, l) => { const c = App.battle.players[1].C, m = App.battle.players[1]; const t = { x: 44 - 6.5, y: 8 + l, z: -v }; App.settings.aimHelp = 'aus'; App.battle.aimDirty = true; App.rig.follow = null; App.rig.view(t, -Math.PI / 2 - 0.35, 1.25, 9, true); }, v, l); await sleep(900); await shot(n); await p.evaluate(() => { App.settings.aimHelp = 'voll'; App.battle.aimDirty = true; }); };
  await p.waitForFunction(() => App.battle.phase !== 'settle' || App.battle.turn === 1, { timeout: 30000 }); await sleep(1500);
  const r1 = await p.evaluate(() => { const B = App.battle, C = B.players[1].C, g = k => C.grid.has(k); return { phase: B.phase, turn: B.turn, loose: B.looseCount(B.players[1]), cracked: B.crackedCount(B.players[1]), fallen: C.blocks.filter(b => b.state === 'loose').length, ammo: B.players[0].econ.ammo.kanone, holeAbove: g('6,3,4') && g('6,3,3') }; });
  if (!(r1.loose > 0 && r1.loose <= 12 && r1.holeAbove)) errors.push('Kanonentreffer sollte ein Loch machen, nicht die Mauer einstürzen lassen');
  console.log('Nach Schuss:', fired, r1);
  // Computerzug abwarten
  await p.waitForFunction(() => App.battle.phase === 'aim' && App.battle.turn === 0, { timeout: 90000 }).catch(() => errors.push('Computerzug hängt'));
  const r2 = await p.evaluate(() => { const B = App.battle; return { round: B.round, shots: B.stats.shots, gold: B.players[0].econ.gold }; });
  console.log('Nach KI-Zug:', r2);
  await closeUp('05_loch_in_mauer', 3, 2.5);
  // Zweiter Schuss (Katapult) auf eine andere Stelle -> Risse
  await p.evaluate(async () => {
    const B = App.battle; B.wind = { x: 0, z: 0 }; B.selectWeapon('katapult');
    const m = await import('./src/ballistics.js'), c = await import('./src/castle.js'), P = B.cur, a = P.aim.katapult;
    const o = c.muzzle(0, P.plan, 'katapult', B.absYaw(P, a), a.elev);
    const s = m.solveShot(App.WEAPONS.katapult, o, c.toWorld(1, 6.6, -3, 3.5), B.wind, { preferHigh: true }); B.setAim(s.elev, s.power, s.yaw); B.fire();
  });
  await p.waitForFunction(() => App.battle.phase === 'settle', { timeout: 30000 }); await sleep(2500);
  const cr = await p.evaluate(() => App.battle.crackedCount(App.battle.players[1]));
  console.log('Risse in der Gegnerburg:', cr); if (cr < 3) errors.push('Keine Risse sichtbar');
  await closeUp('06_risse_in_mauer', -3, 3);
  await p.waitForFunction(() => App.battle.phase === 'aim' && App.battle.turn === 0, { timeout: 90000 }).catch(() => errors.push('Computerzug hängt (2)'));
  // Windpfeil dreht mit der Kamera: Wind nach +x (Richtung Gegner)
  await p.evaluate(() => { App.battle.wind = { x: 2.2, z: 0 }; App.battle.setCamMode('ziel'); }); await sleep(1600);
  const w1 = await p.evaluate(() => App.windDeg); await shot('07_windpfeil_zielansicht');
  await p.evaluate(() => { App.rig.leaveFP(); App.rig.follow = null; App.rig.view({ x: 0, y: 6, z: 0 }, 0, 1.0, 70, true); App.battle.camMode = 'uebersicht'; }); await sleep(1200);
  const w2 = await p.evaluate(() => App.windDeg); await shot('08_windpfeil_seitenansicht');
  console.log('Windpfeil: Zielansicht', w1, '° / Seitenansicht', w2, '°');
  if (!(Math.abs(w1 + 90) < 12 && Math.abs(w2) < 12)) errors.push('Windpfeil dreht nicht mit der Kamera');
  await p.evaluate(() => App.battle.setCamMode('ziel')); await sleep(800);
  // Laden / Burgverwaltung
  await p.tap('#shopBtn'); await sleep(500);
  await p.evaluate(() => { const s = document.getElementById('sTax'); s.value = 45; s.dispatchEvent(new Event('input')); });
  const g0 = await p.evaluate(() => App.battle.cur.econ.gold);
  await p.evaluate(() => [...document.querySelectorAll('#sItems button')].find(b => b.textContent.includes('Steine ×5')).click());
  await sleep(300);
  const shop = await p.evaluate(() => ({ gold: App.battle.cur.econ.gold, stones: App.battle.cur.econ.ammo.katapult, tax: App.battle.cur.econ.tax, msg: document.getElementById('sMsg').textContent }));
  console.log('Laden:', g0, '->', shop); if (shop.gold !== g0 - 10 || shop.tax !== 45) errors.push('Laden fehlerhaft');
  await shot('09_laden_wirtschaft');
  await p.evaluate(() => document.querySelector('[data-act="close-shop"]').click()); await sleep(300);
  // Mauer reparieren (direkt)
  const rep = await p.evaluate(() => { const B = App.battle, P = B.players[1]; const l0 = B.looseCount(P); const n = B.restoreBlocks(P, 10); return { l0, n, l1: B.looseCount(P) }; });
  console.log('Reparatur (Gegnerburg):', rep);
  // Einstellungen: Linienfarbe Cyan, gestrichelt
  await p.tap('#pauseBtn'); await sleep(300);
  await p.evaluate(() => document.querySelector('#pause [data-act="settings"]').click()); await sleep(300);
  await p.evaluate(() => { document.querySelector('[data-set="lineColor"] [data-v="cyan"]').click(); document.querySelector('[data-set="lineStyle"] [data-v="strich"]').click(); });
  await sleep(300); await shot('10_einstellungen_linienfarbe');
  await p.evaluate(() => { document.querySelector('[data-act="close-settings"]').click(); });
  await sleep(200); await p.evaluate(() => document.querySelector('[data-act="resume"]').click());
  await p.evaluate(() => App.battle.selectWeapon('katapult') && App.battle.setAim(55, 0.8, -2));
  await sleep(1800);
  const col = await p.evaluate(() => App.gfx.trajCore.material.color.getHexString()); if (col !== '2ae8ff') errors.push('Linienfarbe nicht übernommen');
  await shot('11_zielansicht_katapult_cyan');
  // Zielfeld einklappen + Burgansicht
  await p.tap('#aimFold'); await p.tap('#camBtn'); await sleep(1800);
  await shot('12_burgansicht_eingeklappt');
  await p.tap('#aimFold');
  // Layouts
  for (const [n, l] of [['13_grosse_burg_klassisch', 'klassisch'], ['14_layout_festung', 'festung'], ['15_layout_turmburg', 'turmburg']]) {
    await p.evaluate(l => { App.start({ mode: 'ai', layouts: [l, l] }); App.battle.setCamMode('gegner'); }, l); await sleep(2500); await shot(n);
  }
  // Spielende -> Endbildschirm
  await p.evaluate(() => { const B = App.battle; B.killKing(B.players[1]); B.phase = 'settle'; B.settleT = 99; });
  await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 20000 });
  console.log('Endbildschirm:', await p.evaluate(() => document.getElementById('endTitle').textContent));
  // Zwei-Spieler
  await p.evaluate(() => App.start({ mode: 'hot' })); await sleep(1500);
  const hot = await p.evaluate(() => App.battle.players.map(P => P.human + ':' + P.name).join(','));
  console.log('Hotseat:', hot); if (hot !== 'true:Blau,true:Rot') errors.push('Hotseat falsch');
  console.log(errors.length ? errors.join('\n') : 'Keine Konsolenfehler');
  await b.close();
  const ok = !errors.length && fired && r1.loose > 0 && r2.shots[1] >= 1;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL'); process.exit(ok ? 0 : 1);
})();
