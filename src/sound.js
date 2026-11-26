// Ballerburg 3D – kleine Synth-Sounds (WebAudio, keine Dateien)
let ctx = null, enabled = true;
export function setSound(on) { enabled = on; }
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ctx.state === 'suspended') ctx.resume(); return ctx; }
function noise(dur, freq, gain, type = 'lowpass') {
  const c = ac(); if (!c || !enabled) return;
  const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
}
function tone(freq, dur, gain = 0.15, type = 'triangle') {
  const c = ac(); if (!c || !enabled) return;
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
export const SFX = {
  kanone: () => noise(0.5, 900, 0.9),
  katapult: () => { noise(0.25, 2500, 0.3, 'bandpass'); tone(110, 0.3, 0.2, 'sawtooth'); },
  moerser: () => noise(0.7, 500, 1.0),
  boom: big => noise(big ? 1.2 : 0.8, big ? 300 : 450, 1.0),
  splash: () => noise(0.6, 1800, 0.4, 'highpass'),
  click: () => tone(660, 0.05, 0.05),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.15), i * 150)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.4, 0.15), i * 220)),
};
