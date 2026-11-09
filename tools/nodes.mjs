import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  const names = r.listNodes().map(n => n.getName());
  console.log('==', f, names.length, 'nodes');
  console.log('  cam:', names.filter(n => /cam/i.test(n)).join(', '));
  console.log('  top:', r.listScenes()[0].listChildren().map(n => n.getName() + ' t' + n.getTranslation().map(v=>+v.toFixed(3)) + ' r' + n.getRotation().map(v=>+v.toFixed(3)) + ' s' + n.getScale().map(v=>+v.toFixed(3))).join(' | '));
  const meshes = r.listNodes().filter(n => n.getMesh()).map(n => n.getName() + (n.getSkin() ? '(skin)' : ''));
  console.log('  meshes:', meshes.join(', '));
  console.log('  nonbone sample:', names.filter(n=>!/Bone_|_end|Twist/.test(n)).slice(0,60).join(', '));
}
