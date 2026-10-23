import type { Sprite } from '../engine/gfx';
import { VW } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { EnemyBullet, Runner, shoot } from './enemies';
import { explode, Anim, splash } from './effects';
import { TS } from '../art/tiles';

// ================================================================ mid-boss

/** The fortress gate that bars the way to the falls: two cannons and a core. */
export class Gate {
  dead = false;
  sprite: Sprite;
  core: GatePart;
  cannons: GatePart[];
  t = 0;
  dying = 0;
  active = false;
  constructor(public g: Game, public x0: number, public bottom: number) {
    const art = g.assets.enemies.gate;
    this.sprite = g.gfx.sprite(art.intact, 15);
    this.sprite.x = x0; this.sprite.y = bottom - 190; this.sprite.sync();
    this.core = new GatePart(g, x0 + 44, bottom - 72, 14, 45, art.core);
    this.cannons = [new GatePart(g, x0 + 6, bottom - 140, 10, 16, art.cannon), new GatePart(g, x0 + 6, bottom - 26, 10, 16, art.cannon)];
  }
  parts(): Hittable[] { return [this.core, ...this.cannons]; }
  update() {
    const g = this.g;
    this.t++;
    if (this.dying > 0) {
      this.dying++;
      if (this.dying % 8 === 0 && this.dying < 120) explode(g, this.x0 + 16 + Math.random() * 56, this.bottom - Math.random() * 180, Math.random() < 0.3 ? 'L' : 'M');
      if (this.dying === 90) {
        this.sprite.visible = false;
        g.world.fill(Math.floor(this.x0 / TS), 0, Math.floor((this.x0 + 72) / TS), Math.floor(this.bottom / TS) - 1, 0);
        g.world.rebuildArea(Math.floor(this.x0 / TS), 70, Math.floor((this.x0 + 72) / TS), Math.floor(this.bottom / TS));
      }
      if (this.dying > 130) { this.dead = true; g.onMidBossDefeated(); }
      return;
    }
    if (!this.active) return;
    // cannons alternate firing
    this.cannons.forEach((c, i) => {
      c.frame = c.flashT > 0 ? 0 : (this.t + i * 40) % 90 < 6 ? 1 : 0;
      if (!c.dead && (this.t + i * 45) % 90 === 0 && g.player.alive) {
        const ang = Math.atan2(g.player.center()[1] - c.y, g.player.center()[0] - (c.x - 16));
        const a = Math.max(Math.PI * 0.75, Math.min(Math.PI * 1.25, ang < 0 ? ang + Math.PI * 2 : ang));
        shoot(g, c.x - 16, c.y, a, 2.3);
        if (i === 1) shoot(g, c.x - 16, c.y, a + 0.25, 2.3);
      }
    });
    // core pulses and sends a ring of shots once both cannons fall
    const cannonsDown = this.cannons.every((c) => c.dead);
    this.core.frame = Math.floor(this.t / 6) % 3;
    if (cannonsDown && this.t % 110 === 0) for (let i = 0; i < 5; i++) shoot(g, this.core.x - 10, this.core.y, Math.PI * 0.65 + i * 0.18, 1.8);
    // reinforcements drop from the wall
    if (this.t % 150 === 75 && g.enemies.length < 6) {
      const r = new Runner(g, this.x0 + 10, this.bottom - 160, -1);
      r.body.vy = 0;
      g.enemies.push(r);
    }
    for (const p of this.parts()) (p as GatePart).draw();
    if (this.core.dead && !this.dying) {
      this.dying = 1;
      g.addScore(5000);
      for (const c of this.cannons) if (!c.dead) c.hit(999);
    }
  }
  destroy() { this.sprite.remove(); this.core.sprite.remove(); for (const c of this.cannons) c.sprite.remove(); }
}

class GatePart implements Hittable {
  dead = false;
  sprite: Sprite;
  flashT = 0;
  frame = 0;
  constructor(public g: Game, public x: number, public y: number, public r: number, public hp: number, public frames: any[]) {
    this.sprite = g.gfx.sprite(frames[0], 16);
    this.draw();
  }
  box(): [number, number, number, number] { return [this.x - this.r - 6, this.y - this.r, this.x + this.r, this.y + this.r]; }
  hit(dmg: number) {
    if (this.dead) return;
    this.hp -= dmg; this.flashT = 4;
    this.g.audio.sfx('hit');
    if (this.hp <= 0) {
      this.dead = true;
      explode(this.g, this.x, this.y, 'M');
      this.g.addScore(1000);
      this.sprite.setFrame(this.g.assets.enemies.gate.coreDead);
      if (this.frames.length === 2) this.sprite.visible = false;
    }
  }
  draw() {
    if (this.flashT > 0) this.flashT--;
    this.sprite.flash = this.flashT > 0 ? 0.8 : 0;
    if (!this.dead) this.sprite.setFrame(this.frames[this.frame % this.frames.length]);
    this.sprite.x = this.x; this.sprite.y = this.y; this.sprite.sync();
  }
}

