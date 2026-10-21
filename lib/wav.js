// lib/wav.js — a tiny hand-rolled synth used only to generate the sample
// music posts in the demo vault. No dependencies.
//
// render(track) returns { wav: Buffer, peaks: number[] } where peaks are 56
// normalized bars for drawing a waveform in the feed.

const SR = 22050; // sample rate

function note(freq, start, dur, gain, type = 'sine') {
  return { freq, start, dur, gain, type };
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> hz

// --- little pieces -------------------------------------------------------
function etude() { // arpeggios: Am, F, C, G — twice through
  const chords = [
    [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
    [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]
  ];
  const notes = [];
  chords.forEach((ch, i) => {
    const t0 = i * 2.2;
    ch.forEach((m, j) => {
      notes.push(note(NOTE(m + 12), t0 + j * 0.30, 1.6, 0.16));
      notes.push(note(NOTE(m), t0 + j * 0.30 + 0.15, 1.7, 0.10, 'triangle'));
    });
  });
  return { notes, dur: chords.length * 2.2 + 1.5 };
}

function tapeLoop() { // drone + slow melody
  const notes = [];
  const root = NOTE(45); // A2
  notes.push(note(root, 0, 20, 0.10, 'triangle'));
  notes.push(note(root * 1.5, 0, 20, 0.05, 'sine'));
  const mel = [69, 72, 76, 74, 72, 69, 67, 69];
  mel.forEach((m, i) => {
    notes.push(note(NOTE(m), 1.2 + i * 2.2, 2.0, 0.12));
  });
  return { notes, dur: 21 };
}

function practice() { // pentatonic plucks, imperfect timing
  const notes = [];
  const seq = [62, 64, 67, 69, 72, 69, 67, 64, 62, 60, 62, 64, 67, 64, 62, 60];
  seq.forEach((m, i) => {
    const jitter = (i % 3) * 0.02;
    notes.push(note(NOTE(m), i * 0.44 + jitter, 0.38, 0.15, 'pluck'));
  });
  return { notes, dur: seq.length * 0.44 + 1 };
}

// --- render ---------------------------------------------------------------
function osc(type, phase) {
  switch (type) {
    case 'sine': return Math.sin(phase);
    case 'triangle': return 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1;
    case 'pluck': {
      const t = (phase / (2 * Math.PI)) % 1;
      return Math.sin(phase) * Math.exp(-t * 5) * (1 - t * 0.4);
    }
    default: return Math.sin(phase);
  }
}

function render(piece) {
  const n = Math.ceil(piece.dur * SR);
  const buf = new Float32Array(n);
  for (const nt of piece.notes) {
    const s0 = Math.floor(nt.start * SR);
    const len = Math.floor(nt.dur * SR);
    let phase = 0;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / len;
      const env = nt.type === 'pluck'
        ? Math.exp(-t * 6)
        : Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.7) * 3);
      phase += (2 * Math.PI * nt.freq) / SR;
      buf[s0 + i] += osc(nt.type, phase) * nt.gain * env;
  }
  }
  // gentle tape hiss + normalize
  let peak = 0;
  for (let i = 0; i < n; i++) {
    buf[i] += (Math.random() - 0.5) * 0.0025;
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const k = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < n; i++) buf[i] *= k;

  // WAV container (16-bit mono)
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);

  // 56 bars for the waveform drawing
  const BARS = 56; const peaks = [];
  const step = Math.floor(n / BARS) || 1;
  for (let b = 0; b < BARS; b++) {
    let m = 0;
    for (let i = b * step; i < Math.min((b + 1) * step, n); i++) m = Math.max(m, Math.abs(buf[i]));
    peaks.push(Math.round(Math.min(1, m * 1.15) * 100) / 100);
  }
  return { wav, peaks };
}

module.exports = { render, pieces: { etude: etude, tapeLoop: tapeLoop, practice: practice } };
