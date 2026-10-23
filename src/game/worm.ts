import type { Sprite } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { Enemy, EnemyBullet } from './enemies';
import { explode } from './effects';
import { dust } from './vehicles';

// The stage 2 boss: a colossal sandworm. It is drawn just behind the ground tiles,
// so the sand itself hides whatever part of it is still underground.

const WORM_Z = 11;

/** A chain of body segments along a curve, capped by the head. Used by the boss and its cameo. */
export class WormBody {
  segs: Sprite[] = [];
  head: Sprite;
  headAng = -Math.PI / 2;
  constructor(public g: Game, n = 14) {
    const art = g.assets.desert;
    for (let i = 0; i < n; i++) {
      const s = g.gfx.sprite(art.wormSeg[i % 3 === 1 ? 1 : 0], WORM_Z);
      s.setFlashColor(1, 1, 1);
      this.segs.push(s);
    }
    this.head = g.gfx.sprite(art.wormHead[0], WORM_Z);
    this.head.setFlashColor(1, 1, 1);
  }
  /** Lay the body along a quadratic curve from the buried base (b) through c to the head (h). */
  draw(bx: number, by: number, cx: number, cy: number, hx: number, hy: number, open: number, flash = 0, flashRed = false) {
    const n = this.segs.length;
    const pt = (t: number): [number, number] => [
      (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * hx,
      (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy + t * t * hy,
    ];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const [x, y] = pt(t);
      const [x2, y2] = pt(Math.min(1, t + 0.02));
      const s = this.segs[i];
      s.x = x; s.y = y;
      s.rot = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
      const shade = 0.6 + 0.4 * t;
      s.setTint(shade, shade * 0.97, shade * 0.95);
      s.flash = flash * 0.6;
      s.setFlashColor(1, flashRed ? 0.35 : 1, flashRed ? 0.35 : 1);
      s.sync();
    }
    const [ax, ay] = pt(0.97);
    this.headAng = Math.atan2(hy - ay, hx - ax);
    const h = this.head;
    h.setFrame(this.g.assets.desert.wormHead[open]);
    h.x = hx; h.y = hy;
    h.rot = this.headAng + Math.PI / 2;
    h.flash = flash;
    h.setFlashColor(1, flashRed ? 0.35 : 1, flashRed ? 0.35 : 1);
    h.sync();
  }
  /** Center of the dome / maw, used for hit boxes and where shots come from. */
  mouth(hx: number, hy: number): [number, number] {
    return [hx + Math.cos(this.headAng) * 30, hy + Math.sin(this.headAng) * 30];
  }
  set visible(v: boolean) { for (const s of this.segs) s.visible = v; this.head.visible = v; }
  destroy() { for (const s of this.segs) s.remove(); this.head.remove(); }
}

type Mode = 'emerge' | 'sway' | 'spit' | 'larvae' | 'dive' | 'tunnel' | 'tremble' | 'burst' | 'gasp' | 'sink' | 'return' | 'dying';

/** Shots only really hurt when the petals are peeled open. */
const ARMORED = 0.25, EXPOSED = 2;

export class SandWorm implements Hittable {
  dead = false;
  hp = 150;
  maxHp = 150;
  invulnerable = true;
  deflect = false;
  body: WormBody;
  mound: Sprite;
  mode: Mode = 'emerge';
  modeT = 0;
  t = 0;
  baseX: number;          // where the body leaves the sand
  hx: number; hy: number; // head position
  lean = 0;
  open = 0;               // 0..2
  flashT = 0;
  cooldown = 90;
  attacks = 0;
  tunnelX = 0;
  enraged = false;
  dyingT = 0;
  constructor(public g: Game, public homeX: number, public floor: number, public left: number, public right: number) {
    this.body = new WormBody(g, 14);
    this.mound = g.gfx.sprite(g.assets.desert.mound, 13);
    this.mound.visible = false;
    this.baseX = homeX;
    this.hx = homeX; this.hy = floor + 80;
    g.audio.sfx('rumble');
    g.audio.sfx('roar');
  }
  get idleY() { return this.floor - 90; }
  get exposed() { return this.open >= 2 || this.mode === 'gasp'; }
  get above() { return this.hy < this.floor - 20; }
  set(m: Mode) { this.mode = m; this.modeT = 0; }
  box(): [number, number, number, number] {
    if (!this.above || this.mode === 'dying') return [0, 0, 0, 0];
    const [mx, my] = this.body.mouth(this.hx, this.hy);
    return [mx - 22, my - 22, mx + 22, my + 22];
  }
  hit(dmg: number) {
    if (this.dead || this.invulnerable || this.mode === 'dying') return;
    const g = this.g;
    if (this.exposed) { this.hp -= dmg * EXPOSED; this.flashT = 4; g.audio.sfx('hit'); }
    else { this.hp -= dmg * ARMORED; this.flashT = 2; g.audio.sfx('clink', 0.35); }
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
    for (const e of g.enemies) if (e instanceof Burrower) e.die();
  }
  update() {
    const g = this.g;
    this.t++; this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const k = this.enraged ? 0.65 : 1;
    const [px] = g.player.center();
    const ease = (tx: number, ty: number, f: number) => { this.hx += (tx - this.hx) * f; this.hy += (ty - this.hy) * f; };
    const sway = Math.sin(this.t / 40) * 14;
    let showMound = false;
    this.invulnerable = !this.above || this.mode === 'emerge' || this.mode === 'return';
    switch (this.mode) {
      case 'emerge':
        ease(this.baseX + sway * 0.3, this.idleY, 0.04);
        this.open = 0;
        if (this.modeT % 6 === 0) dust(g, this.baseX + (Math.random() - 0.5) * 50, this.floor - 2, 14);
        g.gfx.shake = Math.max(g.gfx.shake, 1.5);
        if (this.modeT > 130) { this.set('sway'); this.cooldown = 50; }
        break;
      case 'sway':
        ease(this.baseX + sway, this.idleY + Math.cos(this.t / 27) * 5, 0.06);
        this.open = 0;
        if (--this.cooldown <= 0 && g.player.alive) {
          this.attacks++;
          if (this.attacks % 4 === 3) this.set('larvae');
          else if (this.attacks % 4 === 2 || (this.enraged && this.attacks % 2 === 0)) this.set('dive');
          else this.set('spit');
        }
        break;
      case 'spit': {
        // lean toward the player, peel open, lob a fan of sand
        const lean = Math.max(-60, Math.min(60, (px - this.baseX) * 0.35));
        ease(this.baseX + lean, this.idleY + 10, 0.06);
        this.open = this.modeT < 20 * k ? 0 : this.modeT < 40 * k ? 1 : 2;
        if (this.modeT === Math.round(28 * k)) g.audio.sfx('gulp');
        const volleys = this.enraged ? [46, 76, 106] : [50, 90];
        for (const v of volleys) if (this.modeT === Math.round(v * k)) this.spit();
        if (this.modeT > (this.enraged ? 130 : 130) * k) { this.set('sway'); this.cooldown = (80 + Math.random() * 40) * k; }
        break;
      }
      case 'larvae':
        ease(this.baseX, this.idleY - 6, 0.08);
        this.open = this.modeT > 20 ? 2 : 1;
        if (this.modeT === 20) { g.audio.sfx('roar', 0.6); g.gfx.shake = 4; }
        if (this.modeT === 40 || this.modeT === 70 || (this.enraged && this.modeT === 100)) {
          const x = this.left + 40 + Math.random() * (this.right - this.left - 80);
          g.enemies.push(new Burrower(g, x, this.floor));
        }
        if (this.modeT > 120) { this.set('sway'); this.cooldown = 70 * k; }
        break;
      case 'dive':
        // rear up, then plunge back into the sand
        this.open = 0;
        if (this.modeT < 20) ease(this.baseX, this.idleY - 14, 0.1);
        else { this.hy += 6; this.hx += (this.baseX - this.hx) * 0.2; }
        if (this.modeT === 20) g.audio.sfx('bite');
        if (this.hy > this.floor + 80) { this.set('tunnel'); this.tunnelX = this.baseX; g.audio.sfx('rumble', 0.6); }
        break;
      case 'tunnel':
        // a bulge in the sand homes in on the player
        showMound = true;
        this.tunnelX += Math.sign(px - this.tunnelX) * Math.min(Math.abs(px - this.tunnelX), this.enraged ? 3.2 : 2.4);
        this.tunnelX = Math.max(this.left + 30, Math.min(this.right - 30, this.tunnelX));
        if (this.modeT % 5 === 0) dust(g, this.tunnelX + (Math.random() - 0.5) * 20, this.floor - 2, 14);
        if (this.modeT > 40 && (Math.abs(px - this.tunnelX) < 6 || this.modeT > 150)) { this.set('tremble'); g.audio.sfx('rumble'); }
        break;
      case 'tremble':
        // locked in place and shaking: get clear
        showMound = true;
        g.gfx.shake = Math.max(g.gfx.shake, 1.2);
        if (this.modeT % 4 === 0) dust(g, this.tunnelX + (Math.random() - 0.5) * 36, this.floor - 2, 14);
        if (this.modeT > (this.enraged ? 34 : 46)) {
          this.set('burst');
          this.baseX = this.tunnelX; this.hx = this.tunnelX; this.hy = this.floor + 60;
          g.audio.sfx('bigBoom', 0.6); g.gfx.shake = 7;
          for (let i = -3; i <= 3; i++) dust(g, this.baseX + i * 10, this.floor - 4, 45);
        }
        break;
      case 'burst': {
        this.hy -= 13;
        this.open = 2;
        if (this.hy <= this.idleY + 10) { this.hy = this.idleY + 10; this.set('gasp'); }
        // the eruption column is deadly
        for (const p of g.livePlayers()) {
          if (!p.alive) continue;
          const b = p.box();
          if (b[2] > this.baseX - 20 && b[0] < this.baseX + 20 && b[3] > this.hy - 50) p.hurt();
        }
        break;
      }
      case 'gasp':
        // stuck up in the air, maw wide open: the moment to unload on it
        this.open = 2;
        ease(this.baseX + Math.sin(this.modeT / 6) * 4, this.idleY + 14, 0.1);
        if (this.modeT > 100 * (this.enraged ? 0.8 : 1)) this.set('sink');
        break;
      case 'sink':
        this.open = this.modeT < 10 ? 1 : 0;
        this.hy += 4;
        if (this.hy > this.floor + 80) { this.set('return'); this.tunnelX = this.baseX; }
        break;
      case 'return':
        // burrow back home before rising again
        showMound = true;
        this.tunnelX += Math.sign(this.homeX - this.tunnelX) * Math.min(Math.abs(this.homeX - this.tunnelX), 3);
        if (this.modeT % 6 === 0) dust(g, this.tunnelX, this.floor - 2, 14);
        if (Math.abs(this.tunnelX - this.homeX) < 1) {
          this.baseX = this.homeX; this.hx = this.homeX; this.hy = this.floor + 60;
          this.set('emerge'); this.modeT = 80;
          g.audio.sfx('rumble', 0.6);
        }
        break;
      case 'dying': {
        // it wilts, flops over onto the sand and slides back under
        this.open = 0;
        const d = Math.min(1, this.modeT / 110);
        const tx = this.baseX + 110 * d, ty = this.idleY + (this.floor - 14 - this.idleY) * d * d;
        ease(tx, ty, 0.1);
        if (this.modeT % 8 === 0 && this.modeT < 150) explode(g, this.hx + (Math.random() - 0.5) * 60, this.hy + Math.random() * 60, Math.random() < 0.3 ? 'L' : 'M', this.modeT % 16 === 0);
        if (this.modeT > 150) this.hy += 0.8;
        if (this.modeT > 260) { this.dead = true; g.onBossDefeated(); }
        break;
      }
    }
    // body curve: the base sits under the sand, the bend follows the lean
    const by = this.floor + 50;
    let cx = this.baseX + (this.hx - this.baseX) * 0.15, cy = (by + this.hy) / 2;
    if (this.mode === 'dying') { cx = this.baseX + 10; cy = this.idleY - 30 * Math.min(1, this.modeT / 110); }
    const warn = this.mode === 'tremble' && this.modeT % 6 < 3;
    this.body.draw(this.baseX, by, cx, cy, this.hx, this.hy, this.open,
      this.flashT > 0 ? (this.exposed ? 0.8 : 0.3) : this.mode === 'dying' && this.modeT % 6 < 3 ? 0.5 : 0, false);
    const m = this.mound;
    m.visible = showMound;
    if (showMound) { m.x = this.tunnelX + (this.mode === 'tremble' ? Math.sin(this.modeT * 1.7) * 2 : 0); m.y = this.floor + 2; m.flash = warn ? 0.5 : 0; m.setFlashColor(1, 0.3, 0.3); m.sync(); }
  }
  private spit() {
    const g = this.g;
    const [mx, my] = this.body.mouth(this.hx, this.hy);
    const [px, py] = g.player.center();
    const T = 52, grav = 0.12;
    const n = this.enraged ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const f = 0.65 + (i / (n - 1)) * 0.75;
      const vx = ((px - mx) / T) * f + (Math.random() - 0.5) * 0.3;
      const vy = (py - my) / T - 0.5 * grav * T - i * 0.15;
      g.eBullets.push(new EnemyBullet(g, mx, my, vx, vy, g.assets.desert.sandball, 4, grav, 300, true));
    }
    g.audio.sfx('hiss');
  }
  destroy() { this.body.destroy(); this.mound.remove(); }
}

