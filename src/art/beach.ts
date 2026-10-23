import { Pix, rgb, ramp, mix, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { vnoise, hash } from './tiles';

// Stage 3, "Pearl Beach": a tropical landing beach, its wildlife, and the giant
// clam that lives at the end of it. Everything is painted here at boot.

export interface BeachArt {
  sky: HTMLCanvasElement; islands: HTMLCanvasElement;
  palm: Frame[]; hedgehog: Frame; tower: Frame; boat: Frame; piling: Frame; starfish: Frame; shells: Frame; grass: Frame; crate: Frame;
  crab: Frame[]; crabEyes: Frame; fish: Frame[];
  pearl: Frame[]; bigPearl: Frame; geyser: Frame[]; bubbles: Frame[];
  shell: Frame; lips: Frame[];
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dth = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;

function gradient(stops: [number, string][], t: number, x: number, y: number) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const q = ((t - p0) / (p1 - p0)) * 4;
      const k = (Math.floor(q) + (q - Math.floor(q) > dth(x, y) ? 1 : 0)) / 4;
      return mix(rgb(c0), rgb(c1), Math.min(1, k));
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

// ---------------------------------------------------------------- backdrops

function skyCanvas(): HTMLCanvasElement {
  const W = 512, H = 216;
  const p = new Pix(W, H);
  const stops: [number, string][] = [[0, '#1a4aa8'], [0.25, '#2e74d0'], [0.45, '#5aa4e8'], [0.6, '#9ad4f4'], [1, '#d8f4ff']];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, gradient(stops, y / H, x, y));
  // a hot white sun, high up
  const sx = 90, sy = 30;
  for (let y = sy - 36; y < sy + 36; y++) for (let x = sx - 36; x < sx + 36; x++) {
    const d = Math.hypot(x - sx, y - sy);
    if (d < 11) p.set(x, y, d < 9 ? rgb('#ffffff') : rgb('#fffbe0'));
    else if (d < 36 && ((36 - d) / 25) * 0.5 > dth(x, y)) p.set(x, y, mix(p.get(x, y), rgb('#ffffff'), 0.4));
  }
  // fat cumulus clouds: stacked puffs, lit on top, blue-grey bellies
  const rng = new RNG(77);
  for (let i = 0; i < 7; i++) {
    const cx = rng.range(0, W), cy = rng.range(40, 100), n = rng.int(5, 9), w = rng.range(30, 60);
    const puffs = Array.from({ length: n }, (_, k) => ({ x: cx + (k / (n - 1) - 0.5) * w * 2, y: cy - Math.sin((k / (n - 1)) * Math.PI) * rng.range(6, 16), r: rng.range(8, 16) }));
    for (const pf of puffs) for (let y = Math.floor(pf.y - pf.r); y <= pf.y + pf.r; y++) for (let x = Math.floor(pf.x - pf.r); x <= pf.x + pf.r; x++) {
      const d = Math.hypot(x - pf.x, y - pf.y) / pf.r;
      if (d > 1 || y > cy + 6) continue;
      const lit = (y - pf.y) / pf.r;
      const c = lit < -0.4 ? '#ffffff' : lit < 0.3 ? '#eef6fc' : y > cy + 2 ? '#a8c4dc' : '#cadcec';
      p.set(wrap(x, W), y, rgb(c));
    }
  }
  return p.toCanvas();
}

/** Hazy islands on the horizon, and an enemy battleship lurking offshore. */
function islandsCanvas(): HTMLCanvasElement {
  const W = 512, H = 44;
  const p = new Pix(W, H);
  const far = rgb('#7aa4c4'), near = rgb('#5a86aa'), dark = rgb('#4a7090');
  const isle = (cx: number, w: number, h: number, col: number) => {
    for (let dx = -w; dx <= w; dx++) {
      const t = dx / w;
      const top = H - h * Math.pow(1 - t * t, 0.7) - vnoise((cx + dx) / 6, 0, 401) * 3;
      for (let y = Math.floor(top); y < H; y++) p.set(wrap(cx + dx, W), y, col);
    }
  };
  isle(60, 50, 16, far); isle(140, 30, 10, far); isle(330, 70, 26, far);
  isle(350, 26, 32, near); // a volcanic cone
  isle(460, 40, 12, near);
  // little palms on the near island
  for (const x of [445, 470]) { for (let y = 0; y < 10; y++) p.set(x + Math.round(y * 0.2), H - 12 - y, dark); for (let i = -4; i <= 4; i++) p.set(x + 2 + i, H - 22 + Math.abs(i) * 0.5, dark); }
  // the battleship: hull, superstructure, turrets and a smoke trail
  const bx = 200, by = H - 4;
  for (let x = 0; x < 64; x++) { const h = x < 6 ? x : x > 56 ? (64 - x) * 0.8 : 6; for (let y = 0; y < h; y++) p.set(bx + x, by - y, dark); }
  for (let x = 22; x < 40; x++) for (let y = 6; y < 16; y++) if (y < 12 || (x > 27 && x < 34)) p.set(bx + x, by - y, dark);
  for (const tx of [12, 48]) { for (let x = -3; x <= 3; x++) for (let y = 6; y < 9; y++) p.set(bx + tx + x, by - y, dark); for (let x = 0; x < 7; x++) p.set(bx + tx + (tx < 30 ? -3 - x : 3 + x), by - 8, dark); }
  for (let i = 0; i < 14; i++) p.set(bx + 31 + i, by - 17 - Math.round(i * 0.35 + Math.sin(i) * 0.8), mix(dark, rgb('#c8d8e8'), 0.5));
  return p.toCanvas();
}

// ---------------------------------------------------------------- props

const wood: Ramp = ramp('#3a2414', '#6e4a2e', '#a0743e');
const steel: Ramp = ramp('#22262e', '#4a505e', '#868ea0');
const OUT = OUTLINE;

function palm(seed: number): Frame {
  const W = 104, H = 140;
  const p = new Pix(W, H);
  const rng = new RNG(seed);
  const lean = seed % 2 ? 22 : -16;
  // trunk: a curve of ringed segments
  const trunk = ramp('#5a3a22', '#8a643e', '#b8905a');
  const topX = W / 2 + lean, topY = 38;
  const pt = (t: number): [number, number] => [W / 2 + lean * t * t, H - 2 - (H - 2 - topY) * t];
  for (let t = 0; t <= 1; t += 0.005) {
    const [x, y] = pt(t);
    const r = 5 - t * 1.5;
    for (let dx = -r; dx <= r; dx++) {
      const ring = Math.floor(t * 30) % 2 === 0 && Math.abs(dx) > r - 2;
      p.set(x + dx, y, dx < -r * 0.3 ? trunk[2] : dx > r * 0.4 ? trunk[0] : ring ? trunk[0] : trunk[1]);
    }
    if (Math.floor(t * 300) % 10 === 0) p.set(x - r, y, trunk[0]);
  }
  // coconuts
  p.shape(ramp('#2a1a0a', '#5a3a1a', '#8a6030'), (c, id) => { p.circle(topX - 4, topY + 5, 3.5, c, id); p.circle(topX + 3, topY + 6, 3.5, c, id); p.circle(topX, topY + 9, 3, c, id); }, 2);
  // fronds: arcs drooping from the crown, each a spine with leaflets
  const leaf = [rgb('#1a4a1a'), rgb('#2a7028'), rgb('#4a9a36'), rgb('#8ac85a')];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI + (i / (n - 1)) * Math.PI + rng.range(-0.15, 0.15);
    const len = rng.range(34, 46);
    let px = topX, py = topY;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const droop = t * t * 1.6 * (Math.abs(Math.cos(a0)) + 0.3);
      const ax = Math.cos(a0), ay = Math.sin(a0) + droop;
      const m = Math.hypot(ax, ay);
      px += ax / m; py += ay / m;
      const lw = Math.sin(t * Math.PI) * 6 + 1;
      // leaflets angle back off the spine
      for (let k = 1; k <= lw; k++) {
        const nx = -ay / m, ny = ax / m;
        const sh = k > lw - 1.5 ? 0 : s % 3 === 0 ? 1 : 2;
        p.set(px + nx * k - (ax / m) * k * 0.5, py + ny * k - (ay / m) * k * 0.5 + 1, leaf[sh + (ny < 0 ? 1 : 0)]);
        p.set(px - nx * k - (ax / m) * k * 0.5, py - ny * k - (ay / m) * k * 0.5 + 1, leaf[sh]);
      }
      p.set(px, py, leaf[3]);
    }
  }
  p.outline(OUT);
  return frame(p, W / 2, H);
}

