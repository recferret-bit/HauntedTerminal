import './style.css';
import '@xterm/xterm/css/xterm.css';
import * as THREE from 'three';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// --- Three.js scene ---
const sceneEl = document.getElementById('scene')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
sceneEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 3;

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial(),
);
scene.add(cube);

renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.005;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});

// --- xterm.js terminal ---
const term = new Terminal({
  cursorBlink: true,
  allowTransparency: true,
  theme: { background: '#00000000', foreground: '#33ff66' },
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('terminal')!);
fit.fit();
term.writeln('Haunted Terminal v0.1');
term.write('> ');

term.onData((data) => {
  if (data === '\r') term.write('\r\n> ');
  else if (data === '\x7f') term.write('\b \b');
  else term.write(data);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  fit.fit();
});
