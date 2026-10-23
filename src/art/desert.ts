import { Pix, rgb, ramp, mix, RNG, frame, type Frame, type Ramp } from '../engine/pixel';
import { OUTLINE, drawHumanoid, AX, AY, type Look } from './humanoid';
import { vnoise, hash } from './tiles';
import { dither } from './backgrounds';

// Stage 2, "Scorched Dunes": the desert backdrops, props, the jeep, the enemy
// vehicles and the sandworm. Everything is painted here at boot.

export interface DesertArt {
  sky: HTMLCanvasElement; mesas: HTMLCanvasElement; dunes: HTMLCanvasElement; near: HTMLCanvasElement;
  cactus: Frame[]; ribs: Frame; skull: Frame; sign: Frame; wreck: Frame; barrel: Frame; tower: Frame; boulder: Frame[];
  jeep: Frame[]; jeepWreck: Frame; driver: Frame;
  bike: Frame[];
  heli: Frame; heliRotor: Frame[]; heliWreck: Frame;
  bomb: Frame[]; sandball: Frame[];
  wormSeg: Frame[]; wormHead: Frame[]; mound: Frame; ripple: Frame[]; larva: Frame[];
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dth = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

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
function loopNoise(x: number, w: number, scale: number, seed: number) {
  const a = vnoise(x / scale, 0.5, seed), b = vnoise((x - w) / scale, 0.5, seed);
  return a * (1 - x / w) + b * (x / w);
}
const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;

// ---------------------------------------------------------------- backdrops

function skyCanvas(): HTMLCanvasElement {
  const W = 512, H = 216;
  const p = new Pix(W, H);
  const stops: [number, string][] = [[0, '#14306e'], [0.3, '#2c5aa8'], [0.55, '#6a96d0'], [0.72, '#d8b8a0'], [0.85, '#f6d494'], [1, '#fff0c0']];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, gradient(stops, y / H, x, y));
  // a fierce sun with dithered halo rings
  const sx = 380, sy = 54;
  for (let y = sy - 44; y < sy + 44; y++) for (let x = sx - 44; x < sx + 44; x++) {
    const d = Math.hypot(x - sx, y - sy);
    if (d < 15) p.set(x, y, d < 12 ? rgb('#fffef0') : rgb('#fff4b0'));
    else if (d < 44 && (44 - d) / 29 * 0.55 > dth(x, y)) p.set(x, y, mix(p.get(x, y), rgb('#fff0c0'), d < 24 ? 0.6 : 0.3));
  }
  // thin high streaks of cloud
  const rng = new RNG(31);
  for (let i = 0; i < 9; i++) {
    const cx = rng.range(0, W), cy = rng.range(18, 90), len = rng.range(40, 110);
    for (let x = 0; x < len; x++) {
      const th = Math.sin((x / len) * Math.PI) * 2.2;
      for (let y = -th; y <= th; y++) if (hash(x, y | 0, i) < 0.85) p.set(wrap(cx + x, W), Math.round(cy + y + x * 0.04), mix(p.get(wrap(cx + x, W), Math.round(cy + y)), rgb('#f8f0ff'), y < 0 ? 0.55 : 0.3));
    }
  }
  return p.toCanvas();
}

function mesasCanvas(): HTMLCanvasElement {
  const W = 512, H = 120;
  const p = new Pix(W, H);
  const rows = [
    { base: 30, col: '#b98a90', hi: '#d8a8a0', sh: '#a07480', seed: 3, n: 5 },
    { base: 52, col: '#a0605a', hi: '#c88068', sh: '#844a4c', seed: 4, n: 4 },
  ];
  for (const r of rows) {
    const rng = new RNG(r.seed);
    const tops = new Float32Array(W).fill(H);
    // flat-topped buttes with steep sides and talus skirts
    for (let i = 0; i < r.n; i++) {
      const cx = rng.range(0, W), hw = rng.range(18, 52), top = r.base + rng.range(-10, 20);
      for (let dx = -hw - 40; dx <= hw + 40; dx++) {
        const x = wrap(cx + dx, W);
        const a = Math.abs(dx);
        const h = a <= hw ? top + (a > hw - 4 ? (a - hw + 4) * 2 : 0) : top + 8 + (a - hw) * 1.4 + (a - hw) * (a - hw) * 0.02;
        tops[x] = Math.min(tops[x], h);
      }
    }
    // low rolling floor between buttes
    for (let x = 0; x < W; x++) tops[x] = Math.min(tops[x], H - 26 - loopNoise(x, W, 40, r.seed + 9) * 16);
    for (let x = 0; x < W; x++) for (let y = Math.floor(tops[x]); y < H; y++) {
      const lit = x > 0 && tops[(x + 1) % W] > tops[x] + 0.5; // right-facing slopes catch the sun
      const band = Math.floor((y + vnoise(x / 30, 0, r.seed) * 4) / 6) % 3 === 0;
      p.set(x, y, lit ? rgb(r.hi) : band ? rgb(r.sh) : rgb(r.col));
    }
  }
  return p.toCanvas();
}

