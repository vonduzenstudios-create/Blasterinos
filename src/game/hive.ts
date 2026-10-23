import type { Sprite } from '../engine/gfx';
import { VH } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { Enemy, EnemyBullet } from './enemies';
import { makeBody, type Body } from './world';
import { explode, Anim } from './effects';
import { buildHive, type HiveArt } from '../art/hive';

// Stage 5's residents: the orifices that keep pushing out grubs, the grubs
// themselves, acid pustules, and the boss at the bottom of it all, the Hive Mother.

const art = (): HiveArt => buildHive();
const MAX_GRUBS = 6;
const grubCount = (g: Game) => g.enemies.filter((e) => e instanceof Grub && !e.dead).length;

function splat(g: Game, x: number, y: number) {
  g.addFx(new Anim(g, art().splat, x, y, 4, 40));
}

/** A sprite left behind after its owner is gone (a sealed-up orifice). */
class Remains {
  dead = false;
  constructor(public sprite: Sprite) {}
  update() {}
  destroy() { this.sprite.remove(); }
}

export type OrificeDir = 'up' | 'down' | 'left';
const NORMAL: Record<OrificeDir, [number, number, number]> = { up: [0, -1, 0], down: [0, 1, Math.PI], left: [-1, 0, -Math.PI / 2] };

