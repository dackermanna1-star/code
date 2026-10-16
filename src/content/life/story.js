// Environmental storytelling: placeStory(ctx, kind, opts) puts down one small trace of someone's
// life (mittens on a bench, a sled by the door, a cat in a basement vent...) with a quiet
// "Look" interaction that shows a short caption in Russian with an English translation.
// No rewards, no explanations.

import { HAND_FONT } from '../../render/Signs.js'
import { hashString } from '../../core/rng.js'
import { fixFine } from './vox.js'
import { life } from './rt.js'

const PROMPT = { ru: 'Осмотреть', en: 'Look' }

/**
 * Story kinds. box: interaction box [cx, cy, cz, sx, sy, sz] in local metres (model frame,
 * +Z = the prop's front); texts: quiet captions, one picked per placement by seed.
 */
export const STORY = {
  mittens: {
    model: 'life_mittens', box: [0, 0.05, 0, 0.6, 0.3, 0.45], ground: 0,
    texts: [
      { ru: 'Детские варежки. Кто-то положил их повыше, чтобы нашли.', en: 'Children\'s mittens. Someone put them up high so they\'d be found.' },
      { ru: 'Красные варежки на резинке. Одна ещё влажная внутри.', en: 'Red mittens on an elastic cord. One is still damp inside.' },
    ],
  },
  glove: {
    model: 'life_glove', post: 'life_glove_post', box: [0, 0.15, 0, 0.35, 0.4, 0.3], boxPost: [0, 1.1, 0, 0.35, 0.5, 0.35],
    texts: [
      { ru: 'Чья-то перчатка на столбике. Ждёт хозяина.', en: 'Someone\'s glove on a post. Waiting for its owner.' },
      { ru: 'Перчатку надели на столбик, чтобы было видно. Пальцы смёрзлись.', en: 'Someone pulled the glove onto the post so it could be seen. The fingers have frozen stiff.' },
    ],
  },
  sled: {
    model: 'life_sled', lean: 'life_sled_lean', box: [0, 0.22, 0, 0.6, 0.5, 1.1], boxLean: [0, 0.55, 0.3, 0.6, 1.15, 0.6],
    tints: [0x8a3a30, 0x3f5a7a, 0x4d6a4a, 0xa08a3a, 0x6a3a5a],
    texts: [
      { ru: 'Санки у подъезда. Значит, кто-то уже дома.', en: 'A sled by the entrance. So someone is already home.' },
      { ru: 'Санки с верёвкой. В квартире им места нет, вот и стоят здесь.', en: 'A sled with a rope. There\'s no room for it in the flat, so it stays out here.' },
    ],
  },
  snowman: {
    model: ['life_snowman_a', 'life_snowman_b'], box: [0, 0.75, 0, 1.0, 1.5, 1.0],
    texts: [
      { ru: 'Снеговик. Ведро вместо шапки, морковка вместо носа. Начал оседать.', en: 'A snowman. A bucket for a hat, a carrot for a nose. He has started to sag.' },
      { ru: 'Его лепили на каникулах. Глаза — угольки, руки — ветки.', en: 'Someone built him over the holidays. Coal for eyes, twigs for arms.' },
    ],
  },
  ticket: {
    model: 'life_ticket', box: [0, 0.05, 0, 0.3, 0.2, 0.3],
    texts: [
      { ru: 'Использованный билет. Кто-то уже доехал.', en: 'A used ticket. Someone has already got where they were going.' },
      { ru: 'Билет на одну поездку. Выбросили, не глядя.', en: 'A single-ride ticket, thrown away without a glance.' },
    ],
  },
  bread: {
    model: 'life_bread', box: [0, 0.12, 0, 0.55, 0.35, 0.55],
    texts: [
      { ru: 'Батон в пакете. Кто-то тоже шёл за хлебом.', en: 'A loaf in a carrier bag. Someone else went out for bread, too.' },
      { ru: 'Пакет с хлебом. Наверное, для птиц — или просто забыли.', en: 'A bag of bread. For the birds, probably — or simply forgotten.' },
    ],
  },
  frozen_bag: {
    model: 'life_frozen_bag', box: [0, 0.06, 0, 0.55, 0.25, 0.5],
    texts: [
      { ru: 'Пакет примёрз к скамейке. Не оторвать.', en: 'A carrier bag frozen to the bench. It won\'t come away.' },
      { ru: 'Пустой пакет, вмёрзший в лёд. Лежит здесь с оттепели.', en: 'An empty bag frozen into the ice. It has been here since the thaw.' },
    ],
  },
  key: {
    model: 'life_key', box: [0, 0.05, 0, 0.3, 0.2, 0.3],
    texts: [
      { ru: 'Ключи с таблеткой от домофона. Кто-то сегодня будет звонить соседям.', en: 'Keys with an intercom fob. Someone will be ringing the neighbours tonight.' },
      { ru: 'Связка ключей в снегу. Утром их будут искать.', en: 'A bunch of keys in the snow. Someone will be looking for them in the morning.' },
    ],
  },
  butts: {
    model: 'life_butts', box: [0, 0.08, 0, 0.55, 0.3, 0.5],
    texts: [
      { ru: 'Банка из-под горошка, полная окурков. Здесь курят по вечерам.', en: 'A pea tin full of cigarette ends. People smoke here in the evenings.' },
      { ru: 'Окурки в снегу и банка-пепельница. Курят у подъезда, чтобы не дома.', en: 'Cigarette ends in the snow and a tin-can ashtray. They smoke by the entrance so as not to smoke at home.' },
    ],
  },
  cat: {
    model: 'life_cat', box: [0, 0.19, 0.1, 0.5, 0.45, 0.4], wall: true,
    texts: [
      { ru: 'Кошка в продухе. Смотрит и не уходит.', en: 'A cat in the basement vent. It watches you and doesn\'t leave.' },
      { ru: 'В продухе кто-то живёт. Рядом крышка с размокшим хлебом.', en: 'Someone lives in the vent. Beside it, a lid with soggy bread.' },
    ],
  },
  bicycle: {
    model: 'life_bicycle', box: [0, 0.6, 0, 0.6, 1.2, 1.3],
    tints: [0x2f3f5c, 0x6a2e2a, 0x3d5a40, 0x5a5a5e, 0x2a2a2c],
    texts: [
      { ru: 'Велосипед, пристёгнутый с осени. Колёса ушли в снег.', en: 'A bicycle chained up since autumn. The wheels have sunk into the snow.' },
      { ru: 'Велосипед под снегом. Хозяин вспомнит о нём в апреле.', en: 'A bicycle under the snow. Its owner will remember it in April.' },
    ],
  },
  yolka: {
    model: 'life_yolka', box: [0, 0.35, 0, 1.3, 0.8, 2.0],
    texts: [
      { ru: 'Выброшенная ёлка. На ветках ещё остался дождик.', en: 'A thrown-out New Year tree. There is still some tinsel on the branches.' },
      { ru: 'Ёлку вынесли после Старого Нового года. Пахнет хвоей.', en: 'Someone carried the tree out after the Old New Year. It smells of pine needles.' },
    ],
  },
}

