import { Pix, rgb, mix, RNG, frame, type Frame } from '../engine/pixel';
import { OUTLINE } from './humanoid';
import { drawText } from '../engine/font';

// Projectiles, explosions, pickups and other small effect sprites.

const hot = [rgb('#ffffff'), rgb('#fff6a0'), rgb('#ffd040'), rgb('#ff8a20'), rgb('#e0401a'), rgb('#8a1a10')];
const smoke = [rgb('#3a3434'), rgb('#5a5050'), rgb('#7a7070')];

export function explosionFrames(size: number, seed = 1, n = 8): Frame[] {
  const out: Frame[] = [];
  const S = size * 2 + 4;
  const rng = new RNG(seed);
  const puffs = Array.from({ length: 7 }, () => ({ a: rng.range(0, Math.PI * 2), d: rng.range(0.2, 0.6), r: rng.range(0.35, 0.6) }));
  for (let f = 0; f < n; f++) {
    const t = f / (n - 1);
    const p = new Pix(S, S);
    const c = S / 2;
    const grow = Math.min(1, 0.35 + t * 1.6);
    for (const pf of puffs) {
      const px = c + Math.cos(pf.a) * pf.d * size * grow, py = c + Math.sin(pf.a) * pf.d * size * grow - t * size * 0.3;
      const r = pf.r * size * grow * (t > 0.6 ? 1 - (t - 0.6) * 1.2 : 1);
      for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
        const d = Math.hypot(x - px, y - py) / r;
        if (d > 1) continue;
        const noise = rng.next() * 0.25;
        const k = d + t * 1.9 + noise - 0.3;
        if (t > 0.55 && rng.next() < (t - 0.55) * 1.6) continue;
        let col: number;
        if (k < 0.3) col = hot[0]; else if (k < 0.6) col = hot[1]; else if (k < 0.9) col = hot[2]; else if (k < 1.2) col = hot[3];
        else if (k < 1.5) col = hot[4]; else if (k < 1.9) col = hot[5]; else col = smoke[Math.min(2, Math.floor((k - 1.9) * 3))];
        const cur = p.get(x, y);
        if (cur === 0 || hot.indexOf(col) !== -1 && hot.indexOf(col) < hot.indexOf(cur)) p.set(x, y, col);
      }
    }
    out.push(frame(p, S / 2, S / 2));
  }
  return out;
}

function orb(r: number, cols: number[]): Frame {
  const S = Math.ceil(r * 2) + 2;
  const p = new Pix(S, S);
  const c = (S - 1) / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c) / r;
    if (d > 1) continue;
    p.set(x, y, cols[Math.min(cols.length - 1, Math.floor(d * cols.length))]);
  }
  return frame(p, S / 2, S / 2);
}

export interface FxArt {
  boomS: Frame[]; boomM: Frame[]; boomL: Frame[];
  bullet: Record<string, Frame[]>;
  enemyBullet: Frame[]; fireball: Frame[]; spit: Frame[];
  flash: Frame[]; spark: Frame[]; splash: Frame[]; puff: Frame[];
  hook: Frame; rope: Frame;
  falcon: Record<string, Frame[]>;
  capsule: Frame[];
  medal: Frame; slot: Frame;
  ring: Frame[];
  /** The Crush shell's detonation: a white-hot core inside an expanding shock ring. */
  crush: Frame[]; crush2: Frame[];
}

function laserFrame(len: number, w: number, cols: number[]): Frame {
  const p = new Pix(len, w * 2 + 1);
  for (let x = 0; x < len; x++) for (let y = -w; y <= w; y++) {
    const d = Math.abs(y) / (w + 0.5);
    const taper = x < 3 ? x / 3 : x > len - 3 ? (len - x) / 3 : 1;
    if (d > taper) continue;
    p.set(x, y + w, cols[Math.min(cols.length - 1, Math.floor(d * cols.length))]);
  }
  return frame(p, len / 2, w + 0.5);
}

