// Ballerburg 3D – Sprüche (neutral, eigene Texte)
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const LINES = {
  aiTurn: ['Mal sehen, was eure Mauern aushalten …', 'Kanoniere, an die Geschütze!', 'Ich rieche Schwarzpulver.', 'Jetzt wird zurückgeschossen!', 'Haltet eure Kronen fest!'],
  hit: ['Treffer! Da bröckelt es.', 'Gut gezielt!', 'Das saß!', 'Steine fliegen!'],
  bigHit: ['Volltreffer! Ein ganzes Stück Mauer ist weg!', 'Gewaltig! Das hat gerummst!', 'Die Steinmetze drüben haben jetzt viel zu tun.'],
  aiHit: ['Ha! Eure Mauer wackelt.', 'Na, wie gefällt euch das?', 'Ein kleiner Gruß von drüben!'],
  aiBigHit: ['Bumm! Das war mein bester Schuss heute.', 'Eure Burg hat jetzt ein Panoramafenster.', 'Meine Kanoniere bekommen Extrasuppe!'],
  ownHit: ['Autsch – das war die eigene Mauer!', 'Hoppla, falsche Burg …'],
  miss: ['Daneben.', 'Knapp vorbei ist auch vorbei.', 'Der Wind hat mitgespielt.', 'Die Kugel wollte nur das Tal sehen.'],
  water: ['Platsch! Die Fische beschweren sich.', 'Ab in den Fluss.', 'Das war ein Bad, kein Treffer.'],
};