function dunesCanvas(): HTMLCanvasElement {
  const W = 512, H = 110;
  const p = new Pix(W, H);
  const layers = [
    { base: 34, amp: 26, sc: 60, cols: ['#c28a58', '#e2b07a', '#a46e44'], seed: 12 },
    { base: 58, amp: 22, sc: 44, cols: ['#d29a5c', '#f2c682', '#b47a46'], seed: 13 },
  ];
  for (const L of layers) {
    const h = (x: number) => L.base + (1 - (loopNoise(x, W, L.sc, L.seed) * 0.8 + loopNoise(x, W, L.sc / 3, L.seed + 1) * 0.2)) * L.amp;
    for (let x = 0; x < W; x++) {
      const top = Math.floor(h(x));
      const slope = h(wrap(x + 2, W)) - h(wrap(x - 2, W));
      for (let y = top; y < H; y++) {
        // dunes have a hard crest: lit windward side, shaded lee side
        const depth = (y - top) / 22 + vnoise(x / 5, y / 3, L.seed) * 0.4;
        const c = y === top ? L.cols[1] : slope > 0.25 && depth < 0.7 + dither(x, y) * 0.3 ? L.cols[1] : slope < -0.25 && depth < 0.8 + dither(x, y) * 0.3 ? L.cols[2] : L.cols[0];
        p.set(x, y, rgb(c));
        // wind ripples follow the dune surface
        if (y > top + 3 && Math.abs(((y - top) + vnoise(x / 12, 0, L.seed + 5) * 6) % 7 - 3.5) < 0.5 && hash(x, y, 3) < 0.7) p.set(x, y, mix(rgb(c), rgb(L.cols[1]), 0.45));
      }
    }
  }
  return p.toCanvas();
}

function nearCanvas(): HTMLCanvasElement {
  const W = 512, H = 100;
  const p = new Pix(W, H);
  const base = rgb('#9a5e30'), lit = rgb('#c08048'), dark = rgb('#6e3e20');
  for (let x = 0; x < W; x++) {
    const top = Math.floor(52 + loopNoise(x, W, 50, 21) * 26 + loopNoise(x, W, 9, 22) * 5);
    for (let y = top; y < H; y++) p.set(x, y, y < top + 2 ? lit : vnoise(x / 3, y / 2, 23) > 0.72 ? dark : base);
  }
  // rock outcrops
  const rng = new RNG(5);
  for (let i = 0; i < 6; i++) {
    const cx = rng.range(0, W), w = rng.range(10, 22), h = rng.range(10, 24);
    for (let dx = -w; dx <= w; dx++) {
      const t = 1 - Math.abs(dx) / w;
      for (let y = Math.floor(70 - h * Math.sqrt(t)); y < 80; y++) p.set(wrap(cx + dx, W), y, dx < -w * 0.3 ? rgb('#c88454') : dx > w * 0.4 ? rgb('#5a3018') : rgb('#7a4424'));
    }
  }
  // telegraph poles: they whip past during the jeep ride
  for (let i = 0; i < 4; i++) {
    const px = 40 + i * 128;
    for (let y = 8; y < 74; y++) { p.set(px, y, rgb('#4a2c18')); p.set(px + 1, y, rgb('#2e1a0e')); }
    for (let x = -6; x <= 7; x++) { p.set(px + x, 12, rgb('#3a2212')); p.set(px + x, 13, rgb('#2e1a0e')); }
    p.set(px - 5, 11, rgb('#d8d0c0')); p.set(px + 6, 11, rgb('#d8d0c0'));
    // sagging wires to the next pole
    for (let x = 0; x < 128; x++) {
      const sag = Math.sin((x / 128) * Math.PI) * 9;
      p.set(wrap(px - 5 + x, W), Math.round(12 + sag), rgb('#3a2a20'));
      p.set(wrap(px + 6 + x, W), Math.round(12 + sag + 1), rgb('#3a2a20'));
    }
  }
  return p.toCanvas();
}

// ---------------------------------------------------------------- props

const sandR: Ramp = ramp('#8a5428', '#c88a48', '#f0c078');
const boneR: Ramp = ramp('#8a7a5a', '#d8ccae', '#fff8e8');
const metalR: Ramp = ramp('#2a2e3a', '#5a6074', '#9aa2b8');
const darkMetal: Ramp = ramp('#16181e', '#2e323e', '#4a5064');

