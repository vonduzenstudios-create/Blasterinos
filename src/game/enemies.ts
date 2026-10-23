import type { Sprite } from '../engine/gfx';
import { VW, VH } from '../engine/gfx';
import type { Frame } from '../engine/pixel';
import type { Game } from './game';
import { makeBody, type Body } from './world';
import { explode, Anim } from './effects';
import type { Hittable, WeaponKind } from './weapons';
import { TS } from '../art/tiles';
import { muzzle, standPose, runPose, LOOKS } from '../art/humanoid';

// ---------------------------------------------------------------- bullets

export class EnemyBullet {
  dead = false;
  sprite: Sprite;
  t = 0;
  constructor(public g: Game, public x: number, public y: number, public vx: number, public vy: number,
    public frames: Frame[], public r = 2.5, public grav = 0, public life = 300, public solid = true) {
    this.sprite = g.gfx.sprite(frames[0], 37);
    this.sync();
  }
  sync() {
    this.sprite.setFrame(this.frames[Math.floor(this.t / 4) % this.frames.length]);
    this.sprite.x = this.x; this.sprite.y = this.y;
    this.sprite.sync();
  }
  update() {
    const g = this.g;
    this.t++;
    this.vy += this.grav;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
    if (this.x < g.gfx.camX - 40 || this.x > g.gfx.camX + VW + 40 || this.y < g.gfx.camY - 60 || this.y > g.gfx.camY + VH + 40) this.dead = true;
    if (this.solid && g.world.solidAtPx(this.x, this.y)) { this.dead = true; g.addFx(new Anim(g, g.assets.fx.spark, this.x, this.y, 2, 42, true)); }
    const p = g.player;
    if (p && p.alive) {
      const b = p.box();
      if (this.x + this.r > b[0] && this.x - this.r < b[2] && this.y + this.r > b[1] && this.y - this.r < b[3]) {
        if (p.invuln <= 0 && p.barrier <= 0) { this.dead = true; p.hurt(); }
      }
    }
    if (!this.dead) this.sync();
  }
  destroy() { this.sprite.remove(); }
}

export function shoot(g: Game, x: number, y: number, ang: number, speed = 2.2) {
  g.eBullets.push(new EnemyBullet(g, x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, g.assets.fx.enemyBullet));
  g.audio.sfx('enemyShot');
}

// ---------------------------------------------------------------- base

export abstract class Enemy implements Hittable {
  dead = false;
  hp = 1;
  score = 100;
  flashT = 0;
  t = 0;
  x: number; y: number;
  sprite: Sprite;
  touch = true;      // touching the player kills them
  offscreenT = 0;
  cullMargin = 80;
  invulnerable = false;
  deflect = false;
  boomSize: 'S' | 'M' | 'L' = 'M';
  constructor(public g: Game, x: number, y: number, f: Frame, z = 20) {
    this.x = x; this.y = y;
    this.sprite = g.gfx.sprite(f, z);
    this.sprite.setFlashColor(1, 1, 1);
  }
  abstract box(): [number, number, number, number];
  hit(dmg: number) {
    if (this.dead || this.invulnerable) return;
    this.hp -= dmg;
    this.flashT = 4;
    this.g.audio.sfx('hit');
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    const b = this.box();
    explode(this.g, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, this.boomSize);
  }
  baseUpdate() {
    this.t++;
    if (this.flashT > 0) this.flashT--;
    this.sprite.flash = this.flashT > 0 ? 0.8 : 0;
    const g = this.g;
    const out = this.x < g.gfx.camX - this.cullMargin || this.x > g.gfx.camX + VW + this.cullMargin * 2 ||
      this.y < g.gfx.camY - this.cullMargin * 2 || this.y > g.gfx.camY + VH + this.cullMargin;
    this.offscreenT = out ? this.offscreenT + 1 : 0;
    if (this.offscreenT > 90) this.dead = true;
    // contact damage
    if (this.touch && g.player.alive) {
      const a = this.box(), b = g.player.box();
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) g.player.hurt();
    }
  }
  abstract update(): void;
  onScreen(pad = 0) {
    const g = this.g;
    return this.x > g.gfx.camX - pad && this.x < g.gfx.camX + VW + pad && this.y > g.gfx.camY - pad && this.y < g.gfx.camY + VH + pad;
  }
  angleToPlayer(fx: number, fy: number) {
    const [px, py] = this.g.player.center();
    return Math.atan2(py - fy, px - fx);
  }
  destroy() { this.sprite.remove(); }
}

