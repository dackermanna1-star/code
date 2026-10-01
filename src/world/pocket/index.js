// Pocket dimensions (reached through portal vestibules).
import './lecture.js';

const optional = ['./auditorium.js', './hollowframes.js', './culdesac.js', './suburb.js', './pools.js'];
await Promise.all(optional.map((p) => import(p).catch((e) => console.error('[pocket] failed to load', p, e))));
