import { Pix, rgb, ramp, RNG, frame, type Frame } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { vnoise } from './tiles';
import { dither } from './backgrounds';

// Set dressing: trees, bushes, ruins.

export interface PropArt { tree: Frame[]; bush: Frame[]; pillar: Frame; statue: Frame; vine: Frame; skulls: Frame; }

function tree(seed: number): Frame {
  const W = 120, H = 240;
  const p = new Pix(W, H);
  const rng = new RNG(seed);
  const bark = [rgb('#1a120c'), rgb('#2e2016'), rgb('#4a3422'), rgb('#664a30')];
  const leaf = [rgb('#0c2a14'), rgb('#164a1e'), rgb('#22702a'), rgb('#3a9a34'), rgb('#7acc48')];
  const cx = W / 2 + rng.range(-6, 6);
  // trunk with flared roots
  for (let y = 60; y < H; y++) {
    const t = (y - 60) / (H - 60);
    const flare = t > 0.85 ? (t - 0.85) * 120 : 0;
    const hw = 9 + flare + Math.sin(y / 17 + seed) * 1.2;
    const sway = Math.sin(y / 50 + seed) * 3;
    for (let x = Math.floor(cx - hw + sway); x <= cx + hw + sway; x++) {
      const u = (x - (cx - hw + sway)) / (hw * 2);
      let idx = u < 0.18 ? 3 : u < 0.5 ? 2 : u < 0.85 ? 1 : 0;
      if (vnoise(x / 2, y / 9, seed) > 0.68) idx = Math.max(0, idx - 1);
      p.set(x, y, bark[idx]);
    }
  }
  // branches
  for (let b = 0; b < 3; b++) {
    const by = rng.range(60, 110), dir = b % 2 ? 1 : -1;
    for (let i = 0; i < 26; i++) p.circle(cx + dir * i, by - i * 0.6, Math.max(1, 3 - i / 10), bark[i < 4 ? 2 : 1]);
  }
  // crown
  for (let i = 0; i < 26; i++) {
    const bx = cx + rng.range(-48, 48), by = rng.range(8, 80), r = rng.range(12, 22);
    for (let y = Math.floor(by - r); y <= by + r; y++) for (let x = Math.floor(bx - r); x <= bx + r; x++) {
      const dx = x - bx, dy = y - by, d = Math.hypot(dx, dy) / r;
      if (d > 1 - vnoise(x / 3, y / 3, 2) * 0.3) continue;
      const l = (-dx * 0.4 - dy) / r * 0.5 + 0.5 + (vnoise(x / 2.5, y / 2.5, 6) - 0.5) * 0.5;
      const idx = l > 0.85 + dither(x, y) * 0.1 ? 4 : l > 0.65 ? 3 : l > 0.42 ? 2 : l > 0.2 ? 1 : 0;
      p.set(x, y, leaf[idx]);
    }
  }
  // hanging vines from the crown
  for (let v = 0; v < 6; v++) {
    const vx = cx + rng.range(-40, 40), len = rng.range(30, 90);
    for (let y = 60; y < 60 + len; y++) p.set(vx + Math.sin(y / 8) * 1.2, y, leaf[y % 9 === 0 ? 3 : 1]);
  }
  p.outline(OUTLINE);
  return frame(p, W / 2, H);
}

function bush(seed: number): Frame {
  const p = new Pix(48, 24);
  const rng = new RNG(seed);
  const leaf = [rgb('#0c2a14'), rgb('#164a1e'), rgb('#22702a'), rgb('#3a9a34'), rgb('#7acc48')];
  for (let i = 0; i < 9; i++) {
    const bx = rng.range(8, 40), by = rng.range(12, 20), r = rng.range(6, 10);
    for (let y = Math.floor(by - r); y <= by + r; y++) for (let x = Math.floor(bx - r); x <= bx + r; x++) {
      const dx = x - bx, dy = y - by;
      if (Math.hypot(dx, dy) > r || y > 23) continue;
      const l = (-dx * 0.4 - dy) / r * 0.5 + 0.5 + (vnoise(x / 2, y / 2, seed) - 0.5) * 0.6;
      p.set(x, y, leaf[l > 0.85 ? 4 : l > 0.62 ? 3 : l > 0.4 ? 2 : l > 0.2 ? 1 : 0]);
    }
  }
  p.outline(OUTLINE);
  return frame(p, 24, 24);
}

