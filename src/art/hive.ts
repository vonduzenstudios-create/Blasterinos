import { Pix, rgb, ramp, mix, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { vnoise, hash, TS, SOLID, ONEWAY, TILE_PAINTERS, type TileGetter } from './tiles';

// Stage 5, "The Hive": the inside of an alien nest. Resin honeycomb walls, slime,
// glowing pods, the armored brood pods the hatchlings burst from, and the Hive Queen.
// Everything is painted here at boot, the first time the stage is entered.

export const HT = { RESIN: 40, RIB: 41 } as const;
SOLID.add(HT.RESIN);
ONEWAY.add(HT.RIB);

export interface HiveArt {
  sky: HTMLCanvasElement; far: HTMLCanvasElement; near: HTMLCanvasElement;
  pod: Frame[]; tendril: Frame; eggCluster: Frame; bones: Frame;
  /** closed, charging, open, dead. Drawn pointing up, anchored at the base. */
  broodPod: Frame[];
  hatchling: Frame[]; hatchlingCurl: Frame; splat: Frame[];
  pustule: Frame[];
  egg: Frame[]; plasma: Frame[];
  abdomen: Frame; torso: Frame; core: Frame[]; head: Frame[]; arm: Frame; leg: Frame;
}

const C = {
  resin: [rgb('#120814'), rgb('#22102a'), rgb('#341a3e'), rgb('#4a2652'), rgb('#64366a'), rgb('#84508a')],
  slime: [rgb('#2a4a14'), rgb('#4a7a1e'), rgb('#7ab42c'), rgb('#b8e858'), rgb('#eaffa8')],
  vein: rgb('#7a2a5a'),
  bone: [rgb('#4a3a2a'), rgb('#8a7458'), rgb('#c8b08a'), rgb('#eee0c0')],
  membrane: [rgb('#3a1630'), rgb('#5a2448')],
};
// dark, glossy blue-black chitin, the Queen's and her brood's
const CHITIN = [rgb('#04060a'), rgb('#0a1018'), rgb('#141e2a'), rgb('#20303e'), rgb('#304656'), rgb('#4a6a7a'), rgb('#7aa4b0')];
const ICHOR = [rgb('#0a2a1a'), rgb('#1a5a2a'), rgb('#3aa040'), rgb('#8ae050'), rgb('#e8ffa0')];
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
    p.ellipse(x, y, 5, 7, CHITIN[4], id);
    p.volume(id, CHITIN.slice(1), { flat: 0.8 });
    // the four-way seam on top glows faintly
    p.over(x, y - 6, ICHOR[2]); p.over(x - 1, y - 5, ICHOR[1]); p.over(x + 1, y - 5, ICHOR[1]); p.over(x, y - 4, ICHOR[1]);
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

// ---------------------------------------------------------------- the brood pods

/**
 * Armored brood pods grown into the hive walls. Four plated flaps seal the top;
 * when one is ready the seams light up, the flaps peel back, and a hatchling bursts out.
 * k: 0 closed, 1 charging, 2 open, 3 dead.
 */
function broodPod(k: number): Frame {
  const W = 36, H = 36;
  const p = new Pix(W, H);
  const cx = W / 2, cy = 20;
  const dead = k === 3;
  const cols = dead ? [rgb('#08080a'), rgb('#141416'), rgb('#222226'), rgb('#323236'), rgb('#46464a'), rgb('#5a5a5e')] : CHITIN.slice(0, 6);
  // resin roots gripping the wall
  for (let i = 0; i < 6; i++) p.line(cx - 12 + i * 5, H - 1, cx - 8 + i * 3, H - 8, C.resin[3 + (i & 1)], 2);
  // the shell, ribbed with ring plates
  const shell = p.newPart();
  p.ellipse(cx, cy, 12, 14, cols[3], shell);
  p.volume(shell, cols, { flat: 0.85, pattern: (_x, y) => ((y - cy + 40) % 7 === 0 ? -2 : 0) });
  // glowing veins under the plates
  if (!dead) for (const side of [-1, 1]) for (let y = cy - 8; y < cy + 12; y++) p.over(cx + side * (7 + Math.sin(y / 3) * 1.5), y, k === 1 ? ICHOR[3] : ICHOR[1]);
  if (k === 2) {
    // flaps peeled back, the glowing membrane inside torn open
    p.ellipse(cx, cy - 8, 8, 5, ICHOR[0]);
    p.ellipse(cx, cy - 7, 5, 3, rgb('#020604'));
    p.set(cx, cy - 7, ICHOR[3]);
    for (const a of [-2.4, -1.9, -1.2, -0.7]) {
      const x0 = cx + Math.cos(a) * 7, y0 = cy - 8 + Math.sin(a) * 3;
      p.shape([cols[1], cols[3], cols[5]], (c, id) => p.poly([[x0 - 2, y0 + 2], [x0 + 2, y0 + 2], [x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 6 - 2]], c, id));
    }
    for (let i = 0; i < 4; i++) p.over(cx - 6 + i * 4, cy - 4, ICHOR[2]);
  } else {
    // the cross-shaped seam where the four flaps meet
    const seam = dead ? cols[0] : k === 1 ? ICHOR[4] : ICHOR[2];
    for (let i = -5; i <= 5; i++) { p.over(cx + i, cy - 9 + Math.abs(i) * 0.3, seam); }
    for (let i = -4; i <= 4; i++) p.over(cx, cy - 9 + i, seam);
    if (k === 1) { p.over(cx - 1, cy - 9, ICHOR[3]); p.over(cx + 1, cy - 9, ICHOR[3]); }
    if (dead) for (let i = 0; i < 9; i++) p.over(cx - 3 + i * 0.8 + (i % 2), cy - 2 + i, rgb('#5a5a5e'));
  }
  // a hard sheen on the shell
  if (!dead) for (let i = 0; i < 5; i++) p.over(cx - 7 + i * 0.5, cy - 8 + i * 2, cols[5]);
  p.outline(OUTLINE);
  return frame(p, cx, H);
}

// ---------------------------------------------------------------- the hatchlings

/** A sleek armored hatchling: plated back, long glowing-eyed skull, a whip of a tail. Facing right. */
function hatchling(k: number): Frame {
  const W = 34, H = 18;
  const p = new Pix(W, H);
  // tail first, behind everything
  p.shape([CHITIN[1], CHITIN[2], CHITIN[4]], (c, id) => { for (let i = 0; i < 10; i++) p.line(9 - i, 9 - Math.sin(i / 3 + k) * 2 - i * 0.3, 8 - i, 9 - Math.sin((i + 1) / 3 + k) * 2 - (i + 1) * 0.3, c, i < 4 ? 3 : 2, id); });
  p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, id) => p.poly([[0, 4], [3, 2], [3, 6]], c, id));
  // legs: two pairs, scuttling
  const lg = [[12, 3], [18, -3], [22, 3], [27, -2]];
  lg.forEach(([x, ph], i) => { const o = (k ? ph : -ph) * 0.6; p.line(x, 11, x + o - 2, 16, CHITIN[2], 2); p.set(x + o - 3, 17, CHITIN[1]); if (i % 2) p.set(x + o - 2, 17, CHITIN[1]); });
  // the body: overlapping armored plates
  for (let i = 0; i < 3; i++) {
    const id = p.newPart();
    p.ellipse(11 + i * 5, 9, 5, 4, CHITIN[3], id);
    p.volume(id, CHITIN.slice(0, 6), { flat: 0.85 });
  }
  // the long skull
  const sk = p.newPart();
  p.ellipse(27, 8, 6, 3.5, CHITIN[3], sk);
  p.poly([[26, 5], [33, 8], [26, 11]], CHITIN[3], sk);
  p.volume(sk, CHITIN.slice(0, 7), { flat: 0.8 });
  // glowing eye slit and jaws
  p.set(28, 7, ICHOR[4]); p.set(29, 7, ICHOR[3]); p.set(27, 7, ICHOR[2]);
  p.set(32, 10, rgb('#e8e8e0')); p.set(30, 10, rgb('#e8e8e0'));
  // ridge spines along the back
  for (let i = 0; i < 4; i++) p.set(10 + i * 4, 4, CHITIN[5]);
  p.outline(OUTLINE);
  return frame(p, 18, 17);
}

