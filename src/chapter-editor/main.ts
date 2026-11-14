import '../styles/editor-workstation.css';
import '../styles/chapter-editor.css';
import { startEditor } from './app.js';

const root = document.getElementById('app');
if (root) void startEditor(root);
