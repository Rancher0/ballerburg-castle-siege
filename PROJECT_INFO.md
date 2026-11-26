# PROJECT_INFO – Ballerburg 3D (für Antigravity / weitere Entwicklung)

## Ziel
Browser-3D-Artilleriespiel (später als Android-APK im WebView-Wrapper). Zielgerät: Sony Xperia 1 VI, Chrome, Querformat (~892×412 CSS-Pixel). Alle Texte auf Deutsch.

## Architektur (reines ES-Modul-JavaScript, kein Build-Schritt)
```
index.html            Menüs, HUD, Overlays (DOM)
css/style.css         Oberfläche, mobil zuerst
src/main.js           Einstieg: Bildschirme, HUD, Eingaben (Touch/Maus/Tastatur), Hauptschleife, window.App (für Tests)
src/config.js         ALLE Spielwerte: Welt, WEAPONS-Registry, ECONOMY + SHOP (Laden), Linienfarben/-stile, Regeln, Grafikstufen, terrainHeight()
src/castle.js         Burg-Layouts (klassisch, festung, turmburg): Blöcke, König, Waffenplätze mit Unterbau; lokal->Welt, muzzle()
src/economy.js        reine Wirtschaft: Steuern -> Einkommen, Stimmung, Volk (forecast/settleTurn)
src/physics.js        cannon-es: Welt + Heightfield-Gelände; BlockBroadphase (statische Steine im Raster-Hash, nur dynamische Körper werden geprüft),
                      ObjectCollisionMatrix, makeBlock (statisch), makeDynamic/makeStatic/removeBlock, pushDynamic
src/damage.js         Schadensmodell (in Node testbar): buildCastleState (Raster u,v,l -> Stein), applyHit (Trefferpunkte, Profile je Waffe),
                      supportPass (Halt-Prüfung), killKing, repairCastle
src/ballistics.js     reine Ballistik: launchVelocity, stepProjectile, simulate, solveShot (KI), stickCurve (Totzone)
src/game.js           Battle: Züge, Schuss, Treffer, Siegprüfung, Laden (buy/restoreBlocks/Waffenreparatur), Computergegner inkl. KI-Wirtschaft,
                      Kameramodi (ziel/burg/uebersicht/gegner, aimCamPose), Grafik-Abgleich
src/scene.js          three.js: Himmel, Gelände, Wasser, Bäume, Burg (InstancedMesh), Waffenmodelle, Effekte, Ziellinie (Röhre + Rand, tubeGeo)
src/camera.js         CameraRig: Orbit, Pinch-Zoom, 2-Finger-Pan, Verfolgen, Zielansicht (setFP/leaveFP, Blick-Versatz, FOV-Zoom)
src/sound.js          WebAudio-Synth-Effekte (keine Dateien)
src/lines.js          Sprüche des Gegners
lib/                  three.module.min.js (r170), cannon-es.js (0.20) – lokal, offline
sw.js, manifest.webmanifest, icon.svg   Offline-Cache / installierbar
tests/                Node-Tests (logic, sim) + Headless-Chrome-Smoke-Test (browser/smoke.cjs, optional URL als 2. Argument)
android/              APK-Hülle: AndroidManifest.xml (de.ck.ballerburg), MainActivity.java (WebView + Asset-Handler über
                      https://appassets.androidplatform.net/), Icons, build.sh (aapt2/javac/d8/zipalign/apksigner, kein Gradle)
```
Ziellinie: `Battle.preview()` simuliert absichtlich **ohne Wind** (Spieler muss Wind selbst einschätzen). Der echte Schuss fliegt mit Wind.

## Wirtschaft (v2, Werte v2.1)
Jede Runde (eigener Zugbeginn): Einkommen = Volk × Steuersatz × (0,5 + 0,5 × Burgzustand). Stimmung ändert sich um (25 − Steuer) / 5 und sinkt pro verlorenem eigenen Block.
Stimmung ≥ 65: Volk wächst 4 %, < 30: 7 % wandern ab, 0: Aufstand = Niederlage. Munition je Waffe (`econ.ammo`), Laden-Artikel in `SHOP`.
Mauer ausbessern (15) heilt zuerst Risse, dann setzt es fehlende Steine von unten nach oben zurück (nur mit Unterbau, Schutt wird weggeräumt).
Wichtig: Geschossflug ist eine **eigene deterministische Integration** (`ballistics.js`), identisch für echten Schuss, Flugbahn-Vorschau und KI. cannon-es simuliert nur Steine/Trümmer/König. Treffer = Raster-Abfrage (27 Zellen) gegen intakte Steine + Punkt-in-Box gegen lose Steine.