function missile(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(14, 7);
    p.rect(4, 2, 8, 3, rgb('#c8d0e0'));
    p.rect(4, 2, 8, 1, rgb('#ffffff'));
    p.rect(11, 2, 2, 3, rgb('#e04040'));
    p.set(13, 3, rgb('#e04040'));
    p.rect(4, 1, 2, 1, rgb('#8090a0')); p.rect(4, 5, 2, 1, rgb('#8090a0'));
    p.rect(1 - k, 2, 3 + k, 3, rgb('#ffd040')); p.set(0, 3, rgb('#ff8a20'));
    p.outline(OUTLINE);
    return frame(p, 7, 3.5);
  });
}

function flameFrames(): Frame[] {
  const out: Frame[] = [];
  const rng = new RNG(9);
  for (let f = 0; f < 4; f++) {
    const p = new Pix(12, 12);
    for (let i = 0; i < 18; i++) {
      const x = 6 + rng.range(-3.5, 3.5), y = 6 + rng.range(-3.5, 3.5);
      const d = Math.hypot(x - 6, y - 6) / 5;
      p.circle(x, y, 1.6, hot[Math.min(4, Math.floor(d * 4 + f * 0.3))]);
    }
    p.circle(6, 6, 2, hot[0]);
    out.push(frame(p, 6, 6));
  }
  return out;
}

/** Crush shell: a squat steel warhead with a glowing charge band and a short exhaust flicker. */
function crushShell(): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(14, 9);
    p.shape([rgb('#3a3e4e'), rgb('#7a8098'), rgb('#c8d0e0')], (c, id) => { p.rect(3, 2, 7, 5, c, id); p.ellipse(10, 4.5, 3, 2.5, c, id); }, 1);
    p.rect(6, 2, 2, 5, k ? rgb('#ffe070') : rgb('#ff8a20'));
    p.set(12, 4, rgb('#ffffff'));
    p.rect(2, 1, 2, 1, rgb('#5a6070')); p.rect(2, 7, 2, 1, rgb('#5a6070'));
    p.rect(0, 3, 3 - k, 3, rgb('#ffd040')); p.set(0, 4, rgb('#ff8a20'));
    p.outline(OUTLINE);
    return frame(p, 7, 4.5);
  });
}

/** Detonation drawn at radius R (one size per weapon level, so the pixels stay crisp). */
function crushBlast(R: number): Frame[] {
  const out: Frame[] = [];
  const S = R * 2 + 4, c = S / 2;
  const rng = new RNG(21);
  const rays = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2 + rng.range(-0.2, 0.2), l: rng.range(0.55, 0.95) }));
  const n = 7;
  for (let f = 0; f < n; f++) {
    const t = f / (n - 1);
    const p = new Pix(S, S);
    const ring = R * (0.35 + t * 0.65), core = R * 0.55 * (1 - t);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const band = Math.abs(d - ring);
      if (band < 2.2 - t) p.set(x, y, band < 1 ? (t < 0.5 ? hot[0] : hot[2]) : hot[t < 0.5 ? 2 : 3]);
      else if (d < core) p.set(x, y, hot[Math.min(4, Math.floor((d / core) * 3 + t * 2))]);
    }
    // jagged spikes thrown out with the shock front
    if (t < 0.7) for (const r of rays) {
      const r0 = core, r1 = ring * r.l + 2;
      for (let s = r0; s < r1; s += 0.7) p.set(c + Math.cos(r.a) * s, c + Math.sin(r.a) * s, s < r1 * 0.6 ? hot[1] : hot[3]);
    }
    out.push(frame(p, c, c));
  }
  return out;
}