function cactus(seed: number): Frame {
  const W = 34, H = 60;
  const p = new Pix(W, H);
  const rng = new RNG(seed);
  const cols = [rgb('#16341c'), rgb('#215028'), rgb('#2e6e34'), rgb('#4a9244'), rgb('#7cbc5a')];
  const id = p.newPart();
  const cx = 17;
  p.rect(cx - 5, 8, 10, H - 8, cols[2], id);
  p.circle(cx, 9, 5, cols[2], id);
  const arm = (dir: number, y: number, up: number) => {
    p.rect(dir > 0 ? cx + 4 : cx - 12, y, 8, 6, cols[2], id);
    const ax = cx + dir * 11;
    p.rect(ax - 3, y - up, 6, up + 6, cols[2], id);
    p.circle(ax, y - up, 3, cols[2], id);
  };
  arm(-1, 28 + rng.int(-4, 4), rng.int(10, 16));
  if (seed % 2) arm(1, 20 + rng.int(-3, 3), rng.int(8, 13));
  p.volume(id, cols, { flat: 0.7 });
  // ribs and spines
  for (let y = 4; y < H; y++) for (let x = 0; x < W; x++) if (p.part[y * W + x] === id && (x - cx + 40) % 3 === 0 && hash(x, y, seed) < 0.6) p.set(x, y, cols[1], id);
  for (let i = 0; i < 26; i++) { const x = rng.int(4, W - 4), y = rng.int(4, H - 2); if (p.part[y * W + x] === id) p.set(x, y, rgb('#f0f0c8'), id); }
  p.set(cx, 3, rgb('#ff6a8a')); p.set(cx - 1, 4, rgb('#ffb0c0')); p.set(cx + 1, 4, rgb('#ffb0c0')); // flower
  p.outline(OUTLINE);
  return frame(p, cx, H);
}

function ribs(): Frame {
  // the bleached ribcage of something enormous: a hint of what lives under the sand
  const W = 140, H = 70;
  const p = new Pix(W, H);
  p.shape(boneR, (c, id) => { for (let x = 6; x < W - 6; x++) p.circle(x, 58 - Math.sin((x / W) * Math.PI) * 10, 3, c, id); }, 2);
  for (let i = 0; i < 9; i++) {
    const bx = 14 + i * 14, by = 56 - Math.sin((bx / W) * Math.PI) * 10;
    const h = 30 + Math.sin((i / 8) * Math.PI) * 18;
    p.shape(boneR, (c, id) => {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = bx + Math.sin(t * 2.2) * 12, y = by - t * h;
        p.circle(x, y, 2.2 - t, c, id);
      }
    }, 1);
  }
  for (let x = 0; x < W; x++) for (let y = 60; y < H; y++) if (hash(x, y, 4) < 0.5 && y > 62 + Math.sin(x / 7) * 2) p.set(x, y, sandR[1]);
  p.outline(OUTLINE);
  return frame(p, W / 2, H);
}

function skull(): Frame {
  const p = new Pix(30, 16);
  p.shape(boneR, (c, id) => { p.ellipse(15, 9, 6, 5, c, id); p.rect(12, 9, 6, 6, c, id); }, 2);
  p.shape(boneR, (c, id) => { p.line(10, 6, 2, 3, c, 2, id); p.line(2, 3, 1, 0, c, 1, id); p.line(20, 6, 28, 3, c, 2, id); p.line(28, 3, 29, 0, c, 1, id); });
  p.rect(12, 8, 2, 2, OUTLINE); p.rect(17, 8, 2, 2, OUTLINE); p.set(14, 13, OUTLINE); p.set(16, 13, OUTLINE);
  p.outline(OUTLINE);
  return frame(p, 15, 16);
}

function sign(): Frame {
  // WORM CROSSING. Someone thought this was a good idea.
  const p = new Pix(36, 52);
  p.shape(ramp('#3a2414', '#6a4428', '#946238'), (c, id) => p.rect(16, 22, 4, 30, c, id), 2);
  p.shape(ramp('#a07010', '#f0c020', '#fff080'), (c, id) => p.poly([[18, 1], [35, 18], [18, 35], [1, 18]], c, id));
  p.poly([[18, 4], [32, 18], [18, 32], [4, 18]], rgb('#f0c020'));
  for (let i = 0; i < 4; i++) { p.line(18, 1 + i, 35 - i, 18, OUTLINE); }
  // the silhouette on the sign: a worm arching out of a dune
  p.ellipse(18, 26, 9, 2, OUTLINE);
  for (let t = 0; t <= 1; t += 0.03) { const a = Math.PI * (1 - t); p.circle(18 + Math.cos(a) * 7, 25 - Math.sin(a) * 12, 1.6, OUTLINE); }
  p.circle(25, 25, 2, OUTLINE);
  p.outline(OUTLINE);
  // bullet holes
  p.set(12, 14, rgb('#3a2a10')); p.set(23, 11, rgb('#3a2a10')); p.set(21, 20, rgb('#3a2a10'));
  return frame(p, 18, 52);
}

