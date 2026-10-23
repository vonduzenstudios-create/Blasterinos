import { song, bassLine, arpLine, padLine, drums, type Chord } from './music';

const lower = (s: string) => s.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1));

// ---------------- Stage 5: "The Alien Hive" ----------------
// Creepy and chromatic, but it still has to drive you forward.
const hiveChords: Chord[] = [
  ['C', 'm'], ['C#', 'M'], ['C', 'm'], ['G', 'M'], ['F', 'm'], ['C#', 'M'], ['D', 'M'], ['G', '7'],
  ['C', 'm'], ['C#', 'M'], ['C', 'm'], ['A#', 'M'], ['G#', 'M'], ['F', 'm'], ['G', 'M'], ['G', '7'],
];
const hiveLead = `
C5 . . . D#5 . G5 . F#5 . . . G5 . . .
C#5 . . . F5 . G#5 . G5 . F5 . C#5 . . .
C5 . . . D#5 . G5 . C6 . . . A#5 . G5 .
B4 . . . D5 . G5 . F5 . . . D5 . B4 .
C5 . F5 . G#5 . . . G5 . F5 . D#5 . C5 .
C#5 . . . . . F5 . G#5 . . . F5 . C#5 .
D5 . . . F#5 . A5 . C6 . . . A5 . F#5 .
G5 . . . . . . . F5 . . . D5 . B4 .
C6 . . . G5 . D#5 . C5 . . . D#5 . G5 .
C#6 . . . G#5 . F5 . C#5 . . . F5 . G#5 .
C6 . . . G5 . D#5 . G5 . . . C6 . D#6 .
D6 . . . A#5 . F5 . D5 . . . F5 . A#5 .
C6 . . . G#5 . D#5 . C5 . . . D#5 . G#5 .
C6 . . . G#5 . F5 . C5 . . . F5 . G#5 .
B5 . . . G5 . D5 . B4 . . . D5 . G5 .
B5 . . . . . . . - - - - G5 . F5 .`;
const crawl = [0, -1, 0, 12, 0, -1, 1, 0, 0, -1, 0, 12, 7, -1, 6, 0];
export const HIVE_SONG = song(154, true, [
  { inst: 'lead', vol: 0.17, notes: hiveLead },
  { inst: 'lead2', vol: 0.06, notes: lower(hiveLead) },
  { inst: 'bass', vol: 0.36, notes: bassLine(hiveChords, crawl) },
  { inst: 'arp', vol: 0.04, notes: arpLine(hiveChords, 5, 1) },
  { inst: 'pad', vol: 0.035, notes: padLine(hiveChords, 1) },
  {
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', 'h', 'h', 'k', 's', 'h', 'k', 'h', 'k', 'h', 'k', 'k', 's', 'h', 'h', 'o'],
      ['k', 'h', 'h', 'k', 's', 'h', 'k', 'h', 's', 't', 's', 't', 's', 's', 'ss', 's']),
  },
]);

// ---------------- Final boss: "The Hive Queen" ----------------
const queenChords: Chord[] = [['C', 'm'], ['C#', 'M'], ['C', 'm'], ['B', 'M'], ['C', 'm'], ['C#', 'M'], ['G#', 'M'], ['G', 'M']];
const queenLead = `
C6 . G5 . C6 . D#6 . D6 . C6 . G5 . D#5 .
C#6 . G#5 . F5 . G#5 . C#6 . C6 . G#5 . F5 .
C6 . . . G5 . . . D#6 . D6 . C6 . G5 .
B5 . . . F#5 . D#5 . B4 . D#5 . F#5 . B5 .
C6 . D#6 . G6 . . . F#6 . . . D#6 . C6 .
C#6 . . . F6 . . . G#6 . . . F6 . C#6 .
C6 . . . D#6 . . . G#6 . G6 . D#6 . C6 .
B5 . . . . . . . D6 . . . G6 . . .`;
const pound = [0, 0, 12, 0, 0, 1, 0, 12, 0, 0, 12, 0, 1, 0, 13, 12];
export const QUEEN_SONG = song(184, true, [
  { inst: 'lead', vol: 0.18, notes: queenLead },
  { inst: 'lead2', vol: 0.07, notes: lower(queenLead) },
  { inst: 'bass', vol: 0.38, notes: bassLine(queenChords, pound) },
  { inst: 'arp', vol: 0.045, notes: arpLine(queenChords, 4) },
  {
    inst: 'drums', vol: 1, drum: drums(8,
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'k', 'k', 'h', 'k', 'h', 's', 'h', 'k', 's'],
      ['k', 's', 'k', 's', 's', 't', 's', 't', 's', 's', 't', 't', 'ss', 'ss', 'ss', 's'], 4, 4),
  },
]);

// ---------------- Ending ----------------
const endChords: Chord[] = [['C', 'M'], ['G', 'M'], ['A', 'm'], ['F', 'M'], ['C', 'M'], ['G', 'M'], ['F', 'M'], ['G', 'M']];
const endLead = `
E5 . . . G5 . C6 . . . B5 . A5 . G5 .
D5 . . . G5 . B5 . . . A5 . G5 . D5 .
E5 . . . A5 . C6 . . . E6 . D6 . C6 .
A5 . . . . . F5 . A5 . C6 . F6 . . .
E6 . . . D6 . C6 . . . G5 . C6 . E6 .
D6 . . . B5 . G5 . . . B5 . D6 . G6 .
F6 . . . E6 . D6 . C6 . . . A5 . C6 .
D6 . . . . . . . B5 . . . G5 . . .`;
export const ENDING_SONG = song(132, true, [
  { inst: 'lead', vol: 0.18, notes: endLead },
  { inst: 'lead2', vol: 0.06, notes: lower(endLead) },
  { inst: 'pad', vol: 0.05, notes: padLine(endChords, 1) },
  { inst: 'pad', vol: 0.05, notes: padLine(endChords, 2) },
  { inst: 'bass', vol: 0.3, notes: bassLine(endChords, [0, -1, 12, -1, 7, -1, 12, -1, 0, -1, 12, -1, 7, -1, 10, 12]) },
  { inst: 'arp', vol: 0.04, notes: arpLine(endChords, 5, 2) },
  {
    inst: 'drums', vol: 0.75, drum: drums(8,
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 'k', '.', 'h', '.', 's', '.', 'h', 'o'],
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 's', 's', 't', 't', 's', 's', 't', 't']),
  },
]);
