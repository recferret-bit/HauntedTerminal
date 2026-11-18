import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const SEMVER_RX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function deriveWixVersion(version) {
  const [core, prerelease = ''] = String(version).replace(/^v/, '').split('-', 2);
  const [maj = '0', min = '1', pat = '0'] = core.split('.');
  const clamp = (n, max) => Math.min(max, Math.max(0, Number.parseInt(n, 10) || 0));
  const base = `${clamp(maj, 255)}.${clamp(min, 255)}.${clamp(pat, 65535)}`;
  if (!prerelease) return base;
  const tailNum = /(\d+)(?!.*\d)/.exec(prerelease)?.[1];
  return tailNum ? `${base}.${clamp(tailNum, 65535)}` : `${base}.0`;
}

export function isDirectCliRun(importMetaUrl, argv1 = process.argv[1]) {
  if (!importMetaUrl || !argv1) return false;
  try {
    return importMetaUrl === pathToFileURL(resolve(argv1)).href;
  } catch {
    return false;
  }
}

export function quoteWinArg(arg) {
  const s = String(arg);
  if (s.length === 0) return '""';
  if (!/[\s"&()<>^|]/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function runNodeCliTool(tool, args, options = {}) {
  if (process.platform !== 'win32') {
    return execFileSync(tool, args, options);
  }
  const cmdLine = [`${tool}.cmd`, ...args.map(quoteWinArg)].join(' ');
  return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${cmdLine}"`], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

export function readPackageMeta(root = REPO_ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return {
    name: String(pkg.name ?? 'haunted-terminal'),
    version: String(pkg.version ?? '0.1.0'),
    description: String(pkg.description ?? 'Haunted Terminal desktop edition'),
  };
}

/**
 * Deterministically extracts all AchievementSpec entries (`id`, `steamApiName`, `title`, `statKey`)
 * from `src/chapters/achievements.ts` so the generated Rust `achievements_manifest.rs` cannot drift.
 */
export function extractAchievementsFromSource(root = REPO_ROOT) {
  const src = readFileSync(join(root, 'src/chapters/achievements.ts'), 'utf8');
  const blockMatch = /export const ACHIEVEMENT_SPECS[\s\S]*?=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!blockMatch) {
    throw new Error('Could not locate ACHIEVEMENT_SPECS array in src/chapters/achievements.ts');
  }
  const entries = [];
  for (const objMatch of blockMatch[1].matchAll(/\{([\s\S]*?)\n\s*\},?/g)) {
    const body = objMatch[1];
    const id = /id:\s*'([^']+)'/.exec(body)?.[1];
    const steamApiName = /steamApiName:\s*'([^']+)'/.exec(body)?.[1];
    const title = /title:\s*'([^']+)'/.exec(body)?.[1];
    const statKey = /statKey:\s*'([^']+)'/.exec(body)?.[1] ?? null;
    if (id && steamApiName && title) {
      entries.push({ id, steamApiName, title, statKey });
    }
  }
  if (entries.length === 0) {
    throw new Error('Parsed 0 achievements from src/chapters/achievements.ts');
  }
  return entries;
}

export function parseDesktopFlags(argv = process.argv.slice(2)) {
  const val = (flag, fallback = '') => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  const has = (flag) => argv.includes(flag);
  const pkg = readPackageMeta();
  const noSteam = has('--no-steam');
  const steamDev = !noSteam && has('--steam-dev');
  const rawAppId = noSteam ? '' : val('--app-id', process.env.STEAM_APP_ID ?? (steamDev ? '480' : ''));
  const parsedAppId = rawAppId ? Number(rawAppId) : null;
  if (rawAppId && (!Number.isInteger(parsedAppId) || parsedAppId <= 0)) {
    throw new Error(`Invalid Steam App ID "${rawAppId}" (expected positive integer, e.g. 480 for Spacewar dev)`);
  }
  const rawVersion = val('--version', pkg.version).replace(/^v/, '');
  if (!SEMVER_RX.test(rawVersion)) {
    throw new Error(`Invalid desktop version "${rawVersion}" (expected SemVer MAJOR.MINOR.PATCH)`);
  }
  return {
    outDir: resolve(REPO_ROOT, val('--out', 'src-tauri')),
    distDir: resolve(REPO_ROOT, val('--dist', 'dist')),
    releaseOutDir: resolve(REPO_ROOT, val('--release-out', 'dist-desktop')),
    productName: val('--product-name', 'Haunted Terminal'),
    identifier: val('--identifier', process.env.TAURI_IDENTIFIER ?? 'dev.hauntedterminal.app'),
    version: rawVersion,
    description: pkg.description,
    steamAppId: parsedAppId,
    steamEnabled: !noSteam && (has('--steam') || steamDev || parsedAppId !== null),
    steamDev,
    writeAppIdTxt: !noSteam && (steamDev || has('--write-appid-txt')),
    target: val('--target', ''),
    checkOnly: has('--check'),
    clean: has('--clean'),
    dryRun: has('--dry-run'),
    portableOnly: has('--portable-only'),
    buildWeb: has('--build'),
  };
}
