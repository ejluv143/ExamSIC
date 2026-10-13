// Game sound effects, synthesized with Web Audio (no files to load). Browsers only let audio start after a user
// gesture, so `unlockAudio` runs on the answer tap and the reveal plays on the context it opened.

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

// One plucked note: a quick attack and an exponential fall.
function note(out: AudioNode, type: OscillatorType, freq: number, at: number, length: number, level: number) {
  const osc = ctx!.createOscillator();
  const gain = ctx!.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

// One second of white noise, made once and reused (whooshes).
let noiseBuffer: AudioBuffer | null = null;
function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ctx!.createBuffer(1, ctx!.sampleRate, ctx!.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx!.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

// A gain into a compressor into the speakers, so stacked notes don't clip.
function bus(level: number) {
  const master = ctx!.createGain();
  master.gain.value = level;
  master.connect(ctx!.createDynamicsCompressor()).connect(ctx!.destination);
  return master;
}

// A bouncy major arpeggio over a soft thump, ending in a sparkle. Each step of a streak lifts it a semitone (up to
// five), so a run of right answers sounds like it's climbing.
export function playCorrect(streak = 1) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  const lift = 2 ** (Math.min(Math.max(streak - 1, 0), 5) / 12);
  const master = bus(0.5);

  // The thump: a sine dropping from 180 to 60 Hz.
  const kick = ctx.createOscillator();
  const kickGain = ctx.createGain();
  kick.frequency.setValueAtTime(180, t);
  kick.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  kickGain.gain.setValueAtTime(0.8, t);
  kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  kick.connect(kickGain).connect(master);
  kick.start(t);
  kick.stop(t + 0.17);

  // C5 E5 G5 C6, each a triangle with a sine an octave up for shine.
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const at = t + i * 0.07;
    const last = i === 3;
    note(master, "triangle", f * lift, at, last ? 0.6 : 0.3, 0.35);
    note(master, "sine", f * 2 * lift, at, last ? 0.5 : 0.2, 0.12);
  });

  // The sparkle on top.
  [2093, 2637, 3136].forEach((f, i) => note(master, "sine", f * lift, t + 0.3 + i * 0.04, 0.25, 0.06));
}

// The last ten seconds of a question: an alert at 10, a clock's tick-tock down to 4, then sharper, louder ticks
// for 3, 2, 1.
export function playCountdown(secondsLeft: number) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  if (secondsLeft === 10) {
    const master = bus(0.4);
    note(master, "square", 880, t, 0.12, 0.25);
    note(master, "square", 1175, t + 0.13, 0.2, 0.25);
  } else if (secondsLeft <= 3) {
    const master = bus(0.5);
    note(master, "square", 1568, t, 0.09, 0.35);
    note(master, "sine", 3136, t, 0.06, 0.1);
  } else {
    // A woodblock: a short triangle burst, alternating pitch like a clock.
    note(bus(0.35), "triangle", secondsLeft % 2 === 0 ? 1200 : 900, t, 0.05, 0.4);
  }
}

// A streak, played over the correct chime: a whoosh like a flame catching, a rising power-up, and a chord that hits
// harder the longer the run (up to five).
export function playStreak(streak: number) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.35;
  const heat = Math.min(streak, 5);
  const lift = 2 ** ((heat - 2) / 12);
  const master = bus(0.5);

  const whoosh = noise();
  whoosh.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(300, t);
  band.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
  const whooshGain = ctx.createGain();
  whooshGain.gain.setValueAtTime(0.0001, t);
  whooshGain.gain.exponentialRampToValueAtTime(0.6, t + 0.3);
  whooshGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  whoosh.connect(band).connect(whooshGain).connect(master);
  whoosh.start(t);
  whoosh.stop(t + 0.65);

  const rise = ctx.createOscillator();
  rise.type = "sawtooth";
  rise.frequency.setValueAtTime(220 * lift, t);
  rise.frequency.exponentialRampToValueAtTime(880 * lift, t + 0.35);
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 2500;
  const riseGain = ctx.createGain();
  riseGain.gain.setValueAtTime(0.0001, t);
  riseGain.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
  riseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  rise.connect(soften).connect(riseGain).connect(master);
  rise.start(t);
  rise.stop(t + 0.42);

  // G5 B5 D6 G6: two notes at a streak of 2, the full chord from 4.
  [783.99, 987.77, 1174.66, 1567.98].slice(0, heat).forEach((f) => note(master, "square", f * lift, t + 0.4, 0.45, 0.12));
}

// One brass note: two slightly detuned saws through a filter that opens on the attack (the "blat"), with vibrato
// that comes in once the note is held.
function brass(out: AudioNode, freq: number, at: number, length: number, level: number, pan: number) {
  const c = ctx!;
  const end = at + length;
  // Short notes end before the attack settles: every step stays at or before the release.
  const settle = Math.min(at + 0.2, end);
  const sustain = Math.min(freq * 3.5, 5000);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(300, at);
  filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 7, 7000), at + 0.05);
  filter.frequency.exponentialRampToValueAtTime(sustain, settle);
  filter.frequency.setValueAtTime(sustain, end);
  filter.frequency.exponentialRampToValueAtTime(400, end + 0.15);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.04);
  gain.gain.linearRampToValueAtTime(level * 0.8, settle);
  gain.gain.setValueAtTime(level * 0.8, end);
  gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  filter.connect(gain).connect(panner).connect(out);

  const vibrato = c.createOscillator();
  vibrato.frequency.value = 5.5;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(length > 0.4 ? freq * 0.01 : 0, at + Math.min(length, 0.4));
  vibrato.connect(depth);
  vibrato.start(at);
  vibrato.stop(end + 0.2);
  for (const cents of [-6, 6]) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = cents;
    depth.connect(osc.frequency);
    osc.connect(filter);
    osc.start(at);
    osc.stop(end + 0.2);
  }
}

// A timpani hit: a low sine that sags in pitch as it rings.
function timpani(out: AudioNode, freq: number, at: number) {
  const osc = ctx!.createOscillator();
  osc.frequency.setValueAtTime(freq * 1.1, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + 0.1);
  const gain = ctx!.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.9, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 1.25);
}

// A victory fanfare for the final results: three trumpets, "ta-ta-ta TAAA, ta-ta-ta TAAAAA" up a C major
// arpeggio, with timpani under the long notes. About three seconds.
export function playFanfare() {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.05;
  const master = bus(0.35);
  const [C4, E4, G4, C5, E5, G5] = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
  // [lead, harmony, start, length]; the low trumpet joins only on the long notes.
  const score: [number, number, number, number][] = [
    [G4, E4, 0, 0.1],
    [G4, E4, 0.13, 0.1],
    [G4, E4, 0.26, 0.1],
    [C5, G4, 0.39, 0.5],
    [G4, E4, 1.0, 0.15],
    [C5, G4, 1.18, 0.15],
    [E5, C5, 1.36, 0.15],
    [G5, E5, 1.54, 1.5],
  ];
  for (const [lead, harmony, at, length] of score) {
    brass(master, lead, t + at, length, 0.5, -0.3);
    brass(master, harmony, t + at, length, 0.35, 0.3);
    if (length >= 0.5) {
      brass(master, C4, t + at, length, 0.3, 0);
      timpani(master, 65.41, t + at);
    }
  }
}