/** A puckered vent in the hive wall. Every so often it strains, then out comes a grub. */
export class Orifice extends Enemy {
  nx: number; ny: number;
  phase: 'wait' | 'strain' | 'open' = 'wait';
  phaseT = 0;
  wait: number;
  constructor(g: Game, x: number, y: number, public dir: OrificeDir) {
    super(g, x, y, art().orifice[0], 21);
    [this.nx, this.ny] = NORMAL[dir];
    this.sprite.rot = NORMAL[dir][2];
    this.hp = 12; this.score = 800;
    this.touch = false;
    this.cullMargin = 120;
    this.wait = 30 + Math.random() * 50;
  }
  /** The middle of the ring, where the grubs come out. */
  mouth(): [number, number] { return [this.x + this.nx * 21, this.y + this.ny * 21]; }
  box(): [number, number, number, number] {
    const cx = this.x + this.nx * 14, cy = this.y + this.ny * 14;
    return this.dir === 'left' ? [cx - 11, cy - 18, cx + 11, cy + 18] : [cx - 18, cy - 11, cx + 18, cy + 11];
  }
  update() {
    const g = this.g;
    this.phaseT++;
    const active = this.onScreen(-6) && !g.bossActive;
    let k = 0, jig = 0;
    switch (this.phase) {
      case 'wait':
        if (active && --this.wait <= 0) {
          if (grubCount(g) < MAX_GRUBS) { this.phase = 'strain'; this.phaseT = 0; g.audio.sfx('strain', 0.6); }
          else this.wait = 40;
        }
        break;
      case 'strain':
        k = 1; jig = this.phaseT % 4 < 2 ? 1 : -1;
        if (this.phaseT > 34) { this.phase = 'open'; this.phaseT = 0; }
        break;
      case 'open':
        k = 2;
        if (this.phaseT === 3) this.push();
        if (this.phaseT > 24) { this.phase = 'wait'; this.phaseT = 0; this.wait = 90 + Math.random() * 80; }
        break;
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(art().orifice[k]);
    s.x = this.x + (this.dir === 'left' ? 0 : jig); s.y = this.y + (this.dir === 'left' ? jig : 0);
    s.sync();
  }
  private push() {
    const g = this.g;
    const [mx, my] = this.mouth();
    const [px] = g.player.center();
    const toward = Math.sign(px - mx) || -1;
    let vx = 0, vy = 0;
    if (this.dir === 'up') { vx = toward * (0.8 + Math.random() * 0.8); vy = -3.6; }
    else if (this.dir === 'down') { vx = toward * 0.4; vy = 0.5; }
    else { vx = -2 - Math.random(); vy = -1.6; }
    g.enemies.push(new Grub(g, mx - this.nx * 8, my - this.ny * 8, vx, vy, this.nx, this.ny));
    g.audio.sfx('plop');
  }
  die() {
    const g = this.g;
    this.dead = true;
    g.addScore(this.score);
    const [mx, my] = this.mouth();
    explode(g, mx, my, 'M');
    splat(g, mx, my);
    // it scabs over for good
    const s = g.gfx.sprite(art().orifice[3], 21);
    s.x = this.x; s.y = this.y; s.rot = this.sprite.rot; s.sync();
    g.misc.push(new Remains(s));
  }
}

/** A brown, segmented grub. It inches toward you and hops when it gets close. */
export class Grub extends Enemy {
  body: Body;
  phase: 'out' | 'air' | 'crawl' = 'out';
  dir = -1;
  hopT: number;
  spin = 0;
  constructor(g: Game, x: number, y: number, public vx0: number, public vy0: number, public ox = 0, public oy = -1) {
    super(g, x, y, art().grubCurl, 19);
    this.body = makeBody(x, y + 6, 14, 10);
    this.hp = 2; this.score = 100;
    this.boomSize = 'S';
    this.hopT = 40 + Math.random() * 40;
    this.cullMargin = 60;
    this.dir = Math.sign(vx0) || -1;
    // eggs hatch straight into crawling
    if (ox === 0 && oy === 0) { this.phase = 'crawl'; this.body.y = y; }
  }
  box(): [number, number, number, number] {
    const b = this.body;
    if (this.phase === 'out') return [this.x - 6, this.y - 6, this.x + 6, this.y + 6];
    return [b.x - 9, b.y - 11, b.x + 9, b.y];
  }
  update() {
    const g = this.g, b = this.body;
    const s = this.sprite;
    const [px] = g.player.center();
    this.touch = this.phase !== 'out' || this.t > 6;
    if (this.phase === 'out') {
      // squeezing out of the hole, slowly
      this.x += this.ox * 1.2; this.y += this.oy * 1.2;
      b.x = this.x; b.y = this.y + 6;
      if (this.t >= 9) { this.phase = 'air'; b.vx = this.vx0; b.vy = this.vy0; }
      s.setFrame(art().grubCurl); s.rot = 0;
    } else {
      if (this.phase === 'crawl') {
        if (b.onGround) {
          if (this.t % 30 === 0) this.dir = Math.sign(px - b.x) || this.dir;
          b.vx = this.dir * 0.6;
          // don't crawl off ledges into the acid unless it is chasing you there
          if (!g.world.groundBelow(b.x + this.dir * 9, b.y + 1, 3) && Math.abs(px - b.x) > 40) { this.dir = -this.dir; b.vx = this.dir * 0.6; }
          if (--this.hopT <= 0 && Math.abs(px - b.x) < 80) {
            b.vy = -3.4; b.vx = Math.max(-1.8, Math.min(1.8, (px - b.x) / 30));
            this.hopT = 60 + Math.random() * 60;
            this.phase = 'air';
            g.audio.sfx('hiss', 0.25);
          }
        } else this.phase = 'air';
      }
      b.vy = Math.min(5, b.vy + 0.2);
      g.world.move(b);
      if (b.hitWall) { this.dir = -this.dir; b.vx = -b.vx; }
      if (this.phase === 'air' && b.onGround) { this.phase = 'crawl'; this.dir = Math.sign(px - b.x) || this.dir; }
      this.x = b.x; this.y = b.y - 5;
      if (b.y > g.gfx.camY + VH + 30) { this.dead = true; return; }
      if (this.phase === 'air') { s.setFrame(art().grubCurl); this.spin += 0.25 * (b.vx >= 0 ? 1 : -1); s.rot = this.spin; s.flip = false; }
      else { s.setFrame(art().grub[Math.floor(this.t / 8) % 2]); s.rot = 0; s.flip = this.dir < 0; }
    }
    this.baseUpdate();
    if (this.phase === 'crawl') { s.x = b.x; s.y = b.y; }
    else { s.x = this.x; s.y = this.y; }
    s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    const [x0, y0, x1, y1] = this.box();
    splat(this.g, (x0 + x1) / 2, (y0 + y1) / 2);
    this.g.audio.sfx('plop', 0.6);
  }
}

/** A swollen sac of acid. It fills up, then bursts in a spray of globs. */
export class Pustule extends Enemy {
  k = 0;
  phaseT: number;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y, art().pustule[0], 20);
    this.hp = 5; this.score = 300;
    this.phaseT = -(30 + Math.random() * 60);
  }
  box(): [number, number, number, number] {
    const r = this.k === 3 ? 4 : 8 + this.k * 2;
    return [this.x - r, this.y - r * 2 - 2, this.x + r, this.y];
  }
  update() {
    const g = this.g;
    if (this.onScreen(-10) && g.player.alive) this.phaseT++;
    const T = this.phaseT;
    this.k = T < 60 ? 0 : T < 80 ? 1 : T < 100 ? 2 : 3;
    if (T === 100) this.burst();
    if (T > 150) this.phaseT = 0;
    this.touch = this.k !== 3;
    this.invulnerable = this.k === 3;
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(art().pustule[this.k]);
    s.x = this.x + (this.k === 2 && T % 4 < 2 ? 1 : 0); s.y = this.y; s.sync();
  }
  private burst() {
    const g = this.g;
    const [px] = g.player.center();
    const dir = Math.sign(px - this.x) || -1;
    for (let i = 0; i < 3; i++) {
      const vx = dir * (0.7 + i * 0.75), vy = -3.6 - (i === 1 ? 0.6 : 0);
      g.eBullets.push(new EnemyBullet(g, this.x, this.y - 20, vx, vy, g.assets.fx.spit, 3.5, 0.12));
    }
    splat(g, this.x, this.y - 16);
    g.audio.sfx('splash', 0.5);
  }
}