## Schadensmodell (v2.1)
- Steine haben HP (`BLOCK_HP` in config.js: Mauer 2, Turm/Bergfried 2,5, Zinne 1, König 3). Intakte Steine sind STATISCH.
- `WEAPONS[id]`: `dmg`, `dmgR`, `pen` = Liste [Versatz entlang Flugrichtung, dmg-Faktor, Radius-Faktor], `eject` (wie viele zerstörte Steine
  als Körper herausfliegen), `push` (Impuls auf lose Steine), `atImpact` (Mörser: Zentrum am Einschlagpunkt statt Steinmitte).
- Schaden je Stein = dmg × (1 − (d/R)²); HP ≤ 0 -> zerstört (entfernt bzw. herausgeschleudert), sonst Risse (Tönung + Riss-Overlay-InstancedMesh).
- `supportPass`: von unten nach oben; ein Stein hält, wenn die Zelle darunter intakt ist (oder König lebt darunter), ODER ≥ 2 waagerechte
  Nachbarn selbst direkt aufliegen (Bogen über einem 1 breiten Loch). Sonst wird er dynamisch und fällt. -> 1 Treffer = Loch, 2 Treffer daneben = Einsturz.
- Stein-Zustand `b.state`: 'ok' | 'loose' (dynamisch) | 'gone' (entfernt). `isLoose` = nicht 'ok'.
- Windpfeil: `windScreenAngle(wind, camFwd)` in ballistics.js, wird in main.js jedes Bild aus der Kamerarichtung berechnet.

## Koordinaten
x = Achse zwischen den Burgen (links −44, rechts +44), y = oben, z = seitlich. Burg lokal: u = Richtung Gegner, v = seitlich (`toWorld`). Seitenwinkel `yaw` relativ zur Blickrichtung, + = nach rechts.

## Starten
`python3 -m http.server` im Repo, Browser auf `http://localhost:8000`. GitHub Pages: Branch `main`, Ordner `/`.
APK: `android/build.sh` -> `../Ballerburg3D.apk`; Keystore `../keystore/ballerburg.jks` (außerhalb des Repos, nie committen; für Updates immer denselben verwenden).

## Neue Waffe hinzufügen
1. Eintrag in `WEAPONS` + `WEAPON_ORDER` (config.js): Winkelbereich, Geschwindigkeit, Radius, Explosion (blast/impulse/destroy), Windfaktor, Kosten.
2. Platz in `castlePlan().weapons` (castle.js) inkl. `support`-Blöcken.
3. Modell in `Scene3D.makeWeapon` (scene.js) und Sound in `SFX`.
4. `node tests/logic.test.mjs` prüft u. a., dass die eigene Burg nie im Weg ist.

## Ideen / nächste Schritte
- Wirtschaft weiter ausbauen (Fördertürme/Minen, Pulver als eigene Ressource, Söldner, Handel)
- Mehr Waffen/Munition: Brandpfeile, Kettenkugeln, Ballista, Feuerkugel
- Burgen-Editor / weitere Layouts und Gelände, Tageszeiten, Wetter
- Blöcke mit Material (Holz, Stein, Eisen), kleinere/gemischte Steingrößen
- Wind auch in der Höhe veränderlich, Windfahne in der Welt
- Performance auf dem Gerät messen (Grafik „Mittel“ ist Standard)

## Bekannte Grenzen
- Geschosse sind Punkte mit Radius (kein Abprallen, kein Rollen)
- Steine sind alle gleich groß (Würfel), keine Dächer/Rundtürme
- Halt-Prüfung ist eine einfache Regel (kein echtes Spannungsmodell); breite Bögen über 2+ Steine stürzen ein, 1 breite Löcher halten
- Steine einer Burg werden nur von Treffern in ihrem Bereich beschädigt; herabfallende Trümmer beschädigen andere Steine nicht
- KI zielt auf den König mit Zufallsfehler, der pro Schuss kleiner wird; keine Taktik
- Nur auf Headless-Chrome getestet (Software-Rendering), APK noch nicht auf echtem Gerät
- Zielansicht kann bei sehr steilen Winkeln den Scheitel der Flugbahn abschneiden (Blick mit 1 Finger anheben oder Zoom)
- Weitere Kanonen kaufen gibt es noch nicht (nur Reparatur der vorhandenen)
