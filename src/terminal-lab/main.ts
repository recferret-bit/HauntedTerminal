import '../styles/editor-workstation.css';
import '../styles/terminal-lab.css';
import { startLab } from './app.js';

const root = document.getElementById('app');
if (root) startLab(root);
