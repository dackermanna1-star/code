// Hobbies: reading, painting, journaling, puzzles, model kits, knitting,
// fitness, meditation, cookbooks, board games.
import * as THREE from 'three';
import { G } from '../../game.js';
import { worldPos, itemYaw } from './home.js';
import { consumeUse, findOwned } from './util.js';
import { pick, rand } from '../../core/utils.js';
import { tween, Ease } from '../../core/tween.js';

// ---------------------------------------------------------------- books, comics, magazines, e-readers
const book = {
  subtitle(inst) {
    const pages = inst.def.use.pages || 12;
    const p = inst.st.page || 0;
    return inst.st.finished ? '✔ Read' : p ? `Page ${p + 1}/${pages}` : `${inst.def.use.genre || 'Book'} · ${pages} pages`;
  },
  held(inst) { return [{ key: 'LMB', label: inst.st.page ? 'Keep reading' : 'Read', run: () => book.read(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Read', run: () => { G.items.pickUp(inst); book.read(inst); } }]; },
  read(inst) {
    G.hand.play('read');
    G.ui.openBook(inst, {
      onPage: () => { G.audio.play('pageturn'); G.needs.add({ fun: 1.2, comfort: 0.6 }, { silent: true }); G.events.emit('act', 'readPage', { item: inst.def.id }); },
      onFinish: () => {
        if (!inst.st.finished) {
          inst.st.finished = true;
          G.needs.add({ fun: 12, comfort: 6 });
          G.needs.addBuff('inspired', 240);
          G.events.emit('act', 'finishBook', { item: inst.def.id, genre: inst.def.use.genre });
          G.ui.toast(`Finished "${inst.def.name}" 📖`, { icon: '🏅', kind: 'good' });
          if (inst.def.use.recipes) cookbook.learn(inst);
        }
      },
    });
  },
};

const cookbook = {
  ...book,
  learn(inst) {
    const known = (G.state.flags.recipes ||= []);
    const fresh = (inst.def.use.recipes || []).filter((r) => !known.includes(r));
    known.push(...fresh);
    if (fresh.length) G.ui.toast(`Learned ${fresh.length} new recipe${fresh.length > 1 ? 's' : ''}! Check the stove.`, { icon: '👩‍🍳', kind: 'good' });
  },
  held(inst) { return [...book.held(inst), { key: 'R', label: 'Learn recipes', run: () => cookbook.learn(inst) }]; },
};

// ---------------------------------------------------------------- painting (easel)
const easel = {
  world(inst) { return [{ key: 'E', label: 'Paint something', run: () => easel.paint(inst) }]; },
  paint(inst) {
    const canvasItem = findOwned((i) => i.def.id === 'blank_canvas');
    if (!canvasItem && !inst.def.use.free) { G.ui.toast('You need a blank canvas (Art supply stores sell them).', { icon: '🖼️', kind: 'bad' }); return; }
    const yaw = itemYaw(inst);
    const p = worldPos(inst, [0, 0, 0.9]); p.y = 0;
    const release = G.player.occupy({ pos: p, yaw, pitch: -0.05, eye: 1.55, label: 'Painting', exitPos: p.clone() });
    G.ui.openPainter({
      onDone: (dataURL, title) => {
        release();
        if (!dataURL) return;
        if (canvasItem) G.items.destroy(canvasItem);
        const art = G.items.spawn('custom_painting', { loc: 'storage', st: { img: dataURL, title: title || 'Untitled' } });
        G.hand.held && G.items.toStorage(G.hand.held, true);
        G.hand.take(art);
        G.needs.add({ fun: 18, comfort: 5 });
        G.needs.addBuff('inspired', 300);
        G.events.emit('act', 'paint');
        G.ui.toast(`"${title || 'Untitled'}" is done! Hang it somewhere (F).`, { icon: '🎨', kind: 'good' });
      },
      onCancel: () => release(),
    });
  },
};

// ---------------------------------------------------------------- journal
const journal = {
  subtitle: (inst) => `${(inst.st.entries || []).length} entries`,
  held(inst) { return [{ key: 'LMB', label: 'Write today\'s entry', run: () => journal.write(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Write in it', run: () => journal.write(inst) }]; },
  write(inst) {
    G.ui.openJournal(inst, (text) => {
      if (!text?.trim()) return;
      (inst.st.entries ||= []).push({ day: G.clock.day, time: G.clock.fmt(), text: text.slice(0, 2000) });
      G.audio.play('paper');
      G.needs.add({ comfort: 8, fun: 3 });
      G.needs.addBuff('reflective', 240);
      G.events.emit('act', 'journal');
    });
  },
};

// ---------------------------------------------------------------- progressive builds (puzzles, model kits, knitting)
function progressParts(inst) {
  const parts = [];
  inst.model.traverse((o) => { if (o.userData.step != null) parts.push(o); });
  const prog = inst.st.progress || 0;
  for (const p of parts) p.visible = p.userData.step < prog * (inst.def.use.steps || 5) + 0.001 || prog >= 1;
}
const project = {
  init(inst) { progressParts(inst); },
  subtitle: (inst) => ((inst.st.progress || 0) >= 1 ? 'Complete! ✨' : `${Math.round((inst.st.progress || 0) * 100)}% done`),
  world(inst) { return (inst.st.progress || 0) >= 1 ? [{ key: 'E', label: 'Admire your work', run: () => { G.ui.toast(inst.def.use.doneText || 'Looking great!', { icon: '✨' }); G.needs.add({ comfort: 3 }); } }] : [{ key: 'E', label: `${inst.def.use.verb || 'Work on it'}`, run: () => project.work(inst) }]; },
  held(inst) { return (inst.st.progress || 0) >= 1 ? [] : [{ key: 'LMB', label: inst.def.use.verb || 'Work on it', run: () => project.work(inst) }]; },
  async work(inst) {
    const u = inst.def.use;
    const iv = setInterval(() => G.audio.play(u.sound || 'click', { pitch: rand(0.8, 1.3), volume: 0.5 }), 450);
    const ok = await G.ui.progress(`${u.verb || 'Working'}…`, u.seconds || 8, { icon: u.icon || '🧩' });
    clearInterval(iv);
    if (!ok) return;
    inst.st.progress = Math.min(1, (inst.st.progress || 0) + 1 / (u.sessions || 3));
    progressParts(inst);
    G.needs.add({ fun: 8, comfort: 3 });
    G.events.emit('act', 'project', { item: inst.def.id });
    if (inst.st.progress >= 1) {
      G.audio.play('reveal');
      G.particles.confetti(inst.data.loc === 'world' ? worldPos(inst, [0, 0.2, 0]) : G.hand.tipWorld(), 30);
      G.ui.toast(`${inst.def.name} complete! 🎉`, { icon: '🏆', kind: 'good' });
      G.events.emit('act', 'projectDone', { item: inst.def.id });
      if (u.produces) {
        const made = G.items.spawn(u.produces, { loc: 'storage' });
        if (u.consumeOnDone) { const wasHeld = G.hand.held === inst; G.items.destroy(inst); if (wasHeld) G.hand.take(made); }
        G.ui.toast(`You made: ${made.def.name}!`, { icon: '🧶', kind: 'good' });
      }
    } else G.ui.toast(`${Math.round(inst.st.progress * 100)}% complete`, { icon: u.icon || '🧩' });
  },
};

// ---------------------------------------------------------------- fitness & wellness
const workout = {
  world(inst) { return [{ key: 'E', label: inst.def.use.verb || 'Work out', run: () => workout.go(inst) }]; },
  held(inst) { return inst.def.use.handheld ? [{ key: 'LMB', label: inst.def.use.verb || 'Do some reps', run: () => workout.reps(inst) }] : []; },
  async go(inst) {
    const u = inst.def.use;
    const yaw = itemYaw(inst);
    const p = worldPos(inst, u.standAt || [0, 0, 0]);
    const release = G.player.occupy({ pos: new THREE.Vector3(p.x, u.y ?? 0, p.z), yaw: yaw + (u.faceBack ? Math.PI : 0), pitch: u.pitch ?? -0.3, eye: u.eye ?? 1.0, label: u.verb || 'Working out', exitPos: worldPos(inst, [0, 0, 1.0]).setY(0) });
    const snd = u.sound ? G.audio.loop(u.sound, { pos: p, volume: 0.4 }) : null;
    const bob = setInterval(() => { if (G.player.occ) G.player.occ.target.y += Math.sin(performance.now() * 0.01) * 0.01; }, 50);
    const ok = await G.ui.progress(u.label || 'Working out', u.seconds || 10, { icon: u.icon || '💪' });
    clearInterval(bob); snd?.stop(); release();
    if (!ok) return;
    G.needs.add(u.needs || { energy: -8, hygiene: -6, fun: 6, comfort: 4 });
    G.needs.addBuff(u.buff || 'endorphins', 240);
    G.events.emit('act', 'workout', { item: inst.def.id });
  },
  async reps(inst) {
    if (G.hand.busy) return;
    G.hand.busy = true;
    for (let i = 0; i < 4; i++) { await G.hand.play('raise', { duration: 0.6 }); G.audio.play('thud', { soft: true, impact: 0.2 }); }
    G.hand.busy = false;
    G.needs.add({ energy: -2, fun: 2 });
    inst.st.reps = (inst.st.reps || 0) + 4;
    if (inst.st.reps % 20 === 0) G.needs.addBuff('endorphins', 180);
    G.events.emit('act', 'workout', { item: inst.def.id });
  },
};

const meditate = {
  world(inst) { return [{ key: 'E', label: 'Meditate', run: () => meditate.go(inst) }]; },
  async go(inst) {
    const p = worldPos(inst); p.y = 0;
    const release = G.player.occupy({ pos: p, yaw: itemYaw(inst) + Math.PI, pitch: 0.05, eye: 0.85, label: 'Meditating', exitPos: worldPos(inst, [0, 0, 0.9]).setY(0) });
    G.ui.breathe(true);
    const ok = await G.ui.progress('Breathe in… breathe out…', 12, { icon: '🧘' });
    G.ui.breathe(false);
    release();
    if (!ok) return;
    G.needs.add({ energy: 8, comfort: 12, fun: 2 });
    G.needs.addBuff('calm', 300);
    G.events.emit('act', 'meditate');
  },
};

const boardgame = {
  world(inst) { return [{ key: 'E', label: 'Play a round', run: () => G.games.launch(inst.def.use.game || 'memory_match', { source: inst }) }]; },
  held(inst) { return [{ key: 'LMB', label: 'Play a round', run: () => G.games.launch(inst.def.use.game || 'memory_match', { source: inst }) }]; },
};

export const hobby = { book, comic: book, magazine: book, ereader: book, cookbook, easel, journal, project, workout, meditate, boardgame };
void consumeUse; void pick; void tween; void Ease;
