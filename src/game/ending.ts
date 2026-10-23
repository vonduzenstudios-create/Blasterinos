import { VW, VH } from '../engine/gfx';
import { drawText } from '../engine/font';
import { RNG } from '../engine/pixel';
import type { Game } from './game';
import { ENDING_SONG } from './hivemusic';

// The ending, after the last boss falls: the hive caves in, the dropship gets
// out, then the credits roll. Drawn entirely on the HUD canvas.

const ESCAPE = 420;       // frames of the escape scene before the roll starts
const LINE = 13;
const SPEED = 0.45;       // px per frame
const advance = (l: Line) => (l.scale ? LINE * l.scale * 0.6 + LINE : LINE);

/** A filled circle in whole pixels, so it matches the rest of the art. */
function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  c.fillStyle = col;
  const R = Math.max(1, Math.round(r));
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.round(Math.sqrt(R * R - dy * dy));
    c.fillRect(Math.round(x) - w, Math.round(y) + dy, w * 2 + 1, 1);
  }
}

interface Line { text: string; color: string; scale?: number; }

export class Ending {
  t = 0;
  lines: Line[] = [];
  stars: [number, number, number][] = [];
  rollEnd: number;
  constructor(public g: Game, stages: { num: number; name: string; villain?: string }[]) {
    g.audio.play(ENDING_SONG);
    const rng = new RNG(5);
    for (let i = 0; i < 90; i++) this.stars.push([rng.range(0, VW), rng.range(0, VH), rng.int(0, 2)]);
    const gold = '#ffd040', white = '#ffffff', soft = '#c8c0e0', red = '#ff8080';
    const L = (text: string, color = white, scale?: number) => this.lines.push({ text, color, scale });
    L('BLASTERINOS', '#ff6040', 3); L(''); L(''); L('');
    L('STARRING', gold); L('RYDER'); L('VOSS'); L(''); L('');
    L('THE ROUTE', gold);
    for (const s of stages) L('STAGE ' + s.num + '  ' + s.name, soft);
    L(''); L('');
    const villains = stages.filter((s) => s.villain);
    if (villains.length) {
      L('THE VILLAINS', gold);
      for (const s of villains) L(s.villain!, red);
      L(''); L('');
    }
    L('A VONDUZEN STUDIOS GAME', gold); L('');
    L('DESIGN AND DIRECTION', gold); L('MATTHEW DAUPHINAIS'); L('');
    L('CODE, PIXELS, SOUND AND MUSIC', gold); L('CLAUDE'); L('ALL OF IT GENERATED IN CODE', soft); L(''); L('');
    L('NO GRUBS WERE HARMED', soft); L('IN THE MAKING OF THIS GAME', soft); L(''); L('OK, A FEW.', soft); L(''); L(''); L('');
    L('THANK YOU FOR PLAYING', white);
    // scroll distance until the last line has gone off the top
    this.rollEnd = this.lines.reduce((h, l) => h + advance(l), 0) + VH + 30;
  }
  /** Returns true once the player has watched it through and pressed start. */
  update(): boolean {
    this.t++;
    const i = this.g.input;
    const done = this.rolled;
    const press = i.pressed('start') || i.pressed('jump') || i.pressed('shoot');
    // the roll can be sped up by holding a button
    if (this.t > ESCAPE && !done && (i.held('jump') || i.held('shoot'))) this.t += 2;
    return done && this.t > ESCAPE + this.rollEnd / SPEED + 60 && press;
  }
  get rolled() { return (this.t - ESCAPE) * SPEED >= this.rollEnd; }
  draw(c: CanvasRenderingContext2D) {
    const t = this.t;
    c.fillStyle = '#05030a'; c.fillRect(0, 0, VW, VH);
    for (const [x, y, k] of this.stars) {
      const tw = (Math.floor(t / 20 + x) % 7) === 0;
      c.fillStyle = k === 2 ? '#ffffff' : k === 1 ? '#a8a0d0' : '#5a5480';
      const sy = t > ESCAPE ? (y - (t - ESCAPE) * (0.05 + k * 0.05) + VH * 4) % VH : y;
      if (!tw) c.fillRect(Math.round(x), Math.round(sy), 1, 1);
    }
    if (t < ESCAPE) this.drawEscape(c);
    else this.drawRoll(c);
  }

