import { ConflictError } from '../editor-core/http.js';
import { DEFAULT_LAB_DIR, fetchDiskDir, fetchDiskEtags, loadDiskLabs, saveDiskLab, type DiskLab } from './disk.js';
import type { LabModel } from './lab-model.js';
import type { LabScript } from './lab-types.js';
import { parseLabText, validateLab } from './store.js';

/**
 * The lab's link to `scripts/harness/terminal-lab/` (dev server only): which labs the repo has, saving the open one there,
 * reading one from there, and noticing that the open lab's file changed on disk after it was opened or saved.
 * The baseline itself is on the model (`LabModel.setRepoBaseline`), like the editors' `FileBaselineTracker`.
 */
export class RepoLink {
  writable = false;
  dir = DEFAULT_LAB_DIR;
  labs: DiskLab[] = [];

  get ids(): string[] {
    return this.labs.filter((l) => l.json !== null).map((l) => l.id);
  }

  async refresh(): Promise<void> {
    const [state, dir] = await Promise.all([loadDiskLabs(), fetchDiskDir()]);
    this.writable = state.writable;
    this.labs = state.labs;
    this.dir = state.writable ? dir : DEFAULT_LAB_DIR;
  }

  /** The repo copy of a lab, checked; or why it cannot be used. */
  read(id: string): { script: LabScript; etag: string } | { problem: string } {
    const disk = this.labs.find((l) => l.id === id);
    if (!disk) return { problem: `no lab "${id}" in the repo` };
    if (disk.json === null) return { problem: disk.problem ?? `${disk.file} is not valid JSON` };
    const parsed = parseLabText(JSON.stringify(disk.json));
    return parsed.script ? { script: parsed.script, etag: disk.etag } : { problem: `${disk.file} is not a valid lab: ${parsed.problems[0]}` };
  }

  /** Gives the model its repo baseline when the repo has a lab with its id (on start, after a refresh). */
  adopt(model: LabModel): void {
    const found = this.read(model.id);
    if ('script' in found) model.setRepoBaseline(found.script, found.etag);
  }

  /** True when the open lab's repo file changed after it was opened or saved here. */
  async changed(model: LabModel): Promise<boolean> {
    if (!this.writable) return false;
    return model.changedInRepo(await fetchDiskEtags());
  }

  /** Writes the open lab to the repo. Returns what to tell the user. A stale baseline is refused by the server (409). */
  async save(model: LabModel): Promise<{ ok: boolean; stale?: boolean; message: string }> {
    if (!this.writable) return { ok: false, message: 'the repo is read-only: run the dev server (npm start) to save labs there' };
    const problems = validateLab(model.script);
    if (problems.length > 0) return { ok: false, message: `✕ not saved: ${problems[0]}` };
    try {
      const saved = await saveDiskLab(model.script, model.repoEtag);
      model.setRepoBaseline(structuredClone(model.script), saved.etag);
      await this.refresh();
      const stale = model.changedInRepo(Object.fromEntries(this.labs.map((l) => [l.file, l.etag])));
      const savedPath = saved.path ?? `${this.dir}/${model.id}.lab.json`;
      return { ok: true, stale, message: `saved ${savedPath}${saved.created ? ' (new file)' : ''}` };
    } catch (err) {
      const conflict = err instanceof ConflictError;
      return { ok: false, message: `✕ ${(err as Error).message}${conflict ? '. Nothing was overwritten: use "Reload from repo", or Duplicate this lab.' : ''}` };
    }
  }
}
