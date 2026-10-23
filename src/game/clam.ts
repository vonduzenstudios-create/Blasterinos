import type { Sprite } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { makeBody, type Body } from './world';
import { Enemy, EnemyBullet } from './enemies';
import { explode, Anim } from './effects';
import { dust } from './vehicles';
import { SHELL_R } from '../art/beach';

// Stage 3's boss and wildlife. The giant clam sits half buried at the water's edge.
// Shut, its shell turns every shot. It has to open up to spit, and that is the moment
// to shoot it right in the lips.

const SHELL_Z = 11, LIPS_Z = 10.5; // just behind the sand tiles, so the sand hides the buried hinge
const MAX_OPEN = 0.62;              // radians each half swings out

function splash(g: Game, x: number, y: number) {
  g.addFx(new Anim(g, g.assets.fx.splash, x, y, 3, 34));
}

/** Pearls spat in an arc. They skip along the sand a couple of times before they stop. */
export class Pearl extends EnemyBullet {
  bounces = 0;
  constructor(g: Game, x: number, y: number, vx: number, vy: number, public floor: number) {
    super(g, x, y, vx, vy, g.assets.beach.pearl, 4, 0.13, 360, false);
  }
  update() {
    super.update();
    if (this.dead) return;
    if (this.vy > 0 && this.y > this.floor - 5) {
      this.y = this.floor - 5;
      this.vy = -this.vy * 0.6; this.vx *= 0.85;
      if (++this.bounces > 2) { this.dead = true; this.g.addFx(new Anim(this.g, this.g.assets.fx.spark, this.x, this.y, 2, 42, true)); return; }
      this.sync();
    }
  }
}

/** A pearl the size of a beach ball, rolling along the sand. Jump it or shoot it. */
export class BigPearl extends Enemy {
  rot = 0;
  vy = -2;
  constructor(g: Game, x: number, y: number, public vx: number, public floor: number) {
    super(g, x, y, g.assets.beach.bigPearl, 21);
    this.hp = 10; this.score = 500;
    this.boomSize = 'M';
    this.cullMargin = 40;
  }
  box(): [number, number, number, number] { return [this.x - 11, this.y - 11, this.x + 11, this.y + 11]; }
  update() {
    this.vy += 0.25;
    this.x += this.vx; this.y += this.vy;
    if (this.y > this.floor - 14) { this.y = this.floor - 14; this.vy = this.vy > 1.5 ? -this.vy * 0.4 : 0; }
    this.rot += this.vx / 13;
    this.baseUpdate();
    const s = this.sprite;
    s.rot = this.rot; s.x = this.x; s.y = this.y; s.sync();
  }
}

/** A water spout. Bubbles mark the spot first, then the column comes up through the sand. */
export class Geyser {
  dead = false;
  t = 0;
  warn: Sprite;
  col: Sprite;
  rise = 0;
  constructor(public g: Game, public x: number, public floor: number, public delay = 0, public hold = 60) {
    const a = g.assets.beach;
    this.warn = g.gfx.sprite(a.bubbles[0], 13);
    this.col = g.gfx.sprite(a.geyser[0], 11);
    this.warn.visible = false; this.col.visible = false;
  }
  update() {
    const g = this.g, a = g.assets.beach;
    if (this.delay > 0) { this.delay--; return; }
    this.t++;
    const WARN = 44;
    const w = this.warn;
    w.visible = this.t < WARN + 6;
    if (w.visible) {
      w.setFrame(a.bubbles[Math.floor(this.t / 5) % 2]);
      w.x = this.x + Math.sin(this.t * 1.3); w.y = this.floor + 1; w.sync();
      if (this.t % 12 === 1) g.audio.sfx('hiss', 0.25);
    }
    if (this.t === WARN) { g.audio.sfx('splash'); g.audio.sfx('rumble', 0.4); g.gfx.shake = Math.max(g.gfx.shake, 2); }
    if (this.t >= WARN) {
      const up = this.t < WARN + this.hold;
      this.rise = up ? Math.min(1, this.rise + 0.16) : Math.max(0, this.rise - 0.06);
      const c = this.col;
      c.visible = this.rise > 0;
      c.setFrame(a.geyser[Math.floor(this.t / 4) % 3]);
      c.x = this.x; c.y = this.floor + 104 - this.rise * 100; c.sync();
      if (this.t % 6 === 0 && this.rise > 0.5) splash(g, this.x + (this.t % 12 === 0 ? -10 : 10), this.floor);
      // the column itself is deadly
      const top = c.y - 96;
      if (this.rise > 0.3) for (const p of g.livePlayers()) {
        if (!p.alive) continue;
        const b = p.box();
        if (b[2] > this.x - 10 && b[0] < this.x + 10 && b[3] > top && b[1] < this.floor) p.hurt();
      }
      if (!up && this.rise <= 0) this.dead = true;
    }
  }
  destroy() { this.warn.remove(); this.col.remove(); }
}