// ================================================================ hydra

type HeadMode = 'emerge' | 'idle' | 'windup' | 'lunge' | 'recover' | 'spit' | 'dead';

class Head implements Hittable {
  dead = false;
  hp: number;
  maxHp: number;
  sprite: Sprite;
  segs: Sprite[] = [];
  x: number; y: number;
  restX: number; restY: number;
  mode: HeadMode = 'emerge';
  modeT = 0;
  flashT = 0;
  targetX = 0; targetY = 0;
  facing = 1;
  open = 0;
  cooldown: number;
  sink = 0;
  invulnerable = true;
  constructor(public h: Hydra, public idx: number, public ax: number, public ay: number, restX: number, restY: number, hp: number) {
    const g = h.g;
    this.restX = restX; this.restY = restY;
    this.x = restX; this.y = h.waterY + 40;
    this.hp = hp; this.maxHp = hp;
    for (let i = 0; i < 9; i++) this.segs.push(g.gfx.sprite(i % 2 ? g.assets.hydra.neckBelly : g.assets.hydra.neck, 8));
    this.sprite = g.gfx.sprite(g.assets.hydra.head[0], 22);
    this.sprite.setFlashColor(1, 1, 1);
    this.cooldown = 80 + idx * 70;
  }
  box(): [number, number, number, number] {
    if (this.mode === 'dead') return [0, 0, 0, 0];
    return [this.x - 16, this.y - 14, this.x + 16 + 4, this.y + 12];
  }
  hit(dmg: number) {
    if (this.dead || this.invulnerable) return;
    this.hp -= dmg; this.flashT = 4;
    this.h.g.audio.sfx('hit');
    if (this.hp <= 0) this.kill();
  }
  kill() {
    const g = this.h.g;
    this.dead = true; this.mode = 'dead'; this.modeT = 0;
    g.addScore(3000);
    explode(g, this.x, this.y, 'L');
    g.audio.sfx('roar', 0.7);
    this.sprite.setFrame(g.assets.hydra.stump);
  }
  set(mode: HeadMode) { this.mode = mode; this.modeT = 0; }
  update() {
    const g = this.h.g;
    this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const [px, py] = g.player.center();
    const swayX = Math.sin((this.h.t + this.idx * 40) / 45) * 10, swayY = Math.cos((this.h.t + this.idx * 30) / 35) * 8;
    const ease = (tx: number, ty: number, k: number) => { this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; };
    this.invulnerable = this.mode === 'emerge' || this.mode === 'dead';
    switch (this.mode) {
      case 'emerge':
        ease(this.restX, this.restY, 0.03);
        if (this.modeT > 150) this.set('idle');
        break;
      case 'idle':
        ease(this.restX + swayX, this.restY + swayY, 0.06);
        this.open = Math.max(0, this.open - 0.1);
        if (--this.cooldown <= 0 && g.player.alive && this.h.busyHeads() < 2) {
          const r = Math.random();
          if (r < 0.45) this.set('windup'); else this.set('spit');
        }
        break;
      case 'windup': // rear back, eye flashes
        ease(this.restX - this.facing * 22, this.restY - 26, 0.08);
        this.targetX = px; this.targetY = Math.min(py, this.h.floorY - 22);
        this.open = Math.min(0.5, this.open + 0.05);
        if (this.modeT > 42) { this.set('lunge'); g.audio.sfx('bite'); }
        break;
      case 'lunge':
        ease(this.targetX, this.targetY, 0.22);
        this.open = 1;
        if (this.modeT > 24) this.set('recover');
        break;
      case 'recover':
        ease(this.restX, this.restY, 0.05);
        this.open = Math.max(0, this.open - 0.06);
        if (this.modeT > 50) { this.set('idle'); this.cooldown = 90 + Math.random() * 80; }
        break;
      case 'spit':
        ease(this.restX + swayX * 0.3, this.restY - 10, 0.06);
        this.open = Math.min(1, this.open + 0.08);
        if (this.modeT === 30 || this.modeT === 48 || (this.idx === 1 && this.modeT === 66)) {
          const mx = this.x + this.facing * 26, my = this.y + 6;
          const base = Math.atan2(py - my, px - mx);
          for (const d of [-0.22, 0, 0.22]) {
            g.eBullets.push(new EnemyBullet(g, mx, my, Math.cos(base + d) * 2.3, Math.sin(base + d) * 2.3, g.assets.fx.fireball, 3.5, 0, 300, false));
          }
          g.audio.sfx('flame');
        }
        if (this.modeT > 80) { this.set('idle'); this.cooldown = 100 + Math.random() * 80; }
        break;
      case 'dead':
        // the severed neck slumps and slides back under the lake
        this.sink = Math.min(1, this.sink + 0.008);
        ease(this.restX + (this.idx - 1) * 20, this.h.waterY + 90, 0.02);
        if (this.modeT === 100) splash(g, this.x, this.h.waterY + 4);
        if (this.modeT % 14 === 0 && this.modeT < 90) explode(g, this.x + (Math.random() - 0.5) * 30, this.y + (Math.random() - 0.5) * 20, 'M', this.modeT % 28 === 0);
        break;
    }
    if (this.mode !== 'dead') this.facing = px >= this.x ? 1 : -1;
    // contact with the jaws kills
    if ((this.mode === 'lunge' || this.mode === 'idle' || this.mode === 'recover' || this.mode === 'spit') && g.player.alive) {
      const a = this.box(), b = g.player.box();
      if (a[0] + 4 < b[2] && a[2] - 4 > b[0] && a[1] + 4 < b[3] && a[3] - 4 > b[1]) g.player.hurt();
    }
    this.draw();
  }
  draw() {
    const g = this.h.g;
    // neck: quadratic curve from the body anchor to the back of the head
    const ax = this.h.x + this.ax, ay = this.h.y + this.ay;
    const hx = this.x - this.facing * 14, hy = this.y + 4;
    const cx = (ax + hx) / 2 + (this.idx - 1) * 30, cy = Math.max(ay, hy) + 40;
    const n = this.segs.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * hx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * hy;
      const s = this.segs[i];
      s.x = x; s.y = y;
      s.scale = 1;
      s.visible = y < this.h.waterY + 20 && !(this.mode === 'dead' && this.modeT > 130);
      s.opacity = this.mode === 'dead' ? Math.max(0, 1 - this.modeT / 130) : 1;
      const shade = 0.55 + 0.45 * t;
      s.setTint(shade, shade, shade);
      s.sync();
    }
    const s = this.sprite;
    if (this.mode !== 'dead') s.setFrame(g.assets.hydra.head[this.open > 0.7 ? 2 : this.open > 0.25 ? 1 : 0]);
    s.flip = this.facing < 0;
    s.flash = this.flashT > 0 ? 0.8 : this.mode === 'windup' && this.modeT % 8 < 4 ? 0.35 : 0;
    s.setFlashColor(1, this.mode === 'windup' ? 0.3 : 1, this.mode === 'windup' ? 0.3 : 1);
    s.x = this.x; s.y = this.y;
    s.visible = this.y < this.h.waterY + 30 && !(this.mode === 'dead' && this.modeT > 130);
    s.opacity = this.mode === 'dead' ? Math.max(0, 1 - this.modeT / 130) : 1;
    s.sync();
  }
  destroy() { this.sprite.remove(); for (const s of this.segs) s.remove(); }
}

