import * as THREE from 'three';
import { ROSTER } from '../characters/Roster';
import { CharacterModel } from '../characters/CharacterModel';
import { Animator, Gesture } from '../characters/Animator';
import { EXPRESSIONS } from '../characters/Face';

export function buildCharGallery(root: THREE.Object3D, onUpdate: (fn: (dt: number) => void) => void, lookAt: THREE.Vector3) {
  const gestures: Gesture[] = ['none', 'wave', 'talk', 'cheer', 'crossArms', 'checkWatch', 'thumbsUp', 'clap', 'shrug', 'tapFoot', 'think', 'handsHips', 'none'];
  const exprs = Object.keys(EXPRESSIONS);
  const anims: Animator[] = [];
  ROSTER.forEach((def, i) => {
    const m = new CharacterModel(def.app);
    const a = new Animator(m);
    const row = Math.floor(i / 9);
    const col = i % 9;
    m.rig.root.position.set(-4.4 + col * 1.0 + row * 0.5, 0, 0.6 + row * 1.5);
    m.rig.root.rotation.y = Math.PI;
    root.add(m.rig.root);
    a.setGesture(gestures[i % gestures.length]);
    m.face.setExpression(exprs[i % exprs.length] as keyof typeof EXPRESSIONS);
    a.lookTarget = lookAt;
    anims.push(a);
  });
  onUpdate((dt) => {
    for (const a of anims) {
      a.rig.root.updateMatrixWorld();
      a.update(dt);
    }
  });
}
