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

// ---------------------------------------------------------------- rails

export type RailStyle = 'steel' | 'wood' | 'bone' | 'icy';

/**
 * An overhead rail the player can hang from: a bar `w` px long whose center line sits
 * `hang` px down from the top of the frame, held up by chains, vines or sinew.
 */
export function drawRail(w: number, style: RailStyle, hang: number): Frame {
  const H = hang + 8;
  const p = new Pix(w, H);
  const y = hang;
  const posts: number[] = [5];
  for (let x = 52; x < w - 30; x += 56) posts.push(x);
  posts.push(w - 6);
  const rng = new RNG(w * 7 + hang);
  const bar = style === 'wood' ? ramp('#5a4220', '#a0803c', '#d8c070')
    : style === 'bone' ? ramp('#6a5a64', '#b8a8a0', '#ece0d0')
    : ramp('#2a2e3a', '#5a6272', '#a8b4c4');
  // supports first, so the bar sits over them
  for (const x of posts) {
    if (style === 'steel' || style === 'icy') {
      // chain links hanging out of the dark above, a clamp around the bar
      for (let cy = 0; cy < y - 3; cy += 4) {
        const link = (cy / 4) % 2 === 0;
        p.shape(ramp('#2a2e3a', '#6a7282', '#b0bccc'), (c, id) => link ? p.rect(x - 1, cy, 3, 4, c, id) : p.rect(x, cy, 1, 4, c, id));
      }
      p.shape(ramp('#20242e', '#4a5262', '#8a96a8'), (c, id) => p.rect(x - 3, y - 4, 7, 9, c, id), 2);
    } else if (style === 'wood') {
      // a hanging vine with a few leaves, lashed around the pole
      const ph = rng.range(0, 6);
      p.shape(ramp('#14321a', '#2a5a26', '#4e8a36'), (c, id) => {
        for (let vy = 0; vy < y; vy++) p.set(x + Math.round(Math.sin(vy / 9 + ph) * 1.5), vy, c, id), p.set(x + 1 + Math.round(Math.sin(vy / 9 + ph) * 1.5), vy, c, id);
      });
      for (let vy = 10; vy < y - 6; vy += 14 + rng.int(0, 8)) {
        const lx = x + Math.round(Math.sin(vy / 9 + ph) * 1.5) + (vy % 2 ? 3 : -3);
        p.shape(ramp('#1a4a1e', '#3a8a30', '#7acc48'), (c, id) => p.ellipse(lx, vy, 2.5, 1.4, c, id));
      }
      p.shape(ramp('#4a3418', '#7a5a2a', '#a8844a'), (c, id) => { p.rect(x - 3, y - 3, 7, 2, c, id); p.rect(x - 3, y + 1, 7, 2, c, id); });
    } else {
      // sinew strands from the hive roof, swelling where they grip the bar
      const ph = rng.range(0, 6);
      p.shape(ramp('#3a1430', '#7a2a5a', '#c05a8a'), (c, id) => {
        for (let vy = 0; vy < y; vy++) {
          const sx = x + Math.round(Math.sin(vy / 11 + ph) * 2);
          p.set(sx, vy, c, id); p.set(sx + 1, vy, c, id);
          if (vy > y - 8) p.set(sx - 1, vy, c, id), p.set(sx + 2, vy, c, id);
        }
      });
    }
  }
  // the bar itself
  p.shape(bar, (c, id) => p.rect(0, y - 2, w, 5, c, id), 2);
  if (style === 'wood') for (let x = 6; x < w - 2; x += 13) { p.set(x, y - 1, bar[0]); p.set(x, y, bar[0]); p.set(x, y + 1, bar[0]); p.set(x + 1, y - 1, bar[2]); }
  if (style === 'bone') for (let x = 9; x < w - 4; x += 18) { p.rect(x, y - 3, 3, 7, bar[0]); p.set(x + 1, y - 2, bar[2]); }
  if (style === 'steel' || style === 'icy') for (const x of posts) { p.set(x - 2, y - 3, rgb('#c8d4e0')); p.set(x + 2, y - 3, rgb('#c8d4e0')); }
  if (style === 'icy') {
    // a crust of snow on top and icicles underneath
    for (let x = 0; x < w; x++) if (rng.next() < 0.8) { p.set(x, y - 3, rgb('#f0f8ff')); if (rng.next() < 0.4) p.set(x, y - 4, rgb('#d8e8f8')); }
    for (let x = 3; x < w - 3; x += 5 + rng.int(0, 6)) { const n = rng.int(1, 4); for (let k = 0; k < n; k++) p.set(x, y + 3 + k, rgb(k === n - 1 ? '#e8f8ff' : '#a8d0f0')); }
  }
  p.outline(OUTLINE);
  return frame(p, 0, y);
}
