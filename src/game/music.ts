import { parseSteps, midiOf, type Song } from '../engine/audio';

// Songs are written as step strings (one token per 16th note). Bass, arpeggios
// and drums are generated from the chord chart, leads are hand written.

type Chord = [string, 'M' | 'm' | '7'];

function bassLine(chords: Chord[], pattern: number[]): string {
  const toks: string[] = [];
  for (const [root] of chords) {
    const r = midiOf(root + '2');
    for (let i = 0; i < 16; i++) {
      const off = pattern[i];
      if (off === -1) toks.push('.');
      else if (off === -2) toks.push('-');
      else toks.push(nameOf(r + off));
    }
  }
  return toks.join(' ');
}
function arpLine(chords: Chord[], octave = 4, rate = 1): string {
  const toks: string[] = [];
  for (const [root, q] of chords) {
    const r = midiOf(root + octave);
    const tones = q === 'M' ? [0, 4, 7, 12] : q === 'm' ? [0, 3, 7, 12] : [0, 4, 7, 10];
    for (let i = 0; i < 16; i++) toks.push(i % rate === 0 ? nameOf(r + tones[(i / rate) % 4]) : '.');
  }
  return toks.join(' ');
}
function padLine(chords: Chord[], tone: number): string {
  const toks: string[] = [];
  for (const [root, q] of chords) {
    const tones = q === 'M' ? [0, 4, 7] : q === 'm' ? [0, 3, 7] : [0, 4, 10];
    toks.push(nameOf(midiOf(root + '3') + tones[tone]));
    for (let i = 1; i < 16; i++) toks.push('.');
  }
  return toks.join(' ');
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function nameOf(m: number) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

function drums(bars: number, base: string[], fill: string[], fillEvery = 8, crashEvery = 8): string[] {
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    const pat = (b + 1) % fillEvery === 0 ? fill : base;
    pat.forEach((d, i) => out.push(i === 0 && b % crashEvery === 0 ? d + 'c' : d));
  }
  return out;
}

function song(bpm: number, loop: boolean, parts: { inst: any; vol: number; notes?: string; drum?: string[] }[]): Song {
  let steps = 0;
  const tracks = parts.map((p) => {
    if (p.drum) { steps = Math.max(steps, p.drum.length); return { inst: p.inst, vol: p.vol, events: [], drum: p.drum }; }
    const { events, steps: n } = parseSteps(p.notes!);
    steps = Math.max(steps, n);
    return { inst: p.inst, vol: p.vol, events };
  });
  return { bpm, steps, tracks, loop };
}

// ---------------- Stage 1: "Venom Falls" ----------------
const stageChords: Chord[] = [
  ['E', 'm'], ['C', 'M'], ['D', 'M'], ['B', 'M'], ['E', 'm'], ['C', 'M'], ['D', 'M'], ['B', 'M'],
  ['A', 'm'], ['E', 'm'], ['C', 'M'], ['D', 'M'], ['A', 'm'], ['E', 'm'], ['B', 'M'], ['B', '7'],
];
const stageLead = `
E5 . . . B4 . E5 . G5 . . . F#5 . E5 .
G5 . . . E5 . C5 . E5 . . . D5 . C5 .
D5 . . . A4 . D5 . F#5 . . . E5 . D5 .
D#5 . . . . . . . F#5 . . . B5 . . .
E5 . . . B4 . E5 . G5 . . . A5 . B5 .
C6 . . . B5 . G5 . E5 . . . G5 . C6 .
B5 . A5 . F#5 . D5 . A5 . . . F#5 . A5 .
B5 . . . . . . . . . . . - - - -
A4 . C5 . E5 . A5 . . . G5 . E5 . C5 .
B4 . . . E5 . G5 . B5 . . . A5 . G5 .
G5 . . . E5 . G5 . C6 . . . B5 . G5 .
F#5 . . . . . D5 . A5 . . . F#5 . D5 .
A5 . . . E5 . A5 . C6 . . . B5 . A5 .
G5 . . . B5 . G5 . E5 . . . G5 . B5 .
D#6 . . . B5 . F#5 . D#5 . . . F#5 . B5 .
B5 . . . A5 . . . F#5 . . . D#5 . . .`;
const driveBass = [0, -1, 12, 0, -2, 0, 12, 0, 7, -1, 12, 0, 10, 0, 12, 7];
export const STAGE_SONG = song(152, true, [
  { inst: 'lead', vol: 0.2, notes: stageLead },
  { inst: 'bass', vol: 0.34, notes: bassLine(stageChords, driveBass) },
  { inst: 'arp', vol: 0.05, notes: arpLine(stageChords, 5) },
  {
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 'k', '.', 'h', '.', 's', '.', 'h', 'h'],
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 's', 's', 't', 's', 't', 't', 's', 's']),
  },
]);

