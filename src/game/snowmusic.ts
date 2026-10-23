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
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', 'h', 'o', 'h', 's', 'h', 'o', 'k', 'k', 'h', 'o', 'h', 's', 'h', 'o', 'h'],
      ['k', 'h', 'o', 'h', 's', 'h', 'o', 'k', 's', 's', 't', 's', 't', 't', 'ss', 's']),
  },
]);

// ---------------- Boss: the Glacier Walker ----------------
// E minor, a heavy half-time stomp under a driving riff: the walker's footsteps.
const walkerChords: Chord[] = [
  ['E', 'm'], ['E', 'm'], ['C', 'M'], ['D', 'M'], ['E', 'm'], ['E', 'm'], ['A', 'm'], ['B', 'M'],
  ['C', 'M'], ['D', 'M'], ['E', 'm'], ['G', 'M'], ['A', 'm'], ['C', 'M'], ['B', 'M'], ['B', '7'],
];
const walkerLead = `
E5 . . . - - E5 . G5 . . . F#5 . E5 .
D5 . . . . . . . B4 . . . . . - -
E5 . . . - - E5 . G5 . . . A5 . B5 .
C6 . . . B5 . . . A5 . . . F#5 . . .
E5 . . . - - E5 . G5 . . . F#5 . E5 .
D5 . . . . . . . B4 . . . . . - -
C5 . E5 . A5 . . . G5 . E5 . A5 . . .
D#5 . . . F#5 . . . B5 . . . . . . .
C6 . . . B5 . G5 . E5 . . . G5 . C6 .
D6 . . . C6 . A5 . F#5 . . . A5 . D6 .
E6 . . . B5 . G5 . E5 . . . G5 . B5 .
D6 . . . B5 . . . G5 . . . B5 . D6 .
C6 . . . . . A5 . E5 . . . A5 . C6 .
E6 . . . D6 . C6 . G5 . . . C6 . E6 .
D#6 . . . . . B5 . F#5 . . . B5 . . .
F#6 . . . D#6 . . . B5 . . . A5 . . .`;
const stomp = [0, -1, 0, 0, 12, -1, 0, -1, 0, 0, 12, -1, 0, 3, 5, 7];
export const WALKER_SONG = song(168, true, [
  { inst: 'lead', vol: 0.18, notes: walkerLead },
  { inst: 'lead2', vol: 0.07, notes: walkerLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.38, notes: bassLine(walkerChords, stomp) },
  { inst: 'arp', vol: 0.045, notes: arpLine(walkerChords, 4, 2) },
  { inst: 'pad', vol: 0.03, notes: padLine(walkerChords, 1) },
  {
    inst: 'drums', vol: 1, drum: drums(16,
      ['k', 'h', 'h', 'h', 's', 'h', 'k', 'h', 'k', 'k', 'h', 'h', 's', 'h', 'h', 'h'],
      ['k', 'h', 'h', 'h', 's', 'h', 'k', 'h', 'k', 'k', 's', 'h', 't', 't', 'ss', 's'], 4, 4),
  },
]);