function hedgehog(): Frame {
  // a Czech hedgehog: three crossed girders to stop landing craft
  const p = new Pix(30, 24);
  p.shape(steel, (c, id) => { p.line(3, 22, 26, 3, c, 3, id); p.line(4, 3, 27, 22, c, 3, id); }, 2);
  p.shape(steel, (c, id) => p.line(15, 2, 15, 22, c, 3, id), 2);
  for (const [x, y] of [[8, 8], [20, 15], [15, 12]]) p.over(x, y, rgb('#8a4a2a')); // rust
  p.outline(OUT);
  return frame(p, 15, 23);
}

/** The lifeguard tower: a sniper stands on its deck, TOWER_DECK pixels above the sand. */
export const TOWER_DECK = 96;
function tower(): Frame {
  const W = 68, H = TOWER_DECK + 40;
  const p = new Pix(W, H);
  const deck = H - TOWER_DECK;
  const paint: Ramp = ramp('#7a6a50', '#d8ccb0', '#fff8e8');
  p.shape(wood, (c, id) => { p.line(10, H, 16, deck, c, 4, id); p.line(58, H, 52, deck, c, 4, id); }, 1);
  p.shape(wood, (c, id) => { p.line(13, H - 12, 55, deck + 30, c, 2, id); p.line(55, H - 12, 13, deck + 30, c, 2, id); p.line(15, deck + 40, 53, deck + 40, c, 2, id); });
  // ladder
  p.shape(wood, (c, id) => { p.line(26, H, 28, deck, c, 2, id); p.line(36, H, 38, deck, c, 2, id); for (let y = deck + 6; y < H; y += 8) p.line(27, y, 37, y, c, 1, id); });
  // hut with a red stripe and a little window
  p.shape(paint, (c, id) => p.rect(14, deck - 26, 40, 26, c, id), 2);
  p.rect(14, deck - 12, 40, 4, rgb('#c02828'));
  p.rect(24, deck - 22, 20, 8, rgb('#2a3a4a')); p.rect(25, deck - 21, 6, 3, rgb('#6a9ab8'));
  p.shape(ramp('#6a1010', '#b02020', '#e85050'), (c, id) => p.poly([[8, deck - 26], [34, deck - 38], [60, deck - 26], [60, deck - 23], [8, deck - 23]], c, id), 2);
  p.shape(wood, (c, id) => p.rect(8, deck, 52, 4, c, id), 2);
  p.outline(OUT);
  return frame(p, W / 2, H);
}