export const STORY_KINDS = Object.keys(STORY)

function seedInt(seed, fallback) {
  if (seed === undefined || seed === null || Number.isNaN(seed)) return fallback >>> 0
  if (typeof seed === 'string') return hashString(seed)
  if (seed > 0 && seed < 1) return Math.floor(seed * 4294967295) >>> 0
  return (Math.floor(seed) >>> 0) || fallback
}

function ticketText(seed) {
  const n = String(400000 + (seed % 599999)).padStart(7, '0')
  const day = 9 + (seed % 9)
  return {
    ru: `ГОРТРАНС\nЕДИНЫЙ БИЛЕТ\nна 1 поездку\nСтоимость 17 руб.\n№ ${n} · ${String(day).padStart(2, '0')}.01.08`,
    en: `GORTRANS. Single ticket for 1 ride. Price 17 rub. No. ${n}, ${String(day).padStart(2, '0')}.01.08.`,
  }
}

/** Place on a bench record ({seat:{x,y,z}, angle} from street's registry.benches / placeBench). */
function benchSpot(o, rng) {
  const b = o.bench
  const seat = b.seat ?? b
  const a = b.angle ?? o.angle ?? 0
  // along the bench: local +X of a front-(sin a, cos a) model is (cos a, −sin a)
  const along = o.along ?? (rng % 2 ? 0.45 : -0.45)
  return { x: seat.x + Math.cos(a) * along, z: seat.z - Math.sin(a) * along, y: seat.y + (o.benchSnow ?? 0.25), angle: a + ((rng % 7) - 3) * 0.08 }
}

/**
 * Place a storytelling prop.
 * kind: one of STORY_KINDS. o: { x, z, angle=0 (front faces (sin a, cos a)), y (default: terrain
 *   height; put mittens/bread/frozen_bag on a bench seat with y = seat top + snow), seed,
 *   bench (a bench record: places it on the seat), inspect=true, text {ru,en} (custom caption),
 *   lean (sled: stood against a wall, pivot at the wall), post (glove: on its own lone post; default
 *   when y is not given), bowl (cat: a lid of food below the vent, default true), note (cat: the
 *   handwritten «Не закрывайте продухи» notice above the vent, default false), variant, tint }
 * Returns { kind, placement, placements, interaction, text, x, y, z, angle } or null.
 */
