#!/usr/bin/env node
// Validates all chapters/* manifests, story/comix.spec.json, story/dialogs.json, and levels/*/level.spec.json
// against ModelCatalog, BESTIARY, RoomKind, and Haunted Terminal's art-bible & solvability rules.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, projectRoot, withProcgen } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--chapter', '--root']);
const chaptersRoot = resolve(projectRoot, args.val('--root', 'chapters'));
const filterChapter = args.val('--chapter', '');

// Filled from src/chapters/validate-pack.ts so there is one list of rooms, mechanics and pickups, not a copy per script.
let VALID_ROOMS = new Set();
let VALID_PICKUPS = new Set();
let VALID_MECHANICS = new Set();

function loadJson(filePath, errors) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push(`${filePath}: invalid JSON (${err.message})`);
    return null;
  }
}

await withProcgen(async (procgen, vite) => {
  const { BESTIARY } = await vite.ssrLoadModule('/src/game/bestiary.ts');
  const lists = await vite.ssrLoadModule('/src/chapters/validate-pack.ts');
  const { checkPack } = await vite.ssrLoadModule('/src/chapter-editor/check.ts');
  VALID_ROOMS = new Set(lists.ROOM_KINDS);
  VALID_PICKUPS = new Set(lists.PICKUP_TYPES);
  VALID_MECHANICS = new Set(lists.MECHANICS);
  const modelIds = new Set(procgen.ModelCatalog.list().map((e) => e.id));
  const enemyTypes = new Set(Object.keys(BESTIARY));

  if (!existsSync(chaptersRoot)) {
    console.error(`chapters root not found: ${chaptersRoot}`);
    process.exit(1);
  }

  const dirs = readdirSync(chaptersRoot)
    .filter((d) => statSync(resolve(chaptersRoot, d)).isDirectory())
    .filter((d) => (!filterChapter ? true : d === filterChapter))
    .sort();

  if (dirs.length === 0) {
    console.error(`no chapter folders matched under ${chaptersRoot}`);
    process.exit(1);
  }

  const errors = [];
  let checkedManifests = 0;
  let checkedLevels = 0;
  let checkedPanels = 0;

  for (const dirName of dirs) {
    const cDir = resolve(chaptersRoot, dirName);
    const manifestPath = resolve(cDir, 'chapter.manifest.json');
    if (!existsSync(manifestPath)) {
      errors.push(`${dirName}: missing chapter.manifest.json`);
      continue;
    }

    const manifest = loadJson(manifestPath, errors);
    if (!manifest) continue;
    checkedManifests++;

    if (manifest.id !== dirName) {
      errors.push(`${manifestPath}: manifest.id "${manifest.id}" must match folder name "${dirName}"`);
    }
    if (!manifest.title || typeof manifest.issueNumber !== 'number') {
      errors.push(`${manifestPath}: missing title or numeric issueNumber`);
    }
    if (!manifest.allyNpc?.model || !modelIds.has(manifest.allyNpc.model)) {
      errors.push(`${manifestPath}: allyNpc.model "${manifest.allyNpc?.model}" is not a registered ModelCatalog ID`);
    } else if (manifest.allyNpc.model.startsWith('vibecoder.')) {
      errors.push(`${manifestPath}: HUMAN_ZONE_MISUSE — allyNpc.model "${manifest.allyNpc.model}" cannot use vibecoder.* human palette models`);
    }
    if (!manifest.boss?.model || !modelIds.has(manifest.boss.model)) {
      errors.push(`${manifestPath}: boss.model "${manifest.boss?.model}" is not a registered ModelCatalog ID`);
    }
    if (!Array.isArray(manifest.levels) || manifest.levels.length === 0) {
      errors.push(`${manifestPath}: levels[] must be non-empty`);
      continue;
    }

    // Validate Comix story spec if declared
    if (manifest.comix) {
      const comixPath = resolve(cDir, manifest.comix.specPath);
      const dialogsPath = resolve(cDir, manifest.comix.dialogsPath);
      if (!existsSync(comixPath)) {
        errors.push(`${dirName}: missing ${manifest.comix.specPath}`);
      } else {
        const comix = loadJson(comixPath, errors);
        if (comix) {
          if (!Array.isArray(comix.pages) || comix.pages.length !== manifest.comix.pageCount) {
            errors.push(`${comixPath}: pages.length (${comix.pages?.length}) !== manifest.comix.pageCount (${manifest.comix.pageCount})`);
          }
          for (const page of comix.pages ?? []) {
            if (!Array.isArray(page.panels) || page.panels.length === 0) {
              errors.push(`${comixPath}: page ${page.pageNumber} has no panels`);
              continue;
            }
            for (const panel of page.panels) {
              checkedPanels++;
              const [rx, ry, rw, rh] = panel.rect ?? [];
              if (
                [rx, ry, rw, rh].some((v) => typeof v !== 'number' || Number.isNaN(v)) ||
                rx < 0 ||
                ry < 0 ||
                rw <= 0 ||
                rh <= 0 ||
                rx + rw > 1.001 ||
                ry + rh > 1.001
              ) {
                errors.push(`${comixPath}: panel "${panel.id}" has out-of-bounds rect ${JSON.stringify(panel.rect)}`);
              }
              if (panel.room && !modelIds.has(panel.room)) {
                errors.push(`${comixPath}: panel "${panel.id}" unknown room model "${panel.room}"`);
              }
              for (const actor of panel.cast ?? []) {
                if (!modelIds.has(actor.model)) {
                  errors.push(`${comixPath}: panel "${panel.id}" unknown cast model "${actor.model}"`);
                }
              }
            }
          }
        }
      }

      if (!existsSync(dialogsPath)) {
        errors.push(`${dirName}: missing ${manifest.comix.dialogsPath}`);
      } else {
        const dialogs = loadJson(dialogsPath, errors);
        if (dialogs) {
          for (const lvl of manifest.levels) {
            const d = dialogs.levels?.[lvl.id];
            if (!d) {
              errors.push(`${dialogsPath}: missing dialog entry for level "${lvl.id}"`);
            } else if (!Array.isArray(d.hankRungs) || d.hankRungs.length !== 3 || d.hankRungs.some((r) => !r?.trim())) {
              errors.push(`${dialogsPath}: level "${lvl.id}" must provide exactly 3 non-empty hankRungs`);
            }
          }
        }
      }
    }

    // Validate per-level specs
    for (const lvl of manifest.levels) {
      if (!VALID_ROOMS.has(lvl.roomKind)) {
        errors.push(`${manifestPath}: level "${lvl.id}" invalid roomKind "${lvl.roomKind}"`);
      }
      if (!VALID_MECHANICS.has(lvl.mechanic)) {
        errors.push(`${manifestPath}: level "${lvl.id}" invalid mechanic "${lvl.mechanic}"`);
      }
      for (const et of lvl.enemies ?? []) {
        if (!enemyTypes.has(et)) {
          errors.push(`${manifestPath}: level "${lvl.id}" unknown enemy type "${et}"`);
        }
      }

      if (lvl.specPath) {
        const specFile = resolve(cDir, lvl.specPath);
        if (!existsSync(specFile)) {
          errors.push(`${dirName}: missing level spec ${lvl.specPath}`);
          continue;
        }
        const spec = loadJson(specFile, errors);
        if (!spec) continue;
        checkedLevels++;

        if (spec.id !== lvl.id) {
          errors.push(`${specFile}: spec.id "${spec.id}" !== manifest level id "${lvl.id}"`);
        }
        if (!VALID_ROOMS.has(spec.roomKind)) {
          errors.push(`${specFile}: invalid roomKind "${spec.roomKind}"`);
        }
        if (typeof spec.floorTheme !== 'number' || spec.floorTheme < 1 || spec.floorTheme > 5) {
          errors.push(`${specFile}: floorTheme must be 1..5 (got ${spec.floorTheme})`);
        }
        if (!spec.exitDir && !spec.exitCommand) {
          errors.push(`${specFile}: level must define either exitDir or exitCommand`);
        }
        if (!Array.isArray(spec.winRules) || spec.winRules.length === 0) {
          errors.push(`${specFile}: winRules[] must be non-empty`);
        }
        if (!Array.isArray(spec.solutionCommands) || spec.solutionCommands.length === 0) {
          errors.push(`${specFile}: solutionCommands[] must be non-empty`);
        }
        for (const e of spec.enemies ?? []) {
          if (!enemyTypes.has(e.type)) {
            errors.push(`${specFile}: enemy "${e.id}" has unknown BESTIARY type "${e.type}"`);
          }
        }
        for (const pk of spec.pickups ?? []) {
          if (!VALID_PICKUPS.has(pk.type)) {
            errors.push(`${specFile}: pickup "${pk.id}" has invalid type "${pk.type}"`);
          }
        }
      }
    }
  }

  // The same static checks the chapter editor's Check tab runs: references, asset ids and the field tables (script blocks included).
  for (const dirName of dirs) {
    const cDir = resolve(chaptersRoot, dirName);
    const manifest = existsSync(resolve(cDir, 'chapter.manifest.json')) ? loadJson(resolve(cDir, 'chapter.manifest.json'), errors) : null;
    if (!manifest) continue;
    const read = (rel) => (rel && existsSync(resolve(cDir, rel)) ? loadJson(resolve(cDir, rel), errors) : undefined);
    const levels = (manifest.levels ?? []).map((l) => read(l.specPath)).filter(Boolean).sort((a, b) => a.index - b.index);
    if (levels.length === 0) continue;
    const pack = { manifest, levels, dialogs: read(manifest.comix?.dialogsPath), comix: read(manifest.comix?.specPath) };
    for (const issue of checkPack(pack)) {
      if (issue.severity === 'error') errors.push(`${dirName}/${issue.where}: ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`chapter spec validation FAILED (${errors.length} errors):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(
    `chapter specs OK: ${checkedManifests} chapters, ${checkedLevels} executable level specs, ${checkedPanels} comix panels (0 errors)`,
  );
});
