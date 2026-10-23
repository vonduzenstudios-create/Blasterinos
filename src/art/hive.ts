import { Pix, rgb, ramp, mix, withAlpha, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { vnoise, hash, TS, SOLID, ONEWAY, TILE_PAINTERS, type TileGetter } from './tiles';

// Stage 5, "The Hive": the inside of an alien nest. Resin honeycomb walls, slime,
// glowing pods, the orifices the bugs come out of, and the Hive Mother herself.
// Everything is painted here at boot, the first time the stage is entered.

export const HT = { RESIN: 40, RIB: 41 } as const;
SOLID.add(HT.RESIN);
ONEWAY.add(HT.RIB);

export interface HiveArt {
  sky: HTMLCanvasElement; far: HTMLCanvasElement; near: HTMLCanvasElement;
  pod: Frame[]; tendril: Frame; eggCluster: Frame; bones: Frame;
  /** clenched, straining, open, sealed (dead). Drawn pointing up, anchored at the base. */
  orifice: Frame[];
  grub: Frame[]; grubCurl: Frame; splat: Frame[];
  pustule: Frame[];
  egg: Frame[]; gas: Frame[];
  lobe: Frame; vent: Frame[]; thorax: Frame; head: Frame[]; leg: Frame;
}

const C = {
  resin: [rgb('#120814'), rgb('#22102a'), rgb('#341a3e'), rgb('#4a2652'), rgb('#64366a'), rgb('#84508a')],
  slime: [rgb('#2a4a14'), rgb('#4a7a1e'), rgb('#7ab42c'), rgb('#b8e858'), rgb('#eaffa8')],
  vein: rgb('#7a2a5a'),
  bone: [rgb('#4a3a2a'), rgb('#8a7458'), rgb('#c8b08a'), rgb('#eee0c0')],
  membrane: [rgb('#3a1630'), rgb('#5a2448')],
};
// Hive Mother chitin, glossy magenta with dark banding
const CHITIN = [rgb('#140616'), rgb('#2c0e34'), rgb('#461a50'), rgb('#62286c'), rgb('#82408a'), rgb('#a862a8'), rgb('#d898d0')];
// sphincter flesh
const PUCKER = [rgb('#2a0c10'), rgb('#561c20'), rgb('#84343a'), rgb('#b05a58'), rgb('#d68878'), rgb('#f4b8a2')];
// the grubs: brown, glossy, segmented
const GRUB = [rgb('#1e1006'), rgb('#3a2210'), rgb('#5a3818'), rgb('#7a5226'), rgb('#9c6c34'), rgb('#c4924e')];
const GLOW: Ramp = ramp('#3a7a1a', '#8ae040', '#e8ffa0');

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dth = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;

// ---------------------------------------------------------------- tiles

/** Honeycomb resin, wet slime on top, drips hanging off the underside. */
function paintResin(p: Pix, get: TileGetter, tx: number, ty: number, ox: number, oy: number) {
  const open = (t: number) => !SOLID.has(t);
  const top = open(get(tx, ty - 1)), bottom = open(get(tx, ty + 1)), left = open(get(tx - 1, ty)), right = open(get(tx + 1, ty));
  const R = C.resin;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x, wy = ty * TS + y;
    // warped hex-ish cells: offset rows of 8x7 cells, nudged by noise so nothing lines up
    const wy2 = wy + Math.round(vnoise(wx / 9, wy / 9, 401) * 3);
    const row = Math.floor(wy2 / 7);
    const wx2 = wx + (row & 1) * 4 + Math.round(vnoise(wx / 7, wy / 11, 402) * 2);
    const lx = ((wx2 % 8) + 8) % 8, ly = ((wy2 % 7) + 7) % 7;
    let k: number;
    if (lx === 0 || ly === 0) k = 4;           // cell wall catches the light
    else if (lx === 7 || ly === 6) k = 0;      // and casts a shadow
    else if (lx === 1 || ly === 1) k = 1;
    else k = 2 + (hash(Math.floor(wx2 / 8), row, 403) < 0.18 ? 1 : 0);
    // the deeper rows sink into darkness
    const depth = (ty - 12) * TS + y;
    if (depth > 20 && hash(wx, wy, 404) < Math.min(0.7, (depth - 20) / 50)) k = Math.max(0, k - 1);
    let c = R[k];
    // a few cells glow, a few are capped with slime
    const cellH = hash(Math.floor(wx2 / 8), row, 405);
    if (cellH > 0.985 && k >= 1 && k <= 3) c = mix(GLOW[0], GLOW[1], ly / 7);
    p.set(ox + x, oy + y, c);
  }
  // fat veins crawling across the resin
  if (hash(tx, ty, 406) < 0.3) {
    let y = oy + 3 + Math.floor(hash(tx, ty, 407) * 10);
    for (let x = 0; x < TS; x++) { p.set(ox + x, y, C.vein); p.set(ox + x, y + 1, mix(C.vein, R[1], 0.5)); if (hash(tx * TS + x, ty, 408) < 0.25) y += hash(x, ty, 409) < 0.5 ? -1 : 1; y = Math.max(oy, Math.min(oy + TS - 2, y)); }
  }
  if (left) for (let y = 0; y < TS; y++) { p.set(ox, oy + y, R[5]); p.set(ox + 1, oy + y, R[4]); }
  if (right) for (let y = 0; y < TS; y++) { p.set(ox + TS - 1, oy + y, R[0]); p.set(ox + TS - 2, oy + y, R[1]); }
  const S = C.slime;
  if (top) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    const d = 3 + Math.round(vnoise(wx / 4, ty, 410) * 3);
    for (let y = 0; y < d; y++) p.set(ox + x, oy + y, y === 0 ? S[3] : y === 1 ? S[2] : y < d - 1 ? S[1] : S[0]);
    if (hash(wx, ty, 411) < 0.1) p.set(ox + x, oy, S[4]);
    // goo running down into the cells
    if (hash(wx, ty, 412) < 0.12) for (let y = d; y < d + 2 + hash(wx, ty, 413) * 6; y++) p.set(ox + x, oy + y, S[1]);
    // bubbles on the surface
    if (hash(wx, ty, 414) < 0.05) { p.set(ox + x, oy - 1, S[2]); p.set(ox + x, oy - 2, S[3]); }
  }
  if (bottom) for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    p.set(ox + x, oy + TS - 1, R[0]);
    // slime strands hanging off the ceiling
    if (hash(wx, ty, 415) < 0.22) {
      const len = 2 + Math.floor(hash(wx, ty, 416) * 9);
      for (let y = 0; y < len; y++) p.set(ox + x, oy + TS + y, y === len - 1 ? S[3] : S[1]);
      if (len > 6) { p.set(ox + x, oy + TS + len, S[2]); }
    }
  }
}

