import '../contracts/migrate-storage.js';
import '../styles/editor-workstation.css';
import './audio-lab.css';
import { startAudioLab, type AudioLabHandle } from './app.js';

declare global {
  interface Window {
    __audioLab?: AudioLabHandle;
  }
}

const root = document.getElementById('app');
if (root) {
  window.__audioLab = startAudioLab(root);
}