function falconFrames(letter: string, col: string): Frame[] {
  return [0, 1].map((k) => {
    const p = new Pix(26, 18);
    const gold = [rgb('#7a4a10'), rgb('#d8a020'), rgb('#ffe070')];
    // wings
    for (let i = 0; i < 9; i++) {
      const y0 = 4 + Math.floor(i / 2) + (k ? 1 : 0);
      p.rect(i, y0, 1, 7 - Math.floor(i / 2), i % 2 ? gold[1] : gold[2]);
      p.rect(25 - i, y0, 1, 7 - Math.floor(i / 2), i % 2 ? gold[1] : gold[2]);
    }
    p.ellipse(12.5, 9, 6, 7, rgb(col));
    p.ellipse(12, 8, 4, 5, mix(rgb(col), rgb('#ffffff'), 0.25));
    p.outline(OUTLINE);
    const cv = p.toCanvas();
    const ctx = cv.getContext('2d')!;
    drawText(ctx, letter, 10, 5, '#ffffff', { shadow: '#120d16' });
    return { canvas: cv, w: 26, h: 18, ax: 13, ay: 17 };
  });
}

function capsuleFrames(): Frame[] {
  return [0, 1, 2, 3].map((k) => {
    const p = new Pix(28, 16);
    const body: [number, number, number] = [rgb('#3a3e4e'), rgb('#6a7088'), rgb('#a8b0c8')];
    p.shape(body, (c, id) => p.ellipse(14, 8, 9, 5, c, id), 2);
    p.rect(9, 7, 10, 2, rgb('#c02828'));
    p.set(14, 6, rgb('#ffe070')); p.set(14, 9, rgb('#ffe070'));
    // flapping wings
    const wy = [0, 2, 4, 2][k];
    p.shape([rgb('#5a2a2a'), rgb('#a03030'), rgb('#e06050')], (c, id) => { p.poly([[5, 8], [0, 2 + wy], [6, 5]], c, id); p.poly([[23, 8], [28, 2 + wy], [22, 5]], c, id); });
    p.outline(OUTLINE);
    return frame(p, 14, 8);
  });
}

