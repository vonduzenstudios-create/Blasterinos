import type { Sprite } from '../engine/gfx';
import { VW, VH } from '../engine/gfx';
import type { Game } from './game';
import { Enemy, EnemyBullet, shoot } from './enemies';
import { Anim, Debris, splash } from './effects';
import type { SnowWorld } from './stage4';

// Stage 4 regulars: snowmen that lob snowballs, giant snowballs rolling down the
// hills, ski troopers, and thin lake ice that gives way under your boots.

/** A burst of powder (and a few clumps flying off). */
export function snowBurst(g: Game, x: number, y: number, clumps = 5) {
  const a = g.assets.snow;
  g.addFx(new Anim(g, a.puff, x, y, 3, 40));
  for (let i = 0; i < clumps; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 1 + Math.random() * 2.2;
    g.addFx(new Debris(g, a.snowball[i % 2], x, y, Math.cos(ang) * sp, Math.sin(ang) * sp - 1, 30 + Math.random() * 15, 0.2));
  }
}

/** Lobs snowballs in an arc that lands on (or near) you. */
export class Snowman extends Enemy {
  throwT: number;
  windT = 0;
  facing = -1;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y, g.assets.snow.snowman[0], 19);
    this.hp = 4; this.score = 300;
    this.throwT = 50 + Math.random() * 50;
  }
  box(): [number, number, number, number] { return [this.x - 8, this.y - 38, this.x + 8, this.y]; }
  update() {
    const g = this.g;
    const [px, py] = g.player.center();
    this.facing = px < this.x ? -1 : 1;
    let pose = 0;
    if (this.windT > 0) {
      pose = 1;
      if (--this.windT === 0) {
        // aim for where the player is standing, with a flight time that grows with range
        const sx = this.x + this.facing * 10, sy = this.y - 36;
        const T = Math.max(36, Math.min(70, Math.abs(px - sx) / 2.6));
        const grav = 0.12;
        const vx = Math.max(-3.4, Math.min(3.4, (px - sx) / T));
        const vy = (py - sy) / T - 0.5 * grav * T;
        g.eBullets.push(new EnemyBullet(g, sx, sy, vx, vy, g.assets.snow.snowball, 3, grav, 240));
        g.audio.sfx('swap', 0.5);
        this.throwT = 90 + Math.random() * 50;
      }
    } else if (this.onScreen(-6) && g.player.alive && --this.throwT <= 0) this.windT = 16;
    if (this.throwT > 80 && this.windT === 0 && this.t > 20) pose = 2;
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(g.assets.snow.snowman[pose]);
    s.flip = this.facing < 0;
    s.x = this.x; s.y = this.y; s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    this.g.audio.sfx('crunch');
    snowBurst(this.g, this.x, this.y - 20, 7);
    snowBurst(this.g, this.x, this.y - 6, 3);
  }
}