/** A curved rib of bone with a sagging membrane: one-way platform. */
function paintRib(p: Pix, get: TileGetter, tx: number, ty: number, ox: number, oy: number) {
  const endL = get(tx - 1, ty) !== HT.RIB, endR = get(tx + 1, ty) !== HT.RIB;
  const B = C.bone;
  for (let x = 0; x < TS; x++) {
    const wx = tx * TS + x;
    // knuckles every 8 px
    const knob = (wx % 8 === 0 || wx % 8 === 7) ? 1 : 0;
    for (let y = -knob; y < 5 + knob; y++) {
      const c = y <= 0 ? B[3] : y === 1 ? B[2] : y < 4 ? B[1] : B[0];
      p.set(ox + x, oy + y, c);
    }
    if (wx % 8 === 0) p.set(ox + x, oy + 2, B[0]);
    // membrane sagging between knuckles
    const sag = Math.round(Math.sin(((wx % 16) / 16) * Math.PI) * 4) + 3;
    for (let y = 5; y < 5 + sag; y++) if (((x + y) & 1) === 0 || y < 7) p.set(ox + x, oy + y, y < 7 ? C.membrane[1] : C.membrane[0]);
  }
  if (endL) for (let y = -1; y < 6; y++) p.set(ox, oy + y, B[0]);
  if (endR) for (let y = -1; y < 6; y++) p.set(ox + TS - 1, oy + y, B[0]);
}

TILE_PAINTERS.set(HT.RESIN, paintResin);
TILE_PAINTERS.set(HT.RIB, paintRib);

// ---------------------------------------------------------------- backdrops

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

