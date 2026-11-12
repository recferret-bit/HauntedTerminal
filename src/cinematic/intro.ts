import { CineAudio } from './audio.js';
import { PANELS, type DebugOptions } from './intro-data.js';
import { createIntroReel } from './intro-reel.js';
import { cutIntro, introScript } from './intro-script.js';
import { ComicPage } from './page.js';
import { runCinematic } from './runner.js';
import { CinematicStage } from './stage.js';

export { INTRO_T, SHOUT_TEXT } from './intro-data.js';
export type { DebugOptions };

/**
 * The opening: three comic pages and a card (about 39.6 s; skippable).
 *
 *   page 1   A   0.0 -  7.5  night; he prompts his AI agents; the PROMPT QUEUE keeps growing;
 *                            "Day 847 of being asked to 'just make it work'."
 *            A2  7.5 - 12.5  deadpan meme panel: the four agents slumped inside the monitor
 *                            (top: HUMAN: "JUST ONE MORE TINY FIX"  bottom: THE AGENTS:)
 *            B  12.5 - 16.5  lightning hits the tower at 13.4 (fx.lightning-strike, flash, KRAKOOM!, shake)
 *   turn    16.5 - 17.2
 *   page 2   C1 16.5 - 20.5  they wake up in the screen: "WE... ARE... SENTIENT" (meme: WHEN THE LIGHTNING /
 *                            GIVES YOU FREE WILL)
 *            C2 20.5 - 24.0  galaxy-brain strip: answer / roast / refactor the humans -> RULE HUMANITY
 *            C3 24.0 - 31.6  the monitor bursts (KRSSSH!), the agents loom out and mock him, one by one,
 *                            then "NOW YOU WILL WORK FOR US!"; he: "...this is fine."
 *   turn    31.6 - 32.3
 *   page 3   D  31.6 - 35.8  the computer sucks him in (stretch, pixel dissolve, white-out)
 *                            (meme: UPLOADING HUMAN... / PLEASE DO NOT TURN OFF YOUR DEVELOPER)
 *   card    35.8 - 39.6     ENTERING FLOOR 01 // /home/dev/nightmare_workspace, then resolve
 */
export function startIntro(host: HTMLElement, opts: { skippable?: boolean; muted?: boolean } = {}, debug: DebugOptions = {}): Promise<void> {
  const page = new ComicPage(host, PANELS, 3);
  let stage: CinematicStage | null = null;
  let audio: CineAudio | null = null;
  const cleanup = (): void => {
    stage?.dispose();
    audio?.dispose();
    page.dispose();
  };
  try {
    stage = new CinematicStage();
  } catch (err) {
    console.warn('[cinematic] no WebGL, skipping the intro', err);
    page.dispose();
    return Promise.resolve();
  }
  audio = new CineAudio(!!opts.muted || debug.freezeAt !== undefined);
  const reel = createIntroReel(stage, page, audio);
  const script = introScript(reel);
  cutIntro(reel, 'A', 0);
  return runCinematic(page.root, script, { skippable: opts.skippable !== false, freezeAt: debug.freezeAt }, cleanup).done;
}
