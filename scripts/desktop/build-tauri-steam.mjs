#!/usr/bin/env node
// End-to-end desktop builder for Haunted Terminal (Tauri v2 + optional Steamworks SDK).
//   node scripts/desktop/build-tauri-steam.mjs --dry-run          gates + web build + Tauri gen + offline verify + Cargo check
//   node scripts/desktop/build-tauri-steam.mjs --portable-only    packages offline web tar.gz + SHA256SUMS.txt in dist-desktop/
//   node scripts/desktop/build-tauri-steam.mjs                    full native Tauri v2 installer build (requires Rust / Cargo)
//   node scripts/desktop/build-tauri-steam.mjs --steam --app-id N full Steamworks-enabled native build (`--features steam`)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync as cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPO_ROOT, deriveWixVersion, isDirectCliRun, parseDesktopFlags, runNodeCliTool } from './desktop-config.mjs';
import { materializePlayStaticRoutes, runGenerateTauri } from './generate-tauri-steam.mjs';
import { verifyDesktopBundle } from './verify-desktop-bundle.mjs';

function hasBinary(bin) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const BUNDLE_SUBDIRS = new Set(['dmg', 'msi', 'nsis', 'deb', 'appimage']);

export function sanitizeReleaseArtifactName(filePath) {
  return basename(filePath).trim().replace(/\s+/g, '-');
}

export function collectBundleArtifacts(targetDir, { target = '', version = '' } = {}) {
  const found = [];
  const wixVer = version ? deriveWixVersion(version) : '';
  const searchRoot = target ? join(targetDir, target, 'release', 'bundle') : targetDir;
  const walkReleaseBundles = (dir, inReleaseBundle = false) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        const normalized = full.replace(/\\/g, '/');
        const nextInBundle =
          inReleaseBundle ||
          (/\/release\/bundle\/[^/]+$/.test(normalized) && BUNDLE_SUBDIRS.has(name.toLowerCase()));
        if (inReleaseBundle || !normalized.includes('/debug/')) {
          walkReleaseBundles(full, nextInBundle);
        }
      } else if (
        inReleaseBundle &&
        /\.(dmg|msi|exe|deb|AppImage)$/i.test(name) &&
        (!version || name.includes(version) || (wixVer && name.includes(wixVer)))
      ) {
        found.push(full);
      }
    }
  };
  walkReleaseBundles(searchRoot, false);
  return found.sort();
}

export function resolveTargetPlatform(targetTriple = '', hostPlatform = process.platform, hostArch = process.arch) {
  const t = String(targetTriple).toLowerCase();
  const is32Bit = t ? t.includes('i686') : hostArch === 'ia32';
  const os = t.includes('darwin') || (!t && hostPlatform === 'darwin')
    ? 'macos'
    : t.includes('windows') || (!t && hostPlatform === 'win32')
      ? 'windows'
      : 'linux';
  if (os === 'macos') {
    return { os, is32Bit: false, redistRelPath: 'osx/libsteam_api.dylib', libFileName: 'libsteam_api.dylib' };
  }
  if (os === 'windows') {
    return is32Bit
      ? { os, is32Bit: true, redistRelPath: 'steam_api.dll', libFileName: 'steam_api.dll' }
      : { os, is32Bit: false, redistRelPath: 'win64/steam_api64.dll', libFileName: 'steam_api64.dll' };
  }
  return is32Bit
    ? { os, is32Bit: true, redistRelPath: 'linux32/libsteam_api.so', libFileName: 'libsteam_api.so' }
    : { os, is32Bit: false, redistRelPath: 'linux64/libsteam_api.so', libFileName: 'libsteam_api.so' };
}