export function placeStory(ctx, kind, o = {}) {
  const def = STORY[kind]
  if (!def) { console.warn(`placeStory: unknown kind "${kind}"`); return null }
  const { world, terrain } = ctx
  const seed = seedInt(o.seed, hashString(`${kind}:${o.x}:${o.z}`))
  let x = o.x, z = o.z, y = o.y, angle = o.angle ?? 0
  if (o.bench) ({ x, z, y, angle } = { ...benchSpot(o, seed), ...(o.y !== undefined ? { y: o.y } : {}) })
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  let model = Array.isArray(def.model) ? def.model[(o.variant ?? seed) % def.model.length] : def.model
  let box = def.box
  if (kind === 'glove' && (o.post ?? y === undefined)) { model = def.post; box = def.boxPost }
  if (kind === 'sled' && o.lean) { model = def.lean; box = def.boxLean }
  const ground = terrain.heightAt(x, z)
  if (y === undefined) y = (Number.isFinite(ground) ? ground : 0) + (kind === 'cat' ? 0.25 : 0)
  fixFine(model)
  const tint = o.tint ?? (def.tints ? def.tints[seed % def.tints.length] : 0xffffff)
  const placement = world.place(model, { x, z, y, angle, seed: (seed % 100000) / 100000, tint, tag: 'story', collide: false, userData: { story: kind } })
  if (!placement) return null
  const placements = [placement]
  const c = Math.cos(angle), s = Math.sin(angle)
  const toW = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]

  // extras
  if (kind === 'cat') {
    if (o.bowl !== false) {
      const [bx, bz] = toW(((seed >> 3) % 3 - 1) * 0.12, 0.42)
      const by = terrain.heightAt(bx, bz)
      fixFine('life_cat_bowl')
      const pb = world.place('life_cat_bowl', { x: bx, z: bz, y: Number.isFinite(by) ? by : y, angle, tag: 'story', collide: false })
      if (pb) placements.push(pb)
    }
    if (o.note && ctx.signs) {
      const [nx, nz] = toW(0.05, 0.012)
      ctx.signs.add({
        x: nx, y: y + 0.62, z: nz, angle, w: 0.42, h: 0.26, ppm: 140, aged: 0.55, seed,
        lines: ['Не закрывайте продухи —', 'там живут кошки!'], font: HAND_FONT, weight: 'normal', bg: '#d9d4c3', color: '#23306a',
      })
    }
  }

  // inspect interaction
  let text = o.text ?? def.texts[(seed >>> 5) % def.texts.length]
  let interaction = null
  if (o.inspect !== false && ctx.interactions) {
    const [cx, cz] = toW(box[0], box[2])
    // axis-aligned box covering the rotated local box
    const sx = Math.abs(box[3] * c) + Math.abs(box[5] * s), sz = Math.abs(box[3] * s) + Math.abs(box[5] * c)
    const ticket = kind === 'ticket' ? ticketText(seed) : null
    interaction = ctx.interactions.add({
      x: cx, y: y + box[1], z: cz, size: [Math.max(0.3, sx), Math.max(0.25, box[4]), Math.max(0.3, sz)],
      prompt: PROMPT, reach: 2.6, tag: 'story', data: { kind },
      onUse(game) {
        if (ticket) game.ui.showNote({ ru: ticket.ru, en: ticket.en, style: 'ticket' })
        game.ui.say(text, 6)
        game.events?.emit?.('story', { kind, x, z })
      },
    })
  }
  const rec = { kind, placement, placements, interaction, text, x, y, z, angle }
  const reg = ctx.registry
  if (reg) (reg.story || (reg.story = [])).push({ kind, x, y, z, angle, placement, interaction })
  life.story.push(rec)
  return rec
}

/**
 * Put a story prop beside a подъезд, using a registry.entrances record (residential): next to
 * the porch on the left (side −1) or right (side +1, seen from outside), against the facade.
 * Kinds that suit an entrance: 'sled' (leaning on the wall), 'butts', 'cat' (in the plinth),
 * 'key', 'glove'. opts: { side = ±1 (default by seed), along (m from the door centre, default
 * 2.6), out (m from the wall, default per kind), seed, ...placeStory opts }.
 */
export function placeStoryAtEntrance(ctx, entrance, kind, opts = {}) {
  if (!entrance) return null
  const a = entrance.angle ?? 0
  const seed = seedInt(opts.seed, hashString(`${kind}:${entrance.x}:${entrance.z}`))
  const side = opts.side ?? (seed % 2 ? 1 : -1)
  const along = (opts.along ?? 2.6) * side
  const OUT = { sled: 0.04, cat: 0.02, butts: 0.55, key: 1.2, glove: 0.3, ticket: 1.4 }
  const out = opts.out ?? OUT[kind] ?? 0.6
  // facing (sin a, cos a) out of the building; along the facade = (cos a, −sin a)
  const x = entrance.x + Math.cos(a) * along + Math.sin(a) * out
  const z = entrance.z - Math.sin(a) * along + Math.cos(a) * out
  const o = { ...opts, x, z, angle: a, seed }
  delete o.side; delete o.along; delete o.out
  if (kind === 'sled') o.lean = opts.lean ?? true
  return placeStory(ctx, kind, o)
}