/** A giant snowball tumbling downhill, picking up speed on the slopes. */
export class RollingBall extends Enemy {
  vx: number;
  vy = 0;
  air = false;
  rot = 0;
  constructor(g: Game, x: number, dir: number) {
    super(g, x, 0, g.assets.snow.bigball, 21);
    const w = g.world as SnowWorld;
    this.y = w.surf(x) - 13;
    this.vx = dir * 1.2;
    this.hp = 5; this.score = 200;
    this.cullMargin = 60;
  }
  box(): [number, number, number, number] { return [this.x - 12, this.y - 12, this.x + 12, this.y + 12]; }
  update() {
    const g = this.g, w = g.world as SnowWorld;
    const s0 = w.surf(this.x);
    if (!this.air && isFinite(s0)) {
      // gravity along the slope, a little rolling friction, never quite stopping
      this.vx += w.slope(this.x) * 0.1;
      this.vx *= 0.995;
      const dir = Math.sign(this.vx) || -1;
      if (Math.abs(this.vx) < 0.7) this.vx = dir * 0.7;
      this.vx = Math.max(-3.4, Math.min(3.4, this.vx));
      this.x += this.vx;
      const s = w.surf(this.x);
      if (!isFinite(s) || s > s0 + 6) { this.air = true; this.vy = 0; }
      else this.y = s - 13;
      if (w.solid(Math.floor((this.x + dir * 13) / 16), Math.floor(this.y / 16))) { this.die(); return; }
    } else {
      this.air = true;
      this.vy = Math.min(6, this.vy + 0.25);
      this.x += this.vx; this.y += this.vy;
      const s = w.surf(this.x);
      if (isFinite(s) && this.y + 13 >= s) {
        // smacked into the far bank of a pit
        if (this.y + 13 - s > 12) { this.die(); return; }
        this.y = s - 13; this.air = false; this.vy = 0; g.audio.sfx('land', 0.5);
      }
      if (w.waterY && this.y > w.waterY && this.y - this.vy <= w.waterY) splash(g, this.x, w.waterY);
      if (this.y > g.gfx.camY + VH + 40) { this.dead = true; return; }
    }
    this.rot += this.vx / 13;
    if (this.t % 7 === 0 && !this.air) g.addFx(new Debris(g, g.assets.snow.snowball[0], this.x - Math.sign(this.vx) * 10, this.y + 10, -this.vx * 0.3, -1, 16, 0.2));
    this.baseUpdate();
    const sp = this.sprite;
    sp.rot = this.rot;
    sp.x = this.x; sp.y = this.y; sp.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    this.g.audio.sfx('crunch');
    snowBurst(this.g, this.x, this.y, 9);
  }
}

/** A trooper on skis who schusses down the slope toward you and fires on the way. */
export class Skier extends Enemy {
  vx: number;
  vy = 0;
  air = false;
  shot = false;
  constructor(g: Game, x: number, dir: number) {
    super(g, x, 0, g.assets.snow.skier[0], 22);
    const w = g.world as SnowWorld;
    this.y = w.surf(x);
    this.vx = dir * 2.2;
    this.hp = 1; this.score = 200;
    this.cullMargin = 50;
  }
  box(): [number, number, number, number] { return [this.x - 6, this.y - 20, this.x + 6, this.y]; }
  update() {
    const g = this.g, w = g.world as SnowWorld;
    const dir = Math.sign(this.vx) || -1;
    if (!this.air) {
      this.vx += w.slope(this.x) * 0.08;
      if (Math.abs(this.vx) < 1.6) this.vx = dir * 1.6;
      this.vx = Math.max(-3.6, Math.min(3.6, this.vx));
      const s0 = w.surf(this.x);
      this.x += this.vx;
      const s = w.surf(this.x);
      // off a crest or a cliff: airborne
      if (!isFinite(s) || s > s0 + 5) { this.air = true; this.vy = -1.2; g.audio.sfx('jump', 0.4); }
      else this.y = s;
    } else {
      this.vy = Math.min(5.5, this.vy + 0.2);
      this.x += this.vx; this.y += this.vy;
      const s = w.surf(this.x);
      if (isFinite(s) && this.y >= s) {
        if (this.y - s > 12) { this.die(); return; }
        this.y = s; this.air = false; this.vy = 0; g.audio.sfx('land', 0.6);
      }
      if (this.y > g.gfx.camY + VH + 30) { this.dead = true; return; }
    }
    const [px, py] = g.player.center();
    if (!this.shot && !this.air && Math.sign(px - this.x) === dir && Math.abs(px - this.x) < 170 && this.onScreen(-12)) {
      this.shot = true;
      // roughly level shots only: mirror the angle to face right, clamp it, mirror back
      const a = Math.atan2(py - (this.y - 14), px - this.x);
      let local = dir > 0 ? a : Math.PI - a;
      if (local > Math.PI) local -= Math.PI * 2;
      local = Math.max(-0.5, Math.min(0.5, local));
      shoot(g, this.x + dir * 12, this.y - 14, dir > 0 ? local : Math.PI - local, 2.6);
    }
    if (this.t % 4 === 0 && !this.air) g.addFx(new Debris(g, g.assets.snow.snowball[1], this.x - dir * 14, this.y - 1, -this.vx * 0.2, -0.8 - Math.random(), 14, 0.15));
    this.baseUpdate();
    const sp = this.sprite;
    sp.setFrame(this.air ? g.assets.snow.skierAir : g.assets.snow.skier[Math.floor(this.t / 8) % 2]);
    sp.flip = dir < 0;
    sp.rot = this.air ? Math.max(-0.4, Math.min(0.4, this.vy * 0.08)) * dir : Math.atan(w.slope(this.x)) * 0.8;
    sp.x = this.x; sp.y = this.y; sp.sync();
  }
}

