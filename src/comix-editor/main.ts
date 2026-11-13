import '../styles/chapter-editor.css';
import '../styles/comix-editor.css';
import { startComixEditor } from './app.js';

const root = document.getElementById('app');
if (root) void startComixEditor(root);