/** Baby sandworms: a ripple that slides toward you, then a snapping leap. */
export class Burrower extends Enemy {
  phase: 'under' | 'leap' = 'under';
  vx = 0; vy = 0;
  wait: number;
  constructor(g: Game, x: number, public floor: number) {
    super(g, x, floor, g.assets.desert.ripple[0], 19);
    this.hp = 2; this.score = 200;
    this.boomSize = 'S';
    this.wait = 40 + Math.random() * 40;
    this.cullMargin = 60;
  }
  box(): [number, number, number, number] {
    if (this.phase === 'under') return [0, 0, 0, 0];
    return [this.x - 10, this.y - 12, this.x + 12, this.y + 2];
  }
  update() {
    const g = this.g;
    const [px] = g.player.center();
    this.touch = this.phase === 'leap';
    this.invulnerable = this.phase === 'under';
    const s = this.sprite;
    if (this.phase === 'under') {
      const dir = Math.sign(px - this.x) || 1;
      const nx = this.x + dir * 1.3;
      // stay on solid sand
      if (g.world.groundBelow(nx, this.floor + 1, 2)) this.x = nx;
      this.y = this.floor;
      if (this.t % 9 === 0) dust(g, this.x, this.floor - 2, 18);
      if (--this.wait <= 0 && Math.abs(px - this.x) < 90) {
        this.phase = 'leap';
        this.vx = Math.max(-2.2, Math.min(2.2, (px - this.x) / 34));
        this.vy = -4.6;
        g.audio.sfx('hiss', 0.4);
      }
      s.setFrame(g.assets.desert.ripple[Math.floor(this.t / 4) % 3]);
      s.rot = 0; s.flip = false;
    } else {
      this.vy += 0.2;
      this.x += this.vx; this.y += this.vy;
      s.setFrame(g.assets.desert.larva[Math.floor(this.t / 5) % 2]);
      s.flip = this.vx < 0;
      s.rot = Math.atan2(this.vy, Math.abs(this.vx) + 0.01) * (this.vx < 0 ? -1 : 1);
      if (this.vy > 0 && this.y >= this.floor) {
        // dive back under
        this.y = this.floor; this.phase = 'under'; this.wait = 50 + Math.random() * 40;
        dust(g, this.x, this.floor - 2, 18);
      }
    }
    this.baseUpdate();
    s.x = this.x; s.y = this.y; s.sync();
  }
}

