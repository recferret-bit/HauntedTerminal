import '../contracts/migrate-storage.js';
import { installFullscreenKey } from '../chapters/fullscreen.js';
import { bootHubPage } from './boot.js';
import { startHubRouter } from './router.js';
import { tabOfPath } from './tabs.js';

// The one script of every hub page (Home, Desktop Builds, Achievements, Comix): the header and the waitlist dialog once,
// then the router, which mounts the page on screen and switches tabs without a page load.
const first = tabOfPath(location.pathname) ?? 'home';
bootHubPage(first);
if (document.getElementById('hub-header')) startHubRouter(first);

// F11 toggles full screen on this page (spec .kiro/specs/fullscreen-mode/).
installFullscreenKey();
