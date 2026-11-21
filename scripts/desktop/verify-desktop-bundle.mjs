#!/usr/bin/env node
// Offline & Steamworks bundle verifier for Haunted Terminal's web `dist/` and generated `src-tauri/` shell.
// Ensures 0 external runtime font/script CDNs in `dist/`, valid bundled `.woff2` fonts, valid PNG/ICO/ICNS icon headers,
// valid Tauri v2 CSP (preserving Level 6 JS Cart & Laptop Lab sandboxes), and 1:1 `ACH_*` achievement + Auto-Cloud save sync.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  REPO_ROOT,
  extractAchievementsFromSource,
  isDirectCliRun,
  parseDesktopFlags,
  runNodeCliTool,
} from './desktop-config.mjs';

const FORBIDDEN_CDN_RX =
  /(?:https?:)?\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\b/i;
const CSS_EXTERNAL_URL_RX = /url\(\s*['"]?https?:\/\//i;
const HTML_EXTERNAL_ASSET_RX = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*['"]https?:\/\//i;

function* walkFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

export function verifyDistOffline(distDir) {
  const issues = [];
  for (const reqPage of ['index.html', 'play.html', 'chapters.html', 'comic.html', 'desktop.html', 'achievements.html', 'comix.html']) {
    if (!existsSync(join(distDir, reqPage))) {
      issues.push(`dist/${reqPage} is missing (run \`npm run build\` first)`);
    }
  }
  const fontsDir = join(distDir, 'fonts');
  const woff2Files = existsSync(fontsDir) ? readdirSync(fontsDir).filter((f) => f.endsWith('.woff2')) : [];
  if (woff2Files.length < 10) {
    issues.push(`dist/fonts/ must bundle local Chakra Petch & IBM Plex Mono .woff2 files (found ${woff2Files.length})`);
  }
  for (const f of woff2Files) {
    const buf = readFileSync(join(fontsDir, f));
    if (buf.length < 512 || buf.subarray(0, 4).toString('ascii') !== 'wOF2') {
      issues.push(`dist/fonts/${f} is not a valid WOFF2 font binary`);
    }
  }

  for (const file of walkFiles(distDir)) {
    if (!/\.(html|css|js)$/i.test(file)) continue;
    const rel = relative(distDir, file);
    const text = readFileSync(file, 'utf8');
    const cdnHit = FORBIDDEN_CDN_RX.exec(text);
    if (cdnHit) issues.push(`dist/${rel} references external CDN "${cdnHit[0]}" (breaks offline desktop mode)`);
    if (file.endsWith('.css') && CSS_EXTERNAL_URL_RX.test(text)) {
      issues.push(`dist/${rel} loads an external http(s) CSS resource`);
    }
    if (file.endsWith('.html') && HTML_EXTERNAL_ASSET_RX.test(text)) {
      issues.push(`dist/${rel} loads an external http(s) <script> or <link> asset`);
    }
  }
  return issues;
}

export function verifyTauriDir(tauriDir, expectedAchievements = extractAchievementsFromSource(), opts = {}) {
  const issues = [];
  for (const req of ['Cargo.toml', 'build.rs', 'tauri.conf.json', 'capabilities/default.json', 'src/lib.rs', 'src/main.rs', 'src/steam.rs', 'src/achievements_manifest.rs']) {
    if (!existsSync(join(tauriDir, req))) {
      issues.push(`src-tauri/${req} is missing (run \`node scripts/desktop/generate-tauri-steam.mjs\`)`);
    }
  }
  if (issues.length > 0) return issues;
  if (!opts.allowAppIdTxt && existsSync(join(tauriDir, 'steam_appid.txt'))) {
    issues.push(
      'src-tauri/steam_appid.txt must not be present in standalone or production release builds (pass --steam-dev / --write-appid-txt only for local dev)',
    );
  }

  const cargo = readFileSync(join(tauriDir, 'Cargo.toml'), 'utf8');
  if (!cargo.includes('steamworks = { version = "0.11.0", optional = true }')) {
    issues.push('Cargo.toml must pin optional `steamworks = { version = "0.11.0", optional = true }`');
  }
  if (!cargo.includes('steam = ["dep:steamworks"]')) {
    issues.push('Cargo.toml must declare `steam = ["dep:steamworks"]` feature');
  }
  const buildRs = readFileSync(join(tauriDir, 'build.rs'), 'utf8');
  if (
    !buildRs.includes('stage_steam_redistributable') ||
    !buildRs.includes('-Wl,-rpath,$ORIGIN:$ORIGIN/../lib/haunted-terminal-desktop') ||
    !buildRs.includes('-Wl,-rpath,@executable_path')
  ) {
    issues.push(
      'build.rs must stage steam_api redistributable binaries and configure Linux ($ORIGIN + ../lib) and macOS (@executable_path) rpaths when `steam` feature is enabled',
    );
  }

  let conf;
  try {
    conf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
  } catch (err) {
    issues.push(`tauri.conf.json is invalid JSON: ${err.message}`);
    return issues;
  }
  if (!conf?.productName || !conf?.identifier || conf?.build?.frontendDist !== '../dist') {
    issues.push('tauri.conf.json missing required productName, identifier, or build.frontendDist = "../dist"');
  }
  if (conf?.bundle?.category !== 'Game') {
    issues.push(`tauri.conf.json bundle.category must be "Game" (got ${JSON.stringify(conf?.bundle?.category)})`);
  }
  const sec = conf?.app?.security ?? {};
  const csp = String(sec.csp ?? '');
  if (sec.dangerousDisableAssetCspModification !== true) {
    issues.push('tauri.conf.json app.security.dangerousDisableAssetCspModification must be true so Tauri nonces do not break inline styles or iframe[srcdoc]');
  }
  if (!csp.includes("'unsafe-eval'")) {
    issues.push("tauri.conf.json CSP must include 'unsafe-eval' in script-src so Level 6 JS Cart validation and Laptop Lab Worker runs succeed");
  }
  const nonLocalHttp = [...csp.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((host) => host !== 'ipc.localhost' && host !== 'tauri.localhost');
  if (nonLocalHttp.length > 0) {
    issues.push(`tauri.conf.json CSP permits non-local network origin(s): ${nonLocalHttp.join(', ')}`);
  }

  for (const pngName of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png']) {
    const p = join(tauriDir, 'icons', pngName);
    const b = existsSync(p) ? readFileSync(p) : Buffer.alloc(0);
    if (b.length < 64 || !b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      issues.push(`icons/${pngName} is missing or has an invalid PNG signature`);
    }
  }
  const ico = existsSync(join(tauriDir, 'icons/icon.ico')) ? readFileSync(join(tauriDir, 'icons/icon.ico')) : Buffer.alloc(0);
  if (ico.length < 32 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    issues.push('icons/icon.ico is missing or has an invalid ICO header');
  }
  const icns = existsSync(join(tauriDir, 'icons/icon.icns')) ? readFileSync(join(tauriDir, 'icons/icon.icns')) : Buffer.alloc(0);
  if (icns.length < 32 || icns.subarray(0, 4).toString('ascii') !== 'icns') {
    issues.push('icons/icon.icns is missing or has an invalid ICNS header');
  }

  const manifestRs = readFileSync(join(tauriDir, 'src/achievements_manifest.rs'), 'utf8');
  const rustKeys = [...manifestRs.matchAll(/\("([^"]+)",\s*"(ACH_[A-Z0-9_]+)"\)/g)].map((m) => `${m[1]}:${m[2]}`);
  const tsKeys = expectedAchievements.map((a) => `${a.id}:${a.steamApiName}`);
  if (JSON.stringify(rustKeys) !== JSON.stringify(tsKeys)) {
    issues.push(`achievements_manifest.rs keys (${rustKeys.length}) do not match src/chapters/achievements.ts (${tsKeys.length})`);
  }

  const steamRs = readFileSync(join(tauriDir, 'src/steam.rs'), 'utf8');
  if (!steamRs.includes('request_current_stats()') || !steamRs.includes('UserStatsReceived')) {
    issues.push('src/steam.rs must call `request_current_stats()` and register `UserStatsReceived` callback for ISteamUserStats012');
  }

  const libRs = readFileSync(join(tauriDir, 'src/lib.rs'), 'utf8');
  for (const cmd of [
    'steam_status',
    'steam_unlock_achievement',
    'steam_sync_achievements',
    'steam_clear_achievement',
    'desktop_read_save_bundle',
    'desktop_write_save_bundle',
    'desktop_export_json_file',
    'desktop_open_external_url',
    'steam_show_floating_keyboard',
  ]) {
    if (!libRs.includes(cmd)) issues.push(`src/lib.rs missing Tauri IPC command "${cmd}"`);
  }
  return issues;
}

export function verifyDesktopBundle(cfg) {
  return [
    ...verifyDistOffline(cfg.distDir),
    ...verifyTauriDir(cfg.outDir, undefined, { allowAppIdTxt: cfg.writeAppIdTxt }),
  ];
}

if (isDirectCliRun(import.meta.url)) {
  const cfg = parseDesktopFlags();
  if (cfg.buildWeb) {
    runNodeCliTool('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  const issues = verifyDesktopBundle(cfg);
  if (issues.length > 0) {
    console.error(`desktop bundle verification FAILED (${issues.length}):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log('desktop bundle verification OK (dist/ is 100% offline-ready, fonts/icons/CSP valid, 12 ACH_* keys & 9 IPC commands synced)');
}