/** The worm's surprise appearance that wrecks the jeep (and the gunship, if it is still up). */
export class WormCameo {
  body: WormBody;
  t = 0;
  dead = false;
  hx: number; hy: number;
  constructor(public g: Game, public x: number, public floor: number, public prey: { x: number; y: number; eaten(): void } | null) {
    this.body = new WormBody(g, 16);
    this.hx = x; this.hy = floor + 80;
    this.body.visible = false;
    g.audio.sfx('rumble');
  }
  update() {
    const g = this.g;
    this.t++;
    const t = this.t;
    if (t < 22) {
      g.gfx.shake = Math.max(g.gfx.shake, 2);
      if (t % 3 === 0) dust(g, this.x + (Math.random() - 0.5) * 40, this.floor - 2, 45);
      return;
    }
    if (t === 22) { this.body.visible = true; g.audio.sfx('roar'); g.gfx.shake = 8; for (let i = -3; i <= 3; i++) dust(g, this.x + i * 12, this.floor - 4, 45); }
    let cx = this.x, cy = this.floor - 60;
    if (t < 46) {
      // straight up out of the road, chasing the gunship if there is one
      this.hy -= 12;
      if (this.prey) { this.hx += (this.prey.x - this.hx) * 0.08; if (Math.abs(this.hy - this.prey.y) < 24) { this.prey.eaten(); this.prey = null; g.audio.sfx('bite'); } }
    } else {
      // arc over and dive back into the dunes ahead
      const k = Math.min(1, (t - 46) / 60);
      this.hx += (this.x + 190 - this.hx) * 0.06;
      this.hy = this.floor - 230 + k * k * 330;
      cx = this.x + 40; cy = this.floor - 200;
    }
    this.body.draw(this.x, this.floor + 60, cx, cy, this.hx, this.hy, t < 46 ? 2 : 0);
    if (t > 120) { this.dead = true; this.body.visible = false; }
  }
  destroy() { this.body.destroy(); }
}
