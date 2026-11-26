// Ballerburg 3D – Wirtschaft (rein, ohne Grafik/Physik): Einnahmen, Stimmung, Volk.
import { ECONOMY } from './config.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function newEconomy() {
  return { gold: ECONOMY.startGold, people: ECONOMY.startPeople, mood: ECONOMY.startMood, tax: ECONOMY.startTax, ammo: { ...ECONOMY.startAmmo }, lostSince: 0 };
}
// Vorschau für den Laden: was bringt der nächste Zug bei diesem Steuersatz?
export function forecast(E, integrity) {
  const income = Math.round(E.people * E.tax / 100 * (0.5 + 0.5 * integrity));
  const moodDelta = Math.round(((ECONOMY.moodTaxNeutral - E.tax) / 5 - E.lostSince * ECONOMY.moodPerBlockLost) * 10) / 10;
  return { income, moodDelta };
}
// Rundenabrechnung zu Beginn eines eigenen Zuges. Liefert Ereignistexte.
export function settleTurn(E, integrity) {
  const f = forecast(E, integrity), events = [];
  E.gold += f.income;
  E.mood = clamp(E.mood + f.moodDelta, 0, 100);
  if (E.mood >= 65) { const g = Math.max(1, Math.round(E.people * 0.04)); E.people += g; events.push(`+${g} Leute ziehen zu`); }
  else if (E.mood < 30) { const l = Math.max(1, Math.round(E.people * 0.07)); E.people = Math.max(10, E.people - l); events.push(`${l} Leute wandern ab`); }
  E.lostSince = 0;
  return { income: f.income, moodDelta: f.moodDelta, events };
}
export const moodWord = m => m >= 75 ? 'begeistert' : m >= 55 ? 'zufrieden' : m >= 35 ? 'mürrisch' : m > 15 ? 'wütend' : 'kurz vor dem Aufstand';
export const moodIcon = m => m >= 75 ? '😄' : m >= 55 ? '🙂' : m >= 35 ? '😐' : m > 15 ? '😠' : '🔥';