export function buildFx(): FxArt {
  const yellow = [rgb('#ffffff'), rgb('#fff6a0'), rgb('#ffd040'), rgb('#e08020')];
  const red = [rgb('#ffffff'), rgb('#ffb0a0'), rgb('#ff4030'), rgb('#a01810')];
  const pink = [rgb('#ffffff'), rgb('#ffc0f0'), rgb('#ff50c0'), rgb('#a01870')];
  const cyan = [rgb('#ffffff'), rgb('#a0ffff'), rgb('#20c0ff'), rgb('#1040c0')];
  const green = [rgb('#f0ffe0'), rgb('#a0ff60'), rgb('#40c020'), rgb('#106010')];
  const ringFrames: Frame[] = [];
  for (let i = 0; i < 6; i++) {
    const r = 4 + i * 4;
    const p = new Pix(r * 2 + 3, r * 2 + 3);
    for (let a = 0; a < 64; a++) p.set(r + 1 + Math.cos((a / 64) * Math.PI * 2) * r, r + 1 + Math.sin((a / 64) * Math.PI * 2) * r, i < 3 ? rgb('#ffffff') : rgb('#a0e0ff'));
    ringFrames.push(frame(p, r + 1.5, r + 1.5));
  }
  const sparkFrames = [3, 2, 1].map((r) => {
    const p = new Pix(9, 9);
    p.line(4 - r, 4, 4 + r, 4, rgb('#ffffff')); p.line(4, 4 - r, 4, 4 + r, rgb('#ffffff'));
    if (r > 1) { p.set(4 - r + 1, 4 - r + 1, rgb('#fff6a0')); p.set(4 + r - 1, 4 + r - 1, rgb('#fff6a0')); p.set(4 + r - 1, 4 - r + 1, rgb('#fff6a0')); p.set(4 - r + 1, 4 + r - 1, rgb('#fff6a0')); }
    return frame(p, 4.5, 4.5);
  });
  const flashFrames = [0, 1].map((k) => {
    const p = new Pix(14, 14);
    const r = k ? 4 : 6;
    p.poly([[7 - r, 7], [7, 5], [7 + r, 7], [7, 9]], rgb('#fff6a0'));
    p.poly([[7, 7 - r], [9, 7], [7, 7 + r], [5, 7]], rgb('#fff6a0'));
    p.circle(7, 7, 2.5, rgb('#ffffff'));
    return frame(p, 7, 7);
  });
  const splashFrames = [0, 1, 2, 3, 4].map((k) => {
    const p = new Pix(24, 24);
    const rng = new RNG(3);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + rng.range(-1.1, 1.1), sp = rng.range(4, 11);
      const t = k / 4;
      const x = 12 + Math.cos(a) * sp * t * 1.3, y = 22 + Math.sin(a) * sp * t * 1.8 + 10 * t * t;
      p.set(x, y, i % 3 ? rgb('#c0f0ff') : rgb('#ffffff'));
      if (k < 3) p.set(x, y + 1, rgb('#60b0e0'));
    }
    return frame(p, 12, 22);
  });
  const puffFrames = [0, 1, 2, 3].map((k) => {
    const p = new Pix(12, 12);
    p.circle(6, 6, 2 + k, smoke[2 - Math.min(2, Math.floor(k / 1.5))]);
    if (k < 2) p.circle(5, 5, 1 + k * 0.5, smoke[2]);
    return frame(p, 6, 6);
  });
  const hookP = new Pix(7, 7);
  hookP.line(1, 3, 5, 3, rgb('#c8d0e0'), 2); hookP.line(4, 0, 6, 3, rgb('#e0e8f0')); hookP.line(4, 6, 6, 3, rgb('#e0e8f0'));
  hookP.outline(OUTLINE);
  const ropeP = new Pix(2, 2); ropeP.rect(0, 0, 2, 2, rgb('#d8c890'));
  const medalP = new Pix(8, 10);
  medalP.rect(2, 0, 4, 3, rgb('#3050d0')); medalP.rect(3, 0, 2, 3, rgb('#e04040'));
  medalP.circle(3.5, 6, 2.6, rgb('#ffd040')); medalP.set(3, 5, rgb('#fff6a0')); medalP.outline(OUTLINE);
  const slotP = new Pix(20, 14);
  slotP.rect(0, 0, 20, 14, rgb('#1a1626')); slotP.rect(1, 1, 18, 12, rgb('#2a2440'));
  return {
    boomS: explosionFrames(10, 3, 7), boomM: explosionFrames(18, 5, 9), boomL: explosionFrames(34, 8, 11),
    bullet: {
      R: [orb(2.2, yellow)], M: [orb(2.6, red)], S: [orb(3.2, red), orb(2.9, red)],
      L: [laserFrame(22, 2, cyan)], L2: [laserFrame(30, 3, cyan)], H: missile(), F: flameFrames(), C: crushShell(),
    },
    enemyBullet: [orb(2.6, pink), orb(2.2, pink)],
    fireball: flameFrames().map((f) => f),
    spit: [orb(4, green), orb(3.5, green)],
    flash: flashFrames, spark: sparkFrames, splash: splashFrames, puff: puffFrames,
    hook: frame(hookP, 3.5, 3.5), rope: frame(ropeP, 1, 1),
    falcon: {
      M: falconFrames('M', '#c02020'), S: falconFrames('S', '#c02020'), L: falconFrames('L', '#2050d0'),
      H: falconFrames('H', '#20a040'), F: falconFrames('F', '#e07010'), B: falconFrames('B', '#8030c0'),
      C: falconFrames('C', '#5a6478'),
    },
    capsule: capsuleFrames(),
    medal: frame(medalP, 0, 0), slot: frame(slotP, 0, 0),
    ring: ringFrames,
    crush: crushBlast(26), crush2: crushBlast(36),
  };
}