class Claw implements Hittable {
  dead = false;
  hp = 30;
  sprite: Sprite;
  arm: Sprite;
  x: number; y: number;
  mode: 'hidden' | 'rise' | 'track' | 'slam' | 'hold' | 'retreat' = 'hidden';
  modeT = 0;
  flashT = 0;
  invulnerable = true;
  constructor(public h: Hydra, public side: number) {
    const g = h.g;
    this.x = h.x + side * 120; this.y = h.floorY + 140;
    this.arm = g.gfx.sprite(g.assets.hydra.forearm, 49);
    this.sprite = g.gfx.sprite(g.assets.hydra.claw[0], 50);
  }
  box(): [number, number, number, number] {
    if (this.mode === 'hidden') return [0, 0, 0, 0];
    return [this.x - 34, this.y - 14, this.x + 34, this.y + 30];
  }
  hit(dmg: number) {
    if (this.dead || this.invulnerable) return;
    this.hp -= dmg; this.flashT = 4;
    this.h.g.audio.sfx('hit');
    if (this.hp <= 0) {
      this.dead = true;
      explode(this.h.g, this.x, this.y + 10, 'L');
      this.h.g.addScore(2000);
      this.mode = 'retreat'; this.modeT = 0;
    }
  }
  set(m: Claw['mode']) { this.mode = m; this.modeT = 0; }
  update() {
    const g = this.h.g;
    this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const [px] = g.player.center();
    const floor = this.h.floorY;
    this.invulnerable = this.mode === 'hidden' || this.mode === 'retreat';
    switch (this.mode) {
      case 'hidden': this.y = floor + 140; break;
      case 'rise':
        this.y += (floor - 110 - this.y) * 0.06;
        this.x += (px - this.x) * 0.03;
        if (this.modeT > 50) this.set('track');
        break;
      case 'track':
        this.x += (px - this.x) * 0.06;
        this.y = floor - 110 + Math.sin(this.modeT / 4) * 2;
        if (this.modeT > 55) { this.set('slam'); }
        break;
      case 'slam':
        this.y += 9;
        if (this.y >= floor - 22) {
          this.y = floor - 22; this.set('hold');
          g.gfx.shake = 7; g.audio.sfx('bigBoom', 0.6);
          for (let i = -2; i <= 2; i++) g.addFx(new Anim(g, g.assets.fx.puff, this.x + i * 14, floor - 4, 5, 45));
        }
        break;
      case 'hold':
        if (this.modeT > 50) this.set('retreat');
        break;
      case 'retreat':
        this.y += 4;
        if (this.y > floor + 140) { this.set('hidden'); if (this.dead) { this.sprite.visible = false; this.arm.visible = false; } }
        break;
    }
    if ((this.mode === 'slam' || this.mode === 'hold') && g.player.alive) {
      const a = this.box(), b = g.player.box();
      if (a[0] + 8 < b[2] && a[2] - 8 > b[0] && a[1] < b[3] && a[3] > b[1]) g.player.hurt();
    }
    this.draw();
  }
  draw() {
    const g = this.h.g;
    const s = this.sprite;
    s.setFrame(g.assets.hydra.claw[this.mode === 'slam' || this.mode === 'hold' ? 1 : 0]);
    s.flash = this.flashT > 0 ? 0.8 : this.mode === 'track' && this.modeT % 10 < 5 ? 0.3 : 0;
    s.flip = this.side > 0;
    s.x = this.x; s.y = this.y; s.sync();
    this.arm.x = this.x + this.side * 4; this.arm.y = this.y + 10; this.arm.sync();
    s.visible = this.arm.visible = this.mode !== 'hidden';
  }
  destroy() { this.sprite.remove(); this.arm.remove(); }
}