function wreck(): Frame {
  const p = new Pix(84, 38);
  const rust: Ramp = ramp('#3a1a10', '#6a3418', '#9a5428');
  p.shape(rust, (c, id) => { p.rect(6, 14, 64, 16, c, id); p.rect(20, 4, 30, 12, c, id); }, 2);
  p.shape(darkMetal, (c, id) => p.line(48, 8, 80, 2, c, 3, id), 1); // crooked gun barrel
  p.shape(darkMetal, (c, id) => { for (const x of [14, 30, 46, 62]) p.circle(x, 30, 6, c, id); }, 1);
  for (let i = 0; i < 160; i++) { const x = (i * 37) % 84, y = (i * 13) % 38; if (p.get(x, y) !== 0 && hash(x, y, 7) < 0.5) p.set(x, y, rgb('#2a1a14')); }
  p.rect(30, 8, 8, 5, OUTLINE);
  for (let x = 0; x < 84; x++) for (let y = 30; y < 38; y++) if (y > 33 + Math.sin(x / 5) * 2) p.set(x, y, sandR[1]);
  p.outline(OUTLINE);
  return frame(p, 42, 38);
}

function barrel(): Frame {
  const p = new Pix(16, 20);
  p.shape(ramp('#5a0e0e', '#b02222', '#f05a4a'), (c, id) => p.rect(2, 1, 12, 19, c, id), 2);
  p.rect(2, 5, 12, 1, rgb('#3a0808')); p.rect(2, 14, 12, 1, rgb('#3a0808'));
  p.rect(6, 8, 4, 4, rgb('#ffd040')); p.set(7, 9, OUTLINE); p.set(8, 10, OUTLINE);
  p.outline(OUTLINE);
  return frame(p, 8, 20);
}

/** A wooden lookout. A rifleman stands at its top, TOWER_TOP pixels above the ground. */
export const TOWER_TOP = 58;
function tower(): Frame {
  const W = 44, H = 80;
  const p = new Pix(W, H);
  const wood: Ramp = ramp('#3a2414', '#6a4428', '#946238');
  p.shape(wood, (c, id) => { p.line(8, H, 12, H - TOWER_TOP, c, 3, id); p.line(36, H, 32, H - TOWER_TOP, c, 3, id); }, 1);
  p.shape(wood, (c, id) => { p.line(10, H - 10, 34, H - 40, c, 2, id); p.line(34, H - 10, 10, H - 40, c, 2, id); });
  p.shape(wood, (c, id) => p.rect(4, H - TOWER_TOP, 36, 5, c, id), 2);
  // canvas roof on poles
  p.shape(wood, (c, id) => { p.rect(6, H - TOWER_TOP - 30, 2, 30, c, id); p.rect(36, H - TOWER_TOP - 30, 2, 30, c, id); });
  p.shape(ramp('#6a5a30', '#a89058', '#d8c088'), (c, id) => p.poly([[2, H - TOWER_TOP - 28], [22, H - TOWER_TOP - 36], [42, H - TOWER_TOP - 28], [42, H - TOWER_TOP - 24], [2, H - TOWER_TOP - 24]], c, id), 2);
  p.outline(OUTLINE);
  return frame(p, 22, H);
}

function boulder(seed: number): Frame {
  const W = 52, H = 44;
  const p = new Pix(W, H);
  const cols = [rgb('#4a2016'), rgb('#7a3420'), rgb('#a4502c'), rgb('#c87444'), rgb('#e8a068')];
  const id = p.newPart();
  p.ellipse(26, 24, 24 + (seed % 2), 19, cols[2], id);
  p.volume(id, cols, { flat: 0.8, pattern: (x, y) => (Math.floor((y + vnoise(x / 9, 0, seed) * 5) / 5) % 3 === 0 ? -1 : 0) });
  for (let x = 0; x < W; x++) for (let y = 36; y < H; y++) if (y > 38 + Math.sin(x / 6 + seed) * 2) p.set(x, y, sandR[2]);
  p.outline(OUTLINE);
  return frame(p, 26, H);
}

// ---------------------------------------------------------------- jeep

const olive: Ramp = ramp('#2a3418', '#4e6030', '#7e9448');
const tire: Ramp = ramp('#101014', '#24242c', '#3e3e4a');
export const JEEP_DECK = 22; // deck height above the ground line
const driverLook: Look = {
  skin: ramp('#6a3a24', '#a0603a', '#c88a5a'),
  hair: ramp('#1a1a1a', '#2a2a2a', '#3a3a3a'),
  head: 'beret',
  headColor: ramp('#3a0a0a', '#7a1a1a', '#b03a2a'),
  accent: ramp('#8a6a00', '#f0c020', '#fff080'),
  torso: ramp('#2a3418', '#4e6030', '#7e9448'),
  vest: ramp('#22281a', '#3a4428', '#566238'),
  pants: ramp('#2a3418', '#4e6030', '#7e9448'),
  boots: ramp('#141418', '#2a2a32', '#44444e'),
  gun: ramp('#22232c', '#4a4c5a', '#8a8ea0'),
  bulk: 0,
};

function wheel(p: Pix, cx: number, cy: number, r: number, k: number) {
  p.shape(tire, (c, id) => p.circle(cx, cy, r, c, id), 2);
  p.circle(cx, cy, r - 3.5, metalR[0]);
  p.circle(cx, cy, r - 4.5, metalR[1]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + (k / 4) * (Math.PI / 2);
    p.set(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), tire[2]);
    p.set(cx - Math.cos(a) * (r - 1), cy - Math.sin(a) * (r - 1), tire[2]);
  }
  p.set(cx, cy, metalR[2]);
}