// ---------------- Boss: "Hydra of the Falls" ----------------
const bossChords: Chord[] = [['C', 'm'], ['C', 'm'], ['G#', 'M'], ['A#', 'M'], ['C', 'm'], ['C', 'm'], ['F', 'm'], ['G', 'M']];
const bossLead = `
C5 . . . G4 . C5 . D#5 . D5 . C5 . G4 .
C5 . . . D#5 . . . G5 . F5 . D#5 . D5 .
D#5 . . . C5 . D#5 . G#5 . . . G5 . F5 .
F5 . . . D5 . F5 . A#5 . . . A5 . A#5 .
C6 . . . . . G5 . . . D#5 . . . C5 .
D5 . D#5 . F5 . G5 . G#5 . G5 . F5 . D#5 .
F5 . . . G#5 . . . C6 . . . G#5 . . .
B5 . . . . . . . G5 . F5 . D5 . B4 .`;
const bossBass = [0, 0, 12, 0, 0, 12, 0, 13, 0, 0, 12, 0, 10, 12, 7, 6];
export const BOSS_SONG = song(172, true, [
  { inst: 'lead', vol: 0.19, notes: bossLead },
  { inst: 'lead2', vol: 0.07, notes: bossLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.36, notes: bassLine(bossChords, bossBass) },
  { inst: 'arp', vol: 0.045, notes: arpLine(bossChords, 4) },
  {
    inst: 'drums', vol: 1, drum: drums(8,
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'h', 'k', 'h', 'k', 'k', 's', 'h', 'k', 'h'],
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'h', 's', 't', 's', 't', 's', 's', 'ss', 's'], 4, 4),
  },
]);

// ---------------- Stage 2: "Scorched Dunes" ----------------
// E phrygian dominant over a galloping bass: the snake-charmer scale, played fast.
const desertChords: Chord[] = [
  ['E', 'M'], ['F', 'M'], ['E', 'M'], ['D', 'm'], ['C', 'M'], ['D', 'm'], ['E', 'M'], ['E', '7'],
  ['A', 'm'], ['G', 'M'], ['F', 'M'], ['E', 'M'], ['A', 'm'], ['G', 'M'], ['F', 'M'], ['E', '7'],
];
const desertLead = `
E5 . F5 . G#5 . . . F5 . E5 . . . B4 .
C5 . . . A4 . C5 . F5 . . . E5 . C5 .
B4 . . . G#4 . B4 . E5 . F5 . G#5 . . .
A5 . . . F5 . D5 . F5 . E5 . D5 . . .
E5 . . . C5 . E5 . G5 . . . F5 . E5 .
F5 . . . D5 . F5 . A5 . . . G#5 . F5 .
G#5 . . . . . E5 . B5 . . . A5 . G#5 .
B5 . . . . . . . . . . . - - - -
A5 . . . E5 . A5 . C6 . . . B5 . A5 .
B5 . . . G5 . D5 . G5 . . . F5 . D5 .
C6 . . . A5 . F5 . A5 . C6 . B5 . A5 .
G#5 . . . E5 . . . B4 . . . E5 . F5 .
E5 . A5 . C6 . A5 . E6 . . . D6 . C6 .
D6 . B5 . G5 . B5 . D6 . . . C6 . B5 .
C6 . . . A5 . . . F5 . . . A5 . C6 .
B5 . . . G#5 . . . E5 . . . - - - -`;
const gallop = [0, -1, 0, 0, 12, -1, 0, 0, 7, -1, 0, 0, 10, -1, 12, 0];
export const DESERT_SONG = song(162, true, [
  { inst: 'lead', vol: 0.19, notes: desertLead },
  { inst: 'lead2', vol: 0.06, notes: desertLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.34, notes: bassLine(desertChords, gallop) },
  { inst: 'arp', vol: 0.045, notes: arpLine(desertChords, 5, 2) },
  {
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', 'h', 'h', 'k', 's', 'h', 'h', 'k', 'k', 'h', 'h', 'k', 's', 'h', 'k', 'h'],
      ['k', 'h', 'h', 'k', 's', 'h', 'h', 'k', 's', 's', 't', 's', 't', 't', 'ss', 's']),
  },
]);