/** Rolled into a spiked ball while it flies. */
function hatchlingCurl(): Frame {
  const p = new Pix(20, 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, id) => p.poly([[10 + Math.cos(a - 0.3) * 6, 10 + Math.sin(a - 0.3) * 6], [10 + Math.cos(a + 0.3) * 6, 10 + Math.sin(a + 0.3) * 6], [10 + Math.cos(a) * 9.5, 10 + Math.sin(a) * 9.5]], c, id));
  }
  const id = p.newPart();
  p.circle(10, 10, 6.5, CHITIN[3], id);
  p.volume(id, CHITIN.slice(0, 6), { flat: 0.85, pattern: (x, y) => (Math.abs(Math.hypot(x - 10, y - 10) - 3.5) < 0.6 ? -2 : 0) });
  p.set(12, 8, ICHOR[4]); p.set(13, 8, ICHOR[3]);
  p.outline(OUTLINE);
  return frame(p, 10, 10);
}

/** A spray of glowing ichor. */
function splat(k: number): Frame {
  const S = 34, c = S / 2;
  const p = new Pix(S, S);
  const rng = new RNG(11);
  const r = 4 + k * 3;
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0.3, 1) * r, s = rng.range(1.5, 3.5) * (1 - k * 0.18);
    const col = i % 3 === 0 ? ICHOR[3] : i % 3 === 1 ? ICHOR[2] : CHITIN[4];
    if (s > 0.5) p.circle(c + Math.cos(a) * d, c + Math.sin(a) * d, s, col);
  }
  if (k < 2) p.circle(c, c, 5 - k * 2, ICHOR[4]);
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
  p.ellipse(8, 9 + k * 0.5, 6, 7.5 - k * 0.5, CHITIN[4], id);
  p.volume(id, CHITIN.slice(1), { flat: 0.8 });
  // glowing seams, brighter as it gets ready to split
  for (let y = 3; y < 15; y++) p.over(8 + Math.sin(y / 2) * 0.8, y, k ? ICHOR[3] : ICHOR[1]);
  p.over(5, 8, ICHOR[1]); p.over(11, 10, ICHOR[1]);
  p.outline(OUTLINE);
  return frame(p, 8, 9);
}