/** Laid by the Hive Mother. Lands, wobbles, hatches. */
export class Egg extends Enemy {
  body: Body;
  landedT = -1;
  constructor(g: Game, x: number, y: number, vx: number, vy: number) {
    super(g, x, y, art().egg[0], 19);
    this.body = makeBody(x, y, 12, 14);
    this.body.vx = vx; this.body.vy = vy;
    this.hp = 2; this.score = 100;
    this.boomSize = 'S';
  }
  box(): [number, number, number, number] { const b = this.body; return [b.x - 6, b.y - 15, b.x + 6, b.y]; }
  update() {
    const g = this.g, b = this.body;
    b.vy = Math.min(5, b.vy + 0.15);
    g.world.move(b);
    if (b.hitWall) b.vx = -b.vx * 0.5;
    if (b.onGround) {
      b.vx *= 0.8;
      if (this.landedT < 0) { this.landedT = 0; g.audio.sfx('plop', 0.4); }
    }
    if (this.landedT >= 0 && ++this.landedT > 70) {
      this.dead = true;
      splat(g, b.x, b.y - 8);
      if (grubCount(g) < MAX_GRUBS + 2) g.enemies.push(new Grub(g, b.x, b.y, Math.sign(g.player.center()[0] - b.x) || -1, 0, 0, 0));
      return;
    }
    this.x = b.x; this.y = b.y;
    this.baseUpdate();
    const s = this.sprite;
    const wob = this.landedT > 30 ? (this.t % (this.landedT > 55 ? 4 : 8) < 2 ? 1 : 0) : 0;
    s.setFrame(art().egg[wob]);
    s.x = b.x + (wob ? 1 : 0); s.y = b.y - 9; s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    splat(this.g, this.body.x, this.body.y - 8);
    this.g.audio.sfx('plop', 0.5);
  }
}

/** A rolling bank of green gas. Deadly unless `harmless` (the death throes). */
export class GasCloud {
  dead = false;
  sprite: Sprite;
  t = 0;
  constructor(public g: Game, public x: number, public y: number, public vx: number, public vy: number, public limitX: number, public harmless = false) {
    this.sprite = g.gfx.sprite(art().gas[0], 38);
  }
  update() {
    const g = this.g;
    this.t++;
    this.x += this.vx; this.y += this.vy;
    if (this.harmless) { this.vx *= 0.97; this.vy *= 0.98; }
    const s = this.sprite;
    s.setFrame(art().gas[Math.floor(this.t / 6) % 3]);
    s.opacity = this.harmless ? Math.max(0, 1 - this.t / 90) : 1;
    s.flip = Math.floor(this.t / 18) % 2 === 1;
    s.x = this.x; s.y = this.y; s.sync();
    if (this.harmless ? this.t > 90 : this.x < this.limitX) { this.dead = true; return; }
    if (this.harmless) return;
    for (const p of g.livePlayers()) {
      if (!p.alive) continue;
      const b = p.box();
      if (b[2] > this.x - 20 && b[0] < this.x + 20 && b[3] > this.y - 30 && b[1] < this.y) p.hurt();
    }
  }
  destroy() { this.sprite.remove(); }
}