function jeep(k: number, wrecked = false): Frame {
  const W = 92, H = 44;
  const p = new Pix(W, H);
  const gy = H; // ground line
  // rear bed (the player rides here), cab, hood
  p.shape(olive, (c, id) => {
    p.rect(4, gy - JEEP_DECK, 40, 14, c, id);           // bed
    p.rect(40, gy - 26, 14, 18, c, id);                  // cab doors
    p.poly([[52, gy - 26], [86, gy - 22], [90, gy - 16], [90, gy - 8], [52, gy - 8]], c, id); // hood
  }, 2);
  // bumper, grill, headlight
  p.shape(darkMetal, (c, id) => { p.rect(86, gy - 14, 6, 6, c, id); p.rect(1, gy - JEEP_DECK + 4, 4, 9, c, id); });
  for (let y = gy - 20; y < gy - 10; y += 2) p.line(84, y, 88, y, olive[0]);
  p.rect(86, gy - 21, 3, 3, rgb('#fff8c0'));
  // white star + stripe
  p.line(8, gy - 13, 40, gy - 13, rgb('#d8d0b0'));
  const sx = 62, sy = gy - 17;
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; p.line(sx, sy, sx + Math.cos(a) * 4, sy + Math.sin(a) * 4, rgb('#e8e0c0')); }
  // spare tire on the tailgate
  p.shape(tire, (c, id) => p.ellipse(3, gy - 14, 3, 7, c, id), 1);
  // windshield frame (folded half down) and roll bar behind the driver
  p.shape(darkMetal, (c, id) => { p.line(54, gy - 26, 58, gy - 38, c, 2, id); p.line(58, gy - 38, 62, gy - 37, c, 2, id); });
  p.line(55, gy - 34, 59, gy - 27, rgb('#a8d0e0'));
  if (!wrecked) {
    // driver: beret, shades, hands on the wheel
    p.shape(driverLook.torso, (c, id) => p.rect(42, gy - 36, 8, 11, c, id), 2);
    p.shape(driverLook.skin, (c, id) => p.circle(46, gy - 40, 3.6, c, id));
    p.shape(driverLook.headColor, (c, id) => p.ellipse(45, gy - 43.5, 4.5, 2, c, id));
    p.rect(47, gy - 41, 4, 1, OUTLINE);
    p.shape(driverLook.skin, (c, id) => p.line(48, gy - 31, 54, gy - 30, c, 2, id));
    p.shape(darkMetal, (c, id) => p.line(53, gy - 33, 55, gy - 28, c, 2, id)); // steering wheel
  }
  // mud flaps and wheels
  wheel(p, 18, gy - 8, 8, k);
  wheel(p, 72, gy - 8, 8, k);
  if (wrecked) {
    for (let i = 0; i < 260; i++) { const x = (i * 29) % W, y = (i * 17) % H; if (p.get(x, y) !== 0 && hash(x, y, 3) < 0.6) p.set(x, y, mix(p.get(x, y), rgb('#120a08'), 0.7)); }
  }
  p.outline(OUTLINE);
  return frame(p, 30, gy);
}

function driverFly(): Frame {
  return frame(drawHumanoid(driverLook, { hipX: 0, hipY: -16, lean: -25, legs: [-30, -10, 20, 40], aim: null, arms: 'flail' }), AX, AY);
}

// ---------------------------------------------------------------- enemy vehicles

function bike(k: number): Frame {
  const W = 48, H = 34;
  const p = new Pix(W, H);
  const gy = H;
  const red: Ramp = ramp('#5a1010', '#b02a1a', '#f0603a');
  const tan: Ramp = ramp('#4a3a20', '#7a6232', '#a88a48');
  // frame, tank, seat, exhaust
  p.shape(darkMetal, (c, id) => { p.line(10, gy - 7, 22, gy - 15, c, 2, id); p.line(38, gy - 7, 32, gy - 22, c, 2, id); });
  p.shape(red, (c, id) => { p.poly([[18, gy - 18], [34, gy - 20], [34, gy - 14], [20, gy - 12]], c, id); p.poly([[34, gy - 22], [42, gy - 18], [38, gy - 15]], c, id); }, 2);
  p.shape(darkMetal, (c, id) => p.rect(10, gy - 20, 12, 3, c, id));
  p.shape(metalR, (c, id) => p.line(12, gy - 12, 2, gy - 15, c, 2, id));
  p.rect(0, gy - 16 + (k % 2), 2, 2, rgb('#8a8a8a'));
  wheel(p, 10, gy - 7, 7, k * 2);
  wheel(p, 38, gy - 7, 7, k * 2);
  // rider: hunched forward, pistol arm out
  p.shape(tan, (c, id) => { p.line(18, gy - 20, 26, gy - 30, c, 5, id); }, 2);
  p.shape(tan, (c, id) => { p.line(18, gy - 19, 26, gy - 13, c, 3, id); p.line(26, gy - 13, 26, gy - 8, c, 3, id); });
  p.shape(ramp('#1a1410', '#33281c', '#4c3c2a'), (c, id) => p.rect(24, gy - 9, 5, 3, c, id));
  p.shape(ramp('#8a5a3a', '#c08860', '#e0b088'), (c, id) => p.circle(29, gy - 33, 3.2, c, id));
  p.shape(red, (c, id) => p.ellipse(28.5, gy - 34.5, 4, 3, c, id), 2);
  p.rect(30, gy - 34, 3, 1, rgb('#202020'));
  p.shape(tan, (c, id) => p.line(26, gy - 28, 34, gy - 24, c, 2, id));
  p.shape(darkMetal, (c, id) => p.line(34, gy - 25, 38, gy - 26, c, 2, id));
  p.outline(OUTLINE);
  return frame(p, 24, gy);
}

