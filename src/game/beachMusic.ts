import { song, bassLine, arpLine, drums, type Chord } from './music';

// ---------------- Stage 3: "Pearl Beach" ----------------
// Surf rock: A major with a bouncy lead, galloping bass and tom-heavy fills.
const beachChords: Chord[] = [
  ['A', 'M'], ['A', 'M'], ['D', 'M'], ['A', 'M'], ['E', 'M'], ['D', 'M'], ['A', 'M'], ['E', '7'],
  ['F#', 'm'], ['D', 'M'], ['A', 'M'], ['E', 'M'], ['F#', 'm'], ['D', 'M'], ['E', 'M'], ['E', '7'],
];
const beachLead = `
A4 . C#5 . E5 . A5 . . . G#5 . E5 . C#5 .
E5 . . . C#5 . E5 . F#5 . E5 . C#5 . A4 .
D5 . F#5 . A5 . . . F#5 . A5 . B5 . A5 .
A5 . . . E5 . . . C#5 . . . - - - -
B4 . E5 . G#5 . B5 . . . G#5 . E5 . B4 .
A4 . D5 . F#5 . A5 . . . F#5 . D5 . F#5 .
E5 . . . C#5 . A4 . C#5 . E5 . A5 . . .
G#5 . . . . . . . D5 . E5 . G#5 . B5 .
C#6 . . . A5 . F#5 . A5 . C#6 . . . B5 .
A5 . . . F#5 . D5 . F#5 . A5 . D6 . . .
C#6 . . . A5 . E5 . A5 . C#6 . E6 . . .
B5 . . . G#5 . E5 . G#5 . B5 . . . - -
F#5 . A5 . C#6 . A5 . F#5 . A5 . C#6 . A5 .
D6 . . . A5 . F#5 . D5 . F#5 . A5 . D6 .
E6 . . . D6 . B5 . G#5 . E5 . G#5 . B5 .
D6 . . . . . . . B5 . G#5 . E5 . D5 .`;
const surfBass = [0, -1, 0, 12, 0, -1, 7, -1, 0, -1, 0, 12, 9, -1, 7, -1];
export const BEACH_SONG = song(170, true, [
  { inst: 'lead', vol: 0.19, notes: beachLead },
  { inst: 'lead2', vol: 0.06, notes: beachLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.34, notes: bassLine(beachChords, surfBass) },
  { inst: 'arp', vol: 0.045, notes: arpLine(beachChords, 5, 2) },
  {
    inst: 'drums', vol: 0.9, drum: drums(16,
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 'k', '.', 'h', 'k', 's', '.', 'h', 'h'],
      ['k', '.', 'h', '.', 's', '.', 'h', 'k', 't', 't', 't', 's', 't', 't', 'ss', 's']),
  },
]);

// ---------------- Boss: "The Giant Clam" ----------------
const clamChords: Chord[] = [['F#', 'm'], ['F#', 'm'], ['D', 'M'], ['E', 'M'], ['F#', 'm'], ['A', 'M'], ['G', 'M'], ['C#', '7']];
const clamLead = `
F#5 . . . C#5 . F#5 . A5 . G#5 . F#5 . C#5 .
F#5 . . . A5 . . . C#6 . B5 . A5 . G#5 .
A5 . . . F#5 . A5 . D6 . . . C#6 . A5 .
G#5 . . . E5 . G#5 . B5 . . . A5 . G#5 .
F#6 . . . . . C#6 . . . A5 . . . F#5 .
E5 . F#5 . A5 . C#6 . E6 . C#6 . A5 . E5 .
D6 . . . B5 . . . G5 . . . B5 . . .
C#6 . . . . . . . G#5 . F5 . C#5 . G#4 .`;
const clamBass = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 10, 12, 7, 5];
export const CLAM_SONG = song(174, true, [
  { inst: 'lead', vol: 0.19, notes: clamLead },
  { inst: 'lead2', vol: 0.07, notes: clamLead.replace(/([A-G]#?)(\d)/g, (_, n, o) => n + (parseInt(o) - 1)) },
  { inst: 'bass', vol: 0.37, notes: bassLine(clamChords, clamBass) },
  { inst: 'arp', vol: 0.045, notes: arpLine(clamChords, 4) },
  {
    inst: 'drums', vol: 1, drum: drums(8,
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'k', 'k', 'h', 'k', 'h', 's', 'h', 't', 't'],
      ['k', 'h', 'k', 'h', 's', 'h', 'k', 'h', 's', 't', 's', 't', 's', 's', 'ss', 's'], 4, 4),
  },
]);