/** The far wall of the nest: endless honeycomb fading into the dark, a few cells lit. */
function skyCanvas(): HTMLCanvasElement {
  const W = 512, H = 216;
  const p = new Pix(W, H);
  const stops: [number, string][] = [[0, '#06030a'], [0.35, '#160a1e'], [0.7, '#24102a'], [1, '#0c0610']];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, gradient(stops, y / H, x, y));
  // hex cells, 14 px, outlines only
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor(y / 12);
    const xx = x + (row & 1) * 8;
    const lx = ((xx % 16) + 16) % 16, ly = y % 12;
    const glow = 0.5 + 0.5 * Math.sin(y / H * Math.PI);
    if (lx === 0 || ly === 0) p.set(x, y, mix(p.get(x, y), rgb('#3a1c44'), 0.55 * glow));
    else if (lx === 1 || ly === 1) p.set(x, y, mix(p.get(x, y), rgb('#2c1434'), 0.4 * glow));
    // lit cells: something inside is glowing
    const cell = hash(Math.floor(xx / 16), row, 420);
    if (cell > 0.965 && lx > 2 && ly > 2 && lx < 15 && ly < 11) {
      const d = Math.hypot((lx - 8.5) / 6, (ly - 6.5) / 4);
      if (d < 1) p.set(x, y, mix(p.get(x, y), d < 0.45 ? rgb('#c8f070') : rgb('#5aa030'), (cell > 0.985 ? 0.9 : 0.5) * (d < 0.45 ? 1 : 0.7)));
    }
  }
  return p.toCanvas();
}

/** Huge ribbed arches and resin pillars. */
function farCanvas(): HTMLCanvasElement {
  const W = 512, H = 180;
  const p = new Pix(W, H);
  const col = [rgb('#1a0c1e'), rgb('#26122c'), rgb('#341a3c'), rgb('#44244c')];
  // arches: rows of ribs curving down from the top
  for (let i = 0; i < 4; i++) {
    const cx = i * 128 + 64;
    for (let a = 0; a <= 1; a += 0.004) {
      for (const side of [-1, 1]) {
        const x = cx + side * Math.sin(a * Math.PI / 2) * 70;
        const y = -10 + (1 - Math.cos(a * Math.PI / 2)) * 150;
        const th = 5 - a * 2;
        for (let d = -th; d <= th; d++) {
          const px = wrap(x + d, W), py = Math.round(y);
          if (py < 0 || py >= H) continue;
          const k = d < -th * 0.4 ? 3 : d < th * 0.3 ? 2 : 1;
          p.set(px, py, col[k]);
          p.set(px, py + 1, col[k]);
        }
        // knobbly vertebrae along the arch
        if (Math.round(a * 250) % 12 === 0) p.circle(wrap(x, W), Math.round(y), 4, col[3]);
      }
    }
  }
  // pillars of dripping resin rising from the bottom
  const rng = new RNG(77);
  for (let i = 0; i < 6; i++) {
    const cx = rng.range(0, W), w = rng.range(10, 22), top = rng.range(60, 120);
    for (let y = Math.round(top); y < H; y++) {
      const hw = w * (0.6 + 0.4 * ((y - top) / (H - top))) + Math.sin(y / 6 + i) * 1.5;
      for (let dx = -hw; dx <= hw; dx++) {
        const x = wrap(cx + dx, W);
        const k = dx < -hw * 0.5 ? 2 : dx < hw * 0.4 ? 1 : 0;
        p.set(x, y, col[k]);
      }
    }
    p.ellipse(wrap(cx, W), Math.round(top), w * 0.7, 5, col[2]);
  }
  // glowing pods hung in the arches
  for (let i = 0; i < 10; i++) {
    const x = rng.range(0, W), y = rng.range(40, 140), r = rng.range(2, 4);
    for (let dy = -r * 1.4; dy <= r * 1.4; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx / r, dy / (r * 1.4));
      if (d <= 1) p.set(wrap(x + dx, W), Math.round(y + dy), mix(rgb('#a8e050'), rgb('#3a6a20'), d));
    }
    for (let k = 1; k < 10; k++) p.set(wrap(x, W), Math.round(y - r * 1.4 - k), col[1]);
  }
  return p.toCanvas();
}

