/**
 * /cinematic.html: preview the cinematics outside the game.
 *   ?play=intro | outro      start one right away (otherwise a small menu)
 *   &t=<seconds>             freeze at that moment (fast-forwarded with fixed steps): for screenshots
 *   &muted=1  &skippable=0   the CinematicOptions
 *   &rank=S|A|B|C  &time=<s>  &commands=<n>  &shortcuts=a,b   outro stats
 * `window.__cinematic` reports { state: 'playing' | 'done', which } and the DOM text for checks.
 */
import { playIntro, playOutro, type OutroStats } from './index.js';
import { startIntro } from './intro.js';
import { startOutro } from './outro.js';

const params = new URLSearchParams(location.search);
const host = document.getElementById('host')!;
const menu = document.getElementById('menu')!;
const state = { state: 'idle' as 'idle' | 'playing' | 'done', which: '' };
(window as unknown as { __cinematic: unknown }).__cinematic = {
  get state() {
    return state.state;
  },
  get which() {
    return state.which;
  },
  text: () => host.innerText,
  children: () => host.childElementCount,
};

const stats: OutroStats = {
  rank: (['S', 'A', 'B', 'C'].includes(params.get('rank') ?? '') ? params.get('rank') : 'A') as OutroStats['rank'],
  timeSec: Number(params.get('time') ?? 1234),
  commands: Number(params.get('commands') ?? 87),
  shortcuts: (params.get('shortcuts') ?? 'ls -la,chmod +x,kill -9,cd -,!!,tab-complete').split(',').filter(Boolean),
};
const opts = { muted: params.get('muted') === '1', skippable: params.get('skippable') !== '0' };
const freeze = params.has('t') ? Number(params.get('t')) : undefined;

async function play(which: string): Promise<void> {
  menu.hidden = true;
  state.state = 'playing';
  state.which = which;
  if (freeze !== undefined && Number.isFinite(freeze)) {
    if (which === 'outro') await startOutro(host, stats, opts, { freezeAt: freeze });
    else await startIntro(host, opts, { freezeAt: freeze });
  } else if (which === 'outro') await playOutro(host, stats, opts);
  else await playIntro(host, opts);
  state.state = 'done';
  menu.hidden = false;
}

menu.addEventListener('click', (e) => {
  const which = (e.target as HTMLElement).closest('button')?.dataset.play;
  if (which) void play(which);
});

const which = params.get('play');
if (which === 'intro' || which === 'outro') void play(which);
else menu.hidden = false;
