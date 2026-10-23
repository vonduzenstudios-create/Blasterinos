import type { Frame } from '../engine/pixel';
import type { Sprite } from '../engine/gfx';
import type { Game } from './game';

/** A one-shot animation (explosion, spark, splash...). */
export class Anim {
  dead = false;
  sprite: Sprite;
  t = 0;
  vx = 0; vy = 0; grav = 0;
  constructor(public g: Game, public frames: Frame[], public x: number, public y: number, public rate = 3, z = 40, additive = false, public delay = 0) {
    this.sprite = g.gfx.sprite(frames[0], z, additive);
    this.sprite.x = x; this.sprite.y = y;
    this.sprite.visible = delay <= 0;
    this.sprite.sync();
  }
  update() {
    if (this.delay > 0) { this.delay--; if (this.delay <= 0) this.sprite.visible = true; return; }
    this.t++;
    this.vy += this.grav;
    this.x += this.vx; this.y += this.vy;
    const i = Math.floor(this.t / this.rate);
    if (i >= this.frames.length) { this.dead = true; return; }
    this.sprite.setFrame(this.frames[i]);
    this.sprite.x = this.x; this.sprite.y = this.y;
    this.sprite.sync();
  }
  destroy() { this.sprite.remove(); }
}

/** Tiny physics debris pixel (shrapnel, water drops, sparks). */
export class Debris {
  dead = false;
  sprite: Sprite;
  life: number;
  /** Rotation per frame, for tumbling chunks. */
  spin = 0;
  constructor(public g: Game, f: Frame, public x: number, public y: number, public vx: number, public vy: number, life = 40, public grav = 0.18, z = 41) {
    this.sprite = g.gfx.sprite(f, z);
    this.life = life;
  }
  update() {
    this.vy += this.grav;
    this.x += this.vx; this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
    this.sprite.x = this.x; this.sprite.y = this.y;
    this.sprite.rot += this.spin;
    this.sprite.visible = this.life > 8 || this.life % 2 === 0;
    this.sprite.sync();
  }
  destroy() { this.sprite.remove(); }
}

export function explode(g: Game, x: number, y: number, size: 'S' | 'M' | 'L' = 'M', sound = true) {
  const fx = g.assets.fx;
  const frames = size === 'S' ? fx.boomS : size === 'M' ? fx.boomM : fx.boomL;
  g.addFx(new Anim(g, frames, x, y, size === 'L' ? 4 : 3, 40));
  if (size !== 'S') {
    for (let i = 0; i < (size === 'L' ? 10 : 5); i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * (size === 'L' ? 4 : 2.5);
      g.addFx(new Debris(g, fx.spark[2], x, y, Math.cos(a) * s, Math.sin(a) * s - 1.5, 30 + Math.random() * 20));
    }
  }
  if (size === 'L') {
    for (let i = 0; i < 4; i++) g.addFx(new Anim(g, fx.boomM, x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30, 3, 40, false, 6 + i * 6));
    g.gfx.shake = Math.max(g.gfx.shake, 6);
  } else if (size === 'M') g.gfx.shake = Math.max(g.gfx.shake, 2);
  if (sound) g.audio.sfx(size === 'S' ? 'smallBoom' : size === 'M' ? 'smallBoom' : 'bigBoom');
}

export function spark(g: Game, x: number, y: number) {
  g.addFx(new Anim(g, g.assets.fx.spark, x, y, 2, 42, true));
}

export function splash(g: Game, x: number, y: number) {
  g.addFx(new Anim(g, g.assets.fx.splash, x, y, 4, 42));
}
