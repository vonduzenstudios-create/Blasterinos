import { song, bassLine, arpLine, padLine, drums, type Chord } from './music';

// ---------------- Stage 4: "Snowland" ----------------
// D minor, bright bell arpeggios up high over a pumping bass.
const snowChords: Chord[] = [
  ['D', 'm'], ['A#', 'M'], ['C', 'M'], ['A', 'M'], ['D', 'm'], ['A#', 'M'], ['G', 'm'], ['A', 'M'],
  ['F', 'M'], ['C', 'M'], ['D', 'm'], ['A#', 'M'], ['G', 'm'], ['C', 'M'], ['A', 'M'], ['A', '7'],
];
const snowLead = `
D5 . . . A4 . D5 . F5 . . . E5 . D5 .
F5 . . . D5 . F5 . A#5 . . . A5 . F5 .
G5 . . . E5 . C5 . E5 . G5 . C6 . . .
C#6 . . . . . A5 . E5 . . . C#5 . . .
D6 . . . A5 . F5 . D5 . . . F5 . A5 .
A#5 . . . F5 . D5 . A#4 . . . D5 . F5 .
G5 . A#5 . D6 . A#5 . G5 . . . D5 . . .
E5 . . . . . . . C#5 . . . - - - -
A5 . . . C6 . A5 . F5 . . . A5 . C6 .
G5 . . . E5 . G5 . C6 . . . A#5 . G5 .
A5 . . . F5 . A5 . D6 . . . C6 . A5 .
A#5 . . . . . F5 . D5 . . . F5 . A#5 .
D6 . . . A#5 . G5 . A#5 . D6 . G6 . . .
E6 . . . C6 . G5 . E5 . G5 . C6 . E6 .
C#6 . . . A5 . E5 . A5 . . . C#6 . E6 .
G6 . . . E6 . . . C#6 . . . A5 . . .`;
const pump = [0, -1, 12, -1, 0, -1, 12, 0, 0, -1, 12, -1, 7, -1, 12, 10];
export const SNOW_SONG = song(156, true, [
  { inst: 'lead', vol: 0.18, notes: snowLead },
  { inst: 'bass', vol: 0.34, notes: bassLine(snowChords, pump) },
  { inst: 'arp', vol: 0.05, notes: arpLine(snowChords, 6) },
  { inst: 'pad', vol: 0.035, notes: padLine(snowChords, 1) },
  {
    // open hats on the off beats jingle like sleigh bells
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', 'h', 'o', 'h', 's', 'h', 'o', 'k', 'k', 'h', 'o', 'h', 's', 'h', 'o', 'h'],
      ['k', 'h', 'o', 'h', 's', 'h', 'o', 'k', 's', 's', 't', 's', 't', 't', 'ss', 's']),
  },
]);

// ---------------- Boss: Santa ----------------
// Jingle Bells, dragged into C minor and played far too fast.
const santaChords: Chord[] = [
  ['C', 'm'], ['C', 'm'], ['C', 'm'], ['C', 'm'], ['F', 'm'], ['C', 'm'], ['G#', 'M'], ['G', 'M'],
  ['C', 'm'], ['C', 'm'], ['C', 'm'], ['C', 'm'], ['F', 'm'], ['C', 'm'], ['G', '7'], ['C', 'm'],
];
const jingle = `
D#5 . . . D#5 . . . D#5 . . . . . . .
D#5 . . . D#5 . . . D#5 . . . . . . .
D#5 . . . G5 . . . C5 . . . . . D5 .
D#5 . . . . . . . . . . . . . - -
F5 . . . F5 . . . F5 . . . . . F5 .
F5 . . . D#5 . . . D#5 . . . D#5 . D#5 .
D#5 . . . D5 . . . D5 . . . D#5 . . .
D5 . . . . . . . G5 . . . . . . .
D#5 . . . D#5 . . . D#5 . . . . . . .
D#5 . . . D#5 . . . D#5 . . . . . . .
D#5 . . . G5 . . . C5 . . . . . D5 .
D#5 . . . . . . . . . . . . . - -
F5 . . . F5 . . . F5 . . . . . F5 .
F5 . . . D#5 . . . D#5 . . . D#5 . D#5 .
G5 . . . G5 . . . F5 . . . D5 . . .
C5 . . . . . . . C6 . . . G5 . D#5 .`;
const santaBass = [0, 0, 12, 0, 0, 12, 0, 13, 0, 0, 12, 0, 10, 12, 7, 6];
export const SANTA_SONG = song(184, true, [
  { inst: 'lead', vol: 0.19, notes: jingle },
  { inst: 'lead2', vol: 0.08, notes: jingle.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.37, notes: bassLine(santaChords, santaBass) },
  { inst: 'arp', vol: 0.045, notes: arpLine(santaChords, 5, 2) },
  {
    inst: 'drums', vol: 1, drum: drums(16,
      ['k', 'o', 'k', 'o', 's', 'o', 'k', 'k', 'k', 'o', 'k', 'o', 's', 'o', 'k', 'o'],
      ['k', 'o', 'k', 'o', 's', 'o', 'k', 'h', 's', 't', 's', 't', 's', 's', 'ss', 's'], 4, 4),
  },
]);
