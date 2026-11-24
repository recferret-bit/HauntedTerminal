import '../contracts/migrate-storage.js';
import '../styles/editor-workstation.css';
import '../styles/laptop.css';
import '../styles/laptop-lab.css';
import { startLaptopLab } from './lab/lab-page.js';

const root = document.getElementById('app');
if (root) {
  const lab = startLaptopLab(root);
  // Headless tests drive the lab through this handle (scripts/harness/laptop-lab-smoke.mjs).
  (window as unknown as { __laptop: typeof lab }).__laptop = lab;
}
