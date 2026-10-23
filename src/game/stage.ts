import type { Song } from '../engine/audio';
import type { Hittable } from './weapons';
import type { Spawn } from './level';
import type { Body } from './world';

/** A moving platform the player rides on (the stage 2 jeep). */
export interface Deck { x0: number; x1: number; y: number; }

/**
 * Everything that differs between stages: the map, camera rules, scripted events
 * and bosses. The Game owns the shared entity lists and calls into the stage.
 */
export interface Stage {
  readonly num: number;
  readonly name: string;
  readonly song: Song;
  readonly bossSong: Song;
  /** The boss, by name, for the ending's credits roll. */
  readonly villain?: string;
  /** Lines shown under the score on the stage clear screen. */
  readonly clearLines: string[];
  /** The boss is up, so a restart here should open with the boss song. */
  readonly inBoss: boolean;
  /** Mid-boss or boss on screen: soldier spawners hold off. */
  readonly bossActive: boolean;
  /** Build the map, backdrops and spawns for a checkpoint and place the camera. */
  build(cp: number): void;
  /** Where the player drops in when starting from a checkpoint. */
  start(cp: number): { x: number; y: number; after?: () => void };
  update(): void;
  updateCamera(): void;
  parts(): Hittable[];
  bossBar(): [number, number, string] | null;
  /** Spawn kinds only this stage knows about. Returns false if not handled. */
  spawn(s: Spawn): boolean;
  /** The platform the player is riding, if any. */
  deck(): Deck | null;
  /** Footing under a body standing on the ground: 1 is normal, lower is slippery. */
  grip?(b: Body): number;
  /** Custom drop-in after a death. Returns false to use the default. */
  respawn(): boolean;
  onMidBossDefeated(): void;
  onBossDefeated(): void;
  destroy(): void;
}
