import type { Sprite } from '../engine/gfx';
import { VW } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { Enemy, EnemyBullet, shoot } from './enemies';
import { Anim, Debris, explode } from './effects';
import { JEEP_DECK } from '../art/desert';

// Stage 2's jeep ride: the jeep itself, the dirt bikers that chase it and the
// gunship that hounds it until the sandworm shows up.

/** Kick up a little cloud of sand (the grey smoke puff, tinted). */
export function dust(g: Game, x: number, y: number, z = 14) {
  const a = new Anim(g, g.assets.fx.puff, x, y, 5, z);
  a.sprite.setTint(1.25, 0.95, 0.62);
  a.vy = -0.15;
  g.addFx(a);
  return a;
}

export class Jeep {
  sprite: Sprite;
  x: number; y: number;      // anchor: bottom of the wheels
  vx = 0; vy = 0;
  state: 'drive' | 'crash' | 'wreck' = 'drive';
  t = 0;
  bump = 0;
  smokeT = 0;
  constructor(public g: Game, x: number, public ground: number) {
    this.x = x; this.y = ground;
    this.sprite = g.gfx.sprite(g.assets.desert.jeep[0], 28);
  }
  /** Top of the rear bed the player stands on. */
  get deckY() { return this.y - JEEP_DECK - this.bump; }
  update() {
    const g = this.g, art = g.assets.desert;
    this.t++;
    const s = this.sprite;
    switch (this.state) {
      case 'drive':
        // little hops over the washboard road
        this.bump = this.t % 47 < 3 || this.t % 71 < 2 ? 1 : 0;
        s.setFrame(art.jeep[Math.floor(this.t / 2) % 4]);
        if (this.t % 4 === 0) dust(g, this.x - 14 + Math.random() * 4, this.ground - 2);
        if (this.t % 9 === 0) g.audio.sfx('engine', 0.5);
        s.rot = 0;
        break;
      case 'crash':
        // flung end over end
        this.vy += 0.24;
        this.x += this.vx; this.y += this.vy;
        s.rot += 0.16;
        if (this.y >= this.ground && this.vy > 0) {
          this.y = this.ground; this.wreck();
          explode(g, this.x, this.y - 14, 'L');
          g.audio.sfx('crash');
        }
        break;
      case 'wreck':
        this.vx *= 0.9; this.x += this.vx;
        if (++this.smokeT % 7 === 0) { const a = new Anim(g, g.assets.fx.puff, this.x + (Math.random() - 0.5) * 30, this.y - 30, 7, 27); a.vy = -0.5; g.addFx(a); }
        if (this.smokeT % 23 === 0) g.addFx(new Anim(g, g.assets.fx.fireball, this.x + (Math.random() - 0.5) * 24, this.y - 24, 4, 29, true));
        break;
    }
    s.x = this.x; s.y = this.state === 'wreck' ? this.y - 30 : this.y - this.bump;
    if (this.state === 'crash') s.y = this.y - 22;
    s.sync();
  }
  /** Skip straight to the burnt-out wreck (restarting from the checkpoint after the crash). */
  wreck() {
    this.state = 'wreck';
    const s = this.sprite;
    s.setFrame(this.g.assets.desert.jeepWreck); s.rot = Math.PI; s.flip = true;
  }
  crash() {
    const g = this.g;
    this.state = 'crash';
    this.vx = 2.6; this.vy = -5.5;
    g.gfx.shake = 8;
    g.audio.sfx('crash');
    explode(g, this.x + 30, this.y - 10, 'M');
    // the driver bails out the other way
    g.addFx(new Debris(g, g.assets.desert.driver, this.x + 10, this.y - 30, -1.4, -5.5, 120, 0.2, 29));
  }
  destroy() { this.sprite.remove(); }
}

/** A soldier on a dirt bike who rides alongside the jeep and takes potshots. */
export class Biker extends Enemy {
  rx: number;           // position on screen
  target: number;
  phase: 'enter' | 'ride' | 'leave' = 'enter';
  fireT: number;
  constructor(g: Game, public fromLeft: boolean, public ground: number) {
    super(g, 0, ground, g.assets.desert.bike[0], 26);
    this.rx = fromLeft ? -30 : VW + 30;
    this.target = fromLeft ? 30 + Math.random() * 50 : 250 + Math.random() * 90;
    this.x = g.gfx.camX + this.rx;
    this.hp = 3; this.score = 300;
    this.touch = false; // a lane closer to the camera than the jeep
    this.cullMargin = 140;
    this.fireT = 80 + Math.random() * 50;
  }
  box(): [number, number, number, number] { return [this.x - 14, this.y - 36, this.x + 16, this.y - 4]; }
  update() {
    const g = this.g;
    switch (this.phase) {
      case 'enter':
        this.rx += (this.target - this.rx) * 0.04 + (this.fromLeft ? 0.5 : -0.5);
        if (Math.abs(this.rx - this.target) < 6) this.phase = 'ride';
        break;
      case 'ride':
        this.rx += Math.sin(this.t / 40) * 0.6;
        if (--this.fireT <= 0 && g.player.alive) {
          const mx = this.x + 14, my = this.y - 26;
          shoot(g, mx, my, this.angleToPlayer(mx, my), 1.9);
          g.addFx(new Anim(g, g.assets.fx.flash, mx, my, 2, 36, true));
          this.fireT = 130 + Math.random() * 60;
        }
        if (this.t > 420) this.phase = 'leave';
        break;
      case 'leave':
        this.rx += 3.2;
        if (this.rx > VW + 60) this.dead = true;
        break;
    }
    this.x = g.gfx.camX + this.rx;
    const bump = (this.t + (this.fromLeft ? 0 : 20)) % 37 < 3 ? 1 : 0;
    this.y = this.ground - bump;
    if (this.t % 5 === 0 && g.scrollVx > 0) dust(g, this.x - 14, this.ground - 2, 25);
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(g.assets.desert.bike[Math.floor(this.t / 3) % 2]);
    s.x = this.x; s.y = this.y; s.sync();
  }
}