// ---------------------------------------------------------------- soldiers

/** Runs along the ground, hops gaps, sometimes shoots. */
export class Runner extends Enemy {
  body: Body;
  dir: number;
  shotT: number;
  constructor(g: Game, x: number, y: number, dir: number) {
    super(g, x, y, g.assets.enemies.soldierRun[0]);
    this.body = makeBody(x, y, 10, 26);
    this.dir = dir;
    this.score = 100;
    this.shotT = 50 + Math.random() * 120;
  }
  box(): [number, number, number, number] { const b = this.body; return [b.x - 5, b.y - 25, b.x + 5, b.y]; }
  update() {
    const g = this.g, b = this.body;
    b.vx = this.dir * 1.25;
    b.vy = Math.min(5, b.vy + 0.22);
    // at a ledge: usually jump across, sometimes drop
    if (b.onGround) {
      const ahead = b.x + this.dir * 8;
      if (!g.world.groundBelow(ahead, b.y + 1, 2)) {
        if (Math.random() < 0.6) b.vy = -4.4; // leap
      }
    }
    g.world.move(b);
    if (b.hitWall) { if (b.onGround) b.vy = -4.6; else this.dir = -this.dir; }
    this.x = b.x; this.y = b.y;
    if (b.y > g.gfx.camY + VH + 30) { this.dead = true; return; }
    this.shotT--;
    const [px] = g.player.center();
    if (this.shotT <= 0 && b.onGround && Math.sign(px - b.x) === this.dir && this.onScreen(-10)) {
      shoot(g, b.x + this.dir * 14, b.y - 17, this.dir > 0 ? 0 : Math.PI, 2.4);
      this.shotT = 120 + Math.random() * 120;
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(b.onGround ? g.assets.enemies.soldierRun[Math.floor(this.t / 5) % 6] : g.assets.enemies.soldier.air.f);
    s.flip = this.dir < 0;
    s.x = b.x; s.y = b.y; s.sync();
  }
}

const AIM_KEYS = ['u', 'uf', 'f', 'df'] as const;
function aimKeyFor(ang: number): { key: typeof AIM_KEYS[number]; facing: number } {
  // ang in radians, world space
  const facing = Math.cos(ang) >= 0 ? 1 : -1;
  const local = facing > 0 ? ang : Math.PI - ang; // mirror to the right side
  let deg = (local * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  const key = deg < -67 ? 'u' : deg < -22 ? 'uf' : deg < 22 ? 'f' : 'df';
  return { key, facing };
}

/** Stands its ground, aims in 8 directions and fires bursts. Snipers are the precise variant. */
export class Rifleman extends Enemy {
  facing = -1;
  aim: typeof AIM_KEYS[number] = 'f';
  fireT: number;
  burst = 0;
  sniper: boolean;
  sandbag: Sprite | null = null;
  constructor(g: Game, x: number, y: number, sniper = false, sandbag = false) {
    super(g, x, y, (sniper ? g.assets.enemies.sniper : g.assets.enemies.soldier).stand.f);
    this.sniper = sniper;
    this.hp = sniper ? 3 : 2;
    this.score = sniper ? 300 : 200;
    this.fireT = 40 + Math.random() * 60;
    if (sandbag) { this.sandbag = g.gfx.sprite(g.assets.enemies.sandbag, 22); this.sandbag.x = x + 10; this.sandbag.y = y; this.sandbag.sync(); }
  }
  box(): [number, number, number, number] { return [this.x - 5, this.y - 26, this.x + 5, this.y]; }
  update() {
    const g = this.g;
    const ang = this.angleToPlayer(this.x, this.y - 18);
    const a = aimKeyFor(ang);
    this.facing = a.facing; this.aim = a.key;
    if (this.sandbag) this.sandbag.x = this.x + this.facing * 10, this.sandbag.sync();
    if (this.onScreen(-8) && g.player.alive) {
      this.fireT--;
      if (this.fireT <= 0) {
        const look = this.sniper ? LOOKS.sniper : LOOKS.soldier;
        const [mx, my] = muzzle(standPose(this.aim), look);
        const fx = this.x + mx * this.facing, fy = this.y + my;
        const fireAng = this.sniper ? this.angleToPlayer(fx, fy) : (this.facing > 0 ? 1 : -1) * 0 + snapAngle(ang);
        shoot(g, fx, fy, fireAng, this.sniper ? 2.8 : 2.2);
        g.addFx(new Anim(g, g.assets.fx.flash, fx, fy, 2, 36, true));
        this.burst++;
        if (this.burst < (this.sniper ? 1 : 3)) this.fireT = 10;
        else { this.burst = 0; this.fireT = this.sniper ? 75 + Math.random() * 30 : 100 + Math.random() * 60; }
      }
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame((this.sniper ? g.assets.enemies.sniper : g.assets.enemies.soldier).stand[this.aim]);
    s.flip = this.facing < 0;
    s.x = this.x; s.y = this.y; s.sync();
  }
  destroy() { super.destroy(); this.sandbag?.remove(); }
}
function snapAngle(a: number) { return Math.round(a / (Math.PI / 4)) * (Math.PI / 4); }

// ---------------------------------------------------------------- turret

export class Turret extends Enemy {
  open = 0; // 0..1
  dirIdx = 8; // pointing left
  fireT = 60;
  base: Sprite;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y, g.assets.enemies.turretClosed, 21);
    this.hp = 10; this.score = 500;
    this.base = g.gfx.sprite(g.assets.enemies.turretBase, 20);
    this.touch = false;
    this.invulnerable = true;
    this.deflect = true;
    this.cullMargin = 140;
  }
  box(): [number, number, number, number] { return [this.x - 11, this.y - 26, this.x + 11, this.y - 6]; }
  update() {
    const g = this.g;
    const [px] = g.player.center();
    const near = Math.abs(px - this.x) < 230 && this.onScreen(-4);
    if (near && this.open < 1) this.open = Math.min(1, this.open + 0.04);
    this.invulnerable = this.open < 1;
    if (this.open >= 1) {
      const ang = this.angleToPlayer(this.x, this.y - 15);
      const target = ((Math.round((ang / (Math.PI * 2)) * 16) % 16) + 16) % 16;
      if (this.t % 10 === 0 && target !== this.dirIdx) {
        const diff = ((target - this.dirIdx + 24) % 16) - 8;
        this.dirIdx = (this.dirIdx + Math.sign(diff) + 16) % 16;
      }
      if (--this.fireT <= 0 && g.player.alive) {
        const a = (this.dirIdx / 16) * Math.PI * 2;
        shoot(g, this.x + Math.cos(a) * 14, this.y - 15 + Math.sin(a) * 14, a, 2.4);
        this.fireT = 70;
      }
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(this.open < 1 ? g.assets.enemies.turretClosed : g.assets.enemies.turret[this.dirIdx]);
    s.x = this.x; s.y = this.y + Math.round((1 - this.open) * 10); s.sync();
    this.base.x = this.x; this.base.y = this.y + Math.round((1 - this.open) * 10); this.base.sync();
    this.base.visible = false;
  }
  destroy() { super.destroy(); this.base.remove(); }
}

// ---------------------------------------------------------------- aliens & machines

/** Hops toward the player in big arcs. */
export class Leaper extends Enemy {
  body: Body;
  wait: number;
  facing = -1;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y, g.assets.enemies.leaper.idle[0]);
    this.body = makeBody(x, y, 18, 14);
    this.hp = 3; this.score = 200;
    this.wait = 30 + Math.random() * 40;
  }
  box(): [number, number, number, number] { const b = this.body; return [b.x - 10, b.y - 15, b.x + 10, b.y]; }
  update() {
    const g = this.g, b = this.body;
    const [px] = g.player.center();
    if (b.onGround) {
      b.vx = 0;
      this.wait--;
      if (this.wait < 12) this.facing = Math.sign(px - b.x) || -1;
      if (this.wait <= 0 && this.onScreen(10)) {
        b.vx = this.facing * (1.4 + Math.random() * 0.8);
        b.vy = -4 - Math.random() * 1.5;
        this.wait = 40 + Math.random() * 40;
        g.audio.sfx('hiss', 0.4);
      }
    }
    b.vy = Math.min(5, b.vy + 0.2);
    g.world.move(b);
    if (b.hitWall) b.vx = -b.vx;
    this.x = b.x; this.y = b.y;
    if (b.y > g.gfx.camY + VH + 30) { this.dead = true; return; }
    this.baseUpdate();
    const art = g.assets.enemies.leaper;
    const s = this.sprite;
    s.setFrame(!b.onGround ? art.jump : this.wait < 12 ? art.crouch : art.idle[Math.floor(this.t / 20) % 2]);
    s.flip = this.facing < 0;
    s.x = b.x; s.y = b.y; s.sync();
  }
}

