#!/usr/bin/env node
// Deterministic unit & integration test suite for Haunted Terminal's Tauri v2 + Steamworks desktop generator,
// icon synthesizer, offline bundle verifier, CSP safety, Auto-Cloud save bridge, and 1:1 `ACH_*` achievement sync.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  REPO_ROOT,
  deriveWixVersion,
  extractAchievementsFromSource,
  isDirectCliRun,
  parseDesktopFlags,
  quoteWinArg,
} from './desktop-config.mjs';
import { buildTauriIconSet } from './icon-gen.mjs';
import {
  buildTauriOverrideConfig,
  collectBundleArtifacts,
  locateSteamRedistRoot,
  packageOfflineWebArchive,
  resolveTargetPlatform,
  sanitizeReleaseArtifactName,
  stageSteamRedistributableForBuild,
} from './build-tauri-steam.mjs';
import { runGenerateTauri } from './generate-tauri-steam.mjs';
import { verifyDistOffline, verifyTauriDir } from './verify-desktop-bundle.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'haunted-desktop-unit-'));

try {
  // 1. Source achievement extractor & cross-OS CLI direct-run / SemVer flag validation.
  const achievements = extractAchievementsFromSource(REPO_ROOT);
  assert.equal(achievements.length, 12, 'Expected 12 declarative achievements in src/chapters/achievements.ts');
  for (const ach of achievements) {
    assert.match(ach.steamApiName, /^ACH_[A-Z0-9_]+$/, `Invalid Steam API name: ${ach.steamApiName}`);
  }
  const spacedPath = join(scratch, 'dir with spaces', 'script.mjs');
  assert.equal(isDirectCliRun(pathToFileURL(spacedPath).href, spacedPath), true, 'isDirectCliRun must handle paths with spaces & URL encoding');
  assert.equal(isDirectCliRun(pathToFileURL(spacedPath).href, join(scratch, 'other.mjs')), false);
  assert.equal(parseDesktopFlags(['--version', 'v0.2.3-rc.1']).version, '0.2.3-rc.1', 'Leading v must normalize cleanly');
  assert.equal(deriveWixVersion('0.1.0'), '0.1.0');
  assert.equal(deriveWixVersion('v0.2.3-rc.2'), '0.2.3.2', 'Pre-release SemVer must map to numeric WiX MSI version');
  assert.equal(deriveWixVersion('0.2.3-alpha'), '0.2.3.0');
  assert.throws(() => parseDesktopFlags(['--version', 'not-semver']), /Invalid desktop version/);
  const prevSteamEnv = process.env.STEAM_APP_ID;
  try {
    process.env.STEAM_APP_ID = '480';
    const forcedStandalone = parseDesktopFlags(['--no-steam']);
    assert.equal(forcedStandalone.steamEnabled, false, '--no-steam must override STEAM_APP_ID env');
    assert.equal(forcedStandalone.steamAppId, null, '--no-steam must clear steamAppId');
  } finally {
    if (prevSteamEnv === undefined) delete process.env.STEAM_APP_ID;
    else process.env.STEAM_APP_ID = prevSteamEnv;
  }
  console.log('  ok  extractAchievementsFromSource & cross-OS CLI flag guards: 12 ACH_* keys, --no-steam & pathToFileURL verified');

  // 2. Icon synthesizer emits valid PNG, Windows ICO, and Apple ICNS binary headers.
  const icons = buildTauriIconSet();
  for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png']) {
    assert.ok(icons[name].subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${name} PNG header`);
  }
  assert.equal(icons['icon.ico'].readUInt16LE(0), 0);
  assert.equal(icons['icon.ico'].readUInt16LE(2), 1);
  assert.equal(icons['icon.ico'].readUInt16LE(4), 2);
  assert.equal(icons['icon.icns'].subarray(0, 4).toString('ascii'), 'icns');
  assert.equal(icons['icon.icns'].readUInt32BE(4), icons['icon.icns'].length);
  console.log('  ok  buildTauriIconSet: valid RGBA PNG, ICO, and ICNS headers');

  // 3. Standalone Tauri generation + idempotent `--check` + Steamworks dev mode (`--steam-dev`).
  const standaloneDir = join(scratch, 'tauri-standalone');
  const fakeDist = join(scratch, 'dist');
  mkdirSync(join(fakeDist, 'fonts'), { recursive: true });
  for (const page of [
    'index.html',
    'play.html',
    'chapters.html',
    'comic.html',
    'desktop.html',
    'achievements.html',
    'comix.html',
    'chapter-editor.html',
    'comix-editor.html',
    'terminal-lab.html',
    'laptop-lab.html',
  ]) {
    writeFileSync(join(fakeDist, page), '<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body>ok</body></html>');
  }
  writeFileSync(join(fakeDist, 'assets-app.css'), '@font-face { font-family: "Chakra Petch"; src: url("/fonts/a.woff2"); }');
  for (const fontFile of readdirOrCopiedFonts(join(REPO_ROOT, 'public/fonts'), join(fakeDist, 'fonts'))) {
    assert.ok(existsSync(fontFile));
  }

  const standaloneCfg = parseDesktopFlags(['--out', standaloneDir, '--dist', fakeDist]);
  const gen1 = runGenerateTauri(standaloneCfg);
  assert.equal(gen1.achievementsCount, 12);
  assert.equal(existsSync(join(standaloneDir, 'steam_appid.txt')), false, 'Standalone mode must not write steam_appid.txt');
  assert.ok(gen1.routed >= 20, 'Static /play, /play/floor/*, /editor, /comix-editor, /terminal-lab, /laptop-lab routes must be materialized');
  assert.ok(existsSync(join(fakeDist, 'play/chapter-01-kiroween/index.html')));
  assert.ok(existsSync(join(fakeDist, 'play/floor/2/index.html')));
  for (const studioRoute of [
    'editor',
    'editor/chapter-01-kiroween',
    'editor/chapter-01-kiroween/level-01-tutorial-awakening',
    'comix-editor',
    'comix-editor/intro',
    'terminal-lab',
    'laptop-lab',
  ]) {
    assert.ok(existsSync(join(fakeDist, studioRoute, 'index.html')), `Missing static route dist/${studioRoute}/index.html`);
  }

  const checkRes = runGenerateTauri(parseDesktopFlags(['--out', standaloneDir, '--dist', fakeDist, '--check']));
  assert.equal(checkRes.diffs.length, 0, '--check must report 0 diffs immediately after generation');
  assert.equal(
    JSON.parse(readFileSync(join(standaloneDir, 'tauri.conf.json'), 'utf8')).bundle.windows,
    undefined,
    'Release SemVer without pre-release suffix must omit bundle.windows override',
  );
  const rcDir = join(scratch, 'tauri-rc');
  runGenerateTauri(parseDesktopFlags(['--out', rcDir, '--dist', fakeDist, '--version', 'v0.1.0-rc.2']));
  assert.equal(
    JSON.parse(readFileSync(join(rcDir, 'tauri.conf.json'), 'utf8')).bundle?.windows?.wix?.version,
    '0.1.0.2',
    'Pre-release tag must emit numeric bundle.windows.wix.version for Windows MSI compatibility',
  );

  const steamDir = join(scratch, 'tauri-steam');
  runGenerateTauri(parseDesktopFlags(['--out', steamDir, '--dist', fakeDist, '--steam-dev']));
  assert.equal(readFileSync(join(steamDir, 'steam_appid.txt'), 'utf8').trim(), '480');
  assert.ok(readFileSync(join(steamDir, 'src/achievements_manifest.rs'), 'utf8').includes('Some(480u32)'));
  assert.deepEqual(verifyTauriDir(steamDir, achievements, { allowAppIdTxt: true }), []);
  assert.ok(
    verifyTauriDir(steamDir, achievements).some((m) => m.includes('steam_appid.txt')),
    'Release verifier must reject unexpected steam_appid.txt unless allowAppIdTxt is enabled',
  );
  const staleCheck = runGenerateTauri(parseDesktopFlags(['--out', steamDir, '--dist', fakeDist, '--check', '--no-steam']));
  assert.ok(staleCheck.diffs.includes('steam_appid.txt'), '--check without --steam-dev must flag leftover steam_appid.txt');
  runGenerateTauri(parseDesktopFlags(['--out', steamDir, '--dist', fakeDist, '--no-steam']));
  assert.equal(existsSync(join(steamDir, 'steam_appid.txt')), false, 'Regenerating without --steam-dev must prune stale steam_appid.txt');
  console.log('  ok  generate-tauri-steam: standalone, --steam-dev (App 480), stale steam_appid.txt pruning & --check idempotence');

  // 4. Bundle verifier passes on clean offline dist + generated tauri, and catches planted CDN, CSP & ACH_* regressions.
  assert.deepEqual(verifyDistOffline(fakeDist), []);
  assert.deepEqual(verifyTauriDir(standaloneDir, achievements), []);

  writeFileSync(join(fakeDist, 'bad.css'), '@import url("https://fonts.googleapis.com/css2?family=Roboto");');
  const cdnIssues = verifyDistOffline(fakeDist);
  assert.ok(cdnIssues.some((msg) => msg.includes('fonts.googleapis.com')), 'Verifier must flag planted Google Fonts CDN');
  rmSync(join(fakeDist, 'bad.css'));

  const confPath = join(standaloneDir, 'tauri.conf.json');
  const origConf = readFileSync(confPath, 'utf8');
  writeFileSync(confPath, origConf.replace("'unsafe-eval' ", '').replace('"Game"', '"DeveloperTool"'));
  const cspIssues = verifyTauriDir(standaloneDir, achievements);
  assert.ok(cspIssues.some((msg) => msg.includes('unsafe-eval')), 'Verifier must catch missing unsafe-eval CSP (breaks Level 6 & Laptop Lab)');
  assert.ok(cspIssues.some((msg) => msg.includes('bundle.category')), 'Verifier must require bundle.category = "Game"');
  writeFileSync(confPath, origConf);

  const manifestPath = join(standaloneDir, 'src/achievements_manifest.rs');
  const origManifest = readFileSync(manifestPath, 'utf8');
  writeFileSync(manifestPath, origManifest.replace('ACH_FIRST_BOOT', 'ACH_DRIFTED_KEY'));
  const driftIssues = verifyTauriDir(standaloneDir, achievements);
  assert.ok(driftIssues.some((msg) => msg.includes('achievements_manifest.rs')), 'Verifier must flag ACH_* key drift');
  writeFileSync(manifestPath, origManifest);

  const steamRsPath = join(standaloneDir, 'src/steam.rs');
  const origSteamRs = readFileSync(steamRsPath, 'utf8');
  writeFileSync(steamRsPath, origSteamRs.replaceAll('request_current_stats()', '/* omitted */'));
  const statsIssues = verifyTauriDir(standaloneDir, achievements);
  assert.ok(statsIssues.some((msg) => msg.includes('request_current_stats')), 'Verifier must require ISteamUserStats::RequestCurrentStats');
  writeFileSync(steamRsPath, origSteamRs);

  // Also verify real `dist/` if built on disk.
  if (existsSync(join(REPO_ROOT, 'dist/index.html'))) {
    assert.deepEqual(verifyDistOffline(join(REPO_ROOT, 'dist')), [], 'Real built dist/ must have 0 offline violations');
  }
  console.log('  ok  verify-desktop-bundle: passes clean offline bundle and catches planted CDN, CSP, category & ACH_* drift');

  // 5. Release artifact collector ignores Cargo build-script .exe / debug / helper files and normalizes spaces to hyphens.
  const fakeTarget = join(scratch, 'target');
  mkdirSync(join(fakeTarget, 'release/build/serde-123/out'), { recursive: true });
  mkdirSync(join(fakeTarget, 'debug/bundle/dmg'), { recursive: true });
  mkdirSync(join(fakeTarget, 'universal-apple-darwin/release/bundle/dmg'), { recursive: true });
  mkdirSync(join(fakeTarget, 'release/bundle/nsis'), { recursive: true });
  writeFileSync(join(fakeTarget, 'release/build/serde-123/build-script-build.exe'), 'nope');
  writeFileSync(join(fakeTarget, 'release/haunted-terminal-desktop.exe'), 'nope');
  writeFileSync(join(fakeTarget, 'debug/bundle/dmg/Haunted Terminal_0.1.0_aarch64.dmg'), 'nope');
  writeFileSync(join(fakeTarget, 'universal-apple-darwin/release/bundle/dmg/bundle_dmg.sh'), 'nope');
  writeFileSync(join(fakeTarget, 'universal-apple-darwin/release/bundle/dmg/Haunted Terminal_0.0.9_universal.dmg'), 'stale-dmg');
  writeFileSync(join(fakeTarget, 'universal-apple-darwin/release/bundle/dmg/Haunted Terminal_0.1.0_universal.dmg'), 'dmg-ok');
  writeFileSync(join(fakeTarget, 'release/bundle/nsis/Haunted Terminal_0.1.0_x64-setup.exe'), 'exe-ok');

  const collected = collectBundleArtifacts(fakeTarget, { version: '0.1.0' }).map((p) => sanitizeReleaseArtifactName(p));
  assert.deepEqual(collected, [
    'Haunted-Terminal_0.1.0_x64-setup.exe',
    'Haunted-Terminal_0.1.0_universal.dmg',
  ]);
  const targetScoped = collectBundleArtifacts(fakeTarget, {
    target: 'universal-apple-darwin',
    version: '0.1.0',
  }).map((p) => sanitizeReleaseArtifactName(p));
  assert.deepEqual(targetScoped, ['Haunted-Terminal_0.1.0_universal.dmg']);
  mkdirSync(join(fakeTarget, 'release/bundle/msi'), { recursive: true });
  writeFileSync(join(fakeTarget, 'release/bundle/nsis/Haunted Terminal_0.1.0-rc.2_x64-setup.exe'), 'rc-exe');
  writeFileSync(join(fakeTarget, 'release/bundle/msi/Haunted Terminal_0.1.0.2_x64_en-US.msi'), 'rc-msi');
  writeFileSync(join(fakeTarget, 'release/bundle/msi/Haunted Terminal_0.0.9_x64_en-US.msi'), 'stale-msi');
  const rcCollected = collectBundleArtifacts(fakeTarget, { version: '0.1.0-rc.2' }).map((p) => sanitizeReleaseArtifactName(p));
  assert.deepEqual(rcCollected, [
    'Haunted-Terminal_0.1.0.2_x64_en-US.msi',
    'Haunted-Terminal_0.1.0-rc.2_x64-setup.exe',
  ]);
  console.log('  ok  collectBundleArtifacts & sanitizeReleaseArtifactName: filters release bundles cleanly and normalizes spaces');

  // 6. Cross-OS Steamworks redistributable bundler config, staging & Windows-safe offline tar.gz packaging.
  assert.equal(quoteWinArg(''), '""');
  assert.equal(quoteWinArg('--features'), '--features');
  assert.equal(quoteWinArg('C:\\Program Files\\Haunted Terminal\\'), '"C:\\Program Files\\Haunted Terminal\\\\"');
  assert.equal(quoteWinArg('arg "quoted"'), '"arg \\"quoted\\""');

  const macTarget = resolveTargetPlatform('universal-apple-darwin');
  assert.deepEqual(macTarget, {
    os: 'macos',
    is32Bit: false,
    redistRelPath: 'osx/libsteam_api.dylib',
    libFileName: 'libsteam_api.dylib',
  });
  const win64Target = resolveTargetPlatform('x86_64-pc-windows-msvc');
  assert.deepEqual(win64Target, {
    os: 'windows',
    is32Bit: false,
    redistRelPath: 'win64/steam_api64.dll',
    libFileName: 'steam_api64.dll',
  });
  const win32Target = resolveTargetPlatform('i686-pc-windows-msvc');
  assert.equal(win32Target.libFileName, 'steam_api.dll');
  const linuxTarget = resolveTargetPlatform('x86_64-unknown-linux-gnu');
  assert.deepEqual(linuxTarget, {
    os: 'linux',
    is32Bit: false,
    redistRelPath: 'linux64/libsteam_api.so',
    libFileName: 'libsteam_api.so',
  });

  assert.deepEqual(buildTauriOverrideConfig({ steamEnabled: false }, macTarget, {}), {
    build: { beforeBuildCommand: '' },
    bundle: { macOS: { signingIdentity: '-' } },
  });
  assert.deepEqual(buildTauriOverrideConfig({ steamEnabled: false }, macTarget, { APPLE_SIGNING_IDENTITY: 'Developer ID Application: Studio' }), {
    build: { beforeBuildCommand: '' },
  });
  assert.deepEqual(buildTauriOverrideConfig({ steamEnabled: true }, macTarget, {}), {
    build: { beforeBuildCommand: '' },
    bundle: {
      macOS: {
        signingIdentity: '-',
        files: { 'MacOS/libsteam_api.dylib': 'steam-redist/libsteam_api.dylib' },
      },
    },
  });
  assert.deepEqual(buildTauriOverrideConfig({ steamEnabled: true }, win64Target), {
    build: { beforeBuildCommand: '' },
    bundle: { resources: { 'steam-redist/steam_api64.dll': 'steam_api64.dll' } },
  });
  assert.deepEqual(buildTauriOverrideConfig({ steamEnabled: true }, linuxTarget), {
    build: { beforeBuildCommand: '' },
    bundle: {
      resources: { 'steam-redist/libsteam_api.so': 'libsteam_api.so' },
      linux: {
        deb: { files: { '/usr/lib/haunted-terminal-desktop/libsteam_api.so': 'steam-redist/libsteam_api.so' } },
        appimage: { files: { '/usr/lib/haunted-terminal-desktop/libsteam_api.so': 'steam-redist/libsteam_api.so' } },
      },
    },
  });

  const fakeSteamSdk = join(scratch, 'custom-steam-sdk');
  mkdirSync(join(fakeSteamSdk, 'redistributable_bin'), { recursive: true });
  assert.equal(
    locateSteamRedistRoot(steamDir, { STEAM_SDK_LOCATION: fakeSteamSdk }),
    join(fakeSteamSdk, 'redistributable_bin'),
  );
  if (existsSync(join(REPO_ROOT, 'src-tauri/Cargo.toml'))) {
    const resolvedCargoRedist = locateSteamRedistRoot(join(REPO_ROOT, 'src-tauri'), {});
    assert.equal(existsSync(join(resolvedCargoRedist, 'osx/libsteam_api.dylib')), true);
    assert.equal(existsSync(join(resolvedCargoRedist, 'win64/steam_api64.dll')), true);
    assert.equal(existsSync(join(resolvedCargoRedist, 'linux64/libsteam_api.so')), true);
  }

  const fakeRedistRoot = join(scratch, 'fake-steam-sdk');
  mkdirSync(join(fakeRedistRoot, 'osx'), { recursive: true });
  mkdirSync(join(fakeRedistRoot, 'win64'), { recursive: true });
  mkdirSync(join(fakeRedistRoot, 'linux64'), { recursive: true });
  writeFileSync(join(fakeRedistRoot, 'osx/libsteam_api.dylib'), 'dylib-bytes');
  writeFileSync(join(fakeRedistRoot, 'win64/steam_api64.dll'), 'dll-bytes');
  writeFileSync(join(fakeRedistRoot, 'linux64/libsteam_api.so'), 'so-bytes');

  for (const tInfo of [macTarget, win64Target, linuxTarget]) {
    const staged = stageSteamRedistributableForBuild(steamDir, tInfo, fakeRedistRoot);
    assert.equal(existsSync(staged.stagedLibPath), true);
  }
  assert.throws(
    () => stageSteamRedistributableForBuild(steamDir, win32Target, fakeRedistRoot),
    /Steamworks redistributable binary not found/,
  );

  const spacedReleaseOut = join(scratch, 'release out with spaces');
  const archivePath = packageOfflineWebArchive({
    version: '0.1.0',
    distDir: fakeDist,
    releaseOutDir: spacedReleaseOut,
  });
  assert.equal(existsSync(archivePath), true);
  const untarred = gunzipSync(readFileSync(archivePath)).toString('latin1');
  assert.ok(untarred.includes('index.html'), 'Offline web tar.gz must contain index.html');
  assert.ok(untarred.includes('chakra-petch-700-latin.woff2'), 'Offline web tar.gz must contain bundled WOFF2 fonts');
  console.log('  ok  Steamworks multi-OS bundler overrides, redistributable staging & Windows-safe tar.gz archive verified');

  console.log('\ndesktop unit: 6 test suites passed');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

function readdirOrCopiedFonts(srcFontsDir, dstFontsDir) {
  cpSync(srcFontsDir, dstFontsDir, { recursive: true });
  return [join(dstFontsDir, 'chakra-petch-700-latin.woff2'), join(dstFontsDir, 'ibm-plex-mono-400-latin.woff2')];
}
