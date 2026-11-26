# Ballerburg 3D – Burgenduell im Browser

3D-Artillerie-Spiel mit zwei Burgen: abwechselnd mit **Kanone**, **Katapult** und **Mörser** auf die gegnerische Burg schießen, bis der König getroffen ist, die Burg zur Hälfte eingestürzt ist oder alle Waffen zerstört sind. Ein Fan-Prototyp im Geist der klassischen Burgen-Artilleriespiele, mit eigener Grafik und eigenem Code.

**Spielen:** https://rancher0.github.io/ballerburg-castle-siege/ (Android-Chrome im Querformat, oder am PC)

## Neu in Version 2.1
- **Windpfeil dreht mit der Kamera**: zeigt in jeder Ansicht, wohin der Wind aus der aktuellen Blickrichtung weht (oben = vom Betrachter weg), Stärke bleibt daneben
- **Löcher statt Einsturz**: Steine sind vermörtelt und haben Trefferpunkte. Ein Treffer reißt ein Loch, Nachbarsteine bekommen sichtbare Risse; erst ein zweiter Volltreffer daneben bricht den Abschnitt darüber ein. Steine ohne Halt (nichts darunter, zu wenig tragende Nachbarn) fallen
- **Schadensprofile**: Kanone = kleines, tiefes Loch; Katapult = breites, flaches Loch in der Außenschicht; Mörser = Sprengung. Splitter fliegen, einzelne Steine werden herausgeschleudert
- **Größere, dickere Burgen**: alle 3 Layouts 13×13 bis 13×15 Felder, Mauern 2 (Festung vorne 3) Steine dick, ~700–860 Steine pro Burg; Bergfried 5×5 um den König
- **Balance**: Partien dauern etwa doppelt so viele Schüsse (Simulation ~30–60 statt ~6–38), König hat Trefferpunkte, mehr Startmunition, Mauer ausbessern = 15 Steine und heilt Risse
- Schnellere Physik: intakte Steine sind statisch in einem Raster, eigene Broadphase und Kollisionsmatrix (auch 1700 Körper bleiben flüssig)

## Version 2
- **Zielansicht** 🎥: Kamera knapp hinter und über der aktiven Waffe, Blick entlang des Rohrs zur Gegnerburg – folgt Winkel und Seite live (Standard beim Zielen)
- **Ziellinie ohne Wind**: zeigt die reine Flugbahn, den Wind schätzt man selbst. Dick und mit dunklem Rand, Farbe wählbar (Rot, Gelb, Grün, Cyan, Magenta, Weiß), Stil durchgezogen/gestrichelt/Punkte, Länge Aus/Kurz/Voll
- **Wirtschaft** 🛒: Steuersatz, Volk und Stimmung bestimmen das Einkommen; Laden für Munition, Mauerreparatur, Waffenreparatur und Volksfest. Stimmung 0 = Aufstand = verloren
- **3 Burg-Layouts**: Klassisch, Festung, Turmburg (im Menü wählbar oder Zufall)
- Zielfeld einklappbar, Kopfzeile zeigt während des Schusses den richtigen Spieler
- **Android-APK** (`android/`): WebView-Hülle, Querformat, Vollbild

## Features
- 3D-Szene mit three.js: Tal mit Fluss, Berge, Bäume, Wolken, Schatten
- Burgen aus ~700–860 einzelnen Steinblöcken mit Trefferpunkten und Physik (cannon-es): Löcher, Risse, Einstürze
- 3 Waffen: Kanone (flach, schnell), Katapult (hoher Bogen), Mörser (Sprengbombe); jeder Schuss braucht Munition
- Zielen mit Winkel, Seite und Kraft, Wind beeinflusst den Flug (die Ziellinie zeigt die Bahn ohne Wind)
- Sanfte Touch-Steuerung: Ziel-Joystick mit Totzone, einstellbare Empfindlichkeit, Feinschritt-Tasten
- Computergegner in drei Stufen und Zwei-Spieler-Modus an einem Gerät
- Kamera: drehen (1 Finger), zoomen und verschieben (2 Finger), Geschoss verfolgen
- Grafikstufen Niedrig/Mittel/Hoch, läuft offline (Service Worker), keine CDNs

## Steuerung
| Aktion | Handy | PC |
|---|---|---|
| Winkel / Seite | Ziel-Joystick ziehen oder ▲▼◀▶ | Pfeiltasten |
| Kraft | Kraftbalken ziehen oder ＋/－ | W / S |
| Feuer | FEUER! | Leertaste |
| Waffe | Buttons links | 1 / 2 / 3 |
| Kamera wechseln | 🎥: Zielansicht → Burg → Übersicht → Gegner | 🎥 |
| Zielansicht | 1 Finger = Blick leicht schwenken, 2 Finger = Zoom | Maus ziehen, Rad = Zoom |
| andere Ansichten | 1 Finger drehen, 2 Finger zoomen/verschieben | Maus ziehen, Rad, Rechtsklick ziehen |
| Laden / Steuern | 🛒 (nur im eigenen Zug) | 🛒 |
| Zielfeld einklappen | ▾ über dem Zielfeld | ▾ |

## Lokal starten
```bash
python3 -m http.server 8000   # im Repo-Ordner
# dann http://localhost:8000 öffnen
```
(ES-Module brauchen einen Webserver, `file://` reicht nicht.)

## Android-APK bauen
```bash
android/build.sh        # braucht JDK 17 + Android SDK 34 (ANDROID_HOME); Keystore wird außerhalb des Repos angelegt (../keystore)
```
APKs und Keystores werden nie committet.

## Tests
```bash
node tests/logic.test.mjs        # Physik, Ballistik, KI
node tests/sim.test.mjs 3        # Computer gegen Computer bis zum Sieg
NODE_PATH=<pfad>/node_modules node tests/browser/smoke.cjs /tmp   # Headless-Chrome (puppeteer-core), Server auf Port 8840
```

## Lizenzen
three.js (MIT) und cannon-es (MIT) liegen unter `lib/` mit Lizenzdateien. Der übrige Code ist für dieses Projekt geschrieben.
