import * as THREE from 'three';
import { canvas, tex } from '../world/mapKit';

/**
 * What she finds lying about: a first-aid kit, a box of 9 mm, a note, a photograph - small, real
 * things, each with a faint glint over it so the eye finds them in the dark.
 */
export type ItemKind = 'medkit' | 'ammo' | 'note' | 'photo' | 'key';

let glintTex: THREE.Texture | null = null;
function glintTexture() {
  if (glintTex) return glintTex;
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,235,1)');
  g.addColorStop(0.18, 'rgba(255,240,210,0.7)');
  g.addColorStop(1, 'rgba(255,230,190,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  // a four-point star through it
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(32, 4);
  x.lineTo(32, 60);
  x.moveTo(4, 32);
  x.lineTo(60, 32);
  x.stroke();
  glintTex = tex(c, true, false);
  return glintTex;
}
export function makeGlint() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
  s.scale.setScalar(0.32);
  return s;
}

function labelTex(lines: { text: string; font: string; color: string; y: number }[], bg: string, w = 256, h = 160, draw?: (x: CanvasRenderingContext2D) => void) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  draw?.(x);
  x.textAlign = 'center';
  for (const l of lines) {
    x.font = l.font;
    x.fillStyle = l.color;
    x.fillText(l.text, w / 2, l.y);
  }
  return tex(c, true, false);
}

export function makeItemMesh(kind: ItemKind): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'medkit': {
      const t = labelTex([], '#d8d4cc', 256, 160, (x) => {
        x.fillStyle = '#c42a22';
        x.fillRect(108, 40, 40, 80);
        x.fillRect(88, 60, 80, 40);
      });
      const side = new THREE.MeshStandardMaterial({ color: 0xd0ccc4, roughness: 0.55 });
      const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), [side, side, top, side, side, side]);
      box.position.y = 0.06;
      g.add(box);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
      handle.position.set(0, 0.12, 0);
      g.add(handle);
      break;
    }
    case 'ammo': {
      const t = labelTex([{ text: '9MM', font: '700 64px "Oswald", sans-serif', color: '#e8d8a0', y: 100 }], '#2a2c24', 256, 160);
      const side = new THREE.MeshStandardMaterial({ color: 0x2a2c24, roughness: 0.7 });
      const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.1), [side, side, top, side, side, side]);
      box.position.y = 0.035;
      g.add(box);
      break;
    }
    case 'note':
    case 'photo': {
      const paper = kind === 'note'
        ? labelTex([], '#e8e2d2', 200, 280, (x) => {
          x.strokeStyle = 'rgba(40,40,80,0.55)';
          x.lineWidth = 2;
          for (let y = 40; y < 260; y += 18) {
            x.beginPath();
            x.moveTo(18, y);
            x.lineTo(18 + 120 + Math.random() * 50, y + (Math.random() - 0.5) * 3);
            x.stroke();
          }
        })
        : labelTex([], '#f2efe6', 200, 240, (x) => {
          const gr = x.createLinearGradient(0, 0, 200, 200);
          gr.addColorStop(0, '#5a4a52');
          gr.addColorStop(1, '#1e2a34');
          x.fillStyle = gr;
          x.fillRect(14, 14, 172, 172);
          x.fillStyle = 'rgba(255,220,200,0.5)';
          x.beginPath();
          x.arc(80, 100, 26, 0, Math.PI * 2);
          x.arc(124, 96, 24, 0, Math.PI * 2);
          x.fill();
        });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'note' ? 0.21 : 0.12, kind === 'note' ? 0.29 : 0.145), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.8, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = (Math.random() - 0.5) * 0.6;
      m.position.y = 0.004;
      g.add(m);
      break;
    }
    case 'key': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.054), new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.35, metalness: 0.2 }));
      m.position.y = 0.003;
      g.add(m);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.005, 0.012), new THREE.MeshBasicMaterial({ color: 0x2a5a9a }));
      stripe.position.set(0, 0.004, -0.012);
      g.add(stripe);
      break;
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