/** A tongue of green plasma: the shockwave the Queen drives along the floor. */
function plasma(k: number): Frame {
  const W = 44, H = 40;
  const p = new Pix(W, H);
  const rng = new RNG(60 + k);
  for (let x = 0; x < W; x++) {
    const e = 1 - Math.abs(x - W / 2) / (W / 2);
    const h = Math.max(0, e * 30 + Math.sin(x / 3 + k * 2) * 5 + rng.range(-3, 3) + 4);
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(1, h);
      const c = t < 0.3 ? rgb('#ffffff') : t < 0.55 ? ICHOR[4] : t < 0.8 ? ICHOR[3] : ICHOR[2];
      if (t > 0.85 && dth(x + k, y) > 0.5) continue;
      p.set(x, H - 1 - y, c);
    }
  }
  return frame(p, W / 2, H);
}

// ---------------------------------------------------------------- the Hive Queen

/** Her swollen egg sac, trailing out behind her: ribbed plates over a glowing belly. */
function abdomen(): Frame {
  const W = 170, H = 96;
  const p = new Pix(W, H);
  const cx = W / 2, cy = H / 2;
  const id = p.newPart();
  p.ellipse(cx, cy, 82, 44, CHITIN[3], id);
  p.volume(id, CHITIN, { flat: 0.95, pattern: (x) => ((x + 200) % 16 < 2 ? -3 : 0) });
  // the translucent underside, eggs glowing within
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / 76, dy = (y - cy - 10) / 30;
    if (dx * dx + dy * dy < 1 && y > cy + 4 && p.get(x, y) !== 0) {
      // eggs packed in unevenly, glowing through the membrane
      const row = Math.floor((y + 2) / 12), cx2 = (x + 4 + (row & 1) * 7 + Math.floor(hash(row, 0, 501) * 6)) % 14;
      const r = 3 + hash(Math.floor((x + 4 + (row & 1) * 7) / 14), row, 502) * 2;
      const d = Math.hypot(cx2 - 7, ((y + 2) % 12) - 6);
      const glow = 0.5 + 0.5 * vnoise(x / 18, y / 10, 503);
      p.set(x, y, d < r ? (d < r * 0.5 ? ICHOR[3] : glow > 0.5 ? ICHOR[2] : ICHOR[1]) : d < r + 1 ? ICHOR[0] : mix(ICHOR[0], CHITIN[2], 0.6));
    }
  }
  // spines down the top
  for (let i = 0; i < 8; i++) {
    const x = 26 + i * 16, y = cy - 42 + Math.pow((x - cx) / 82, 2) * 28;
    p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.poly([[x - 3, y + 4], [x + 3, y + 4], [x + 4, y - 7]], c, s));
  }
  p.outline(OUTLINE);
  return frame(p, cx, cy);
}