export function locateSteamRedistRoot(tauriDir, env = process.env) {
  if (env.STEAM_SDK_LOCATION) {
    const customRoot = join(env.STEAM_SDK_LOCATION, 'redistributable_bin');
    if (existsSync(customRoot)) return customRoot;
  }
  const raw = execFileSync(
    'cargo',
    ['metadata', '--manifest-path', join(tauriDir, 'Cargo.toml'), '--features', 'steam', '--format-version', '1'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const meta = JSON.parse(raw);
  const sysPkg = (meta.packages ?? []).find((p) => p?.name === 'steamworks-sys');
  if (!sysPkg?.manifest_path) {
    throw new Error('Could not resolve steamworks-sys crate via `cargo metadata`');
  }
  const redistRoot = join(dirname(sysPkg.manifest_path), 'lib', 'steam', 'redistributable_bin');
  if (!existsSync(redistRoot)) {
    throw new Error(`Missing steamworks-sys redistributable_bin directory at ${redistRoot}`);
  }
  return redistRoot;
}

export function stageSteamRedistributableForBuild(tauriDir, targetInfo, redistRoot) {
  const src = join(redistRoot, targetInfo.redistRelPath);
  if (!existsSync(src)) {
    throw new Error(`Steamworks redistributable binary not found: ${src}`);
  }
  const stageDir = join(tauriDir, 'steam-redist');
  mkdirSync(stageDir, { recursive: true });
  const dest = join(stageDir, targetInfo.libFileName);
  cpSync(src, dest);
  return { stageDir, stagedLibPath: dest, relativeLibPath: `steam-redist/${targetInfo.libFileName}` };
}

export function buildTauriOverrideConfig(cfg, targetInfo, env = process.env) {
  const override = { build: { beforeBuildCommand: '' } };
  const adhocMacSign =
    targetInfo.os === 'macos' && !env.APPLE_SIGNING_IDENTITY && !env.APPLE_CERTIFICATE
      ? { signingIdentity: '-' }
      : {};
  if (!cfg.steamEnabled) {
    if (Object.keys(adhocMacSign).length > 0) {
      override.bundle = { macOS: adhocMacSign };
    }
    return override;
  }
  const relLib = `steam-redist/${targetInfo.libFileName}`;
  if (targetInfo.os === 'macos') {
    override.bundle = {
      macOS: {
        ...adhocMacSign,
        files: { [`MacOS/${targetInfo.libFileName}`]: relLib },
      },
    };
  } else if (targetInfo.os === 'windows') {
    override.bundle = { resources: { [relLib]: targetInfo.libFileName } };
  } else {
    const linuxLibDest = `/usr/lib/haunted-terminal-desktop/${targetInfo.libFileName}`;
    override.bundle = {
      resources: { [relLib]: targetInfo.libFileName },
      linux: {
        deb: { files: { [linuxLibDest]: relLib } },
        appimage: { files: { [linuxLibDest]: relLib } },
      },
    };
  }
  return override;
}

function writeChecksums(outDir) {
  const files = readdirSync(outDir)
    .filter((f) => f !== 'SHA256SUMS.txt' && statSync(join(outDir, f)).isFile())
    .sort();
  const lines = files.map((f) => `${sha256File(join(outDir, f))}  ${f}`);
  const sumPath = join(outDir, 'SHA256SUMS.txt');
  writeFileSync(sumPath, `${lines.join('\n')}\n`, 'utf8');
  return { sumPath, count: files.length };
}

export function packageOfflineWebArchive(cfg) {
  mkdirSync(cfg.releaseOutDir, { recursive: true });
  const archiveName = `haunted-terminal-v${cfg.version}-offline-web.tar.gz`;
  const archivePath = join(cfg.releaseOutDir, archiveName);
  // Stream uncompressed tar from `cwd: cfg.distDir` and gzip in Node so Windows `D:\...` drive-letter colons never reach GNU tar.
  const rawTar = execFileSync('tar', ['-cf', '-', '.'], {
    cwd: cfg.distDir,
    maxBuffer: 256 * 1024 * 1024,
  });
  writeFileSync(archivePath, gzipSync(rawTar, { level: 9 }));
  return archivePath;
}

function main() {
  const cfg = parseDesktopFlags();
  console.log(`[1/4] Building production web bundle (v${cfg.version})...`);
  runNodeCliTool('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });

  console.log('[2/4] Generating Tauri v2 + Steamworks desktop shell & static /play routes...');
  runGenerateTauri(cfg);
  materializePlayStaticRoutes(cfg.distDir);

  console.log('[3/4] Verifying offline bundle & ACH_* Steamworks parity...');
  const issues = verifyDesktopBundle(cfg);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  const cargoReady = hasBinary('cargo') && hasBinary('rustc');
  const overrideFileName = '.tauri-ci-override.json';
  const overridePath = join(cfg.outDir, overrideFileName);
  const tauriArgs = ['--yes', '@tauri-apps/cli@2.2.7', 'build', '--config', overrideFileName];
  if (cfg.target) tauriArgs.push('--target', cfg.target);
  if (cfg.steamEnabled) tauriArgs.push('--', '--features', 'steam');

  if (cfg.dryRun) {
    console.log('[4/4] Dry-run summary:');
    console.log(`  Rust / Cargo installed: ${cargoReady ? 'YES' : 'NO (install via https://rustup.rs or build via GitHub v* tag)'}`);
    console.log(`  Steamworks feature:     ${cfg.steamEnabled ? `ENABLED (appId=${cfg.steamAppId ?? 'env'})` : 'STANDALONE (enable with --steam --app-id <ID>)'}`);
    console.log(`  Native build command:   (cd ${relative(REPO_ROOT, cfg.outDir) || 'src-tauri'} && npx ${tauriArgs.join(' ')})`);
    return;
  }

  rmSync(cfg.releaseOutDir, { recursive: true, force: true });
  mkdirSync(cfg.releaseOutDir, { recursive: true });
  const webArchive = packageOfflineWebArchive(cfg);
  console.log(`  packaged ${relative(REPO_ROOT, webArchive)}`);

  if (cfg.portableOnly) {
    const sums = writeChecksums(cfg.releaseOutDir);
    console.log(`[4/4] Portable offline build ready (${sums.count} artifact(s), ${relative(REPO_ROOT, sums.sumPath)})`);
    return;
  }

  if (!cargoReady) {
    console.error(
      'Rust toolchain (`cargo` / `rustc`) is not installed on this machine. ' +
        'Install Rust via https://rustup.rs, pass `--portable-only`, or push a `v*` git tag so `.github/workflows/desktop-release.yml` builds macOS, Windows, and Linux installers on GitHub Actions.',
    );
    process.exit(2);
  }

  console.log(`[4/4] Building native desktop installers in ${relative(REPO_ROOT, cfg.outDir) || 'src-tauri'}: npx ${tauriArgs.join(' ')}`);
  const targetInfo = resolveTargetPlatform(cfg.target);
  const env = { ...process.env, CI: process.env.CI || 'true' };
  if (cfg.steamAppId) env.STEAM_APP_ID = String(cfg.steamAppId);
  else delete env.STEAM_APP_ID;
  if (targetInfo.os === 'linux') {
    env.APPIMAGE_EXTRACT_AND_RUN = env.APPIMAGE_EXTRACT_AND_RUN || '1';
    env.NO_STRIP = env.NO_STRIP || 'true';
  }
  const activeBundleDir = cfg.target
    ? join(cfg.outDir, 'target', cfg.target, 'release', 'bundle')
    : join(cfg.outDir, 'target', 'release', 'bundle');
  rmSync(activeBundleDir, { recursive: true, force: true });
  const redistStageDir = join(cfg.outDir, 'steam-redist');
  if (cfg.steamEnabled) {
    const redistRoot = locateSteamRedistRoot(cfg.outDir, env);
    const staged = stageSteamRedistributableForBuild(cfg.outDir, targetInfo, redistRoot);
    console.log(`  staged Steamworks redistributable -> ${relative(REPO_ROOT, staged.stagedLibPath)}`);
    if (targetInfo.os === 'linux') {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
        ? `${staged.stageDir}:${env.LD_LIBRARY_PATH}`
        : staged.stageDir;
    }
  }
  const overrideConfig = buildTauriOverrideConfig(cfg, targetInfo, env);
  writeFileSync(overridePath, `${JSON.stringify(overrideConfig, null, 2)}\n`, 'utf8');
  try {
    runNodeCliTool('npx', tauriArgs, { cwd: cfg.outDir, stdio: 'inherit', env });
  } finally {
    rmSync(overridePath, { force: true });
    rmSync(redistStageDir, { recursive: true, force: true });
  }

  const bundleRoot = join(cfg.outDir, 'target');
  let copied = 0;
  for (const artifact of collectBundleArtifacts(bundleRoot, { target: cfg.target, version: cfg.version })) {
    const dest = join(cfg.releaseOutDir, sanitizeReleaseArtifactName(artifact));
    cpSync(artifact, dest);
    copied += 1;
  }
  const sums = writeChecksums(cfg.releaseOutDir);
  console.log(`desktop build complete (${copied} native installer(s) + offline archive in ${relative(REPO_ROOT, cfg.releaseOutDir)}, checksums in ${basename(sums.sumPath)})`);
}

if (isDirectCliRun(import.meta.url)) {
  main();
}