/** Bombs fall with gravity and burst on the sand. */
class Bomb extends EnemyBullet {
  update() {
    super.update();
    if (this.dead && this.life > 0 && this.y > this.g.gfx.camY + 20) explode(this.g, this.x, this.y - 4, 'S');
  }
}

/** The gunship mid-boss of the jeep ride. It keeps pace with the view. */
export class Gunship implements Hittable {
  dead = false;
  hp = 70;
  maxHp = 70;
  invulnerable = true;
  sprite: Sprite;
  rotor: Sprite;
  rx = VW + 90; ry = 40;
  x = 0; y = 0;
  phase: 'enter' | 'fight' | 'falling' | 'gone' = 'enter';
  t = 0;
  flashT = 0;
  vy = 0;
  constructor(public g: Game, public ground: number) {
    const art = g.assets.desert;
    this.sprite = g.gfx.sprite(art.heli, 24);
    this.sprite.setFlashColor(1, 1, 1);
    this.rotor = g.gfx.sprite(art.heliRotor[0], 24);
    g.audio.sfx('alarm');
    g.banner = { text: 'WARNING', sub: 'ATTACK GUNSHIP', t: 120 };
  }
  get alive() { return this.phase === 'enter' || this.phase === 'fight'; }
  box(): [number, number, number, number] {
    if (!this.alive) return [0, 0, 0, 0];
    return [this.x - 36, this.y - 14, this.x + 30, this.y + 14];
  }
  hit(dmg: number) {
    if (!this.alive || this.invulnerable) return;
    this.hp -= dmg; this.flashT = 4;
    this.g.audio.sfx('hit');
    if (this.hp <= 0) {
      this.phase = 'falling'; this.t = 0; this.vy = -1;
      this.g.addScore(5000);
      this.g.audio.sfx('roar', 0.3);
      explode(this.g, this.x, this.y, 'L');
    }
  }
  /** Swallowed whole by the worm. */
  eaten() {
    if (!this.alive) return;
    explode(this.g, this.x, this.y, 'L');
    this.phase = 'gone';
    this.sprite.visible = false; this.rotor.visible = false;
  }
  update() {
    const g = this.g;
    this.t++;
    if (this.flashT > 0) this.flashT--;
    const [px, py] = g.player.center();
    switch (this.phase) {
      case 'enter':
        this.rx += (250 - this.rx) * 0.03;
        this.ry = 54 + Math.sin(this.t / 23) * 6;
        if (this.t > 120) { this.phase = 'fight'; this.t = 0; this.invulnerable = false; }
        break;
      case 'fight': {
        const c = this.t % 200;
        if (c < 80) {
          this.rx += (260 + Math.sin(this.t / 50) * 50 - this.rx) * 0.05;
          // chin gun burst
          if (c >= 30 && c <= 46 && c % 8 === 6 && g.player.alive) {
            const mx = this.x - 40, my = this.y + 12;
            shoot(g, mx, my, Math.atan2(py - my, px - mx), 2.2);
            g.addFx(new Anim(g, g.assets.fx.flash, mx, my, 2, 36, true));
          }
        } else if (c < 150) {
          // bombing run: sweep back over the jeep, dropping a stick of bombs with gaps to stand in
          this.rx += (40 - this.rx) * 0.045;
          if (c === 96 || c === 112 || c === 128) {
            g.eBullets.push(new Bomb(g, this.x + 4, this.y + 18, 0, 0.4, g.assets.desert.bomb, 4, 0.12, 200, true));
            g.audio.sfx('enemyShot', 0.6);
          }
        } else this.rx += (260 - this.rx) * 0.04;
        this.ry = 56 + Math.sin(this.t / 23) * 8;
        break;
      }
      case 'falling':
        this.vy += 0.08;
        this.ry += this.vy;
        this.rx -= 1.2;
        this.sprite.rot = Math.sin(this.t / 3) * 0.3 + this.t * 0.03;
        if (this.t % 7 === 0) explode(g, this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 20, 'M', this.t % 14 === 0);
        if (this.y > this.ground - 16) {
          explode(g, this.x, this.y, 'L');
          for (let i = 0; i < 4; i++) explode(g, this.x - 30 + i * 20, this.y - 10, 'M', false);
          this.phase = 'gone';
          this.sprite.visible = false; this.rotor.visible = false;
        }
        break;
      case 'gone':
        this.dead = true;
        break;
    }
    if (this.alive && this.t % 7 === 0) g.audio.sfx('heli', 0.35);
    this.x = g.gfx.camX + this.rx; this.y = g.gfx.camY + this.ry;
    const s = this.sprite;
    if (this.phase === 'falling') s.setFrame(g.assets.desert.heliWreck);
    s.flash = this.flashT > 0 ? 0.8 : 0;
    s.x = this.x; s.y = this.y; s.sync();
    const r = this.rotor;
    r.setFrame(g.assets.desert.heliRotor[Math.floor(this.t / 2) % 3]);
    r.rot = s.rot;
    r.x = this.x + 6 + Math.sin(s.rot) * 24; r.y = this.y - 24 + (1 - Math.cos(s.rot)) * 24; r.sync();
  }
  destroy() { this.sprite.remove(); this.rotor.remove(); }
}