function boat(): Frame {
  // the landing craft that dropped our commandos off, ramp down on the sand
  const W = 150, H = 62;
  const p = new Pix(W, H);
  const hull: Ramp = ramp('#2a3438', '#4e5e62', '#7e9094');
  p.shape(hull, (c, id) => p.poly([[4, 18], [112, 18], [112, H - 4], [16, H - 4], [4, 40]], c, id), 2);
  p.shape(steel, (c, id) => p.poly([[112, 22], [146, H - 4], [140, H - 2], [108, H - 4]], c, id), 2); // the ramp
  p.shape(hull, (c, id) => p.rect(10, 6, 22, 14, c, id), 2); // wheelhouse
  p.rect(14, 9, 14, 4, rgb('#1a2228'));
  for (let x = 20; x < 108; x += 12) p.rect(x, 24, 2, 26, hull[0]); // ribs
  p.rect(4, 30, 108, 2, rgb('#c8a020'));
  p.rect(60, 34, 14, 10, rgb('#e8e0c8')); p.rect(66, 34, 2, 10, rgb('#c02020')); p.rect(60, 38, 14, 2, rgb('#c02020')); // insignia
  // rust streaks and barnacles at the waterline
  for (let x = 6; x < 110; x++) if (hash(x, 0, 51) < 0.2) for (let y = 34; y < 34 + hash(x, 1, 52) * 18; y++) p.over(x, y, rgb('#6a4030'));
  for (let x = 16; x < 110; x += 3) if (hash(x, 2, 53) < 0.5) p.over(x, H - 6, rgb('#d8d0c0'));
  p.outline(OUT);
  return frame(p, 75, H - 2);
}

