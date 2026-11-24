#!/usr/bin/env node
// Deterministic generator for Out Of Credits's Tauri v2 + Steamworks Rust desktop wrapper.
//   node scripts/desktop/generate-tauri-steam.mjs                     writes src-tauri/ (standalone + optional `steam` Cargo feature)
//   node scripts/desktop/generate-tauri-steam.mjs --steam-dev         sets Spacewar dev App ID 480 + writes steam_appid.txt
//   node scripts/desktop/generate-tauri-steam.mjs --app-id <id>       sets production Steam App ID
//   node scripts/desktop/generate-tauri-steam.mjs --check             exits 1 if existing output differs from canonical templates
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { REPO_ROOT, extractAchievementsFromSource, isDirectCliRun, parseDesktopFlags } from './desktop-config.mjs';
import { buildTauriIconSet } from './icon-gen.mjs';
import {
  renderAchievementsManifestRs,
  renderBuildRs,
  renderCapabilityJson,
  renderCargoToml,
  renderLibRs,
  renderMainRs,
  renderSteamBridgeRs,
  renderTauriConf,
} from './tauri-templates.mjs';

export function materializePlayStaticRoutes(distDir) {
  let count = 0;
  const copyRoute = (srcHtml, destHtml) => {
    if (!existsSync(srcHtml)) return;
    mkdirSync(dirname(destHtml), { recursive: true });
    writeFileSync(destHtml, readFileSync(srcHtml));
    count += 1;
  };
  const playHtml = join(distDir, 'play.html');
  const editorHtml = join(distDir, 'chapter-editor.html');
  const comixEditorHtml = join(distDir, 'comix-editor.html');
  const terminalLabHtml = join(distDir, 'terminal-lab.html');

  if (existsSync(playHtml)) {
    copyRoute(playHtml, join(distDir, 'play', 'index.html'));
    for (let floor = 1; floor <= 5; floor++) {
      copyRoute(playHtml, join(distDir, 'play', 'floor', String(floor), 'index.html'));
    }
  }
  const chaptersDir = join(REPO_ROOT, 'chapters');
  if (existsSync(chaptersDir)) {
    for (const slug of readdirSync(chaptersDir)) {
      const manifestPath = join(chaptersDir, slug, 'chapter.manifest.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      copyRoute(playHtml, join(distDir, 'play', slug, 'index.html'));
      copyRoute(editorHtml, join(distDir, 'editor', slug, 'index.html'));
      for (const lvl of manifest.levels ?? []) {
        if (!lvl?.id) continue;
        copyRoute(playHtml, join(distDir, 'play', slug, lvl.id, 'index.html'));
        copyRoute(editorHtml, join(distDir, 'editor', slug, lvl.id, 'index.html'));
      }
    }
  }
  const comixDir = join(REPO_ROOT, 'comix');
  if (existsSync(comixDir) && existsSync(comixEditorHtml)) {
    for (const slug of readdirSync(comixDir)) {
      const pagesDir = join(comixDir, slug, 'pages');
      if (!statSync(join(comixDir, slug)).isDirectory()) continue;
      copyRoute(comixEditorHtml, join(distDir, 'comix-editor', slug, 'index.html'));
      if (existsSync(pagesDir)) {
        for (const pageSlug of readdirSync(pagesDir)) {
          if (statSync(join(pagesDir, pageSlug)).isDirectory()) {
            copyRoute(comixEditorHtml, join(distDir, 'comix-editor', slug, pageSlug, 'index.html'));
          }
        }
      }
    }
  }
  const labsDir = join(REPO_ROOT, 'scripts/harness/terminal-lab');
  if (existsSync(labsDir) && existsSync(terminalLabHtml)) {
    for (const file of readdirSync(labsDir)) {
      if (file.endsWith('.lab.json')) {
        const labId = file.slice(0, -'.lab.json'.length);
        copyRoute(terminalLabHtml, join(distDir, 'terminal-lab', labId, 'index.html'));
      }
    }
  }
  for (const [pageFile, routeDir] of [
    ['chapter-editor.html', 'editor'],
    ['comix-editor.html', 'comix-editor'],
    ['terminal-lab.html', 'terminal-lab'],
    ['laptop-lab.html', 'laptop-lab'],
  ]) {
    copyRoute(join(distDir, pageFile), join(distDir, routeDir, 'index.html'));
  }
  return count;
}

export function generateTauriSteamFiles(cfg) {
  const achievements = extractAchievementsFromSource();
  const icons = buildTauriIconSet();
  const files = new Map([
    ['Cargo.toml', Buffer.from(renderCargoToml(cfg), 'utf8')],
    ['build.rs', Buffer.from(renderBuildRs(), 'utf8')],
    ['tauri.conf.json', Buffer.from(renderTauriConf(cfg), 'utf8')],
    ['capabilities/default.json', Buffer.from(renderCapabilityJson(), 'utf8')],
    ['src/achievements_manifest.rs', Buffer.from(renderAchievementsManifestRs(achievements, cfg.steamAppId), 'utf8')],
    ['src/steam.rs', Buffer.from(renderSteamBridgeRs(), 'utf8')],
    ['src/lib.rs', Buffer.from(renderLibRs(), 'utf8')],
    ['src/main.rs', Buffer.from(renderMainRs(), 'utf8')],
  ]);
  for (const [iconName, buf] of Object.entries(icons)) {
    files.set(`icons/${iconName}`, buf);
  }
  if (cfg.writeAppIdTxt && cfg.steamAppId) {
    files.set('steam_appid.txt', Buffer.from(`${cfg.steamAppId}\n`, 'utf8'));
  }
  return { files, achievements };
}

export function runGenerateTauri(cfg = parseDesktopFlags()) {
  if (cfg.clean && existsSync(cfg.outDir)) {
    rmSync(cfg.outDir, { recursive: true, force: true });
  }
  const { files, achievements } = generateTauriSteamFiles(cfg);
  const diffs = [];
  for (const [rel, want] of files.entries()) {
    const dest = join(cfg.outDir, rel);
    const cur = existsSync(dest) ? readFileSync(dest) : null;
    if (!cur || !cur.equals(want)) {
      diffs.push(rel);
      if (!cfg.checkOnly) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, want);
      }
    }
  }
  for (const conditionalRel of ['steam_appid.txt']) {
    const stalePath = join(cfg.outDir, conditionalRel);
    if (!files.has(conditionalRel) && existsSync(stalePath)) {
      diffs.push(conditionalRel);
      if (!cfg.checkOnly) rmSync(stalePath, { force: true });
    }
  }
  const routed = !cfg.checkOnly && existsSync(cfg.distDir) ? materializePlayStaticRoutes(cfg.distDir) : 0;
  return { outDir: cfg.outDir, count: files.size, diffs, achievementsCount: achievements.length, routed };
}

if (isDirectCliRun(import.meta.url)) {
  const cfg = parseDesktopFlags();
  const res = runGenerateTauri(cfg);
  const relOut = relative(REPO_ROOT, res.outDir) || res.outDir;
  if (cfg.checkOnly) {
    if (res.diffs.length > 0) {
      console.error(`tauri-steam check FAILED (${res.diffs.length} stale/missing file(s) in ${relOut}): ${res.diffs.join(', ')}`);
      process.exit(1);
    }
    console.log(`tauri-steam check OK (${res.count} files in ${relOut}, ${res.achievementsCount} ACH_* keys synced)`);
  } else {
    console.log(
      `generated ${relOut} (${res.count} files, ${res.achievementsCount} ACH_* keys synced${
        cfg.steamAppId ? `, steamAppId=${cfg.steamAppId}` : ', standalone + optional steam feature'
      }${res.routed ? `, ${res.routed} static /play & studio routes` : ''})`,
    );
  }
}