function heli(wrecked: boolean): Frame {
  const W = 120, H = 52;
  const p = new Pix(W, H);
  const sandCamo: Ramp = ramp('#5a4a2a', '#9a8250', '#cab27a');
  // tail boom and fin (pointing right: the gunship faces left toward the jeep)
  p.shape(sandCamo, (c, id) => { p.poly([[64, 18], [112, 18], [112, 24], [64, 30]], c, id); p.poly([[104, 4], [114, 4], [114, 24], [106, 24]], c, id); }, 2);
  // main fuselage
  const id = p.newPart();
  p.ellipse(44, 26, 34, 14, sandCamo[1], id);
  p.rect(20, 14, 40, 16, sandCamo[1], id);
  p.volume(id, [rgb('#3a301a'), rgb('#5a4a2a'), rgb('#7e6a3e'), rgb('#9a8250'), rgb('#cab27a'), rgb('#e8d4a0')], { flat: 0.7 });
  // camo blotches
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.part[y * W + x] && vnoise(x / 7, y / 5, 9) > 0.66) p.data[y * W + x] = mix(p.data[y * W + x], rgb('#5a5a2a'), 0.6);
  // canopy
  p.shape(ramp('#103040', '#2a6a8a', '#8ad0f0'), (c, idc) => p.poly([[12, 24], [22, 13], [38, 13], [38, 24]], c, idc), 2);
  p.line(28, 14, 28, 23, sandCamo[0]);
  p.set(19, 17, rgb('#ffffff')); p.set(20, 16, rgb('#ffffff'));
  // engine housing and rotor mast
  p.shape(darkMetal, (c, idm) => { p.rect(36, 8, 26, 7, c, idm); p.rect(48, 3, 4, 6, c, idm); }, 2);
  // stub wings with rocket pods and the chin gun
  p.shape(darkMetal, (c, idw) => { p.rect(36, 30, 26, 4, c, idw); p.rect(40, 33, 16, 6, c, idw); }, 2);
  p.shape(metalR, (c, idg) => { p.rect(12, 34, 8, 6, c, idg); p.line(12, 37, 2, 38, c, 2, idg); }, 1);
  // skids
  p.shape(darkMetal, (c, ids) => { p.line(22, 40, 22, 47, c, 2, ids); p.line(58, 40, 58, 47, c, 2, ids); p.line(14, 48, 66, 48, c, 2, ids); p.line(66, 48, 70, 45, c, 2, ids); });
  // red stripe + skull roundel
  p.line(64, 24, 100, 22, rgb('#c02020'));
  p.circle(84, 22, 3, rgb('#e8e0c0')); p.set(83, 22, OUTLINE); p.set(85, 22, OUTLINE);
  if (wrecked) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.data[y * W + x] && hash(x, y, 2) < 0.55) p.data[y * W + x] = mix(p.data[y * W + x], rgb('#140c08'), 0.75);
  p.outline(OUTLINE);
  return frame(p, 44, 26);
}

function rotor(k: number): Frame {
  const W = 132, H = 7;
  const p = new Pix(W, H);
  // a blur of blades: long streaks that change length each frame
  const len = [62, 44, 56][k];
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - W / 2);
    if (d < len) { p.set(x, 3, (x + k) % 3 ? rgb('#4a4c58') : rgb('#7a7e8e')); if (d < len * 0.6 && (x + k * 2) % 4 === 0) p.set(x, 2, rgb('#9aa0b0')); }
  }
  p.rect(W / 2 - 3, 2, 6, 4, darkMetal[1]);
  return frame(p, W / 2, 4);
}

function bomb(k: number): Frame {
  const p = new Pix(10, 14);
  p.shape(ramp('#1a1e14', '#3a4428', '#6a7848'), (c, id) => p.ellipse(5, 8, 3.5, 5, c, id), 2);
  p.shape(darkMetal, (c, id) => { p.rect(2, 1, 6, 2, c, id); p.rect(4, 2, 2, 2, c, id); });
  p.set(5, 12, k ? rgb('#ff4020') : rgb('#ffd040'));
  p.outline(OUTLINE);
  return frame(p, 5, 7);
}

