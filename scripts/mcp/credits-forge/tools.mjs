// The tools of the credits-forge MCP server, exported as plain functions + metadata for server.mjs.
import {
  getChapterFile,
  getLevel,
  listAssets,
  listLevels,
  solveLevel,
  validateChapter,
  validateLevel,
  writeChapterFile,
  writeLevel,
} from './chapter-tools.mjs';
import { getComix, listComix, validateComix, writeComix } from './comix-tools.mjs';
import { getLab, listLabs, runLab, validateLabTool, writeLab } from './lab-tools.mjs';
import { createContext, ForgeError } from './shared.mjs';

export { createContext, ForgeError };

export const TOOLS = {
  list_assets: {
    run: listAssets,
    description: 'List the ids a level or comix spec may reference: models (with category), room kinds, FX presets (family, anchor, durationMs, word, moment, layers), and audio cues (sfx, music). kind: all (default), models, rooms, fx or audio.',
  },
  list_levels: {
    run: listLevels,
    description: 'List the chapters and their levels (id, index, title, mechanic, spec path). Pass chapter to list one.',
  },
  get_level: {
    run: getLevel,
    description: 'Read one level spec from disk with its etag. Send the etag back to write_level.',
  },
  validate_level: {
    run: validateLevel,
    description: "Run the chapter editor's Check tab on the chapter with this level in place. Pass a draft `spec`, or `levelId` to check the one on disk. Writes nothing.",
  },
  solve_level: {
    run: solveLevel,
    description: "Play the level's solutionCommands headlessly under enemy ticks and report ok, commands, deaths, problem and the last output. Pass a draft `spec`, or `levelId` for the one on disk. Writes nothing.",
  },
  write_level: {
    run: writeLevel,
    description: 'Save a level spec: only if it validates, clears with 0 deaths, and baseEtag matches the file. Writes canonically and recompiles the chapter catalog.',
  },
  get_chapter_file: {
    run: getChapterFile,
    description: 'Read chapter.manifest.json, story/dialogs.json, story/comix.spec.json, or a level spec with its etag.',
  },
  validate_chapter: {
    run: validateChapter,
    description: 'Validate an entire chapter pack (optionally overlaying a draft path + json in memory without touching disk).',
  },
  write_chapter_file: {
    run: writeChapterFile,
    description: 'Save chapter.manifest.json or story/*.json after checkPack validation and baseEtag check, writing canonically and recompiling the chapter catalog. Use write_level for levels.',
  },
  list_comix: {
    run: listComix,
    description: 'List all animated 3D comix sequences and their pages (id, index, title, from/until, path). Pass comix to filter to one.',
  },
  get_comix: {
    run: getComix,
    description: 'Read a comix sequence (manifest + pages) or a single file (path + etag) from disk.',
  },
  validate_comix: {
    run: validateComix,
    description: 'Run static checkComixPack checks and 60fps simulation (runComixSim) on a comix sequence, optionally overlaying a draft path + json in memory.',
  },
  write_comix: {
    run: writeComix,
    description: 'Save comix.manifest.json or an existing pages/<id>/page.spec.json only after validation, 60fps simulation, and baseEtag check. Writes canonically and recompiles the comix catalog.',
  },
  list_labs: {
    run: listLabs,
    description: 'List committed Terminal Lab documents under scripts/harness/terminal-lab/*.lab.json with step/setup counts and etags.',
  },
  get_lab: {
    run: getLab,
    description: 'Read one *.lab.json document with its etag for validate_lab, run_lab, or write_lab.',
  },
  validate_lab: {
    run: validateLabTool,
    description: 'Validate a Terminal Lab schema and static checkLab checks, by committed id or draft script object. Writes nothing.',
  },
  run_lab: {
    run: runLab,
    description: 'Run a Terminal Lab headlessly through node-driver + 30 enemy soak ticks asserting zero player damage, by committed id or draft script object.',
  },
  write_lab: {
    run: writeLab,
    description: 'Create or update a committed <id>.lab.json only after checkLab validation, full headless run + 30 soak ticks (0 damage), and baseEtag check.',
  },
};