/** Beach crabs: buried with only their eyes showing until you get close, then they scuttle at you. */
export class Crab extends Enemy {
  body: Body;
  phase: 'buried' | 'walk' = 'walk';
  dir = -1;
  walkT = 0;
  constructor(g: Game, x: number, y: number, buried = true, vx = 0, vy = 0) {
    super(g, x, y, buried ? g.assets.beach.crabEyes : g.assets.beach.crab[0], 19);
    this.body = makeBody(x, y, 16, 12);
    this.body.vx = vx; this.body.vy = vy;
    this.hp = 3; this.score = 200;
    this.boomSize = 'S';
    if (buried) this.phase = 'buried';
    this.walkT = Math.floor(Math.random() * 40);
  }
  box(): [number, number, number, number] {
    if (this.phase === 'buried') return [0, 0, 0, 0];
    const b = this.body;
    return [b.x - 11, b.y - 15, b.x + 11, b.y];
  }
  update() {
    const g = this.g, b = this.body, a = g.assets.beach;
    const [px] = g.player.center();
    this.invulnerable = this.phase === 'buried';
    this.touch = this.phase !== 'buried';
    const s = this.sprite;
    if (this.phase === 'buried') {
      s.setFrame(a.crabEyes);
      // eyes swivel to follow you
      s.flip = px < b.x;
      if (Math.abs(px - b.x) < 110 && g.player.alive) {
        this.phase = 'walk';
        b.vy = -3.6;
        dust(g, b.x, b.y - 2, 14);
        g.audio.sfx('bite', 0.4);
      }
    } else {
      this.walkT++;
      const cycle = this.walkT % 80;
      const pausing = cycle > 56;
      if (b.onGround) {
        if (cycle === 0) this.dir = Math.sign(px - b.x) || -1;
        b.vx = pausing ? 0 : this.dir * 1.15;
      }
      b.vy = Math.min(5, b.vy + 0.22);
      g.world.move(b);
      if (b.hitWall && b.onGround) b.vy = -3.2;
      if (b.y > g.gfx.camY + 260) { this.dead = true; return; }
      s.setFrame(pausing ? a.crab[2] : a.crab[Math.floor(this.walkT / 4) % 2]);
      s.flip = false;
      if (pausing && cycle === 60) g.audio.sfx('clink', 0.3);
    }
    this.x = b.x; this.y = b.y;
    this.baseUpdate();
    s.x = b.x; s.y = b.y; s.sync();
  }
}

/** A barracuda leaping out of the water at you. */
export class Fish extends Enemy {
  constructor(g: Game, x: number, y: number, public vx: number, public vy: number, public waterY: number) {
    super(g, x, y, g.assets.beach.fish[0], 20);
    this.hp = 1; this.score = 150;
    this.boomSize = 'S';
    this.cullMargin = 120;
  }
  box(): [number, number, number, number] { return [this.x - 12, this.y - 6, this.x + 12, this.y + 6]; }
  update() {
    const g = this.g;
    this.vy += 0.16;
    this.x += this.vx; this.y += this.vy;
    if (this.vy > 0 && this.y > this.waterY + 14) { splash(this.g, this.x, this.waterY); this.dead = true; this.sprite.visible = false; return; }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(g.assets.beach.fish[Math.floor(this.t / 5) % 2]);
    s.flip = this.vx < 0;
    s.rot = Math.atan2(this.vy, Math.abs(this.vx) + 0.01) * (this.vx < 0 ? -1 : 1);
    s.x = this.x; s.y = this.y; s.sync();
  }
}

