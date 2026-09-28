// Stand-alone first-person hands viewer (no level load): exposes window.FPV for
// scenarios (tests/fph_*.mjs) that build arms/weapons and grab contact sheets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as hands from '../src/combat/fpHands.js';
import { buildModel, setWeaponEnv } from '../src/combat/weaponModels.js';
import { CHARACTERS } from '../src/entities/characters.js';

const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 960), H = +(Q.get('h') || 540);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(Q.get('bg') || 0x3a3d42);
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = env; scene.environmentIntensity = 0.08;
setWeaponEnv(env, 0.55);
const camera = new THREE.PerspectiveCamera(58, W / H, 0.01, 20);
camera.layers.enableAll();
scene.add(camera);
// game-like viewmodel lighting (camera-attached key + warm fill + dim hemi)
const hemi = new THREE.HemisphereLight(0x303848, 0x141210, 0.35 * (+(Q.get('amb') || 1)));
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffeedd, 1.05 * (+(Q.get('key') || 1)));
key.position.set(0.5, 1.0, 0.7); camera.add(key); camera.add(key.target);
const fill = new THREE.DirectionalLight(0xffd6b0, 0.32); fill.position.set(-0.2, -0.5, -1); camera.add(fill); camera.add(fill.target);
const studio = new THREE.DirectionalLight(0xffffff, 0); studio.position.set(-1, 2, 3); scene.add(studio);
const holder = new THREE.Group(); camera.add(holder);
window.FPV = {
  THREE, hands, buildModel, CHARACTERS, renderer, scene, camera, holder, key, fill, hemi, studio,
  render() { renderer.render(scene, camera); },
  grid(cols, rows, cw, ch) { const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); return { c, g, cw, ch, cols, put(i, label) { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; g.drawImage(renderer.domElement, x, y, cw, ch); if (label) { g.fillStyle = '#000a'; g.fillRect(x, y, Math.min(cw, 8 + label.length * 7), 17); g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(label, x + 4, y + 12); } } }; },
};
window.__ready = true;
