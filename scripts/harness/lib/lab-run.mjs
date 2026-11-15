// Runs one Terminal Lab document headlessly, the way terminal-lab.mjs, the unit test and the smoke test all need it.
//   const mods = await loadLabModules(vite);   const r = await runLabText(mods, text);
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { labsDir, listLabFiles } from './terminal-lab-api.mjs';

/** Extra ticks after the script, with every enemy free to fire: the lab's promise is that nobody is hurt, ever. */
export const SOAK_TICKS = 30;
const HURT = ['PLAYER_DAMAGED', 'PLAYER_RESPAWNED'];

export async function loadLabModules(vite) {
  return {
    store: await vite.ssrLoadModule('/src/terminal-lab/store.ts'),
    check: await vite.ssrLoadModule('/src/terminal-lab/lab-check.ts'),
    driver: await vite.ssrLoadModule('/src/terminal-lab/node-driver.ts'),
    runner: await vite.ssrLoadModule('/src/terminal-lab/runner.ts'),
  };
}

/** Every committed lab file, with its name and text. */
export function committedLabs() {
  return listLabFiles(labsDir).map((file) => ({ file, path: resolve(labsDir, file), text: readFileSync(resolve(labsDir, file), 'utf8') }));
}

/**
 * Parses, checks and runs a lab. `problems` (not a lab) and `errors` (checkLab errors) stop it before it runs.
 * `transcript` covers the script's steps only, so it can be compared with the browser's; `hurt` names what hurt the player
 * during the steps or the soak, or is null.
 */
export async function runLabText(mods, text) {
  const { script, problems } = mods.store.parseLabText(text);
  if (!script) return { problems, errors: [], results: [] };
  const errors = mods.check.checkLab(script).filter((i) => i.severity === 'error');
  if (errors.length > 0) return { script, problems: [], errors, results: [] };
  const driver = mods.driver.createNodeDriver(script);
  const { results, reason } = await mods.runner.runSteps(driver, script.steps, { stopOnFail: false });
  const transcript = mods.runner.transcriptOf(results);
  const hurtStep = results.find((r) => r.eventTypes.some((t) => HURT.includes(t)));
  let hurt = hurtStep ? `step ${hurtStep.index + 1}` : null;
  for (let i = 0; i < SOAK_TICKS && !hurt; i++) {
    if ((await driver.tick()).events.some((e) => HURT.includes(e.type))) hurt = `soak tick ${i + 1}`;
  }
  const after = await driver.inspect();
  if (!hurt && after.hp !== after.maxHp) hurt = `HP ${after.hp}/${after.maxHp}`;
  return { script, problems: [], errors: [], results, reason, transcript, hurt, absorbed: after.absorbedTotal };
}