function sandball(k: number): Frame {
  const p = new Pix(12, 12);
  p.shape(ramp('#7a4a1e', '#c8863e', '#f8d088'), (c, id) => p.circle(6, 6, 4 + (k ? 0.5 : 0), c, id), 2);
  p.set(4 + k, 4, rgb('#fff0c0'));
  p.set(8, 8 - k, rgb('#5a3014'));
  p.outline(OUTLINE);
  return frame(p, 6, 6);
}

// ---------------------------------------------------------------- the sandworm

// Ruddy and ridged, with a beak of overlapping armour plates.
const FLESH = [rgb('#3e161c'), rgb('#6a2a2e'), rgb('#985044'), rgb('#c47a62'), rgb('#e2a486'), rgb('#f8ccae')];
const DOME = [rgb('#2e1e14'), rgb('#4e3420'), rgb('#76522e'), rgb('#a07a46'), rgb('#c8a466'), rgb('#ecd29a')];
const VEIN = rgb('#6a2a5a');
const MAW = [rgb('#2a0410'), rgb('#6a0a20'), rgb('#b02038'), rgb('#e85060')];
const TOOTH: Ramp = ramp('#9a9078', '#f0e8d0', '#ffffff');

function wormSeg(vein: boolean): Frame {
  const S = 48, c = S / 2;
  const p = new Pix(S, S);
  const id = p.newPart();
  p.circle(c, c, 21, FLESH[3], id);
  // ring bands (drawn pointing up; the sprite is rotated along the spine)
  p.volume(id, FLESH, { flat: 0.85, pattern: (x, y) => { const dy = y - c; return Math.abs(dy - 13) < 1.6 ? -2 : Math.abs(dy + 9) < 1.2 ? -1 : 0; } });
  if (vein) {
    // a bulging vein running along the side
    for (let y = 4; y < 44; y++) { const x = c - 11 + Math.sin(y / 5) * 2 + (y > 24 ? (y - 24) * 0.15 : 0); p.over(x, y, VEIN); if (y % 7 < 4) p.over(x + 1, y, mix(VEIN, FLESH[4], 0.4)); }
    for (let y = 10; y < 30; y++) p.over(c + 8 + Math.sin(y / 4) * 1.5, y, mix(VEIN, FLESH[3], 0.35));
  }
  // grit stuck to the skin
  for (let i = 0; i < 12; i++) p.over(c + Math.round(Math.sin(i * 7.1) * 16), c + Math.round(Math.cos(i * 3.3) * 16), FLESH[1]);
  p.outline(OUTLINE);
  return frame(p, c, c);
}

/** open: 0 closed, 1 parting, 2 fully open maw. Drawn pointing up; anchor at the neck. */
function wormHead(open: number): Frame {
  const W = 72, H = 76;
  const p = new Pix(W, H);
  const cx = W / 2;
  const neckY = 66;
  const neckShape = (id: number) => {
    // rounded sides so it blends into the body segments behind it
    for (let y = 36; y < H; y++) { const hw = 19 - Math.max(0, (y - 64)) * 0.6; for (let x = Math.ceil(cx - hw); x <= cx + hw; x++) p.set(x, y, FLESH[3], id); }
  };
  if (open === 0) {
    // a tapering beak of three stacked armour plates, split by a three-way seam
    const neck = p.newPart();
    neckShape(neck);
    p.volume(neck, FLESH, { flat: 0.9, pattern: (x, y) => (Math.abs(y - 60) < 1.2 ? -1 : 0) });
    const plates: [number, number, number, number][] = [[54, 22, 40, 19], [42, 19, 24, 15], [28, 15, 6, 6]];
    for (const [yb, wb, yt, wt] of plates) {
      const id = p.newPart();
      p.poly([[cx - wb, yb], [cx + wb, yb], [cx + wt, yt], [cx - wt, yt]], DOME[3], id);
      p.ellipse(cx, yt, wt, 3, DOME[3], id);
      p.volume(id, DOME, { flat: 0.6 });
      // dark lip where the plate overlaps the one below it
      for (let x = Math.ceil(cx - wb); x <= cx + wb; x++) { p.over(x, yb, DOME[0]); p.over(x, yb - 1, DOME[1]); }
    }
    // ridge ticks along each plate, and grit in the seams
    for (let i = -2; i <= 2; i++) for (const [yb, wb] of [[50, 18], [38, 14], [24, 10]]) p.over(cx + i * wb / 2.5, yb - 2, DOME[2]);
    // the closed mouth: a three-way seam meeting near the tip
    for (let y = 8; y < 30; y++) p.over(cx, y, DOME[0]);
    for (let i = 0; i < 9; i++) { p.over(cx - 1 - i, 8 + i * 1.6, DOME[0]); p.over(cx + 1 + i, 8 + i * 1.6, DOME[0]); }
    p.over(cx - 6, 6, DOME[5]); p.over(cx - 7, 8, DOME[5]); p.over(cx - 12, 22, DOME[4]); p.over(cx - 14, 34, DOME[4]);
  } else {
    // the beak plates split into four petals, now peeled back around a ring of teeth
    const spread = open === 1 ? 0.45 : 1;
    const neck = p.newPart();
    neckShape(neck);
    p.volume(neck, FLESH, { flat: 0.9 });
    // gullet
    p.ellipse(cx, 30, 18 + spread * 6, 12 + spread * 6, MAW[1]);
    p.ellipse(cx, 32, 12 + spread * 4, 8 + spread * 4, MAW[0]);
    p.ellipse(cx, 26, 8, 4, MAW[2]);
    // two rings of hooked teeth
    for (const [r, n, ry] of [[18 + spread * 6, 14, 12 + spread * 6], [11 + spread * 3, 10, 7 + spread * 3]] as [number, number, number][]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = 30 + Math.sin(a) * ry;
        p.shape(TOOTH, (c, id) => p.poly([[x - 2, y], [x + 2, y], [cx + Math.cos(a) * (r - 6), 30 + Math.sin(a) * (ry - 5)]], c, id));
      }
    }
    // petals
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * (0.55 + spread * 0.75);
      const len = 22, bx = cx + Math.cos(a) * (16 + spread * 6), by = 32 + Math.sin(a) * (14 + spread * 4);
      const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len * (0.8 + spread * 0.2);
      const nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
      const id = p.newPart();
      p.poly([[bx - nx, by - ny], [bx + nx, by + ny], [tx + nx * 0.3, ty + ny * 0.3], [tx - nx * 0.3, ty - ny * 0.3]], DOME[3], id);
      p.circle((bx + tx) / 2, (by + ty) / 2, 7, DOME[3], id);
      p.volume(id, DOME, { flat: 0.8 });
      // inner face of the petal is raw red
      p.line(bx, by, tx, ty, MAW[3], 2);
    }
  }
  p.outline(OUTLINE);
  return frame(p, cx, neckY);
}

