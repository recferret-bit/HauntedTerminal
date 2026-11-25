import { startPageAudio } from '../audio/page.js';
import '../contracts/migrate-storage.js';
import '../styles/editor-workstation.css';
import '../styles/terminal-lab.css';
import { startLab } from './app.js';

const root = document.getElementById('app');
if (root) {
  startPageAudio(null, root);
  startLab(root);
}