/** Hovering robot that weaves toward the player and drops shots. */
export class Drone extends Enemy {
  baseY: number;
  vx: number;
  fireT = 60;
  constructor(g: Game, x: number, y: number, dir: number) {
    super(g, x, y, g.assets.enemies.drone[0], 24);
    this.hp = 3; this.score = 300;
    this.baseY = y; this.vx = dir * 1.1;
    this.cullMargin = 60;
  }
  box(): [number, number, number, number] { return [this.x - 9, this.y - 8, this.x + 9, this.y + 7]; }
  update() {
    const g = this.g;
    const [px, py] = g.player.center();
    this.x += this.vx;
    // drift toward a height above the player
    this.baseY += Math.sign(py - 70 - this.baseY) * 0.3;
    this.y = this.baseY + Math.sin(this.t / 18) * 14;
    if (Math.abs(px - this.x) < 40 && Math.sign(this.vx) !== 0 && this.t > 60) this.vx *= 0.98;
    else if (Math.abs(this.vx) < 1) this.vx = Math.sign(px - this.x) * 1.1;
    if (--this.fireT <= 0 && this.onScreen(-10) && g.player.alive) {
      shoot(g, this.x, this.y + 8, this.angleToPlayer(this.x, this.y + 8), 2);
      this.fireT = 90 + Math.random() * 40;
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(g.assets.enemies.drone[Math.floor(this.t / 3) % 4]);
    s.x = this.x; s.y = this.y; s.sync();
  }
}

/** Alien larva that clings to the cliff walls and spits arcing goo. */
export class Crawler extends Enemy {
  side: number;
  vy = 0.4;
  fireT: number;
  minY: number; maxY: number;
  constructor(g: Game, x: number, y: number, side: number) {
    super(g, x, y, g.assets.enemies.crawler[0], 21);
    this.side = side; // -1 on left wall facing right, 1 on right wall facing left
    this.hp = 4; this.score = 300;
    this.fireT = 50 + Math.random() * 60;
    this.minY = y - 40; this.maxY = y + 40;
    this.cullMargin = 100;
  }
  box(): [number, number, number, number] { return [this.x - 10, this.y - 10, this.x + 10, this.y + 10]; }
  update() {
    const g = this.g;
    this.y += this.vy;
    if (this.y < this.minY || this.y > this.maxY) this.vy = -this.vy;
    if (--this.fireT <= 0 && this.onScreen(-10) && g.player.alive) {
      const [px, py] = g.player.center();
      const dx = px - this.x;
      const tFly = Math.max(30, Math.abs(dx) / 2.2);
      const vx = dx / tFly, vy = (py - this.y) / tFly - 0.08 * tFly / 2;
      g.eBullets.push(new EnemyBullet(g, this.x - this.side * 8, this.y, vx, Math.max(-5, vy), g.assets.fx.spit, 3.5, 0.08));
      g.audio.sfx('hiss', 0.5);
      this.fireT = 100 + Math.random() * 50;
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(g.assets.enemies.crawler[Math.floor(this.t / 10) % 2]);
    s.rot = this.vy < 0 ? (this.side < 0 ? 0 : 0) : Math.PI;
    s.flip = this.side > 0;
    s.x = this.x; s.y = this.y; s.sync();
  }
}

// ---------------------------------------------------------------- power-ups

/** Winged capsule that flies across the screen carrying a weapon. */
export class Capsule extends Enemy {
  baseY: number;
  constructor(g: Game, x: number, y: number, public weapon: WeaponKind | 'B', public dir = 1) {
    super(g, x, y, g.assets.fx.capsule[0], 25);
    this.baseY = y;
    this.touch = false;
    this.score = 500;
    this.cullMargin = 60;
  }
  box(): [number, number, number, number] { return [this.x - 10, this.y - 6, this.x + 10, this.y + 6]; }
  update() {
    this.x += this.dir * 2.3;
    this.y = this.baseY + Math.sin(this.t / 22) * 18;
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(this.g.assets.fx.capsule[Math.floor(this.t / 5) % 4]);
    s.x = this.x; s.y = this.y; s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    explode(this.g, this.x, this.y, 'S', false);
    this.g.audio.sfx('capsule');
    this.g.pickups.push(new Pickup(this.g, this.x, this.y, this.weapon));
  }
}

export class Pickup {
  dead = false;
  sprite: Sprite;
  body: Body;
  t = 0;
  constructor(public g: Game, x: number, y: number, public kind: WeaponKind | 'B') {
    this.sprite = g.gfx.sprite(g.assets.fx.falcon[kind][0], 26);
    this.body = makeBody(x, y, 16, 12);
    this.body.vy = -3.5; this.body.vx = 0.6;
  }
  update() {
    const g = this.g, b = this.body;
    this.t++;
    b.vy = Math.min(3, b.vy + 0.15);
    g.world.move(b);
    if (b.onGround) b.vx = 0;
    if (b.y > g.gfx.camY + VH + 20 || b.x < g.gfx.camX - 30) this.dead = true;
    const p = g.player;
    if (p.alive) {
      const pb = p.box();
      if (b.x + 10 > pb[0] && b.x - 10 < pb[2] && b.y > pb[1] && b.y - 16 < pb[3]) {
        this.dead = true;
        g.audio.sfx('pickup');
        if (this.kind === 'B') p.barrier = 60 * 12;
        else p.giveWeapon(this.kind);
        g.addScore(1000);
        g.flashText(this.kind === 'B' ? 'BARRIER!' : this.kind + ' GET!', b.x, b.y - 24);
      }
    }
    const s = this.sprite;
    s.setFrame(g.assets.fx.falcon[this.kind][Math.floor(this.t / 8) % 2]);
    s.x = b.x; s.y = b.y; s.sync();
  }
  destroy() { this.sprite.remove(); }
}

// ---------------------------------------------------------------- spawners

/** Sends soldiers in from the screen edges while the camera is inside [x0, x1]. */
export class RunnerSpawner {
  dead = false;
  t = 0;
  constructor(public g: Game, public x0: number, public x1: number, public every = 70, public groundRow = 96) {}
  update() {
    const g = this.g;
    if (g.gfx.camX + VW / 2 > this.x1) { this.dead = true; return; }
    if (g.gfx.camX + VW / 2 < this.x0 || g.bossActive) return;
    this.t++;
    if (this.t % this.every === 0 && g.enemies.filter((e) => e instanceof Runner).length < 4) {
      const fromRight = Math.random() < 0.8;
      const x = fromRight ? g.gfx.camX + VW + 12 : g.gfx.camX - 12;
      // find ground below the top of the screen at that x
      const tx = Math.floor(x / TS);
      for (let ty = Math.floor(g.gfx.camY / TS); ty < Math.floor((g.gfx.camY + VH) / TS); ty++) {
        if ((g.world.solid(tx, ty) || g.world.oneway(tx, ty)) && !g.world.solid(tx, ty - 1)) {
          g.enemies.push(new Runner(g, x, ty * TS, fromRight ? -1 : 1));
          break;
        }
      }
    }
  }
  destroy() {}
}
