# Ballerburg 3D – Burgenduell im Browser

3D-Artillerie-Spiel mit zwei Burgen: abwechselnd mit **Kanone**, **Katapult** und **Mörser** auf die gegnerische Burg schießen, bis der König getroffen ist, die Burg zur Hälfte eingestürzt ist oder alle Waffen zerstört sind. Ein Fan-Prototyp im Geist der klassischen Burgen-Artilleriespiele, mit eigener Grafik und eigenem Code.

**Spielen:** https://rancher0.github.io/ballerburg-castle-siege/ (Android-Chrome im Querformat, oder am PC)

## Features
- 3D-Szene mit three.js: Tal mit Fluss, Berge, Bäume, Wolken, Schatten
- Burgen aus ~250 einzelnen Steinblöcken mit echter Physik (cannon-es): Mauern brechen, Türme stürzen ein
- 3 Waffen: Kanone (flach, schnell), Katapult (hoher Bogen), Mörser (Sprengbombe, kostet Gold)
- Zielen mit Winkel, Seite und Kraft, Wind beeinflusst den Flug, Flugbahn-Vorschau (aus/kurz/voll)
- Sanfte Touch-Steuerung: Ziel-Joystick mit Totzone, einstellbare Empfindlichkeit, Feinschritt-Tasten
- Computergegner in drei Stufen und Zwei-Spieler-Modus an einem Gerät
- Kamera: drehen (1 Finger), zoomen und verschieben (2 Finger), Geschoss verfolgen
- Gold-System: jede Runde Einnahmen je nach Zustand der Burg
- Grafikstufen Niedrig/Mittel/Hoch, läuft offline (Service Worker), keine CDNs

## Steuerung
| Aktion | Handy | PC |
|---|---|---|
| Winkel / Seite | Ziel-Joystick ziehen oder ▲▼◀▶ | Pfeiltasten |
| Kraft | Kraftbalken ziehen oder ＋/－ | W / S |
| Feuer | FEUER! | Leertaste |
| Waffe | Buttons links | 1 / 2 / 3 |
| Kamera | 1 Finger drehen, 2 Finger zoomen/verschieben, 🎥 Ansicht wechseln | Maus ziehen, Rad, Rechtsklick ziehen |

## Lokal starten
```bash
python3 -m http.server 8000   # im Repo-Ordner
# dann http://localhost:8000 öffnen
```
(ES-Module brauchen einen Webserver, `file://` reicht nicht.)

## Tests
```bash
node tests/logic.test.mjs        # Physik, Ballistik, KI
node tests/sim.test.mjs 3        # Computer gegen Computer bis zum Sieg
NODE_PATH=<pfad>/node_modules node tests/browser/smoke.cjs /tmp   # Headless-Chrome (puppeteer-core), Server auf Port 8840
```

## Lizenzen
three.js (MIT) und cannon-es (MIT) liegen unter `lib/` mit Lizenzdateien. Der übrige Code ist für dieses Projekt geschrieben.