/** Sends fish leaping out of a stretch of water while the player is nearby. */
export class FishSchool {
  dead = false;
  timer = 30;
  constructor(public g: Game, public x0: number, public x1: number, public waterY: number, public every = 80) {}
  update() {
    const g = this.g;
    if (this.x1 < g.gfx.camX - 60) { this.dead = true; return; }
    const p = g.nearestPlayer((this.x0 + this.x1) / 2, this.waterY);
    if (!p.alive || Math.abs(p.body.x - (this.x0 + this.x1) / 2) > 230) return;
    if (--this.timer > 0) return;
    this.timer = this.every + Math.random() * 50;
    const x = this.x0 + 6 + Math.random() * (this.x1 - this.x0 - 12);
    const vx = Math.max(-2.4, Math.min(2.4, (p.body.x - x) / 42));
    g.enemies.push(new Fish(g, x, this.waterY + 10, vx, -5.4 - Math.random() * 0.8, this.waterY));
    splash(g, x, this.waterY);
    g.audio.sfx('splash', 0.5);
  }
  destroy() {}
}

type Mode = 'rise' | 'idle' | 'spit' | 'roll' | 'geyser' | 'crabs' | 'dying';
const PATTERN: Mode[] = ['spit', 'geyser', 'roll', 'spit', 'crabs', 'geyser', 'spit', 'roll'];

