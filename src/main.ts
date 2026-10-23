import { VW, VH } from './engine/gfx';
import { Game } from './game/game';

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

  // fixed 60 Hz simulation with a render each animation frame
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  const frame = (now: number) => {
    acc += Math.min(100, now - last);
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 4) { game.update(); acc -= STEP; steps++; }
    if (steps >= 4) acc = 0;
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
