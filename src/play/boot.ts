import { AssetRegistry } from '../assets/asset-registry.js';
import { CHAPTER_MANIFESTS, getChapterPack } from '../chapters/catalog.js';
import { createChapterSession, isChapterSession } from '../chapters/chapter-session.js';
import { readDraftPack } from '../chapters/draft.js';
import type { ChapterManifest } from '../chapters/types.js';
import { createSession, type Session } from '../game/session.js';
import { ComicStage } from '../renderer/comic-stage.js';
import { readInitialShaderState } from '../ui/visual-lab.js';
import { readPlayRoute } from './route.js';
import { Play, STORY, readSkipPref, type DebugGive, type PlayDom, type SkipTutorial } from './state.js';

function requirePlayDom(): PlayDom {
  const mount = document.getElementById('stage-mount');
  const stageWrap = document.getElementById('stage-wrapper');
  const termDockEl = document.getElementById('terminal-dock');
  const editorPaneEl = document.getElementById('code-editor-pane');
  const termEl = document.getElementById('terminal-panel');
  const inspectorEl = document.getElementById('dev-inspector');
  const toggleBtn = document.getElementById('sandbox-toggle-btn');
  const hudEl = document.getElementById('hud');
  const statsEl = document.getElementById('outro');
  const captionEl = document.getElementById('stage-caption');
  const cineEl = document.getElementById('cinematic');
  const mastheadSubEl = document.getElementById('masthead-sub');
  // The terminal stays dark until the intro is over and it powers on.
  document.body.classList.add('term-off');
  if (!mount || !stageWrap || !termEl || !inspectorEl || !toggleBtn || !hudEl || !statsEl || !captionEl || !cineEl) {
    throw new Error('Missing shell nodes');
  }
  return {
    mount, stageWrap, termDockEl, editorPaneEl, termEl, inspectorEl, toggleBtn, hudEl, statsEl, captionEl, cineEl, mastheadSubEl,
  };
}

function chapterBanner(session: Session, manifest: ChapterManifest | undefined): string {
  if (!isChapterSession(session)) return STORY;
  const level = session.getCurrentLevel();
  return [
    `\x1b[1;93m${manifest?.badge ?? 'ISSUE #1'}: ${manifest?.title ?? 'FREELANCE NIGHTMARE'}\x1b[0m`,
    `${manifest?.subtitle ?? ''}`,
    `Level ${level.index}/${session.getLevels().length}: \x1b[1;96m${level.title}\x1b[0m (${level.cwd})`,
    `Goal: ${level.summary}`,
    'Type \x1b[1;93mhank\x1b[0m for Socratic hints, \x1b[1;93medit <file>\x1b[0m for Split Code Editor, or \x1b[1;93mhelp\x1b[0m.',
    '',
  ].join('\n');
}

async function loadStage(mount: HTMLElement): Promise<ComicStage> {
  const registry = new AssetRegistry();
  await registry.reloadAll();
  const boot = readInitialShaderState();
  const stage = new ComicStage(mount, registry);
  stage.buildScene();
  stage.pixelOn = boot.pixelOn;
  stage.crtOn = boot.crtOn;
  stage.setPixelParams(boot.pixel);
  stage.setCrtParams(boot.crt);
  stage.setInk(boot.ink);
  stage.setStorm(boot.stormOn, boot.storm);
  stage.setZoom(boot.zoom);
  stage.applyConfigVisuals();
  return stage;
}

export async function bootPlay(): Promise<Play> {
  const dom = requirePlayDom();
  const stage = await loadStage(dom.mount);
  const route = readPlayRoute(location.pathname, location.search);
  const urlParams = route.search;
  const levelParam = route.level;
  const floorParam = route.floor;
  const chapterParam = route.chapter || CHAPTER_MANIFESTS[0]?.id || '';
  // `?draft=1` plays the chapter editor's unsaved pack; its progress and scrap are never recorded.
  const draft = urlParams.get('draft') === '1' ? readDraftPack(chapterParam) : null;
  const pack = draft ?? getChapterPack(chapterParam);
  const chapterManifest = pack?.manifest;
  const session: Session = pack
    ? createChapterSession({
        chapterId: chapterParam,
        pack,
        preview: draft !== null || urlParams.get('preview') === '1',
        startLevelId: levelParam,
        tacticalMode: urlParams.get('tactical') === '1',
        chaosMode: urlParams.get('chaos') === '1',
        chaosSeed: urlParams.get('seed') ?? undefined,
      })
    : createSession();

  if (!isChapterSession(session) && floorParam >= 2 && floorParam <= 5) {
    session.debugTeleport(floorParam as 1 | 2 | 3 | 4 | 5);
  }
  if (urlParams.get('dev') === '1') dom.inspectorEl.classList.remove('hidden');
  if (dom.mastheadSubEl && chapterManifest) {
    dom.mastheadSubEl.textContent = `${chapterManifest.badge} // ${chapterManifest.title}`;
  }

  const debugGive = (session as Session & { debugGive?: DebugGive }).debugGive?.bind(session);
  const skipTutorial = (session as Session & { skipTutorial?: SkipTutorial }).skipTutorial?.bind(session);
  const directMidJump =
    (Boolean(levelParam) && (!isChapterSession(session) || session.getCurrentLevel().index > 1)) ||
    floorParam >= 2;
  const skipIntroPref =
    readSkipPref() ||
    ((isChapterSession(session) || directMidJump) && urlParams.get('intro') !== '1');

  return new Play(
    dom,
    stage,
    session,
    chapterBanner(session, chapterManifest),
    debugGive,
    skipTutorial,
    skipIntroPref,
  );
}
