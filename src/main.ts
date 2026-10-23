import { VW, VH } from './engine/gfx';
import { Game } from './game/game';
import { Lobby } from './net/lobby';
import type { Lockstep } from './net/lockstep';

if (location.search.includes('sheet')) {
  import('./sheetview').then((m) => m.run());
} else {
  const stage = document.getElementById('stage')!;
  const gl = document.getElementById('gl') as HTMLCanvasElement;
  const hud = document.getElementById('hud') as HTMLCanvasElement;

  // Integer scaling keeps pixels square and crisp.
  const fit = () => {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VW, window.innerHeight / VH)));
    const s2 = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    const scale = s2 - s > 0.5 && s < 2 ? s2 : s;
    stage.style.width = Math.round(VW * scale) + 'px';
    stage.style.height = Math.round(VH * scale) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();

  const game = new Game(gl, hud);
  (window as any).game = game;
  game.boot();

  // online co-op: while a session runs it steps the game in lockstep with the partner
  let net: Lockstep | null = null;
  const lobby = new Lobby(game, (session) => {
    net = session;
    (window as any).net = session;
    session.onEnd = (reason) => { net = null; game.endNet(); lobby.open(reason); };
  });
  game.onOnline = () => lobby.open();
  const room = new URLSearchParams(location.search).get('room');
  if (room) lobby.joinFromLink(room);

  // fixed 60 Hz simulation with a render each animation frame
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  const frame = (now: number) => {
    if (net) { net.tick(now); last = now; acc = 0; }
    else {
      acc += Math.min(100, now - last);
      last = now;
      let steps = 0;
      while (acc >= STEP && steps < 4) { game.update(); acc -= STEP; steps++; }
      if (steps >= 4) acc = 0;
    }
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
