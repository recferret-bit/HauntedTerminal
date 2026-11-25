import './contracts/migrate-storage.js';
import './styles/game.css';
import './styles/dialog.css';
import './styles/esc-menu.css';
import './styles/hint-dialog.css';
import './styles/chapter-map.css';
import './styles/terminal-skins.css';
import '@xterm/xterm/css/xterm.css';
import { startPlay } from './play/start.js';

void startPlay();
