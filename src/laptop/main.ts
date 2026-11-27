import '../contracts/migrate-storage.js';
import '../styles/editor-workstation.css';
import '../styles/laptop.css';
import '../styles/laptop-lab.css';
import { startLaptopLab } from './lab/lab-page.js';
import type { LaptopHandle } from './ui/laptop.js';

declare global {
  interface Window {
    __laptop?: LaptopHandle;
  }
}

const root = document.getElementById('app');
if (root) {
  const lab = startLaptopLab(root);
  // Headless tests drive the lab through this handle (scripts/harness/laptop-lab-smoke.mjs, laptop-lab.mjs).
  window.__laptop = lab;
}
