import './storybook.css';
import { LabApp } from './app/lab-app.js';
import { installLabApi } from './app/lab-api.js';
import { readOptions } from './domain/options-io.js';

/**
 * Storybook: procgen models, textures and FX under the game's real renderer.
 * Camera convention, comic materials, ink shells, post chain and flash feed are the game's own
 * (see stage/lab-stage.ts). Everything is driven by URL parameters (domain/options.ts) and `window.__storybook`.
 */
const app = new LabApp(document.getElementById('lab') as HTMLElement, readOptions(location.search), new URLSearchParams(location.search));
installLabApi(app);
void app.boot();