/** Close tendrils and fleshy columns, dark, scrolling fast. */
function nearCanvas(): HTMLCanvasElement {
  const W = 512, H = 200;
  const p = new Pix(W, H);
  const col = [rgb('#0e060e'), rgb('#180a1a'), rgb('#241028')];
  const rng = new RNG(91);
  // hanging tendrils from the top
  for (let i = 0; i < 14; i++) {
    const x0 = rng.range(0, W), len = rng.range(30, 90), th = rng.range(2, 5), ph = rng.range(0, 6);
    for (let y = 0; y < len; y++) {
      const x = x0 + Math.sin(y / 10 + ph) * 4;
      const t = th * (1 - y / len * 0.7);
      for (let d = -t; d <= t; d++) p.set(wrap(x + d, W), y, col[d < 0 ? 2 : 1]);
    }
    p.circle(wrap(x0 + Math.sin(len / 10 + ph) * 4, W), Math.round(len), th * 0.8, col[2]);
    if (rng.next() < 0.5) p.set(wrap(x0 + Math.sin(len / 10 + ph) * 4, W), Math.round(len + th), rgb('#6aa030'));
  }
  // lumpy growths along the bottom
  for (let x = 0; x < W; x++) {
    const h = 26 + Math.round((vnoise(x / 30, 0.5, 430) * 0.6 + vnoise(x / 9, 0.5, 431) * 0.4) * 40);
    for (let y = H - h; y < H; y++) p.set(x, y, y < H - h + 2 ? col[2] : col[y > H - h + 12 ? 0 : 1]);
  }
  return p.toCanvas();
}

// ---------------------------------------------------------------- props

function pod(k: number): Frame {
  const p = new Pix(18, 26);
  // a glowing sac on a stalk
  for (let y = 16; y < 26; y++) p.set(9 + Math.round(Math.sin(y / 3) * 1), y, C.resin[3]);
  const id = p.newPart();
  p.ellipse(9, 10, 6 + k * 0.5, 8 + k * 0.5, GLOW[1], id);
  p.volume(id, [rgb('#2a5a14'), GLOW[0], rgb('#5aa830'), GLOW[1], rgb('#c0f070'), GLOW[2]], { flat: 0.8 });
  // a dark shape curled inside
  p.over(9, 11, rgb('#1a3a0a')); p.over(10, 10, rgb('#1a3a0a')); p.over(8, 12, rgb('#2a4a10')); p.over(10, 12, rgb('#2a4a10'));
  p.outline(OUTLINE);
  return frame(p, 9, 26);
}

function tendril(): Frame {
  const p = new Pix(14, 60);
  for (let y = 0; y < 60; y++) {
    const x = 7 + Math.sin(y / 8) * 3;
    const t = 3 - y / 30;
    for (let d = -t; d <= t; d++) p.set(Math.round(x + d), y, d < 0 ? C.resin[4] : C.resin[2]);
  }
  p.set(7 + Math.round(Math.sin(59 / 8) * 3), 59, C.slime[3]);
  p.outline(OUTLINE);
  return frame(p, 7, 0);
}

function eggCluster(): Frame {
  const p = new Pix(44, 22);
  const rng = new RNG(5);
  for (let i = 0; i < 7; i++) {
    const x = 6 + i * 5 + rng.range(-1, 1), y = 13 - (i % 2) * 3;
    const id = p.newPart();
    p.ellipse(x, y, 5, 7, rgb('#b8b888'), id);
    p.volume(id, [rgb('#3a4020'), rgb('#6a7040'), rgb('#9aa060'), rgb('#c8c890'), rgb('#eef0c0')], { flat: 0.8 });
    p.over(x, y - 7, rgb('#5a6030'));
  }
  for (let x = 0; x < 44; x++) for (let y = 18; y < 22; y++) p.set(x, y, y === 18 ? C.slime[2] : C.slime[1]);
  p.outline(OUTLINE);
  return frame(p, 22, 22);
}

function bones(): Frame {
  const p = new Pix(40, 14);
  const B = C.bone;
  // a picked-clean soldier's helmet and a few bones. Not everyone made it this far.
  p.shape(ramp('#2a3418', '#4e6030', '#7e9448'), (c, id) => { p.ellipse(10, 9, 8, 6, c, id); p.rect(1, 9, 19, 2, c, id); }, 2);
  p.shape([B[1], B[2], B[3]], (c, id) => { p.line(20, 12, 36, 9, c, 2, id); p.circle(20, 12, 2, c, id); p.circle(36, 9, 2, c, id); });
  p.shape([B[1], B[2], B[3]], (c, id) => { p.line(24, 13, 32, 13, c, 2, id); });
  for (let x = 0; x < 40; x++) p.set(x, 13, C.slime[1]);
  p.outline(OUTLINE);
  return frame(p, 20, 14);
}