class Core implements Hittable {
  dead = false;
  hp = 120;
  invulnerable = true;
  flashT = 0;
  constructor(public h: Hydra) {}
  box(): [number, number, number, number] {
    const x = this.h.x, y = this.h.y - 88;
    return [x - 16, y - 14, x + 16, y + 14];
  }
  hit(dmg: number) {
    if (this.dead || this.invulnerable) return;
    this.hp -= dmg; this.flashT = 4;
    this.h.g.audio.sfx('hit');
    if (this.hp <= 0) { this.dead = true; this.h.startDeath(); }
  }
}

export class Hydra {
  dead = false;
  t = 0;
  x: number; y: number;      // body bottom-center
  baseY: number;
  waterY: number;
  floorY: number;
  body: Sprite;
  coreSprite: Sprite;
  shell: Sprite;
  heads: Head[];
  claws: Claw[];
  core: Core;
  phase: 'rise' | 'heads' | 'transition' | 'core' | 'dying' = 'rise';
  phaseT = 0;
  shellOpen = 0;
  constructor(public g: Game, cx: number, waterY: number, floorY: number) {
    this.x = cx; this.waterY = waterY; this.floorY = floorY;
    this.baseY = waterY + 70;
    this.y = waterY + 230;
    const art = g.assets.hydra;
    this.body = g.gfx.sprite(art.body, 5);
    this.body.setTint(0.42, 0.5, 0.6);
    this.coreSprite = g.gfx.sprite(art.core[0], 5.5 as any);
    this.coreSprite.z = 5;
    this.shell = g.gfx.sprite(art.coreShell, 5);
    this.shell.setTint(0.5, 0.55, 0.62);
    this.core = new Core(this);
    const L = cx - VW / 2;
    this.heads = [
      new Head(this, 0, -96, -110, L + 70, floorY - 112, 55),
      new Head(this, 1, 0, -170, L + VW / 2, floorY - 140, 65),
      new Head(this, 2, 96, -110, L + VW - 70, floorY - 112, 55),
    ];
    this.claws = [new Claw(this, -1), new Claw(this, 1)];
    g.audio.sfx('rumble');
  }
  parts(): Hittable[] { return [...this.heads, ...this.claws, this.core]; }
  busyHeads() { return this.heads.filter((h) => h.mode !== 'idle' && h.mode !== 'dead' && h.mode !== 'emerge').length; }
  totalHp() {
    return this.heads.reduce((a, h) => a + Math.max(0, h.hp), 0) + Math.max(0, this.core.hp);
  }
  maxHp() { return 55 + 65 + 55 + 120; }
  update() {
    const g = this.g;
    this.t++; this.phaseT++;
    switch (this.phase) {
      case 'rise':
        this.y += (this.baseY - this.y) * 0.02;
        if (this.phaseT % 20 === 0) splash(g, this.x + (Math.random() - 0.5) * 300, this.waterY + 4);
        if (this.phaseT === 60) g.audio.sfx('roar');
        g.gfx.shake = Math.max(g.gfx.shake, 1.5);
        if (this.phaseT > 170) { this.phase = 'heads'; this.phaseT = 0; }
        break;
      case 'heads':
        this.y = this.baseY + Math.sin(this.t / 50) * 3;
        if (this.heads.every((h) => h.dead) && this.phaseT > 10) {
          this.phase = 'transition'; this.phaseT = 0;
          g.audio.sfx('roar');
        }
        break;
      case 'transition':
        this.y = this.baseY + Math.sin(this.t / 50) * 3;
        this.shellOpen = Math.min(1, this.phaseT / 80);
        g.gfx.shake = Math.max(g.gfx.shake, 2);
        if (this.phaseT > 100) { this.phase = 'core'; this.phaseT = 0; this.core.invulnerable = false; }
        break;
      case 'core': {
        this.y = this.baseY + Math.sin(this.t / 40) * 4;
        // alternate claw slams
        const active = this.claws.filter((c) => !c.dead);
        if (active.length && this.phaseT % 170 === 20) {
          const c = active[Math.floor(this.phaseT / 170) % active.length];
          if (c.mode === 'hidden') c.set('rise');
        }
        // core spits arcing globs
        if (this.phaseT % 120 === 60 && g.player.alive) {
          const cx = this.x, cy = this.y - 88;
          for (let i = 0; i < 3; i++) {
            const vx = (Math.random() - 0.5) * 4, vy = -3.5 - Math.random();
            g.eBullets.push(new EnemyBullet(g, cx, cy, vx, vy, g.assets.fx.spit, 3.5, 0.09, 300, false));
          }
          g.audio.sfx('hiss');
        }
        if (this.phaseT % 200 === 140) for (let i = 0; i < 8; i++) shoot(g, this.x, this.y - 88, Math.PI * (0.1 + i * 0.115), 1.7);
        break;
      }
      case 'dying':
        if (this.phaseT % 7 === 0 && this.phaseT < 200) explode(g, this.x + (Math.random() - 0.5) * 260, this.y - Math.random() * 180, Math.random() < 0.3 ? 'L' : 'M', this.phaseT % 14 === 0);
        if (this.phaseT > 60) this.y += 0.9;
        this.body.flash = this.phaseT % 6 < 3 ? 0.6 : 0;
        if (this.phaseT % 30 === 0) splash(g, this.x + (Math.random() - 0.5) * 300, this.waterY + 4);
        if (this.phaseT > 260) { this.dead = true; g.onBossDefeated(); }
        break;
    }
    for (const h of this.heads) h.update();
    for (const c of this.claws) c.update();
    this.draw();
  }
  startDeath() {
    const g = this.g;
    this.phase = 'dying'; this.phaseT = 0;
    g.addScore(20000);
    g.audio.sfx('roar');
    g.eBullets.forEach((b) => (b.dead = true));
    for (const c of this.claws) if (!c.dead) { c.dead = true; c.set('retreat'); }
  }
  draw() {
    const b = this.body;
    b.x = this.x; b.y = this.y; b.sync();
    const cx = this.x, cy = this.y - 88;
    const c = this.coreSprite;
    c.setFrame(this.g.assets.hydra.core[Math.floor(this.t / 6) % 3]);
    c.visible = this.shellOpen > 0;
    c.flash = this.core.flashT > 0 ? 0.8 : 0;
    if (this.core.flashT > 0) this.core.flashT--;
    c.x = cx; c.y = cy; c.sync();
    // shell plates split apart to expose the core
    const s = this.shell;
    s.visible = this.shellOpen < 1;
    s.x = cx; s.y = cy + this.shellOpen * 40; s.opacity = 1 - this.shellOpen; s.sync();
  }
  destroy() {
    this.body.remove(); this.coreSprite.remove(); this.shell.remove();
    for (const h of this.heads) h.destroy();
    for (const c of this.claws) c.destroy();
  }
}
