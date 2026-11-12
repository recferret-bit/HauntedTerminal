import { bootPlay } from './boot.js';
import { bindPlayInput, mountPlayDev, mountPlayHud, mountPlayShell } from './input.js';
import { armPlayClock, wirePlayLoop } from './loop.js';
import { wirePlayOutro } from './outro.js';

export function startPlay(): void {
  void runPlay().catch((err) => {
    console.error(err);
  });
}

async function runPlay(): Promise<void> {
  const play = await bootPlay();
  mountPlayShell(play);
  wirePlayLoop(play);
  wirePlayOutro(play);
  mountPlayHud(play);
  bindPlayInput(play);
  mountPlayDev(play);
  armPlayClock(play);
  await play.startRun();
}