/** The armored thorax, with an opening at its heart where the core sits. */
function torso(): Frame {
  const W = 96, H = 104;
  const p = new Pix(W, H);
  const cx = W / 2;
  const id = p.newPart();
  p.poly([[cx - 26, 6], [cx + 26, 6], [cx + 42, 40], [cx + 34, 84], [cx + 16, H - 2], [cx - 16, H - 2], [cx - 34, 84], [cx - 42, 40]], CHITIN[3], id);
  p.volume(id, CHITIN, { flat: 0.9, pattern: (x, y) => ((y + 100) % 13 < 2 && Math.abs(x - cx) > 14 ? -2 : Math.abs(x - cx) < 1 && y < 40 ? -2 : 0) });
  // shoulder spikes and a ridged spine down the middle
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bx = cx + side * (22 + i * 7), by = 10 + i * 6;
    p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.poly([[bx - 3, by + 4], [bx + 3, by + 4], [bx + side * (6 + i * 3), by - 12 + i * 2]], c, s));
  }
  for (let y = 10; y < 40; y += 5) p.over(cx, y, CHITIN[5]);
  // the socket around the core
  p.ellipse(cx, 62, 19, 21, CHITIN[0]);
  p.ellipse(cx, 62, 16, 18, ICHOR[0]);
  // rib plates curving around it
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const y = 46 + i * 10;
    p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.line(cx + side * 20, y, cx + side * 36, y + 6, c, 3, s));
  }
  p.outline(OUTLINE);
  return frame(p, cx, H / 2);
}

/** The core: 0 sealed under armor plates, 1 seams glowing, 2 laid open and pulsing. */
function core(k: number): Frame {
  const W = 36, H = 40;
  const p = new Pix(W, H);
  const cx = W / 2, cy = H / 2;
  if (k === 2) {
    const id = p.newPart();
    p.ellipse(cx, cy, 13, 15, ICHOR[3], id);
    p.volume(id, [ICHOR[0], ICHOR[1], ICHOR[2], ICHOR[3], ICHOR[4], rgb('#ffffff')], { flat: 0.6 });
    for (let i = 0; i < 6; i++) { const a = i; for (let r = 4; r < 13; r++) p.over(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.1 + Math.sin(r) * 0.8, ICHOR[1]); }
    p.circle(cx - 3, cy - 5, 2, rgb('#ffffff'));
  } else {
    // four armor plates locked over it
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.poly([[cx + sx, cy + sy], [cx + sx * 14, cy + sy * 2], [cx + sx * 12, cy + sy * 13], [cx + sx * 2, cy + sy * 16]], c, s), 2);
    }
    const seam = k === 1 ? ICHOR[4] : ICHOR[1];
    for (let i = -14; i <= 14; i++) { p.over(cx, cy + i, seam); p.over(cx + i * 0.9, cy, seam); }
    if (k === 1) p.circle(cx, cy, 2, ICHOR[4]);
  }
  p.outline(OUTLINE);
  return frame(p, cx, cy);
}