function piling(): Frame {
  const p = new Pix(12, 64);
  p.shape(wood, (c, id) => p.rect(2, 0, 8, 64, c, id), 2);
  for (let y = 4; y < 64; y += 9) p.over(3 + (y % 4), y, wood[0]);
  for (let y = 28; y < 64; y++) if (hash(y, 0, 61) < 0.35) p.over(2 + Math.floor(hash(y, 1, 62) * 8), y, rgb('#d8d4c0')); // barnacles
  for (let y = 40; y < 64; y++) p.over(2 + (y % 3), y, rgb('#3a6a3a'));
  p.outline(OUT);
  return frame(p, 6, 0);
}

function starfish(): Frame {
  const p = new Pix(16, 16);
  p.shape(ramp('#a03010', '#f07030', '#ffb070'), (c, id) => {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; p.line(8, 8, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, c, 3, id); }
  }, 2);
  p.set(8, 8, rgb('#ffe0b0')); p.set(6, 6, rgb('#ffe0b0')); p.set(10, 7, rgb('#ffe0b0'));
  p.outline(OUT);
  return frame(p, 8, 14);
}

function shells(): Frame {
  const p = new Pix(22, 10);
  p.shape(ramp('#b07a70', '#f0c0b0', '#fff0e8'), (c, id) => p.ellipse(6, 6, 5, 4, c, id), 2);
  for (let i = -3; i <= 3; i++) p.line(6, 9, 6 + i * 1.4, 3, rgb('#c8908a'));
  p.shape(ramp('#6a5a8a', '#a898c8', '#e0d8f8'), (c, id) => { p.poly([[13, 9], [21, 9], [17, 2]], c, id); }, 2);
  p.outline(OUT);
  return frame(p, 11, 9);
}

function grass(): Frame {
  // a big tuft of dune grass for the foreground
  const p = new Pix(48, 34);
  const g = [rgb('#3a5a2a'), rgb('#5a7a3a'), rgb('#8aa04a'), rgb('#c0c070')];
  const rng = new RNG(9);
  for (let i = 0; i < 22; i++) {
    const bx = rng.range(8, 40), len = rng.range(14, 32), bend = rng.range(-14, 14);
    for (let t = 0; t <= 1; t += 0.02) p.set(bx + bend * t * t, 33 - len * t, g[Math.min(3, Math.floor(t * 3.5))]);
  }
  p.outline(OUT);
  return frame(p, 24, 33);
}

function crate(): Frame {
  const p = new Pix(22, 20);
  p.shape(ramp('#4a3a1a', '#8a7038', '#c0a060'), (c, id) => p.rect(1, 1, 20, 18, c, id), 2);
  p.line(2, 2, 19, 17, rgb('#5a4422')); p.line(19, 2, 2, 17, rgb('#5a4422'));
  p.rect(1, 9, 20, 2, rgb('#5a4422'));
  p.outline(OUT);
  return frame(p, 11, 20);
}

// ---------------------------------------------------------------- critters

const crabR = [rgb('#4a0e08'), rgb('#8a1e10'), rgb('#c83a1e'), rgb('#f06a3a'), rgb('#ffa070')];

/** k: 0, 1 walk cycle, 2 claws up and snapping. */
function crab(k: number): Frame {
  const W = 34, H = 24;
  const p = new Pix(W, H);
  const cx = 17, cy = 14;
  // legs
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const up = (i + k) % 2 === 0 ? -1 : 1;
    const x0 = cx + s * (6 + i * 2), y0 = cy + 1;
    p.line(x0, y0, x0 + s * 5, y0 + 3 + up, crabR[1], 2);
    p.line(x0 + s * 5, y0 + 3 + up, x0 + s * 6, H - 1, crabR[1], 1);
  }
  // shell
  const body = p.newPart();
  p.ellipse(cx, cy, 11, 6, crabR[2], body);
  p.volume(body, crabR, { flat: 0.8 });
  // claws
  for (const s of [-1, 1]) {
    const up = k === 2;
    const ax = cx + s * 13, ay = up ? cy - 9 : cy - 3;
    p.line(cx + s * 8, cy - 2, ax, ay + 3, crabR[2], 2);
    const id = p.newPart();
    p.ellipse(ax, ay, 4, 3.5, crabR[3], id);
    p.volume(id, crabR, { flat: 0.8 });
    // pincer gap
    p.line(ax + s * 1, ay - 1, ax + s * 4, ay - (up ? 3 : 1), 0);
  }
  // eyestalks
  for (const s of [-1, 1]) { p.line(cx + s * 3, cy - 5, cx + s * 4, cy - 9, crabR[2]); p.rect(cx + s * 4 - 1, cy - 11, 2, 2, rgb('#ffffff')); p.set(cx + s * 4, cy - 10, OUT); }
  p.line(cx - 3, cy + 1, cx + 3, cy + 1, crabR[0]); // grumpy mouth
  p.outline(OUT);
  return frame(p, cx, H - 1);
}