  private drawEscape(c: CanvasRenderingContext2D) {
    const t = this.t;
    const shake = t < 300 ? Math.round(Math.sin(t * 1.7) * Math.min(3, t / 60)) : 0;
    const blown = t > 300;
    // the hive: a lumpy mound on the horizon, splitting open
    if (!blown) {
      c.fillStyle = '#24102a';
      for (let x = 0; x < VW; x += 2) {
        const h = 46 + Math.sin(x / 31) * 14 + Math.sin(x / 9 + 1) * 4 + (x > 150 && x < 240 ? 30 * Math.sin(((x - 150) / 90) * Math.PI) : 0);
        c.fillRect(x + shake, VH - h, 2, h);
      }
      c.fillStyle = '#3a1c44';
      for (let x = 0; x < VW; x += 2) {
        const h = 46 + Math.sin(x / 31) * 14 + Math.sin(x / 9 + 1) * 4 + (x > 150 && x < 240 ? 30 * Math.sin(((x - 150) / 90) * Math.PI) : 0);
        c.fillRect(x + shake, VH - h, 2, 2);
      }
      // fire bursting out of the cracks
      const rng = new RNG(Math.floor(t / 5) + 1);
      for (let i = 0; i < Math.min(8, t / 30); i++) {
        const x = rng.range(20, VW - 20), y = VH - rng.range(10, 60), r = rng.range(3, 8) * (1 + (t % 5) / 5);
        disc(c, x + shake, y, r, rng.next() < 0.5 ? '#ff8a20' : '#e0401a');
        disc(c, x + shake, y - r * 0.2, r * 0.6, '#ffd040');
        disc(c, x + shake, y - r * 0.3, r * 0.3, '#fff6a0');
      }
    } else {
      // a crater, smoking
      c.fillStyle = '#140a16';
      for (let x = 0; x < VW; x += 2) { const h = 22 + Math.sin(x / 31) * 8; c.fillRect(x, VH - h, 2, h); }
      c.fillStyle = 'rgba(90,80,90,0.5)';
      for (let i = 0; i < 6; i++) { const x = 120 + i * 26 + Math.sin(t / 30 + i) * 6, y = VH - 30 - ((t - 300) * (0.3 + i * 0.05)) % 80; c.fillRect(Math.round(x), Math.round(y), 10, 8); }
    }
    // the dropship lifts off and climbs away
    if (t > 120) {
      const k = Math.min(1, (t - 120) / 240);
      const sx = 190 + k * k * 260, sy = VH - 70 - k * 150;
      this.drawShip(c, Math.round(sx), Math.round(sy), t);
    }
    // the big one
    if (t > 300 && t < 360) {
      const a = 1 - (t - 300) / 60;
      c.fillStyle = `rgba(255,250,220,${a.toFixed(2)})`; c.fillRect(0, 0, VW, VH);
    }
    const say = (from: number, text: string, y: number, col = '#ffffff') => { if (t > from && (Math.floor(t / 3) % 2 === 0 || t > from + 12)) drawText(c, text, VW / 2, y, col, { align: 'center' }); };
    say(20, 'THE HIVE MOTHER IS DEAD.', 30, '#ffd040');
    say(90, 'WITHOUT HER, THE WHOLE NEST CAVES IN...', 46);
    say(200, 'RYDER AND VOSS MAKE IT OUT. BARELY.', 62);
  }

  private drawShip(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
    // hull
    c.fillStyle = '#120d16'; c.fillRect(x - 15, y - 5, 30, 10); c.fillRect(x - 19, y - 2, 4, 5);
    c.fillStyle = '#4e6030'; c.fillRect(x - 14, y - 4, 28, 8);
    c.fillStyle = '#7e9448'; c.fillRect(x - 14, y - 4, 28, 2);
    c.fillStyle = '#2a3418'; c.fillRect(x - 14, y + 2, 28, 2);
    // cockpit and fins
    c.fillStyle = '#7ac0ff'; c.fillRect(x + 6, y - 3, 6, 3);
    c.fillStyle = '#2e3240'; c.fillRect(x - 12, y - 9, 6, 5); c.fillRect(x - 6, y + 4, 10, 3);
    // engine flame
    const f = t % 4 < 2 ? 6 : 4;
    c.fillStyle = '#ff8a20'; c.fillRect(x - 18 - f, y - 1, f, 3);
    c.fillStyle = '#fff6a0'; c.fillRect(x - 18 - f / 2, y, f / 2, 1);
  }

  private drawRoll(c: CanvasRenderingContext2D) {
    const t = this.t - ESCAPE;
    const scroll = Math.min(t * SPEED, this.rollEnd);
    let y = VH + 10 - scroll;
    // keep the text off the strip the heroes run along
    c.save();
    c.beginPath(); c.rect(0, 0, VW, VH - 56); c.clip();
    for (const l of this.lines) {
      if (y > -20 && y < VH + 10 && l.text) drawText(c, l.text, VW / 2, Math.round(y), l.color, { align: 'center', scale: l.scale });
      y += advance(l);
    }
    c.restore();
    // the two of them, running home along the bottom
    const g = this.g;
    c.fillStyle = '#140a16'; c.fillRect(0, VH - 12, VW, 12);
    c.fillStyle = '#3a1c44'; c.fillRect(0, VH - 12, VW, 1);
    ['ryder', 'voss'].forEach((id, k) => {
      const fr = g.assets.heroes[id].run.f;
      const f = fr[Math.floor(t / 5 + k * 3) % fr.length];
      c.drawImage(f.canvas, Math.round(VW / 2 - 20 + k * 30 - f.ax), Math.round(VH - 12 - f.ay));
    });
    if (this.rolled) {
      // the roll is over: the end card stays up
      drawText(c, 'THE END', VW / 2, 70, '#ffd040', { align: 'center', scale: 3 });
      drawText(c, 'FINAL SCORE ' + g.score, VW / 2, 108, '#ffffff', { align: 'center' });
      if (t % 60 < 40) drawText(c, 'PRESS START', VW / 2, 140, '#c8c0e0', { align: 'center' });
    }
  }
}