// ---------------------------------------------------------------- the orifices

/**
 * The holes the bugs come out of: a puckered ring nestled between two round,
 * fleshy mounds. It is a nest vent. It is definitely a nest vent.
 * k: 0 clenched, 1 straining, 2 open, 3 sealed.
 */
function orifice(k: number): Frame {
  const W = 44, H = 30;
  const p = new Pix(W, H);
  const cx = W / 2;
  const strain = k === 1 ? 1 : 0;
  // the two cheeks
  for (const side of [-1, 1]) {
    const id = p.newPart();
    p.ellipse(cx + side * (10 + strain), 18 - strain, 12 + strain, 11 + strain, PUCKER[3], id);
    p.volume(id, k === 3 ? [rgb('#1a1418'), rgb('#3a2e32'), rgb('#5a4a4c'), rgb('#7a6a6a'), rgb('#9a8a88')] : PUCKER, { flat: 0.8 });
  }
  // resin base it grows out of
  for (let x = 0; x < W; x++) for (let y = 26; y < H; y++) p.set(x, y, y === 26 ? C.resin[4] : C.resin[2]);
  // the cleft between them
  for (let y = 9 + strain; y < 27; y++) p.set(cx, y, PUCKER[0]);
  // the ring itself, at the top of the cleft
  const ry = 9 - strain;
  const rr = k === 2 ? 7 : k === 1 ? 6 : 5;
  const ring = p.newPart();
  p.ellipse(cx, ry, rr, rr * 0.62, PUCKER[4], ring);
  p.volume(ring, k === 3 ? [rgb('#2a2224'), rgb('#4a3c3e'), rgb('#6a5a5a')] : [PUCKER[1], PUCKER[2], PUCKER[3], PUCKER[4], PUCKER[5]], { flat: 0.6 });
  // wrinkles radiating from the middle
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    for (let r = (k === 2 ? 3.5 : 1); r < rr; r += 0.5) p.over(cx + Math.cos(a) * r, ry + Math.sin(a) * r * 0.62, PUCKER[k === 1 ? 2 : 1]);
  }
  if (k === 0) { p.set(cx, ry, PUCKER[0]); p.set(cx - 1, ry, PUCKER[1]); p.set(cx + 1, ry, PUCKER[1]); }
  else if (k === 1) {
    // bulging, flushed, and something is pressing from the inside
    p.ellipse(cx, ry, 2, 1.2, GRUB[2]);
    p.set(cx, ry - 1, GRUB[4]);
  } else if (k === 2) {
    p.ellipse(cx, ry, 4, 2.6, PUCKER[0]);
    p.ellipse(cx, ry + 0.5, 2.5, 1.5, rgb('#0a0204'));
    // a drip of goo
    p.set(cx + 3, ry + 3, C.slime[2]); p.set(cx + 3, ry + 4, C.slime[3]);
  } else {
    // scabbed over for good
    p.ellipse(cx, ry, 3, 2, rgb('#2a2a1a'));
    p.set(cx - 1, ry, rgb('#5a5a3a')); p.set(cx + 1, ry - 1, rgb('#5a5a3a'));
  }
  // a little sheen on each cheek
  if (k !== 3) for (const side of [-1, 1]) { p.over(cx + side * 10 - 4, 12, PUCKER[5]); p.over(cx + side * 10 - 3, 11, PUCKER[5]); }
  p.outline(OUTLINE);
  return frame(p, cx, H);
}

// ---------------------------------------------------------------- the grubs