export class GiantClam implements Hittable {
  dead = false;
  hp = 110;
  maxHp = 110;
  invulnerable = true;
  deflect = true;
  shellL: Sprite; shellR: Sprite; lips: Sprite;
  mode: Mode = 'rise';
  modeT = 0;
  t = 0;
  open = 0;        // how far the halves have swung apart, radians
  pucker = false;
  flashT = 0;
  cooldown = 60;
  attacks = 0;
  enraged = false;
  hingeY: number;
  sink = 110;      // how far below its resting place it still is
  constructor(public g: Game, public hx: number, public floor: number, public left: number, public right: number) {
    const a = g.assets.beach;
    this.hingeY = floor + 10;
    this.lips = g.gfx.sprite(a.lips[0], LIPS_Z);
    this.shellL = g.gfx.sprite(a.shell, SHELL_Z);
    this.shellR = g.gfx.sprite(a.shell, SHELL_Z);
    this.shellR.flip = true;
    for (const s of [this.lips, this.shellL, this.shellR]) s.setFlashColor(1, 1, 1);
    g.audio.sfx('rumble');
    this.draw();
  }
  get vulnerable() { return this.open > 0.3 && this.mode !== 'rise' && this.mode !== 'dying'; }
  get mouth(): [number, number] { return [this.hx, this.hingeY + this.sink - 48]; }
  set(m: Mode) { this.mode = m; this.modeT = 0; }
  box(): [number, number, number, number] {
    const y = this.hingeY + this.sink;
    if (this.mode === 'dying' || this.sink > 60) return [0, 0, 0, 0];
    if (this.vulnerable) return [this.hx - 22, y - 82, this.hx + 22, y - 14];
    return [this.hx - 66, y - 80, this.hx + 66, this.floor];
  }
  hit(dmg: number) {
    if (this.dead || !this.vulnerable) return;
    const g = this.g;
    this.hp -= dmg;
    this.flashT = 4;
    g.audio.sfx('hit');
    if (!this.enraged && this.hp > 0 && this.hp < this.maxHp * 0.35) {
      this.enraged = true;
      g.audio.sfx('roar'); g.gfx.shake = 5;
      g.banner = { text: 'ENRAGED!', t: 120 };
    }
    if (this.hp <= 0) this.die();
  }
  private die() {
    const g = this.g;
    this.hp = 0;
    this.set('dying');
    g.addScore(20000);
    g.audio.sfx('roar');
    g.eBullets.forEach((b) => (b.dead = true));
    for (const e of g.enemies) if (e instanceof Crab || e instanceof BigPearl) e.die();
    for (const m of g.misc) if (m instanceof Geyser) m.dead = true;
  }
  private openTo(target: number, speed = 0.05) {
    this.open += Math.max(-speed * 1.6, Math.min(speed, target - this.open));
  }
  update() {
    const g = this.g;
    this.t++; this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const k = this.enraged ? 0.7 : 1;
    this.pucker = false;
    switch (this.mode) {
      case 'rise':
        // shoulders up out of the sand
        this.sink = Math.max(0, this.sink - 0.95);
        g.gfx.shake = Math.max(g.gfx.shake, 1.2);
        if (this.modeT % 6 === 0) dust(g, this.hx + (Math.random() - 0.5) * 150, this.floor - 2, 14);
        if (this.sink <= 0) { this.set('idle'); this.cooldown = 40; g.audio.sfx('bite'); }
        break;
      case 'idle':
        this.openTo(0, 0.05);
        if (--this.cooldown <= 0 && g.player.alive) {
          this.set(PATTERN[this.attacks % PATTERN.length]);
          this.attacks++;
          if ((this.mode as Mode) !== 'geyser') g.audio.sfx('gulp');
        }
        break;
      case 'spit': {
        this.openTo(MAX_OPEN * 0.8, 0.04);
        const volleys = this.enraged ? [34, 58, 82, 106] : [40, 72, 104];
        for (const v of volleys) {
          if (this.modeT >= v - 6 && this.modeT < v + 4) this.pucker = true;
          if (this.modeT === v) this.spit();
        }
        if (this.modeT > volleys[volleys.length - 1] + 30) this.close(90 * k);
        break;
      }
      case 'roll': {
        // gape wide and inhale, dragging everyone in, then cough up a huge pearl
        this.openTo(MAX_OPEN, 0.05);
        const [mx, my] = this.mouth;
        if (this.modeT > 15 && this.modeT < 85) {
          if (this.modeT % 12 === 0) g.audio.sfx('hiss', 0.5);
          for (const p of g.livePlayers()) if (p.alive && p.state === 'play' && Math.abs(p.body.x - this.hx) > 90) p.body.x += Math.sign(this.hx - p.body.x) * 0.5;
          if (this.modeT % 4 === 0) {
            const sx = mx - 60 - Math.random() * 120, sy = this.floor - 4 - Math.random() * 60;
            // spray and sand whipping into its mouth
            const a = new Anim(g, g.assets.fx.spark, sx, sy, 8, 14);
            a.vx = (mx - sx) / 24; a.vy = (my - sy) / 24;
            if (this.modeT % 8 === 0) a.sprite.setTint(1, 0.85, 0.6);
            g.addFx(a);
          }
        }
        if (this.modeT === 90 || (this.enraged && this.modeT === 125)) {
          this.pucker = true;
          g.enemies.push(new BigPearl(g, mx - 20, my, this.enraged ? -3 : -2.5, this.floor));
          g.audio.sfx('pearl'); g.audio.sfx('bigBoom', 0.3);
          g.gfx.shake = 3;
        }
        if (this.modeT > 86 && this.modeT < 96) this.pucker = true;
        if (this.modeT > (this.enraged ? 150 : 120)) this.close(80 * k);
        break;
      }
      case 'geyser': {
        // clamps down tight and shudders, and the sand starts spouting
        this.openTo(0, 0.08);
        g.gfx.shake = Math.max(g.gfx.shake, 0.8);
        const n = this.enraged ? 3 : 2;
        if (this.modeT === 10) {
          g.audio.sfx('bite');
          for (let i = 0; i < n; i++) {
            const p = g.livePlayers()[i % Math.max(1, g.livePlayers().length)] ?? g.player;
            const x = Math.max(this.left + 20, Math.min(this.hx - 90, p.body.x + (i === 0 ? 0 : (i % 2 ? -1 : 1) * 46)));
            g.misc.push(new Geyser(g, x, this.floor, i * 26, this.enraged ? 50 : 60));
          }
        }
        if (this.modeT > 150) { this.set('idle'); this.cooldown = 40 * k; }
        break;
      }
      case 'crabs': {
        // the lips part and out climb the crabs
        this.openTo(MAX_OPEN * 0.55, 0.04);
        const drops = this.enraged ? [30, 50, 70] : [32, 62];
        for (const d of drops) if (this.modeT === d) {
          const [mx, my] = this.mouth;
          g.enemies.push(new Crab(g, mx, my + 10, false, -1.2 - Math.random() * 1.2, -3.5));
          this.pucker = true;
          g.audio.sfx('gulp', 0.6);
        }
        if (this.modeT > drops[drops.length - 1] + 40) this.close(70 * k);
        break;
      }
      case 'dying': {
        this.openTo(this.modeT < 140 ? MAX_OPEN : 0, this.modeT < 140 ? 0.06 : 0.12);
        const [mx, my] = this.mouth;
        if (this.modeT % 8 === 0 && this.modeT < 140) explode(g, mx + (Math.random() - 0.5) * 90, my + (Math.random() - 0.5) * 60, Math.random() < 0.3 ? 'L' : 'M', this.modeT % 16 === 0);
        if (this.modeT === 140) { g.audio.sfx('bite'); g.audio.sfx('bigBoom'); g.gfx.shake = 6; }
        if (this.modeT > 160) { this.sink += 0.7; if (this.modeT % 8 === 0) dust(g, this.hx + (Math.random() - 0.5) * 140, this.floor - 2, 14); }
        if (this.modeT > 300) { this.dead = true; g.onBossDefeated(); }
        break;
      }
    }
    this.invulnerable = !this.vulnerable;
    this.deflect = !this.vulnerable && this.mode !== 'dying';
    // contact: the whole clam is a wall of shell and lip
    if (this.mode !== 'dying' && this.sink < 40) {
      const y = this.hingeY + this.sink;
      for (const p of g.livePlayers()) {
        if (!p.alive) continue;
        const [cx, cy] = p.center();
        if (cy < y && Math.hypot(cx - this.hx, cy - y) < SHELL_R - 16) p.hurt();
      }
    }
    this.draw();
  }
  private close(cooldown: number) {
    this.set('idle');
    this.cooldown = cooldown;
    this.g.audio.sfx('bite', 0.7);
  }
  private spit() {
    const g = this.g;
    const [mx, my] = this.mouth;
    const [px, py] = g.player.center();
    const n = this.enraged ? 6 : 5;
    const T = 50, grav = 0.13;
    for (let i = 0; i < n; i++) {
      const f = 0.45 + (i / (n - 1)) * 0.9;
      const vx = Math.min(-0.6, ((px - mx) / T) * f + (Math.random() - 0.5) * 0.25);
      const vy = (py - my) / T - 0.5 * grav * T - 0.6 - i * 0.12;
      g.eBullets.push(new Pearl(g, mx - 10, my, vx, vy, this.floor));
    }
    g.audio.sfx('pearl');
  }
  private draw() {
    const g = this.g, a = g.assets.beach;
    const y = this.hingeY + this.sink;
    const shudder = this.mode === 'geyser' && this.modeT < 140 ? Math.sin(this.modeT * 2.1) : 0;
    const flash = this.flashT > 0 ? 0.7 : this.mode === 'dying' && this.modeT < 140 && this.modeT % 6 < 3 ? 0.5 : 0;
    const L = this.shellL, R = this.shellR, M = this.lips;
    L.x = this.hx - 1 + shudder; L.y = y; L.rot = -this.open;
    R.x = this.hx + 1 - shudder; R.y = y; R.rot = this.open;
    const breathe = this.mode === 'idle' ? Math.sin(this.t / 20) * 0.015 : 0;
    L.rot -= breathe; R.rot += breathe;
    M.setFrame(a.lips[this.open < 0.25 ? 0 : this.pucker ? 2 : 1]);
    M.x = this.hx; M.y = y - 4;
    M.flash = flash;
    M.setFlashColor(1, this.enraged ? 0.5 : 1, this.enraged ? 0.5 : 1);
    // a closed shell glints when shots bounce off it; the open lips flash instead
    L.flash = R.flash = this.mode === 'dying' ? flash * 0.5 : 0;
    for (const s of [L, R, M]) s.sync();
  }
  destroy() { this.shellL.remove(); this.shellR.remove(); this.lips.remove(); }
}
