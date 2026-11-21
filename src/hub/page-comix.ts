import { CHAPTER_MANIFESTS, readChapterProgress } from '../chapters/catalog.js';
import { COMIX_MANIFESTS } from '../cinematic/catalog.js';
import { refreshOnSaveChange } from './boot.js';
import { buildComixSections, renderComixTiles } from './comix-tiles.js';

/** Draw the tiles into the page's `#comix-tiles`; progress changes in the game tab or arrives with the desktop save bundle. */
export function mount(): void {
  const host = document.getElementById('comix-tiles');
  if (!host) return;
  const render = (): void => renderComixTiles(host, buildComixSections(COMIX_MANIFESTS, CHAPTER_MANIFESTS, readChapterProgress()));
  render();
  refreshOnSaveChange(render);
}