function crabEyes(): Frame {
  const p = new Pix(14, 8);
  for (const x of [4, 9]) { p.rect(x, 3, 1, 5, crabR[2]); p.rect(x - 1, 0, 3, 3, rgb('#ffffff')); p.set(x, 1, OUT); }
  p.outline(OUT);
  return frame(p, 7, 8);
}

function fish(k: number): Frame {
  // a leaping barracuda, facing right
  const W = 36, H = 16;
  const p = new Pix(W, H);
  const silver = [rgb('#1a2a3a'), rgb('#3a5a7a'), rgb('#6a90b0'), rgb('#a8c8e0'), rgb('#e8f4ff')];
  const id = p.newPart();
  p.poly([[4, 8], [12, 4], [28, 4], [34, 8], [28, 11], [12, 11]], silver[2], id);
  p.volume(id, silver, { flat: 0.7 });
  // tail
  const tf = k ? 3 : -3;
  p.poly([[6, 8], [0, 1 + tf], [2, 8], [0, 15 + tf]], silver[1]);
  // stripes, eye, toothy jaw
  for (let x = 12; x < 26; x += 4) p.line(x, 5, x + 2, 8, silver[1]);
  p.set(29, 6, OUT); p.set(29, 5, rgb('#ffe040'));
  p.line(28, 9, 35, 9, OUT);
  for (let x = 29; x < 35; x += 2) p.set(x, 8, rgb('#ffffff'));
  p.poly([[16, 4], [20, 0], [22, 4]], silver[1]); // dorsal fin
  p.outline(OUT);
  return frame(p, 18, 8);
}

function pearl(k: number): Frame {
  const p = new Pix(12, 12);
  const cols = [rgb('#8a7a9a'), rgb('#c8bcd8'), rgb('#f0e8f4'), rgb('#ffffff')];
  const id = p.newPart();
  p.circle(6, 6, 4.2, cols[2], id);
  p.volume(id, cols, { flat: 0.9 });
  // iridescent sheen sliding around
  p.over(4 + k, 4, rgb('#ffffff')); p.over(8 - k, 8, rgb('#f0c8e0')); p.over(7, 3 + k, rgb('#c8f0f0'));
  p.outline(OUT);
  return frame(p, 6, 6);
}

function bigPearl(): Frame {
  const S = 28;
  const p = new Pix(S, S);
  const cols = [rgb('#6a5a7a'), rgb('#9a8cae'), rgb('#cabcd8'), rgb('#eee4f2'), rgb('#ffffff')];
  const id = p.newPart();
  p.circle(14, 14, 12, cols[3], id);
  p.volume(id, cols, { flat: 0.95 });
  // a faint pink swirl so you can see it rolling
  for (let t = 0; t < 1; t += 0.02) { const a = t * Math.PI * 3, r = 2 + t * 8; p.over(14 + Math.cos(a) * r, 14 + Math.sin(a) * r, rgb('#f4c8dc')); }
  p.over(9, 8, rgb('#ffffff')); p.over(10, 8, rgb('#ffffff')); p.over(9, 9, rgb('#ffffff'));
  p.outline(OUT);
  return frame(p, 14, 14);
}

