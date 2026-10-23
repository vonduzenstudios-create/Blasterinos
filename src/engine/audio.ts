// All sound is synthesized with the Web Audio API: chiptune-style pulse waves,
// a filtered saw synth bass, noise drums, and one-shot sound effects.

// Captured at load, before online co-op seeds Math.random for the shared simulation:
// sound must never draw from that sequence, since only one side may have audio running.
const nativeRandom = Math.random;

type Inst = 'lead' | 'lead2' | 'bass' | 'arp' | 'drums' | 'pad';

interface NoteEv { step: number; midi: number; len: number; }
interface Track { inst: Inst; vol: number; events: NoteEv[]; drum?: string[]; }
export interface Song { bpm: number; steps: number; tracks: Track[]; loop: boolean; }

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function midiOf(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return NOTE[m[1]] + (parseInt(m[2]) + 1) * 12;
}
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Parse a step string: note names start a note, "." holds it, "-" is silence. */
export function parseSteps(s: string): { events: NoteEv[]; steps: number } {
  const toks = s.trim().split(/\s+/);
  const events: NoteEv[] = [];
  let cur: NoteEv | null = null;
  toks.forEach((t, i) => {
    if (t === '.') { if (cur) cur.len++; return; }
    if (t === '-') { cur = null; return; }
    cur = { step: i, midi: midiOf(t), len: 1 };
    events.push(cur);
  });
  return { events, steps: toks.length };
}

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  noiseBuf!: AudioBuffer;
  waves: Record<string, PeriodicWave> = {};
  private song: Song | null = null;
  private songStart = 0;
  private nextStep = 0;
  private timer: number | null = null;
  private musicGain!: GainNode;
  private lastSfx: Record<string, number> = {};
  muted = false;

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    this.musicGain = ctx.createGain(); this.musicGain.connect(this.musicBus);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = nativeRandom() * 2 - 1;
    for (const duty of [0.125, 0.25, 0.5]) this.waves['p' + duty] = this.pulseWave(duty);
    if (this.pendingSong) { const s = this.pendingSong; this.pendingSong = null; this.play(s); }
  }

  private pulseWave(duty: number) {
    const n = 48;
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.cos(k * Math.PI * duty); im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.sin(k * Math.PI * duty); }
    return this.ctx!.createPeriodicWave(re, im);
  }

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; }

  // ---------- low level voices ----------
  private osc(type: OscillatorType | string, f0: number, f1: number, t: number, dur: number, vol: number, out: AudioNode, attack = 0.002, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (type.startsWith('p')) o.setPeriodicWave(this.waves[type]); else o.type = type as OscillatorType;
    o.frequency.setValueAtTime(Math.max(f0, 1), t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
    return { o, g };
  }
  private noise(t: number, dur: number, vol: number, out: AudioNode, ftype: BiquadFilterType = 'lowpass', f0 = 8000, f1 = 8000, q = 0.7) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, nativeRandom() * 0.5); s.stop(t + dur + 0.02);
  }

  // ---------- sound effects ----------
  sfx(name: string, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    // Rate limit identical sounds so rapid fire doesn't turn into mush.
    const minGap: Record<string, number> = { hit: 0.04, shot: 0.05, enemyShot: 0.06, flame: 0.07, smallBoom: 0.03, heli: 0.08, engine: 0.1 };
    if (minGap[name] && now - (this.lastSfx[name] ?? 0) < minGap[name]) return;
    this.lastSfx[name] = now;
    const out = this.sfxBus;
    const t = now + 0.005;
    const v = vol;
    switch (name) {
      case 'rifle':
        this.osc('p0.25', 1400, 260, t, 0.09, 0.22 * v, out);
        this.noise(t, 0.05, 0.12 * v, out, 'highpass', 3000, 1500);
        break;
      case 'machine':
        this.osc('p0.5', 900, 180, t, 0.07, 0.2 * v, out);
        this.noise(t, 0.04, 0.14 * v, out, 'bandpass', 2500, 900, 1.5);
        break;
      case 'spread':
        this.osc('p0.125', 1800, 400, t, 0.12, 0.18 * v, out);
        this.osc('p0.25', 1200, 300, t, 0.12, 0.12 * v, out);
        this.noise(t, 0.08, 0.15 * v, out, 'highpass', 4000, 2000);
        break;
      case 'laser':
        this.osc('sawtooth', 2400, 600, t, 0.22, 0.14 * v, out, 0.002, 'exp');
        this.osc('p0.5', 1200, 300, t, 0.22, 0.12 * v, out);
        break;
      case 'homing':
        this.osc('p0.25', 300, 1300, t, 0.12, 0.16 * v, out);
        this.noise(t, 0.12, 0.08 * v, out, 'bandpass', 1500, 4000, 2);
        break;
      case 'flame':
        this.noise(t, 0.16, 0.22 * v, out, 'lowpass', 1800, 300, 1);
        this.osc('sawtooth', 90, 60, t, 0.14, 0.08 * v, out);
        break;
      case 'enemyShot':
        this.osc('p0.5', 700, 350, t, 0.08, 0.1 * v, out);
        break;
      case 'hit':
        this.osc('square', 2200, 1600, t, 0.03, 0.06 * v, out);
        break;
      case 'armorHit':
        this.osc('p0.5', 300, 120, t, 0.2, 0.25 * v, out);
        this.noise(t, 0.2, 0.2 * v, out, 'bandpass', 3000, 600, 3);
        // plates clattering away
        this.osc('square', 1900, 1700, t + 0.04, 0.07, 0.09 * v, out);
        this.osc('square', 2700, 2500, t + 0.11, 0.06, 0.07 * v, out);
        this.osc('square', 2200, 2050, t + 0.19, 0.05, 0.05 * v, out);
        break;
      case 'shwing': // armor snapping back on: a bright metallic sweep that rings out
        this.noise(t, 0.3, 0.2 * v, out, 'bandpass', 2000, 9000, 4);
        this.osc('p0.125', 1046, 4186, t, 0.12, 0.07 * v, out);
        this.osc('sine', 2093, 2093, t + 0.08, 0.55, 0.13 * v, out, 0.004);
        this.osc('sine', 3136, 3136, t + 0.08, 0.5, 0.09 * v, out, 0.004);
        this.osc('triangle', 4186, 4186, t + 0.1, 0.35, 0.05 * v, out, 0.004);
        break;
      case 'smallBoom':
        this.noise(t, 0.3, 0.45 * v, out, 'lowpass', 3500, 120, 1);
        this.osc('triangle', 180, 40, t, 0.25, 0.35 * v, out);
        break;
      case 'bigBoom':
        this.noise(t, 0.9, 0.7 * v, out, 'lowpass', 2500, 60, 1.2);
        this.osc('sine', 120, 25, t, 0.8, 0.7 * v, out);
        this.osc('triangle', 70, 30, t + 0.05, 0.7, 0.4 * v, out);
        break;
      case 'jump':
        this.osc('p0.25', 220, 520, t, 0.12, 0.1 * v, out, 0.002, 'lin');
        break;
      case 'land':
        this.noise(t, 0.05, 0.08 * v, out, 'lowpass', 600, 200);
        break;
      case 'grapple':
        this.osc('p0.125', 400, 2000, t, 0.14, 0.12 * v, out);
        this.noise(t, 0.14, 0.06 * v, out, 'highpass', 3000, 8000);
        break;
      case 'clink':
        this.osc('square', 2600, 2400, t, 0.06, 0.12 * v, out);
        this.osc('square', 3900, 3700, t + 0.02, 0.06, 0.08 * v, out);
        break;
      case 'reel':
        for (let i = 0; i < 4; i++) this.osc('p0.5', 300 + i * 120, 300 + i * 120, t + i * 0.035, 0.03, 0.06 * v, out);
        break;
      case 'pickup': {
        const ns = [72, 76, 79, 84, 88];
        ns.forEach((n, i) => this.osc('p0.25', mtof(n), mtof(n), t + i * 0.055, 0.1, 0.16 * v, out));
        break;
      }
      case 'capsule':
        this.osc('p0.5', 600, 1200, t, 0.08, 0.12 * v, out);
        this.noise(t, 0.2, 0.25 * v, out, 'bandpass', 2000, 500, 1);
        break;
      case 'swap':
        this.osc('p0.5', 880, 880, t, 0.04, 0.1 * v, out);
        this.osc('p0.5', 1320, 1320, t + 0.05, 0.05, 0.1 * v, out);
        break;
      case 'die': {
        this.noise(t, 0.6, 0.4 * v, out, 'lowpass', 2000, 100, 1);
        const ns = [76, 72, 67, 64, 60, 55];
        ns.forEach((n, i) => this.osc('p0.25', mtof(n), mtof(n - 1), t + i * 0.07, 0.09, 0.15 * v, out));
        break;
      }
      case 'roar':
        this.osc('sawtooth', 90, 45, t, 1.4, 0.35 * v, out, 0.15);
        this.osc('sawtooth', 93, 44, t, 1.4, 0.3 * v, out, 0.2);
        this.osc('square', 180, 70, t, 1.2, 0.08 * v, out, 0.2);
        this.noise(t, 1.4, 0.35 * v, out, 'bandpass', 700, 200, 1.5);
        break;
      case 'hiss':
        this.noise(t, 0.5, 0.3 * v, out, 'highpass', 2500, 5000, 0.8);
        break;
      case 'splash':
        this.noise(t, 0.5, 0.35 * v, out, 'bandpass', 1800, 400, 0.8);
        this.noise(t + 0.05, 0.3, 0.15 * v, out, 'highpass', 4000, 2000);
        break;
      case 'bite':
        this.noise(t, 0.12, 0.4 * v, out, 'bandpass', 900, 300, 2);
        this.osc('square', 140, 60, t, 0.12, 0.2 * v, out);
        break;
      case 'hatch': // a hatchling bursting out of its pod
        this.noise(t, 0.18, 0.3 * v, out, 'bandpass', 2400, 700, 3);
        this.osc('square', 900, 220, t, 0.12, 0.1 * v, out);
        this.noise(t + 0.06, 0.25, 0.15 * v, out, 'highpass', 3000, 6000, 0.8);
        break;
      case 'charge': // a pod's seams lighting up
        this.osc('sawtooth', 120, 480, t, 0.4, 0.07 * v, out, 0.05, 'lin');
        this.osc('p0.125', 240, 960, t, 0.4, 0.05 * v, out, 0.05, 'lin');
        break;
      case 'quake': // the Hive Queen slamming the floor: boom plus a rising plasma sweep
        this.osc('sine', 90, 30, t, 0.8, 0.5 * v, out, 0.002);
        this.noise(t, 0.9, 0.45 * v, out, 'lowpass', 1200, 90, 1);
        this.osc('sawtooth', 200, 1400, t + 0.05, 0.5, 0.08 * v, out, 0.02);
        this.noise(t + 0.05, 0.6, 0.15 * v, out, 'bandpass', 800, 4000, 2);
        break;
      case 'menu':
        this.osc('p0.5', 988, 988, t, 0.05, 0.12 * v, out);
        break;
      case 'select':
        this.osc('p0.25', 660, 660, t, 0.06, 0.14 * v, out);
        this.osc('p0.25', 990, 990, t + 0.07, 0.06, 0.14 * v, out);
        this.osc('p0.25', 1320, 1320, t + 0.14, 0.14, 0.14 * v, out);
        break;
      case 'pause':
        this.osc('p0.5', 1320, 1320, t, 0.05, 0.12 * v, out);
        this.osc('p0.5', 660, 660, t + 0.06, 0.08, 0.12 * v, out);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.osc('p0.5', 880, 880, t + i * 0.3, 0.14, 0.14 * v, out);
          this.osc('p0.5', 660, 660, t + i * 0.3 + 0.15, 0.14, 0.14 * v, out);
        }
        break;
      case 'rumble':
        this.noise(t, 1.5, 0.35 * v, out, 'lowpass', 300, 80, 1);
        this.osc('sine', 50, 35, t, 1.5, 0.3 * v, out, 0.3);
        break;
      case 'engine': // jeep motor putter
        this.osc('sawtooth', 62, 55, t, 0.12, 0.07 * v, out, 0.01);
        this.noise(t, 0.08, 0.05 * v, out, 'lowpass', 400, 200);
        break;
      case 'heli': // rotor chop
        this.noise(t, 0.07, 0.18 * v, out, 'bandpass', 260, 160, 2.5);
        break;
      case 'crash':
        this.noise(t, 0.7, 0.5 * v, out, 'bandpass', 2500, 400, 1.5);
        this.osc('square', 220, 60, t, 0.5, 0.16 * v, out);
        for (let i = 0; i < 4; i++) this.osc('square', 1800 - i * 300, 1500 - i * 300, t + 0.05 + i * 0.06, 0.05, 0.08 * v, out);
        break;
      case 'gulp': // the worm peeling open
        this.osc('sine', 300, 90, t, 0.25, 0.25 * v, out);
        this.noise(t, 0.3, 0.2 * v, out, 'bandpass', 600, 250, 3);
        break;
      case 'pearl': // the clam spitting: a wet pop and a bright ping
        this.noise(t, 0.08, 0.3 * v, out, 'bandpass', 1200, 500, 3);
        this.osc('sine', 1760, 2640, t + 0.02, 0.12, 0.14 * v, out);
        this.osc('p0.25', 2200, 1800, t + 0.04, 0.08, 0.06 * v, out);
        break;
      case 'launch': // a mine leaving its tube: a thump and a rising hiss
        this.osc('square', 90, 40, t, 0.1, 0.25 * v, out);
        this.noise(t, 0.3, 0.2 * v, out, 'bandpass', 900, 3000, 2);
        break;
      case 'jets': // jump-jet burn
        this.noise(t, 0.4, 0.3 * v, out, 'lowpass', 600, 1800, 1);
        this.osc('sawtooth', 70, 110, t, 0.35, 0.1 * v, out);
        break;
      case 'crunch': // packed snow giving way
        this.noise(t, 0.25, 0.35 * v, out, 'lowpass', 2400, 300, 1);
        this.noise(t, 0.1, 0.15 * v, out, 'highpass', 5000, 3000);
        break;
    }
  }

  // ---------- music sequencer ----------
  private pendingSong: Song | null = null;
  play(song: Song | null) {
    if (!this.ctx) { this.pendingSong = song; return; }
    this.stop();
    if (!song) return;
    this.song = song;
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.musicBus);
    this.songStart = this.ctx.currentTime + 0.08;
    this.nextStep = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop(fade = 0.05) {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx && this.musicGain) {
      const g = this.musicGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
      setTimeout(() => g.disconnect(), 1000 + fade * 5000);
    }
    this.song = null;
  }
  private schedule() {
    const ctx = this.ctx!, song = this.song;
    if (!song) return;
    const stepDur = 60 / song.bpm / 4;
    const horizon = ctx.currentTime + 0.15;
    while (this.songStart + this.nextStep * stepDur < horizon) {
      const abs = this.nextStep;
      if (!song.loop && abs >= song.steps) { this.timer !== null && clearInterval(this.timer); this.timer = null; return; }
      const step = abs % song.steps;
      const t = this.songStart + abs * stepDur;
      for (const tr of song.tracks) {
        if (tr.inst === 'drums') {
          const d = tr.drum![step];
          if (d && d !== '.') this.drum(d, t, tr.vol);
          continue;
        }
        for (const ev of tr.events) if (ev.step === step) this.voice(tr.inst, ev.midi, t, ev.len * stepDur, tr.vol);
      }
      this.nextStep++;
    }
  }
  private voice(inst: Inst, midi: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!, out = this.musicGain;
    const f = mtof(midi);
    if (inst === 'lead' || inst === 'lead2') {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.waves[inst === 'lead' ? 'p0.25' : 'p0.125']);
      o.frequency.setValueAtTime(f, t);
      // Delayed vibrato on held notes.
      if (dur > 0.25) {
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.5));
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.setTargetAtTime(vol * 0.7, t + 0.02, 0.08);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.92, 0.02);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    } else if (inst === 'bass') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.setPeriodicWave(this.waves['p0.5']); o2.frequency.value = f / 2;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 6;
      fl.frequency.setValueAtTime(2600, t); fl.frequency.exponentialRampToValueAtTime(260, t + Math.min(dur, 0.18));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.02);
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    } else if (inst === 'arp') {
      this.osc('p0.125', f, f, t, Math.min(dur, 0.12), vol, out, 0.002);
    } else if (inst === 'pad') {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.12);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.08);
        o.connect(fl); fl.connect(g); g.connect(out);
        o.start(t); o.stop(t + dur + 0.5);
      }
    }
  }
  private drum(d: string, t: number, vol: number) {
    const out = this.musicGain;
    for (const ch of d) {
      if (ch === 'k') { this.osc('sine', 160, 38, t, 0.22, 0.9 * vol, out, 0.001); this.osc('square', 90, 40, t, 0.03, 0.15 * vol, out); }
      if (ch === 's') { this.noise(t, 0.16, 0.5 * vol, out, 'highpass', 1500, 1200, 0.7); this.osc('triangle', 240, 160, t, 0.08, 0.35 * vol, out); }
      if (ch === 'h') this.noise(t, 0.035, 0.18 * vol, out, 'highpass', 8000, 8000);
      if (ch === 'o') this.noise(t, 0.16, 0.18 * vol, out, 'highpass', 7000, 7000);
      if (ch === 't') this.osc('triangle', 200, 90, t, 0.18, 0.5 * vol, out);
      if (ch === 'c') this.noise(t, 0.9, 0.22 * vol, out, 'highpass', 5000, 3000, 0.5);
    }
  }
}

export const audio = new Audio();