/** Glossy brown, segmented, about the size and shape you'd expect. With eyes. Facing right. */
function grub(k: number): Frame {
  const W = 26, H = 16;
  const p = new Pix(W, H);
  const segs: [number, number, number, number][] = [[5, 11, 4, 3.5], [10, 10 - k, 5, 4.5], [16, 10, 5.5, 5], [21, 10 + k * 0.5, 4.5, 4.5]];
  for (const [x, y, rx, ry] of segs) {
    const id = p.newPart();
    p.ellipse(x, y, rx, ry, GRUB[3], id);
    p.volume(id, GRUB, { flat: 0.85 });
  }
  // the little curl on top of the back
  const tip = p.newPart();
  p.ellipse(9, 5 - k, 2.5, 2.2, GRUB[3], tip);
  p.volume(tip, GRUB, { flat: 0.9 });
  p.set(7, 3 - k, GRUB[2]);
  // bug eyes and mandibles at the front
  p.circle(22, 7, 2.2, rgb('#f8f8e8')); p.circle(25, 8, 1.8, rgb('#f8f8e8'));
  p.set(23, 7, OUTLINE); p.set(25, 8, OUTLINE);
  p.set(25, 12, GRUB[5]); p.set(26, 13, GRUB[1]);
  // stubby legs
  for (let i = 0; i < 4; i++) p.set(6 + i * 5 + (k ? 1 : 0), 15, GRUB[1]);
  p.outline(OUTLINE);
  return frame(p, 14, 15);
}

/** Curled up, tumbling through the air. */
function grubCurl(): Frame {
  const p = new Pix(18, 18);
  const id = p.newPart();
  p.circle(9, 9, 7, GRUB[3], id);
  p.volume(id, GRUB, { flat: 0.85, pattern: (x, y) => (Math.abs(Math.hypot(x - 9, y - 9) - 4) < 0.7 ? -2 : 0) });
  p.circle(12, 7, 1.6, rgb('#f8f8e8')); p.set(12, 7, OUTLINE);
  p.outline(OUTLINE);
  return frame(p, 9, 9);
}

function splat(k: number): Frame {
  const S = 34, c = S / 2;
  const p = new Pix(S, S);
  const rng = new RNG(11);
  const r = 4 + k * 3;
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0.3, 1) * r, s = rng.range(1.5, 3.5) * (1 - k * 0.18);
    const col = i % 3 === 0 ? C.slime[2] : i % 3 === 1 ? GRUB[2] : GRUB[4];
    if (s > 0.5) p.circle(c + Math.cos(a) * d, c + Math.sin(a) * d, s, col);
  }
  if (k < 2) p.circle(c, c, 5 - k * 2, C.slime[3]);
  return frame(p, c, c);
}

function pustule(k: number): Frame {
  const W = 30, H = 30;
  const p = new Pix(W, H);
  const cx = W / 2;
  if (k < 3) {
    const r = 7 + k * 2.2;
    const id = p.newPart();
    p.ellipse(cx, H - 2 - r, r, r * 1.05, GLOW[1], id);
    p.volume(id, [rgb('#1a3a0a'), rgb('#2e5a14'), rgb('#4a8a20'), rgb('#78c030'), rgb('#b0e860'), rgb('#e8ffa8')], { flat: 0.75 });
    // veins
    for (let i = 0; i < 3; i++) for (let y = 0; y < r * 1.6; y++) p.over(cx - r * 0.6 + i * r * 0.6 + Math.sin(y / 2 + i) * 1, H - 3 - y, mix(C.vein, GLOW[1], 0.3));
    // pore on top
    p.over(cx, H - 2 - r * 2, rgb('#1a3a0a')); p.over(cx + 1, H - 2 - r * 2 + 1, rgb('#1a3a0a'));
  } else {
    // burst: a deflated skin
    p.shape(ramp('#1a3a0a', '#3a6a1a', '#6aa030'), (c, id) => p.ellipse(cx, H - 3, 9, 3, c, id), 2);
    p.set(cx - 4, H - 6, C.slime[3]); p.set(cx + 3, H - 7, C.slime[3]);
  }
  for (let x = 4; x < W - 4; x++) p.set(x, H - 1, C.resin[3]);
  p.outline(OUTLINE);
  return frame(p, cx, H);
}

function egg(k: number): Frame {
  const p = new Pix(16, 18);
  const id = p.newPart();
  p.ellipse(8, 9 + k * 0.5, 6, 7.5 - k * 0.5, rgb('#c8c890'), id);
  p.volume(id, [rgb('#3a4020'), rgb('#6a7040'), rgb('#9aa060'), rgb('#c8c890'), rgb('#eef0c0')], { flat: 0.8 });
  for (let y = 4; y < 15; y++) p.over(5 + Math.sin(y / 2) * 1, y, rgb('#7a6a3a'));
  // a shadow squirming inside
  p.over(9, 9 + k, rgb('#6a6a3a')); p.over(10, 10 + k, rgb('#6a6a3a'));
  p.outline(OUTLINE);
  return frame(p, 8, 9);
}

