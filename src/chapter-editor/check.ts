import '../procgen/index.js';
import { ModelCatalog } from '../procgen/core/catalog.js';
import { solvePack, type SolveReport } from '../chapters/solve.js';
import { assetIssues, validatePack, type PackIssue } from '../chapters/validate-pack.js';
import type { ChapterPack } from '../chapters/types.js';
import { schemaIssues } from './schema-check.js';

/**
 * Every static check a chapter has, in one list: references (files, enemies, sockets, cores), asset ids against the
 * model catalog, and the field tables. The editor's Check tab and `generate-chapter.mjs --validate/--verify` both call this,
 * so a human and an agent see the same errors.
 */
export function checkPack(pack: ChapterPack): PackIssue[] {
  return [...validatePack(pack), ...assetIssues(pack, (id) => ModelCatalog.has(id)), ...schemaIssues(pack)];
}

export function runSolve(pack: ChapterPack, levelId?: string): SolveReport {
  return solvePack(pack, { levelId, ticks: 2 });
}