// ---------------------------------------------------------------- the Hive Mother

/** A hittable region of the boss. */
class Part implements Hittable {
  dead = false;
  invulnerable = false;
  deflect = false;
  b: [number, number, number, number] = [0, 0, 0, 0];
  constructor(public onHit: (d: number) => void) {}
  box() { return this.b; }
  hit(d: number) { this.onHit(d); }
}

type Mode = 'intro' | 'idle' | 'eggs' | 'toot' | 'spit' | 'grubs' | 'dying';
const VENT_DMG = 2.4, HEAD_DMG = 1;

/**
 * The queen of the hive, seen from behind: she backs into the chamber, rear end
 * first, and looks back over her shoulder at you. The vent between the two halves
 * of her abdomen lays eggs and breaks wind. Her head and that vent are the weak spots.
 */
export class HiveMother {
  dead = false;
  hp = 240;
  maxHp = 240;
  mode: Mode = 'intro';
  modeT = 0;
  t = 0;
  x: number;           // middle of the abdomen
  bob = 0;
  squeeze = 0;
  ventK = 0;
  headK = 0;
  flashT = 0;
  cooldown = 60;
  attacks = 0;
  enraged = false;
  sink = 0;
  lobes: Sprite[];
  ventS: Sprite; thoraxS: Sprite; headS: Sprite;
  legs: Sprite[] = [];
  holes: Sprite[] = [];
  vent: Part; head: Part; shell: Part;
  constructor(public g: Game, public homeX: number, public floor: number, public arenaX: number, public ceil: number) {
    const a = art(), gx = g.gfx;
    this.x = homeX + 240;
    for (let i = 0; i < 6; i++) { const s = gx.sprite(a.leg, 9); s.setFlashColor(1, 1, 1); this.legs.push(s); }
    this.thoraxS = gx.sprite(a.thorax, 10);
    this.headS = gx.sprite(a.head[0], 10.5);
    this.lobes = [gx.sprite(a.lobe, 11), gx.sprite(a.lobe, 11.1)];
    this.ventS = gx.sprite(a.vent[0], 11.3);
    for (const s of [this.thoraxS, this.headS, ...this.lobes, this.ventS]) s.setFlashColor(1, 1, 1);
    // two holes in the chamber roof that she can make the grubs drop from
    for (const hx of [arenaX + 110, arenaX + 180]) {
      const s = gx.sprite(a.orifice[0], 21);
      s.x = hx; s.y = ceil; s.rot = Math.PI; s.sync();
      this.holes.push(s);
    }
    this.vent = new Part((d) => this.damage(d * VENT_DMG, true));
    this.vent.deflect = true;
    this.head = new Part((d) => this.damage(d * HEAD_DMG, false));
    this.shell = new Part(() => {});
    this.shell.invulnerable = true; this.shell.deflect = true;
    g.audio.sfx('rumble');
    this.draw();
  }
  get ventPos(): [number, number] { return [this.x, this.floor - 30 + this.bob + this.sink]; }
  get headPos(): [number, number] {
    const sway = Math.sin(this.t / 50) * 6;
    return [this.x - 6 + sway, this.floor - 112 + this.bob * 0.5 + this.sink + (this.headK ? -2 : 0)];
  }
  parts(): Hittable[] { return [this.vent, this.head, this.shell]; }
  set(m: Mode) { this.mode = m; this.modeT = 0; }

  private damage(d: number, vent: boolean) {
    const g = this.g;
    if (this.mode === 'dying' || this.mode === 'intro') return;
    this.hp -= d;
    this.flashT = vent ? 4 : 3;
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
    g.addScore(30000);
    g.audio.sfx('roar');
    g.eBullets.forEach((b) => (b.dead = true));
    for (const e of g.enemies) if (e instanceof Grub || e instanceof Egg) e.die();
    for (const m of g.misc) if (m instanceof GasCloud && !m.harmless) m.dead = true;
  }