/** Green gas, dithered so the hive shows through. */
function gas(k: number): Frame {
  const W = 52, H = 38;
  const p = new Pix(W, H);
  const rng = new RNG(60 + k);
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) puffs.push([rng.range(12, W - 12), rng.range(14, H - 10), rng.range(8, 13)]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 9;
    for (const [px, py, r] of puffs) best = Math.min(best, Math.hypot(x - px, y - py) / r);
    if (best > 1) continue;
    const edge = best > 0.82;
    if (edge && dth(x + k, y) > 0.5) continue;
    const shade = (y / H) + (best * 0.4);
    const c = shade < 0.45 ? rgb('#d8f878') : shade < 0.75 ? rgb('#9ad040') : rgb('#5a9a28');
    p.set(x, y, withAlpha(c, edge ? 0.55 : 0.85));
  }
  return frame(p, W / 2, H);
}

// ---------------------------------------------------------------- the Hive Mother

/**
 * One half of the Mother's colossal abdomen, seen from behind. The two halves sit
 * side by side. Insects have abdomens. That is all this is.
 */
function lobe(): Frame {
  const W = 104, H = 104, r = 49;
  const p = new Pix(W, H);
  const cx = W / 2, cy = H / 2;
  const id = p.newPart();
  p.circle(cx, cy, r, CHITIN[3], id);
  // banded chitin plates curving around it like a wasp's
  p.volume(id, CHITIN, {
    flat: 0.95,
    pattern: (x, y) => {
      const dy = y - cy + Math.pow(Math.abs(x - cx) / r, 2) * 10;
      const band = ((dy + 200) % 22);
      return band < 2.5 ? -3 : band < 4 ? -1 : 0;
    },
  });
  // a big wet sheen
  for (let i = 0; i < 18; i++) for (let j = 0; j < 3; j++) p.over(cx - 26 + i + j, cy - 30 + Math.round(Math.pow((i - 9) / 9, 2) * 6) + j, j === 1 ? CHITIN[6] : CHITIN[5]);
  p.over(cx - 30, cy - 18, CHITIN[6]); p.over(cx - 31, cy - 15, CHITIN[5]);
  p.outline(OUTLINE);
  return frame(p, cx, cy);
}