function mound(): Frame {
  const W = 44, H = 16;
  const p = new Pix(W, H);
  p.shape(sandR, (c, id) => p.ellipse(22, 16, 21, 12, c, id), 2);
  for (let x = 4; x < 40; x++) if ((x * 7) % 5 === 0) p.over(x, 10 + Math.round(Math.sin(x) * 2), sandR[0]);
  p.outline(OUTLINE);
  return frame(p, 22, 16);
}

function ripple(k: number): Frame {
  const p = new Pix(26, 8);
  for (let x = 0; x < 26; x++) {
    const h = Math.max(0, Math.sin(((x + k * 3) / 26) * Math.PI * 2) * 2 + 3 - Math.abs(x - 13) * 0.25);
    for (let y = 8 - Math.round(h); y < 8; y++) p.set(x, y, y === 8 - Math.round(h) ? rgb('#f8d890') : rgb('#d8a058'));
  }
  return frame(p, 13, 8);
}

function larva(k: number): Frame {
  const W = 30, H = 18;
  const p = new Pix(W, H);
  for (let i = 0; i < 4; i++) {
    const id = p.newPart();
    p.circle(6 + i * 5, 10 + Math.sin(i + k * 1.5) * 1.5, 4.5 - i * 0.2, FLESH[3], id);
    p.volume(id, FLESH, { flat: 0.9 });
  }
  const hd = p.newPart();
  p.ellipse(25, 9, 5, 5, DOME[3], hd);
  p.volume(hd, DOME, { flat: 0.8 });
  // tiny snapping mouth
  p.poly([[28, 9], [W, 6 - k], [W, 12 + k]], MAW[1]);
  p.set(28, 7, TOOTH[1]); p.set(28, 11, TOOTH[1]);
  p.outline(OUTLINE);
  return frame(p, 15, 14);
}

export function buildDesert(): DesertArt {
  return {
    sky: skyCanvas(), mesas: mesasCanvas(), dunes: dunesCanvas(), near: nearCanvas(),
    cactus: [cactus(1), cactus(2), cactus(3)], ribs: ribs(), skull: skull(), sign: sign(), wreck: wreck(), barrel: barrel(), tower: tower(),
    boulder: [boulder(1), boulder(2)],
    jeep: [0, 1, 2, 3].map((k) => jeep(k)), jeepWreck: jeep(0, true), driver: driverFly(),
    bike: [bike(0), bike(1)],
    heli: heli(false), heliRotor: [rotor(0), rotor(1), rotor(2)], heliWreck: heli(true),
    bomb: [bomb(0), bomb(1)], sandball: [sandball(0), sandball(1)],
    wormSeg: [wormSeg(false), wormSeg(true)], wormHead: [wormHead(0), wormHead(1), wormHead(2)],
    mound: mound(), ripple: [ripple(0), ripple(1), ripple(2)], larva: [larva(0), larva(1)],
  };
}