/** While the camera is in [x0, x1], sends something down the hill every so often. */
export class HillSpawner {
  dead = false;
  t = 0;
  constructor(public g: Game, public kind: 'ball' | 'skier', public x: number, public x0: number, public x1: number, public every: number) {
    this.t = Math.floor(every * 0.6);
  }
  update() {
    const g = this.g;
    const mid = g.gfx.camX + VW / 2;
    if (mid > this.x1 || this.x < g.gfx.camX - 10) { this.dead = true; return; }
    if (mid < this.x0 || g.bossActive) return;
    if (++this.t % this.every !== 0) return;
    const live = g.enemies.filter((e) => (this.kind === 'ball' ? e instanceof RollingBall : e instanceof Skier)).length;
    if (live >= 2) return;
    // from the hilltop if it is in view, otherwise from the right edge of the screen
    const x = Math.min(this.x, g.gfx.camX + VW + 14);
    g.enemies.push(this.kind === 'ball' ? new RollingBall(g, x, -1) : new Skier(g, x, -1));
  }
  destroy() {}
}

/** A sheet of lake ice. It cracks while you stand on it, gives way, and freezes over again. */
export class ThinIce {
  dead = false;
  sprite: Sprite;
  crack = 0;
  broken = 0;
  plat: { x0: number; x1: number; y: number; on: boolean };
  constructor(public g: Game, public x: number, public y: number) {
    this.sprite = g.gfx.sprite(g.assets.snow.thinIce[0], 14);
    this.sprite.x = x; this.sprite.y = y; this.sprite.sync();
    this.plat = { x0: x, x1: x + 48, y, on: true };
    (g.world as SnowWorld).plats.push(this.plat);
  }
  update() {
    const g = this.g, pl = this.plat;
    if (!pl.on) {
      if (++this.broken > 240) {
        pl.on = true; this.crack = 0; this.broken = 0;
        this.sprite.visible = true;
      }
      return;
    }
    const loaded = g.livePlayers().some((p) => p.alive && p.body.onGround && Math.abs(p.body.y - pl.y) < 0.6 && p.body.x >= pl.x0 && p.body.x <= pl.x1);
    if (loaded) {
      this.crack++;
      if (this.crack === 18 || this.crack === 38) g.audio.sfx('clink', 0.5);
    } else if (this.crack > 0 && this.crack < 20) this.crack--;
    if (this.crack >= 52) {
      pl.on = false;
      this.sprite.visible = false;
      g.audio.sfx('crunch');
      for (let i = 0; i < 10; i++) g.addFx(new Debris(g, g.assets.snow.shard, this.x + 4 + i * 4, pl.y + 2, (Math.random() - 0.5) * 2, -Math.random() * 2, 40, 0.2));
    }
    this.sprite.setFrame(g.assets.snow.thinIce[this.crack < 18 ? 0 : this.crack < 38 ? 1 : 2]);
    this.sprite.x = this.x + (this.crack > 38 ? (this.crack % 2) : 0);
    this.sprite.sync();
  }
  destroy() { this.sprite.remove(); }
}

