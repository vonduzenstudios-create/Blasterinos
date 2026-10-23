import { LOOKS, buildHero, type HeroFrames, type Look } from '../art/humanoid';
import { buildFx, type FxArt } from '../art/fx';
import { buildEnemyArt, type EnemyArt } from '../art/enemies';
import { buildProps, type PropArt } from '../art/props';
import { buildHydra, type HydraArt } from '../art/hydra';
import { buildDesert, type DesertArt } from '../art/desert';
import { skyCanvas, mountainsCanvas, canopyCanvas, jungleNearCanvas, cliffCanvas, fernCanvas } from '../art/backgrounds';

// Everything is generated once at boot and shared.
export interface Assets {
  heroes: Record<string, HeroFrames>;
  looks: Record<string, Look>;
  fx: FxArt; enemies: EnemyArt; props: PropArt; hydra: HydraArt; desert: DesertArt;
  bg: { sky: HTMLCanvasElement; mountains: HTMLCanvasElement; canopy: HTMLCanvasElement; near: HTMLCanvasElement; cliff: HTMLCanvasElement; ferns: HTMLCanvasElement[] };
}

export function buildAssets(): Assets {
  return {
    heroes: { ryder: buildHero(LOOKS.ryder), voss: buildHero(LOOKS.voss) },
    looks: LOOKS,
    fx: buildFx(),
    enemies: buildEnemyArt(),
    props: buildProps(),
    hydra: buildHydra(),
    desert: buildDesert(),
    bg: {
      sky: skyCanvas(), mountains: mountainsCanvas(), canopy: canopyCanvas(), near: jungleNearCanvas(), cliff: cliffCanvas(),
      ferns: [fernCanvas(1), fernCanvas(2), fernCanvas(3)],
    },
  };
}