  update() {
    const g = this.g;
    this.t++; this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const k = this.enraged ? 0.7 : 1;
    const T = this.modeT;
    this.ventK = 0; this.headK = 0; this.squeeze = 0;
    for (const h of this.holes) h.setFrame(art().orifice[0]);
    // a cheeky wiggle while she waits
    this.bob = Math.sin(this.t / 20) * 1.5;
    switch (this.mode) {
      case 'intro':
        // backing into the chamber, legs scuttling
        this.x += (this.homeX - this.x) * 0.03;
        if (T % 10 === 0) g.gfx.shake = Math.max(g.gfx.shake, 1.5);
        if (T === 90) { g.audio.sfx('roar'); this.headK = 1; }
        if (T > 90 && T < 130) this.headK = 1;
        if (T > 140) { this.x = this.homeX; this.set('idle'); this.cooldown = 40; }
        break;
      case 'idle':
        if (--this.cooldown <= 0 && g.player.alive) {
          this.attacks++;
          const a = this.attacks % 6;
          this.set(a === 1 ? 'eggs' : a === 2 ? 'spit' : a === 3 ? 'toot' : a === 4 ? 'grubs' : a === 5 ? 'spit' : 'toot');
          if (a === 3 || a === 0) g.audio.sfx('strain');
        }
        break;
      case 'eggs': {
        // strain, open up, and lay
        this.ventK = T < 30 * k ? 1 : 2;
        if (T < 30 * k) this.squeeze = T % 6 < 3 ? 2 : 0;
        const lays = this.enraged ? [30, 44, 58, 72] : [36, 60, 84];
        for (const at of lays) if (T === Math.round(at * k) + 4) this.lay();
        if (T > 130 * k) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'toot': {
        // clench, quiver, then let rip a wave of gas along the floor
        const blasts = this.enraged ? [44, 84] : [48];
        const first = Math.round(blasts[0] * k);
        if (T < first) { this.squeeze = 2 + (T % 4 < 2 ? 1 : 0); this.ventK = 1; this.flashT = T % 8 < 2 ? 2 : this.flashT; }
        else this.ventK = 2;
        for (const at of blasts) if (T === Math.round(at * k)) this.toot();
        if (T > Math.round(blasts[blasts.length - 1] * k) + 60) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'spit': {
        this.headK = T > 14 ? 1 : 0;
        const shots = this.enraged ? [20, 30, 40, 50, 60] : [22, 40, 58];
        for (const at of shots) if (T === Math.round(at * k)) this.spit();
        if (T === 16) g.audio.sfx('hiss');
        if (T > 90 * k) { this.set('idle'); this.cooldown = 40 * k; }
        break;
      }
      case 'grubs': {
        this.headK = T < 40 ? 1 : 0;
        if (T === 6) { g.audio.sfx('roar', 0.6); g.gfx.shake = 3; }
        const drops = this.enraged ? [40, 60, 80, 100] : [44, 80, 116];
        drops.forEach((at, i) => {
          const h = this.holes[i % 2];
          const dt = Math.round(at * k) - T;
          if (dt > 0 && dt < 24) h.setFrame(art().orifice[1]);
          else if (dt <= 0 && dt > -16) h.setFrame(art().orifice[2]);
          if (dt === 0 && grubCount(g) < MAX_GRUBS) {
            g.enemies.push(new Grub(g, h.x, h.y + 13, (i % 2 ? -1 : 1) * 0.5, 0.5, 0, 1));
            g.audio.sfx('plop');
          }
        });
        if (T > 140 * k) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'dying': {
        this.headK = 1;
        this.ventK = T < 120 ? 2 : 0;
        this.squeeze = T < 150 && T % 4 < 2 ? 2 : 0;
        if (T === 30) {
          // one last, enormous one
          g.audio.sfx('toot');
          for (let i = 0; i < 6; i++) g.misc.push(new GasCloud(g, this.x + (i - 2.5) * 14, this.floor - 20, (i - 2.5) * 0.5, -0.6 - (i % 3) * 0.25, 0, true));
          g.flashText('PFFFFFT!', this.x, this.floor - 60);
        }
        if (T % 7 === 0 && T < 220) explode(g, this.x + (Math.random() - 0.5) * 160, this.floor - 20 - Math.random() * 110, Math.random() < 0.3 ? 'L' : 'M', T % 14 === 0);
        if (T > 150) this.sink += 0.8;
        if (T > 300) { this.dead = true; g.onBossDefeated(); return; }
        break;
      }
    }
    // the vent takes real damage only while it is open
    this.vent.invulnerable = this.ventK < 2 || this.mode === 'dying' || this.mode === 'intro';
    this.head.invulnerable = this.mode === 'dying' || this.mode === 'intro';
    this.collideBody();
    this.draw();
  }

  /** Walking into her is fatal. */
  private collideBody() {
    if (this.mode === 'dying') return;
    for (const p of this.g.livePlayers()) {
      if (!p.alive) continue;
      const [cx, cy] = p.center();
      for (const side of [-1, 1]) {
        const lx = this.x + side * (40 - this.squeeze), ly = this.floor - 44 + this.bob;
        if (Math.hypot(cx - lx, cy - ly) < 50) p.hurt();
      }
    }
  }

  private lay() {
    const g = this.g;
    const [vx, vy] = this.ventPos;
    g.enemies.push(new Egg(g, vx - 6, vy, -1.4 - Math.random() * 2.2, -2.6 - Math.random() * 1.4));
    g.audio.sfx('plop');
  }
  private toot() {
    const g = this.g;
    const [vx] = this.ventPos;
    g.misc.push(new GasCloud(g, vx - 30, this.floor + 4, -2.6, 0, this.arenaX - 40));
    g.audio.sfx('toot');
    g.gfx.shake = Math.max(g.gfx.shake, 4);
  }
  private spit() {
    const g = this.g;
    const [hx, hy] = this.headPos;
    const mx = hx, my = hy + 16;
    const [px, py] = g.player.center();
    const dx = px - mx;
    const tFly = Math.max(36, Math.abs(dx) / 2.4);
    const vx = dx / tFly, vy = (py - my) / tFly - 0.08 * tFly / 2;
    const n = this.enraged ? 2 : 1;
    for (let i = 0; i < n; i++) g.eBullets.push(new EnemyBullet(g, mx, my, vx * (1 - i * 0.25), Math.max(-5, vy) - i * 0.5, g.assets.fx.spit, 3.5, 0.08));
    g.audio.sfx('hiss', 0.6);
  }

  private draw() {
    const a = art();
    const fl = this.flashT > 0 ? 0.6 : this.mode === 'dying' && this.modeT % 6 < 3 ? 0.4 : 0;
    const ly = this.floor - 44 + this.sink;
    // legs poke out either side and scuttle while she moves
    const moving = this.mode === 'intro';
    this.legs.forEach((s, i) => {
      const side = i < 3 ? -1 : 1, j = i % 3;
      const ph = Math.sin(this.t / (moving ? 3 : 14) + i * 2.1) * (moving ? 0.35 : 0.1);
      s.x = this.x + side * 70; s.y = ly - 26 + j * 16;
      s.flip = side < 0;
      s.rot = side * (-0.25 + j * 0.3 + ph);
      s.flash = fl * 0.6;
      s.sync();
    });
    const t = this.thoraxS;
    t.x = this.x - 4; t.y = this.floor - 94 + this.bob * 0.6 + this.sink; t.flash = fl * 0.6; t.sync();
    const h = this.headS;
    const [hx, hy] = this.headPos;
    h.setFrame(a.head[this.headK]);
    h.x = hx; h.y = hy;
    h.rot = this.mode === 'dying' ? Math.min(0.9, this.modeT / 160) : Math.sin(this.t / 50) * 0.08;
    h.flash = this.flashT > 0 && !this.vent.invulnerable ? fl * 0.4 : fl; h.sync();
    this.lobes.forEach((s, i) => {
      const side = i === 0 ? -1 : 1;
      // when she waits they take turns bobbing; it is meant to look like a taunt
      const wig = this.mode === 'idle' ? Math.sin(this.t / 7) * 1.5 * side : 0;
      s.x = this.x + side * (40 - this.squeeze); s.y = ly + this.bob + wig;
      s.flash = fl; s.sync();
    });
    const v = this.ventS;
    const [vx, vy] = this.ventPos;
    v.setFrame(a.vent[this.ventK]);
    v.x = vx; v.y = vy; v.flash = fl; v.sync();
    // hit boxes follow the art
    this.vent.b = [vx - 16, vy - 18, vx + 16, vy + 18];
    this.head.b = [hx - 20, hy - 16, hx + 20, hy + 20];
    this.shell.b = this.mode === 'intro' || this.mode === 'dying' ? [0, 0, 0, 0] : [this.x - 88, this.floor - 92, this.x + 88, this.floor];
  }
  destroy() {
    for (const s of [...this.legs, this.thoraxS, this.headS, ...this.lobes, this.ventS, ...this.holes]) s.remove();
  }
}