// ---------------- Boss: "The Great Dune Worm" ----------------
const wormChords: Chord[] = [['D', 'm'], ['D#', 'M'], ['D', 'm'], ['C', 'M'], ['D', 'm'], ['D#', 'M'], ['A#', 'M'], ['A', 'M']];
const wormLead = `
D5 . . . A4 . D5 . F5 . E5 . D5 . A4 .
D#5 . . . G5 . . . A#5 . G5 . D#5 . D5 .
F5 . . . D5 . F5 . A5 . . . G5 . F5 .
E5 . . . C5 . E5 . G5 . . . F5 . E5 .
D6 . . . . . A5 . . . F5 . . . D5 .
D#5 . F5 . G5 . A#5 . D#6 . D6 . A#5 . G5 .
F5 . . . A#5 . . . D6 . . . A#5 . . .
C#6 . . . . . . . A5 . G5 . E5 . C#5 .`;
const wormBass = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 1, 12, 7, 1];
export const WORM_SONG = song(176, true, [
  { inst: 'lead', vol: 0.19, notes: wormLead },
  { inst: 'lead2', vol: 0.07, notes: wormLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.37, notes: bassLine(wormChords, wormBass) },
  { inst: 'arp', vol: 0.045, notes: arpLine(wormChords, 4) },
  {
    inst: 'drums', vol: 1, drum: drums(8,
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'k', 'k', 'h', 'k', 'h', 's', 'h', 'k', 'h'],
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'h', 's', 't', 's', 't', 's', 's', 'ss', 's'], 4, 4),
  },
]);

// ---------------- Title ----------------
const titleChords: Chord[] = [['E', 'm'], ['C', 'M'], ['G', 'M'], ['D', 'M'], ['E', 'm'], ['C', 'M'], ['D', 'M'], ['B', 'M']];
const titleLead = `
E5 . . . . . B4 . E5 . G5 . . . . .
E5 . . . . . . . C5 . . . . . . .
D5 . . . . . B4 . D5 . G5 . . . B5 .
A5 . . . . . . . F#5 . . . . . . .
G5 . . . . . F#5 . E5 . . . B4 . . .
C5 . . . E5 . . . G5 . . . C6 . . .
B5 . . . A5 . . . F#5 . . . D5 . . .
D#5 . . . . . . . F#5 . . . B5 . . .`;
export const TITLE_SONG = song(128, true, [
  { inst: 'lead', vol: 0.17, notes: titleLead },
  { inst: 'pad', vol: 0.05, notes: padLine(titleChords, 1) },
  { inst: 'pad', vol: 0.05, notes: padLine(titleChords, 2) },
  { inst: 'bass', vol: 0.3, notes: bassLine(titleChords, [0, -1, -1, 0, -2, -2, 12, -1, 0, -1, -1, 7, -2, -2, 10, -1]) },
  { inst: 'arp', vol: 0.045, notes: arpLine(titleChords, 4, 2) },
  {
    inst: 'drums', vol: 0.75, drum: drums(8,
      ['k', '.', 'h', '.', 's', '.', 'h', '.', 'k', '.', 'k', '.', 's', '.', 'h', 'o'],
      ['k', '.', 'h', '.', 's', '.', 'h', '.', 's', 's', 't', 't', 's', 's', 't', 't']),
  },
]);

// ---------------- Jingles ----------------
export const CLEAR_SONG = song(140, false, [
  { inst: 'lead', vol: 0.2, notes: 'E5 . G5 . B5 . E6 . . . D6 . . . E6 . . . F#6 . . . G6 . . . . . . . . . . . . . - -' },
  { inst: 'lead2', vol: 0.1, notes: 'B4 . D5 . G5 . B5 . . . A5 . . . B5 . . . D6 . . . D#6 . . . . . . . . . . . . . - -' },
  { inst: 'bass', vol: 0.3, notes: 'E2 . . . E3 . . . C3 . . . D3 . . . E3 . . . D3 . . . B2 . . . . . . . . . . . . . - -' },
  { inst: 'drums', vol: 0.8, drum: 'kc . . . s . . . k . . . s s s s kc . . . . . . . . . . . . . . . . . . . . . . .'.split(' ') },
]);
export const GAMEOVER_SONG = song(90, false, [
  { inst: 'lead', vol: 0.2, notes: 'B4 . . . A4 . . . G4 . . . F#4 . . . E4 . . . . . . . . . . . . . . -' },
  { inst: 'pad', vol: 0.06, notes: 'E3 . . . . . . . C3 . . . . . . . B2 . . . . . . . . . . . . . . -' },
  { inst: 'bass', vol: 0.3, notes: 'E2 . . . . . . . C2 . . . . . . . B1 . . . . . . . . . . . . . . -' },
]);
export const READY_SONG = song(150, false, [
  { inst: 'lead', vol: 0.2, notes: 'E5 . B4 . E5 . G5 . B5 . . . . . . . . . . . -' },
  { inst: 'bass', vol: 0.3, notes: 'E2 . E2 . E2 . E2 . E3 . . . . . . . . . . . -' },
  { inst: 'drums', vol: 0.8, drum: 'k . s . k . s . kc . . . . . . . . . . . .'.split(' ') },
]);