function geyser(k: number): Frame {
  const W = 30, H = 104;
  const p = new Pix(W, H);
  const cols = [rgb('#2a6a9a'), rgb('#5aa0d0'), rgb('#a0d8f4'), rgb('#ffffff')];
  for (let y = 10; y < H; y++) {
    const w = 7 + Math.sin(y / 5 + k * 2) * 1.5 + (y > H - 14 ? (y - (H - 14)) * 0.6 : 0);
    for (let x = -w; x <= w; x++) {
      const s = Math.floor((y + k * 7 + Math.abs(x) * 3) / 6) % 3;
      p.set(15 + x, y, Math.abs(x) > w - 1.5 ? cols[3] : cols[s === 0 ? 2 : s === 1 ? 1 : 0]);
    }
  }
  // foaming crown and spray
  const rng = new RNG(20 + k);
  for (let i = 0; i < 40; i++) { const a = rng.range(0, Math.PI * 2), r = rng.range(0, 11); p.circle(15 + Math.cos(a) * r, 12 + Math.sin(a) * r * 0.7, rng.range(1, 2.5), i % 3 ? cols[3] : cols[2]); }
  for (let i = 0; i < 10; i++) p.set(rng.range(2, W - 2), rng.range(0, 30), cols[3]);
  return frame(p, 15, H);
}

function bubbles(k: number): Frame {
  const p = new Pix(30, 12);
  const rng = new RNG(5 + k);
  for (let i = 0; i < 9; i++) {
    const x = rng.range(4, 26), y = 11 - rng.range(0, 6 + k * 3), r = rng.range(1, 2.4);
    p.circle(x, y, r, rgb('#c8f0ff'));
    p.set(x - r * 0.4, y - r * 0.4, rgb('#ffffff'));
  }
  p.rect(2, 10, 26, 2, rgb('#7a6648'));
  return frame(p, 15, 11);
}

// ---------------------------------------------------------------- the giant clam

// The clam sits on its hinge with its two halves standing up like a fan. When it
// opens, they swing apart to show what it has been hiding. The shell is drawn as
// the left half; the right half is the same sprite, mirrored.
export const SHELL_R = 88;
const SHELL = [rgb('#3a2a3e'), rgb('#6a5068'), rgb('#9a7e8e'), rgb('#c8aca8'), rgb('#e8d4c4'), rgb('#fff4e6')];

function shellHalf(): Frame {
  const R = SHELL_R;
  const W = R + 6, H = R + 8;
  const hx = W - 2, hy = H - 4;   // the hinge
  const p = new Pix(W, H);
  const a0 = -Math.PI + 0.14, a1 = -Math.PI / 2;
  const ribs = 6;
  for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) {
    const dx = x - hx, dy = y - hy;
    const r = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    if (dx >= 0 && dy < 0) a = -Math.PI / 2 + Math.min(0.03, dx / 60); // let it overlap the seam a touch
    if (a < a0 - 0.02 || a > a1 + 0.04 || dy > 0) continue;
    const u = (a - a0) / (a1 - a0);                    // 0 at the outer side, 1 at the seam
    const rib = Math.cos(u * ribs * Math.PI * 2);
    // the rim is a deep zigzag, like a giant clam's
    const edge = R - 9 + rib * 7 - (u < 0.08 ? (0.08 - u) * 120 : 0);
    if (r > edge || r < 7) continue;
    let k = rib > 0.35 ? 4 : rib > -0.35 ? 3 : 2;
    if (r > edge - 4) k = rib > 0 ? 5 : 3;                // pale lip
    if (Math.floor(r / 9) % 2 === 0 && Math.abs(rib) < 0.8 && hash(x, y, 701) < 0.6) k--; // growth bands
    if (r < 22) k = Math.max(1, k - 2);                    // dark, crusty near the hinge
    if (u > 0.94) k = Math.max(0, k - 2);                  // shadow along the seam
    k += dth(x, y) < 0.2 ? -1 : 0;
    p.set(x, y, SHELL[Math.max(0, Math.min(5, k))]);
  }
  // barnacles and a strand of weed
  const rng = new RNG(88);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(a0 + 0.2, a1 - 0.2), r = rng.range(26, R - 20);
    const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * r;
    p.circle(x, y, 2.4, rgb('#d8d2c4')); p.over(x, y, rgb('#4a4040')); p.over(x - 1, y - 1, rgb('#ffffff'));
  }
  for (let t = 0; t < 1; t += 0.02) p.set(hx - 40 + Math.sin(t * 9) * 3, hy - 50 + t * 26, rgb('#3a7a3a'));
  p.outline(OUT);
  return frame(p, hx, hy);
}

