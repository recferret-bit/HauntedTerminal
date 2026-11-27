import { FxCatalog, ModelCatalog } from '../procgen/index.js';
import { solvePack, type SolveReport } from '../chapters/solve.js';
import { assetIssues, validatePack, type PackIssue } from '../chapters/validate-pack.js';
import type { ChapterPack } from '../chapters/types.js';
import { schemaIssues } from './schema-check.js';

/**
 * Every static check a chapter has, in one list: references (files, enemies, sockets, cores), asset ids against the
 * model/FX catalogs, and the field tables. The editor's Check tab and `generate-chapter.mjs --validate/--verify` both call this,
 * so a human and an agent see the same errors.
 */
export function checkPack(pack: ChapterPack): PackIssue[] {
  return [
    ...guarded('reference checks', () => validatePack(pack)),
    ...guarded('asset checks', () => assetIssues(pack, (id) => ModelCatalog.has(id), (id) => FxCatalog.has(id))),
    ...guarded('field checks', () => schemaIssues(pack)),
  ];
}

/**
 * Runs one group of checks. A hand-edited draft can break the shape a group walks (a null list, a string where an object
 * goes); that becomes one issue, so the Check tab and the CLI still show the field errors that explain it.
 */
function guarded(group: string, run: () => PackIssue[]): PackIssue[] {
  try {
    return run();
  } catch (err) {
    console.error(`[checkPack] ${group} threw (a malformed spec, or a bug in the check if the spec looks fine):`, err);
    const message = `${group} stopped on a malformed spec (fix the field errors first): ${err instanceof Error ? err.message : String(err)}`;
    return [{ severity: 'error', where: 'chapter', tab: 'check', message }];
  }
}

export function runSolve(pack: ChapterPack, levelId?: string): SolveReport {
  return solvePack(pack, { levelId, ticks: 2 });
}
