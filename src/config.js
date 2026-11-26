// Ballerburg 3D – zentrale Konfiguration: Spielwerte, Waffen, Gelände.
// Neue Waffen: einfach einen Eintrag in WEAPONS ergänzen (und in castle.js platzieren).

export const WORLD = {
  gravity: 20,          // m/s² (bewusst etwas höher als real -> flottere Flugbahnen)
  plateau: 8,           // Höhe der Burgplateaus
  castleX: 44,          // Burgmitte links bei -44, rechts bei +44
  waterLevel: 0.6,
  fieldHalfX: 72, fieldHalfZ: 34,   // Bereich mit Physik-Gelände
  maxWind: 3.2,         // max. Windbeschleunigung (m/s²)
};

// Waffen-Registry. Winkel in Grad. speed = Mündungsgeschwindigkeit bei 100 % Kraft.
export const WEAPONS = {
  kanone: {
    id: 'kanone', name: 'Kanone', icon: '💣', desc: 'Schnell und flach. Gut gegen Mauern.',
    elevMin: -5, elevMax: 60, yawRange: 40, speedMin: 18, speed: 64,
    radius: 0.32, blast: 2.3, impulse: 20, destroy: 0.66, windFactor: 0.6,
    cost: 0, ammoName: 'Kugeln', color: 0x222222, launchHeight: 0.9, aiPreferHigh: false,
  },
  katapult: {
    id: 'katapult', name: 'Katapult', icon: '🪨', desc: 'Hoher Bogen über die Mauer, schwerer Stein.',
    elevMin: 42, elevMax: 75, yawRange: 40, speedMin: 15, speed: 52,
    radius: 0.6, blast: 2.8, impulse: 22, destroy: 0.58, windFactor: 1.0,
    cost: 0, ammoName: 'Steine', color: 0x8a8378, launchHeight: 3.6, aiPreferHigh: true,
  },
  moerser: {
    id: 'moerser', name: 'Mörser', icon: '🔥', desc: 'Sprengbombe, steil von oben. Bomben sind teuer.',
    elevMin: 50, elevMax: 85, yawRange: 40, speedMin: 15, speed: 60,
    radius: 0.42, blast: 3.0, impulse: 18, destroy: 0.5, windFactor: 0.8,
    cost: 0, ammoName: 'Bomben', color: 0x3a2a1a, launchHeight: 0.8, aiPreferHigh: true, explosive: true,
  },
};
export const WEAPON_ORDER = ['kanone', 'katapult', 'moerser'];

// Wirtschaft (angelehnt an klassische Burgenspiele): Steuern, Volk, Stimmung, Laden
export const ECONOMY = {
  startGold: 60, startPeople: 100, startMood: 70, startTax: 30, maxTax: 80,
  startAmmo: { kanone: 10, katapult: 6, moerser: 1 },
  moodTaxNeutral: 25,     // bei diesem Steuersatz bleibt die Stimmung gleich
  moodPerBlockLost: 0.25, // Stimmungsverlust pro zerstörtem eigenen Block
};
// Ladenartikel. kind: ammo | repairWeapon | repairWall | fest
export const SHOP = [
  { id: 'ammo_kanone', kind: 'ammo', weapon: 'kanone', qty: 5, price: 15, icon: '💣', name: 'Kanonenkugeln ×5' },
  { id: 'ammo_katapult', kind: 'ammo', weapon: 'katapult', qty: 5, price: 10, icon: '🪨', name: 'Steine ×5' },
  { id: 'ammo_moerser', kind: 'ammo', weapon: 'moerser', qty: 1, price: 25, icon: '🔥', name: 'Mörserbombe ×1' },
  { id: 'rep_wall', kind: 'repairWall', qty: 10, price: 30, icon: '🧱', name: 'Mauer ausbessern (10 Steine)' },
  { id: 'rep_weapon', kind: 'repairWeapon', price: 50, icon: '🔧', name: 'Waffe reparieren' },
  { id: 'fest', kind: 'fest', price: 40, icon: '🎉', name: 'Volksfest (+20 Stimmung)', mood: 20 },
];

// Ziellinie: Farben und Stile
export const LINE_COLORS = { rot: 0xff2a2a, gelb: 0xffe23a, gruen: 0x3cff5a, cyan: 0x2ae8ff, magenta: 0xff3cf0, weiss: 0xffffff };
export const LINE_COLOR_NAMES = { rot: 'Rot', gelb: 'Gelb', gruen: 'Grün', cyan: 'Cyan', magenta: 'Magenta', weiss: 'Weiß' };
export const LINE_STYLES = { voll: 'Durchgezogen', strich: 'Gestrichelt', punkte: 'Punkte' };

export const RULES = {
  loseIntegrity: 0.5,    // unter 50 % intakter Blöcke -> Burg gefallen
  blockLooseDist: 0.7,   // Block gilt als zerstört, wenn so weit verschoben
  settleMax: 4.5,        // s: max. Wartezeit nach Einschlag
};

export const QUALITY = {
  niedrig: { pixelRatio: 1, shadows: false, shadowSize: 0, trees: 40, solverIt: 10 },
  mittel:  { pixelRatio: 1.5, shadows: true, shadowSize: 1024, trees: 90, solverIt: 10 },
  hoch:    { pixelRatio: 2.5, shadows: true, shadowSize: 2048, trees: 160, solverIt: 12 },
};

export const PLAYER_COLORS = [0x2f6fd6, 0xc8342c];
export const PLAYER_NAMES_AI = ['Du', 'Computer'];
export const PLAYER_NAMES_HOT = ['Blau', 'Rot'];

export const DEFAULT_SETTINGS = {
  quality: 'mittel', sensitivity: 1.0, aimHelp: 'voll', sound: true, difficulty: 'mittel', follow: true,
  lineColor: 'rot', lineStyle: 'voll', layout: 'zufall', aimCam: true,
};

// Geländehöhe (rein funktional -> identisch für Grafik, Physik, Flugbahn und KI)
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export function terrainHeight(x, z) {
  const P = WORLD.plateau, ax = Math.abs(x);
  let h = P * smooth((ax - 9) / 24);                       // Tal mit Fluss in der Mitte
  h -= 1.2 * (1 - smooth(ax / 6));                          // Flussbett
  const nearCastle = Math.max(0, 1 - Math.max(0, Math.hypot(ax - WORLD.castleX, z) - 9) / 6);
  const noise = 0.7 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17 - x * 0.07) + 0.35 * Math.sin(x * 0.53 + 1.3) * Math.sin(z * 0.41);
  h += noise * (1 - nearCastle) * (ax < 9 ? 0.3 : 1);
  const az = Math.abs(z);
  const sat = (v, m) => m * (1 - Math.exp(-v / m));          // sanft begrenzen
  if (az > 22) h += sat(0.045 * (az - 22) * (az - 22), 16) * (0.8 + 0.2 * Math.sin(x * 0.07));  // Hügel an den Seiten
  if (ax > 62) h += sat(0.08 * (ax - 62) * (ax - 62), 22) * (0.8 + 0.2 * Math.cos(z * 0.09));   // Berge hinter den Burgen
  return h;
}
