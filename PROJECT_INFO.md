# PROJECT_INFO – Ballerburg 3D (für Antigravity / weitere Entwicklung)

## Ziel
Browser-3D-Artilleriespiel (später als Android-APK im WebView-Wrapper). Zielgerät: Sony Xperia 1 VI, Chrome, Querformat (~892×412 CSS-Pixel). Alle Texte auf Deutsch.

## Architektur (reines ES-Modul-JavaScript, kein Build-Schritt)
```
index.html            Menüs, HUD, Overlays (DOM)
css/style.css         Oberfläche, mobil zuerst
src/main.js           Einstieg: Bildschirme, HUD, Eingaben (Touch/Maus/Tastatur), Hauptschleife, window.App (für Tests)
src/config.js         ALLE Spielwerte: Welt, WEAPONS-Registry, Wirtschaft, Regeln, Grafikstufen, terrainHeight()
src/castle.js         Burg-Bauplan (Blöcke, König, Waffenplätze), lokal->Welt, muzzle()
src/physics.js        cannon-es: Welt + Heightfield-Gelände, Blöcke, König, explode()
src/ballistics.js     reine Ballistik: launchVelocity, stepProjectile, simulate, solveShot (KI), stickCurve (Totzone)
src/game.js           Battle: Züge, Schuss, Treffer, Siegprüfung, Computergegner, Grafik-Abgleich
src/scene.js          three.js: Himmel, Gelände, Wasser, Bäume, Burg (InstancedMesh), Waffenmodelle, Effekte, Flugbahnlinie
src/camera.js         CameraRig: Orbit, Pinch-Zoom, 2-Finger-Pan, Verfolgen
src/sound.js          WebAudio-Synth-Effekte (keine Dateien)
src/lines.js          Sprüche des Gegners
lib/                  three.module.min.js (r170), cannon-es.js (0.20) – lokal, offline
sw.js, manifest.webmanifest, icon.svg   Offline-Cache / installierbar
tests/                Node-Tests + Headless-Chrome-Smoke-Test
```
Wichtig: Geschossflug ist eine **eigene deterministische Integration** (`ballistics.js`), identisch für echten Schuss, Flugbahn-Vorschau und KI. cannon-es simuliert nur Steine/Trümmer/König. Treffer = Punkt-in-Box-Test gegen Blockkörper; Einschlag -> `explode()` (Blöcke im Kern entfernen, außen Impulse).

## Koordinaten
x = Achse zwischen den Burgen (links −44, rechts +44), y = oben, z = seitlich. Burg lokal: u = Richtung Gegner, v = seitlich (`toWorld`). Seitenwinkel `yaw` relativ zur Blickrichtung, + = nach rechts.

## Starten
`python3 -m http.server` im Repo, Browser auf `http://localhost:8000`. GitHub Pages: Branch `main`, Ordner `/`.

## Neue Waffe hinzufügen
1. Eintrag in `WEAPONS` + `WEAPON_ORDER` (config.js): Winkelbereich, Geschwindigkeit, Radius, Explosion (blast/impulse/destroy), Windfaktor, Kosten.
2. Platz in `castlePlan().weapons` (castle.js) inkl. `support`-Blöcken.
3. Modell in `Scene3D.makeWeapon` (scene.js) und Sound in `SFX`.
4. `node tests/logic.test.mjs` prüft u. a., dass die eigene Burg nie im Weg ist.

## Ideen / nächste Schritte
- Wirtschaft ausbauen (Steuern, Bevölkerung, Pulver/Kugeln kaufen, Reparatur, Fördertürme)
- Mehr Waffen/Munition: Brandpfeile, Kettenkugeln, Ballista, Feuerkugel
- Burgen-Editor / verschiedene Burglayouts und Gelände, Tageszeiten, Wetter
- Blöcke mit Material (Holz, Stein, Eisen) und Trefferpunkten statt Sofort-Entfernen
- Wind auch in der Höhe veränderlich, Windfahne in der Welt
- APK-Wrapper (wie bei den anderen Spielen: WebView + WebViewAssetLoader, gleiche Signatur bei Updates)
- Performance auf dem Gerät messen (Grafik „Mittel“ ist Standard)

## Bekannte Grenzen
- Geschosse sind Punkte mit Radius (kein Abprallen, kein Rollen)
- Steine sind alle gleich groß (Würfel), keine Dächer/Rundtürme
- KI zielt auf den König mit Zufallsfehler, der pro Schuss kleiner wird; keine Taktik
- Nur auf Headless-Chrome getestet (Software-Rendering), noch nicht auf echtem Gerät