/** 0 clenched, 1 straining, 2 wide open. */
function vent(k: number): Frame {
  const W = 40, H = 34;
  const p = new Pix(W, H);
  const cx = W / 2, cy = H / 2;
  const rx = 10 + k * 3, ry = 8 + k * 2.5;
  const ring = p.newPart();
  p.ellipse(cx, cy, rx, ry, PUCKER[3], ring);
  p.volume(ring, k === 1 ? [PUCKER[2], PUCKER[3], PUCKER[4], PUCKER[5], rgb('#ffd8c8')] : [PUCKER[1], PUCKER[2], PUCKER[3], PUCKER[4], PUCKER[5]], { flat: 0.55 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    for (let r = k === 2 ? 0.55 : 0.1; r < 1; r += 0.08) p.over(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, PUCKER[1]);
  }
  if (k === 2) {
    p.ellipse(cx, cy, rx * 0.5, ry * 0.5, PUCKER[0]);
    p.ellipse(cx, cy + 1, rx * 0.32, ry * 0.32, rgb('#060102'));
    // glowing green deep inside, and drool
    p.set(cx, cy + 1, GLOW[1]); p.set(cx - 1, cy + 1, GLOW[0]);
    for (let y = 0; y < 6; y++) p.set(cx + 2, cy + ry * 0.5 + y, y > 3 ? C.slime[3] : C.slime[2]);
  } else {
    p.set(cx, cy, PUCKER[0]); p.set(cx - 1, cy, PUCKER[1]); p.set(cx + 1, cy, PUCKER[1]);
    if (k === 1) { p.ellipse(cx, cy, 2.5, 1.5, GLOW[0]); p.set(cx, cy - 1, GLOW[1]); }
  }
  p.outline(OUTLINE);
  return frame(p, cx, cy);
}

function thorax(): Frame {
  const W = 92, H = 52;
  const p = new Pix(W, H);
  const id = p.newPart();
  p.ellipse(W / 2, 30, 40, 20, CHITIN[3], id);
  p.volume(id, CHITIN, { flat: 0.9, pattern: (x) => (Math.abs(x - W / 2) < 1 ? -2 : 0) });
  // a ridge of spines
  for (let i = -3; i <= 3; i++) {
    const x = W / 2 + i * 10, base = 14 + Math.abs(i) * 2;
    p.shape(ramp('#2a1a10', '#8a7458', '#eee0c0'), (c, s) => p.poly([[x - 3, base + 2], [x + 3, base + 2], [x + i * 1.5, base - 10 + Math.abs(i)]], c, s));
  }
  p.outline(OUTLINE);
  return frame(p, W / 2, 30);
}

/** Looking back over her shoulder at you. k: 0 idle, 1 screeching. */
function head(k: number): Frame {
  const W = 64, H = 56;
  const p = new Pix(W, H);
  const cx = W / 2;
  // crest
  for (let i = -2; i <= 2; i++) p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => p.poly([[cx + i * 7 - 4, 16], [cx + i * 7 + 4, 16], [cx + i * 9, 2 + Math.abs(i) * 3]], c, s));
  const skull = p.newPart();
  p.ellipse(cx, 24, 22, 15, CHITIN[3], skull);
  p.ellipse(cx, 34, 15, 10, CHITIN[3], skull);
  p.volume(skull, CHITIN, { flat: 0.85 });
  // mandibles, wider apart when screeching
  const sp = k ? 7 : 2;
  for (const side of [-1, 1]) {
    p.shape(ramp('#2a1a10', '#8a7458', '#eee0c0'), (c, s) => p.poly([[cx + side * 7, 38], [cx + side * 13, 38], [cx + side * (6 + sp), 52], [cx + side * (3 + sp * 0.6), 50]], c, s));
  }
  if (k) {
    // the maw between them, glowing green, with strings of drool
    p.ellipse(cx, 44, 6, 7, rgb('#1a0408'));
    p.ellipse(cx, 45, 3, 4, GLOW[1]);
    p.line(cx - 4, 40, cx - 3, 52, C.slime[2]); p.line(cx + 3, 40, cx + 4, 50, C.slime[2]);
  }
  // big glowing compound eyes
  for (const side of [-1, 1]) {
    const id = p.newPart();
    p.ellipse(cx + side * 12, 24, 7, 5, GLOW[1], id);
    p.volume(id, [rgb('#1a4a0a'), GLOW[0], GLOW[1], GLOW[2], rgb('#ffffff')], { flat: 0.7, pattern: (x, y) => ((x + y) % 3 === 0 ? -1 : 0) });
    // the slant makes her look cross
    for (let i = 0; i < 9; i++) p.set(cx + side * (6 + i), 18 + Math.round(i * 0.35), CHITIN[0]);
  }
  p.outline(OUTLINE);
  return frame(p, cx, 30);
}

/** Jointed insect leg, drawn pointing right from the hip at (0, 5). */
function leg(): Frame {
  const W = 62, H = 30;
  const p = new Pix(W, H);
  p.shape([CHITIN[1], CHITIN[2], CHITIN[4]], (c, s) => { p.line(3, 8, 32, 4, c, 6, s); }, 2);
  p.shape([CHITIN[1], CHITIN[2], CHITIN[4]], (c, s) => { p.line(32, 4, 54, 24, c, 4, s); p.circle(32, 4, 3.5, c, s); }, 2);
  p.shape(ramp('#2a1a10', '#8a7458', '#eee0c0'), (c, s) => p.poly([[52, 22], [57, 23], [60, 29]], c, s));
  p.outline(OUTLINE);
  return frame(p, 3, 8);
}

let cache: HiveArt | null = null;
export function buildHive(): HiveArt {
  if (cache) return cache;
  cache = {
    sky: skyCanvas(), far: farCanvas(), near: nearCanvas(),
    pod: [pod(0), pod(1)], tendril: tendril(), eggCluster: eggCluster(), bones: bones(),
    orifice: [0, 1, 2, 3].map(orifice),
    grub: [grub(0), grub(1)], grubCurl: grubCurl(), splat: [0, 1, 2, 3].map(splat),
    pustule: [0, 1, 2, 3].map(pustule),
    egg: [egg(0), egg(1)], gas: [gas(0), gas(1), gas(2)],
    lobe: lobe(), vent: [vent(0), vent(1), vent(2)], thorax: thorax(), head: [head(0), head(1)], leg: leg(),
  };
  return cache;
}