// What the shell has been hiding: a ruffled, rosy mantle and a pair of plump lips with a
// pearl tucked between them. It's a clam. Clams look like this. Probably.
const MANTLE = [rgb('#3a0e2a'), rgb('#6a1a48'), rgb('#9a2e66'), rgb('#c85288'), rgb('#e886aa'), rgb('#ffc0d4')];
const LIP = [rgb('#6a1424'), rgb('#a02a3a'), rgb('#d04a54'), rgb('#f07a7a'), rgb('#ffaaa0'), rgb('#ffe0d8')];
const SPOT = rgb('#5ac8e8');

/** k: 0 lips pressed shut, 1 parted with the pearl showing, 2 puckered to spit. */
function lips(k: number): Frame {
  const W = 72, H = 92;
  const p = new Pix(W, H);
  const cx = W / 2, cy = 50;
  // mantle with a frilly edge and the iridescent spots giant clams have
  const m = p.newPart();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = Math.atan2(y - cy, x - cx);
    const fr = 1 + Math.sin(a * 11) * 0.05;
    const dx = (x - cx) / (33 * fr), dy = (y - cy) / (40 * fr);
    if (dx * dx + dy * dy <= 1 && y < H - 4) p.set(x, y, MANTLE[3], m);
  }
  p.volume(m, MANTLE, { flat: 0.6, pattern: (x, y) => (vnoise(x / 4, y / 4, 711) > 0.7 ? 1 : 0) });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 0.78 + (i % 3) * 0.06;
    p.over(cx + Math.cos(a) * 30 * r, cy + Math.sin(a) * 36 * r, SPOT);
  }
  // the frill: a lighter ruffled rim
  for (let t = 0; t < Math.PI * 2; t += 0.01) {
    const fr = 1 + Math.sin(t * 11) * 0.05;
    p.over(cx + Math.cos(t) * 32 * fr, cy + Math.sin(t) * 39 * fr, MANTLE[5]);
    p.over(cx + Math.cos(t) * 30 * fr, cy + Math.sin(t) * 37 * fr, MANTLE[4]);
  }
  // the opening between the lips
  const gap = [1, 7, 9][k];
  const lipH = k === 2 ? 22 : 28;
  if (k > 0) {
    p.ellipse(cx, cy, gap + 2, lipH - 2, rgb('#2a0410'));
    p.ellipse(cx, cy + 2, gap, lipH - 8, rgb('#5a0a1c'));
    // the pearl, glowing in there
    const pr = k === 2 ? 7 : 6;
    const pid = p.newPart();
    p.circle(cx, cy - (k === 2 ? 0 : 1), pr, rgb('#f0e8f4'), pid);
    p.volume(pid, [rgb('#8a7a9a'), rgb('#c8bcd8'), rgb('#f0e8f4'), rgb('#ffffff')], { flat: 0.9 });
  }
  // two plump lips, one each side
  for (const s of [-1, 1]) {
    const id = p.newPart();
    const lx = cx + s * (gap + (k === 2 ? 7 : 8));
    p.ellipse(lx, cy, k === 2 ? 9 : 10, lipH, LIP[3], id);
    if (k === 2) p.ellipse(lx - s * 3, cy, 7, lipH - 4, LIP[3], id); // pushed forward into an O
    p.volume(id, LIP, { flat: 0.75 });
    // a glossy highlight and a crease
    for (let y = -lipH + 8; y < lipH - 10; y += 2) p.over(lx - 4 + Math.round(Math.sin(y / 6)), cy + y, LIP[5]);
    p.over(lx + s * 4, cy - lipH + 6, LIP[1]); p.over(lx + s * 4, cy + lipH - 6, LIP[1]);
  }
  p.outline(OUT);
  return frame(p, cx, H - 4);
}

export function buildBeach(): BeachArt {
  return {
    sky: skyCanvas(), islands: islandsCanvas(),
    palm: [palm(1), palm(2)], hedgehog: hedgehog(), tower: tower(), boat: boat(), piling: piling(), starfish: starfish(), shells: shells(), grass: grass(), crate: crate(),
    crab: [crab(0), crab(1), crab(2)], crabEyes: crabEyes(), fish: [fish(0), fish(1)],
    pearl: [pearl(0), pearl(1)], bigPearl: bigPearl(), geyser: [geyser(0), geyser(1), geyser(2)], bubbles: [bubbles(0), bubbles(1)],
    shell: shellHalf(), lips: [lips(0), lips(1), lips(2)],
  };
}