function pillar(): Frame {
  const p = new Pix(28, 72);
  const st = ramp('#3a3a32', '#6a6a5a', '#9a9a84');
  p.shape(st, (c, id) => p.rect(5, 8, 18, 62, c, id), 2);
  p.shape(st, (c, id) => { p.rect(2, 2, 24, 7, c, id); p.rect(2, 64, 24, 8, c, id); }, 2);
  for (let y = 14; y < 62; y += 8) p.line(7, y, 20, y, st[0]);
  // carved glyphs
  for (let y = 18; y < 60; y += 16) { p.rect(11, y, 6, 6, st[0]); p.rect(12, y + 1, 4, 4, st[2]); p.set(13, y + 2, st[0]); }
  // breakage + moss
  p.poly([[18, 0], [26, 0], [26, 6]], 0);
  for (let x = 2; x < 26; x++) if (vnoise(x / 3, 1, 4) > 0.45) for (let y = 2; y < 2 + vnoise(x / 2, 3, 5) * 10; y++) p.over(x, y, rgb('#2a7034'));
  p.outline(OUTLINE);
  return frame(p, 14, 72);
}

function statue(): Frame {
  // A weathered serpent-headed idol: foreshadows the hydra.
  const p = new Pix(48, 64);
  const st = ramp('#2e3a32', '#566a5a', '#8aa08a');
  p.shape(st, (c, id) => p.rect(8, 44, 32, 20, c, id), 2);
  p.shape(st, (c, id) => { p.ellipse(24, 26, 12, 18, c, id); }, 2);
  p.shape(st, (c, id) => { p.ellipse(24, 14, 14, 9, c, id); p.poly([[10, 14], [2, 22], [14, 20]], c, id); p.poly([[38, 14], [46, 22], [34, 20]], c, id); }, 2);
  p.rect(16, 12, 4, 3, rgb('#ff4a2a')); p.rect(28, 12, 4, 3, rgb('#ff4a2a'));
  p.set(17, 12, rgb('#ffe0a0')); p.set(29, 12, rgb('#ffe0a0'));
  for (let x = 16; x < 33; x += 3) p.line(x, 19, x + 1, 22, rgb('#e0e0c8'));
  for (let x = 8; x < 40; x++) if (vnoise(x / 3, 2, 8) > 0.5) for (let y = 44; y < 47 + vnoise(x / 2, 7, 9) * 5; y++) p.over(x, y, rgb('#2a7034'));
  p.outline(OUTLINE);
  return frame(p, 24, 64);
}

function vine(): Frame {
  const p = new Pix(10, 80);
  for (let y = 0; y < 80; y++) {
    const x = 5 + Math.sin(y / 7) * 2;
    p.set(x, y, rgb('#22702a'));
    if (y % 6 === 0) { p.set(x + 1, y, rgb('#3a9a34')); p.set(x + 2, y + 1, rgb('#7acc48')); p.set(x - 1, y + 2, rgb('#3a9a34')); }
  }
  p.outline(OUTLINE);
  return frame(p, 5, 0);
}

function skulls(): Frame {
  const p = new Pix(30, 12);
  for (const [x, y] of [[5, 7], [13, 8], [21, 7], [9, 3], [17, 3]] as [number, number][]) {
    p.shape(ramp('#8a8470', '#d8d0b0', '#fffff0'), (c, id) => p.ellipse(x, y, 3.5, 3, c, id), 2);
    p.set(x - 1, y, OUTLINE); p.set(x + 1, y, OUTLINE);
  }
  p.outline(OUTLINE);
  return frame(p, 15, 12);
}

export function buildProps(): PropArt {
  return { tree: [tree(1), tree(2), tree(3)], bush: [bush(1), bush(2), bush(3)], pillar: pillar(), statue: statue(), vine: vine(), skulls: skulls() };
}
