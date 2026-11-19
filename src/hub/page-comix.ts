import { CHAPTER_MANIFESTS, readChapterProgress } from '../chapters/catalog.js';
import { bootHubPage, refreshOnSaveChange } from './boot.js';
import { buildComixTiles, renderComixTiles } from './comix-tiles.js';

bootHubPage('comix');

const host = document.getElementById('comix-tiles');
if (host) {
  const render = (): void => renderComixTiles(host, buildComixTiles(CHAPTER_MANIFESTS, readChapterProgress()));
  render();
  // Progress changes in the game tab; the desktop save bundle can also arrive after the first paint.
  refreshOnSaveChange(render);
}
