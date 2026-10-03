import { it } from 'vitest';
import { Composer, renderMusicOffline, CHORDS, slotTime, BAR_SEC, PART_GAIN } from '../src/audio/music';
import { peak, integratedDb, momentaryMaxDb, allFinite } from '../src/audio/dsp';

const NAMES = ['C','D','E','F','G','A','B'];
function nn(m: number) { const n = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12]; return n + (Math.floor(m/12)-1); }
it('music', () => {
  const c = new Composer(3);
  const rows: string[] = [];
  for (let b = 0; b < 42; b++) {
    const info = c.next();
    const mel = info.notes.filter(n => n.part === 'marimba').map(n => `${nn(n.midi)}@${(n.t/0.3).toFixed(1)}`).join(' ');
    const bass = info.notes.filter(n => n.part === 'bass').map(n => nn(n.midi)).join(' ');
    const counts: Record<string, number> = {};
    for (const n of info.notes) counts[n.part] = (counts[n.part] ?? 0) + 1;
    rows.push(`${String(b).padStart(2)} ${info.section.padEnd(5)} ${String(info.barInPhrase).padStart(2)} ${info.chords.join('/').padEnd(7)} | mel: ${mel.padEnd(60)} | bass: ${bass.padEnd(14)} ${JSON.stringify(counts)}`);
  }
  console.log(rows.join('\n'));
  const sr = 44100;
  for (const seed of [1,2,3]) {
    const { audio } = renderMusicOffline(40, sr, seed);
    console.log('seed', seed, 'peak', peak(audio).toFixed(3), 'int', integratedDb(audio, sr).toFixed(1), 'momMax', momentaryMaxDb(audio, sr, 0.4).toFixed(1), allFinite(audio));
  }
}, 60000);
