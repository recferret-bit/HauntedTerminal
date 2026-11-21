import { CHAPTER_MANIFESTS, readChapterProgress } from '../chapters/catalog.js';
import { bootHubPage, refreshOnSaveChange } from './boot.js';
import { COMIX_MANIFESTS } from '../cinematic/catalog.js';
import { buildComixTiles, buildSequenceTiles, renderComixTiles } from './comix-tiles.js';

bootHubPage('comix');

const host = document.getElementById('comix-tiles');
if (host) {
  const render = (): void => renderComixTiles(host, [...buildSequenceTiles(COMIX_MANIFESTS), ...buildComixTiles(CHAPTER_MANIFESTS, readChapterProgress())]);
  render();
  // Progress changes in the game tab; the desktop save bundle can also arrive after the first paint.
  refreshOnSaveChange(render);
}