/** Her head in profile, facing left: a long crested skull. k: 0 idle, 1 shrieking. */
function head(k: number): Frame {
  const W = 86, H = 60;
  const p = new Pix(W, H);
  // crest of swept-back spines
  for (let i = 0; i < 6; i++) {
    const bx = 40 + i * 6, by = 18 + i * 1.5;
    p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.poly([[bx - 4, by + 4], [bx + 4, by + 4], [bx + 14 + i * 3, by - 14 + i * 2]], c, s));
  }
  // the long smooth skull, pointing left
  const sk = p.newPart();
  p.ellipse(46, 26, 28, 12, CHITIN[3], sk);
  p.poly([[22, 20], [6, 30], [22, 34]], CHITIN[3], sk);
  p.ellipse(70, 30, 12, 14, CHITIN[3], sk);
  p.volume(sk, CHITIN, { flat: 0.85, pattern: (x, y) => (Math.abs(y - 26 - (x - 46) * 0.05) < 0.6 && x > 30 ? -2 : 0) });
  // lower jaw, dropping open to shriek
  const drop = k ? 9 : 2;
  p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => p.poly([[14, 34 + drop * 0.3], [50, 34], [58, 40], [22, 40 + drop]], c, s));
  // teeth
  for (let i = 0; i < 6; i++) { p.set(14 + i * 5, 33, rgb('#e8e8e0')); p.set(18 + i * 5, 37 + drop * (1 - i / 7), rgb('#c8c8c0')); }
  if (k) {
    // the inner mouth, glowing, pushing forward
    p.ellipse(26, 37, 9, 3 + drop * 0.25, rgb('#020604'));
    p.shape([ICHOR[1], ICHOR[2], ICHOR[4]], (c, s) => { p.line(34, 37, 12, 37, c, 3, s); p.circle(12, 37, 2.5, c, s); });
  }
  // eye slits, burning green
  for (let i = 0; i < 7; i++) p.set(28 + i, 23 + Math.round(i * 0.3), i < 5 ? ICHOR[4] : ICHOR[2]);
  p.set(29, 22, ICHOR[3]);
  p.outline(OUTLINE);
  return frame(p, 70, 34);
}

/** A scythe forelimb hanging from the shoulder at the anchor, blade toward the floor. */
function arm(): Frame {
  const W = 40, H = 92;
  const p = new Pix(W, H);
  p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => { p.line(20, 4, 26, 42, c, 8, s); p.circle(20, 5, 5, c, s); }, 2);
  p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => { p.line(26, 42, 16, 62, c, 6, s); p.circle(26, 42, 4.5, c, s); }, 2);
  // the blade: a long hooked edge
  const B: Ramp = ramp('#1a2a30', '#7aa4b0', '#e8fbff');
  p.shape(B, (c, s) => p.poly([[13, 58], [20, 60], [12, 82], [2, 90], [6, 78]], c, s), 2);
  for (let y = 62; y < 86; y++) p.over(12 - (y - 62) * 0.35, y, rgb('#ffffff'));
  p.outline(OUTLINE);
  return frame(p, 20, 5);
}

/** Jointed insect leg, drawn pointing right from the hip at (3, 8). */
function leg(): Frame {
  const W = 62, H = 30;
  const p = new Pix(W, H);
  p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => { p.line(3, 8, 32, 4, c, 6, s); }, 2);
  p.shape([CHITIN[1], CHITIN[3], CHITIN[5]], (c, s) => { p.line(32, 4, 54, 24, c, 4, s); p.circle(32, 4, 3.5, c, s); }, 2);
  p.shape([CHITIN[2], CHITIN[4], CHITIN[6]], (c, s) => p.poly([[52, 22], [57, 23], [60, 29]], c, s));
  p.outline(OUTLINE);
  return frame(p, 3, 8);
}

let cache: HiveArt | null = null;
export function buildHive(): HiveArt {
  if (cache) return cache;
  cache = {
    sky: skyCanvas(), far: farCanvas(), near: nearCanvas(),
    pod: [pod(0), pod(1)], tendril: tendril(), eggCluster: eggCluster(), bones: bones(),
    broodPod: [0, 1, 2, 3].map(broodPod),
    hatchling: [hatchling(0), hatchling(1)], hatchlingCurl: hatchlingCurl(), splat: [0, 1, 2, 3].map(splat),
    pustule: [0, 1, 2, 3].map(pustule),
    egg: [egg(0), egg(1)], plasma: [plasma(0), plasma(1), plasma(2)],
    abdomen: abdomen(), torso: torso(), core: [core(0), core(1), core(2)], head: [head(0), head(1)], arm: arm(), leg: leg(),
  };
  return cache;
}
