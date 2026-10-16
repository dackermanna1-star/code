// Public helpers of the "phone" package: place readable Russian texts in the world.
//
//   import { addNotice, addPoster, addGraffiti, addPriceTag, addPlate, addNoticeCluster } from '../phone/api.js'
//   addNotice(ctx, { x, y, z, angle: 0, kind: 'notice', sub: 'tearoff', seed: 17 })
//
// (x, y, z) is the centre of the item ON the wall surface; it is pushed 1 cm out along its
// facing normal. angle: 0 faces south (+z), π/2 faces east (+x), π north, -π/2 west
// (the same convention as signs.add). Items are picked from texts.js deterministically by seed.

import { TEXTS, ALL_TEXTS, getText, textsOf, pickText } from './texts.js'
import { drawItem, drawNotice, drawPoster, drawGraffiti, drawPriceTag, drawPlate, defaultSize, defaultPpm, graffitiAspect, HAND_STACK } from './draw.js'

export { TEXTS, ALL_TEXTS, getText, textsOf, pickText }
export { drawItem, drawNotice, drawPoster, drawGraffiti, drawPriceTag, drawPlate, defaultSize, graffitiAspect, HAND_STACK }

const PROMPT_READ = { ru: 'Читать', en: 'Read' }
const PROMPT_LOOK = { ru: 'Рассмотреть', en: 'Look closer' }

const DEFAULT_AGED = { printed: 0.35, official: 0.3, handwritten: 0.25, tearoff: 0.4, poster: 0.35, flyer: 0.45, pricetag: 0.08, handcard: 0.2, label: 0.15, hours: 0.15, sticker: 0.2, plate: 0.25, house: 0.3, stop: 0.25, painted: 0.35, danger: 0.3, hydrant: 0.35, shopsign: 0.25, rules: 0.1, lightbox: 0 }

function seedOf(o) {
  if (o.seed !== undefined) return o.seed
  return Math.abs(Math.round(o.x * 73.13 + o.z * 19.7 + (o.y ?? 0) * 7.1)) + 1
}
function seedInt(s) { return (Math.floor(Math.abs(s) * 1000003) % 2147483647) + 1 }

/** Resolve an item: o.item (object or id) | o.id | pick by o.kind/o.sub/o.look with o.seed. */
export function resolveText(o, fallbackKind = 'notice') {
  if (o.item && typeof o.item === 'object') return o.item
  if (typeof o.item === 'string') return getText(o.item)
  if (o.id) return getText(o.id)
  return pickText(o.kind ?? fallbackKind, seedOf(o), { sub: o.sub, look: o.pickLook, exclude: o.exclude })
}

/** The ui.showNote payload for a library item. */
export function noteFor(item) {
  if (!item) return { ru: '', en: '' }
  let ru = item.ru
  if (item.list) ru += '\n' + item.list.join(' — ')
  if (item.sub2) ru += '\n' + item.sub2
  if (item.addendum) ru += '\n\n' + item.addendum
  let footer = item.footer
  if (item.tear) footer = footer ? `${footer} · ${item.tear}` : item.tear
  return { title: item.title && item.look !== 'pricetag' ? item.title : undefined, ru, en: item.en, style: item.style ?? 'notice', footer }
}

/**
 * Add a readable interaction box in front of a wall item.
 * o: { x, y, z, angle, w, h, item, prompt, reach, depth, enabled }
 */
export function addReadable(ctx, o) {
  const ang = o.angle ?? 0
  const nx = Math.sin(ang), nz = Math.cos(ang)
  const rx = Math.cos(ang), rz = -Math.sin(ang)
  const w = Math.max(0.22, o.w), h = Math.max(0.22, o.h), d = o.depth ?? 0.14
  const hx = Math.abs(rx) * w / 2 + Math.abs(nx) * d / 2
  const hz = Math.abs(rz) * w / 2 + Math.abs(nz) * d / 2
  const item = o.item
  return ctx.interactions.add({
    x: o.x + nx * d * 0.4, y: o.y, z: o.z + nz * d * 0.4,
    size: [hx * 2, h, hz * 2],
    prompt: o.prompt ?? PROMPT_READ,
    reach: o.reach ?? 2.3,
    tag: o.tag ?? 'readable',
    enabled: o.enabled ?? true,
    data: { item },
    onUse(game) {
      try { game.ui.showNote(o.note ?? noteFor(item)) } catch (e) { console.error('[phone] note', e) }
      game.events?.emit?.('read', { item, x: o.x, y: o.y, z: o.z })
    },
  })
}

/**
 * The general helper: draw any library item on a wall and make it readable.
 * o: { x, y, z, angle=0, w?, h?, item|id|kind+sub, seed, look (override how it's drawn),
 *      aged (0..1), readable=true, prompt, reach, indoor, emissive, schedule, double,
 *      offset=0.01, ppm, color (graffiti), tornTabs ('allButOne' | bool[]), tape, paper, ink }
 * Returns { item, sign, interaction, w, h } or null.
 */
export function addText(ctx, o) {
  const item = resolveText(o, o.kind ?? 'notice')
  if (!item) return null
  const look = o.look ?? item.look ?? 'printed'
  const seed = seedOf(o)
  let w = o.w, h = o.h
  if (!w || !h) {
    const [dw, dh] = defaultSize(item, look)
    if (w && !h) h = w * dh / dw
    else if (h && !w) w = h * dw / dh
    else { w = dw * (o.scale ?? 1); h = dh * (o.scale ?? 1) }
  }
  const ang = o.angle ?? 0
  const off = o.offset ?? 0.01
  const x = o.x + Math.sin(ang) * off, z = o.z + Math.cos(ang) * off
  const opts = { seed: seedInt(seed), look, color: o.color, tornTabs: o.tornTabs ?? null, tape: o.tape, paper: o.paper, ink: o.ink, fade: o.fade, flat: o.flat }
  const sign = ctx.signs.add({
    x, y: o.y, z, angle: ang, w, h,
    ppm: o.ppm ?? defaultPpm(w, h, look),
    draw: (g, W, H) => { try { drawItem(g, W, H, item, opts) } catch (e) { console.error('[phone] draw', item.id, e) } },
    aged: o.aged ?? DEFAULT_AGED[look] ?? 0,
    seed: seedInt(seed) % 9973,
    indoor: o.indoor, emissive: o.emissive, schedule: o.schedule, double: o.double,
  })
  let interaction = null
  if (o.readable !== false) {
    interaction = addReadable(ctx, {
      x: o.x, y: o.y, z: o.z, angle: ang, w, h, item,
      prompt: o.prompt ?? (item.kind === 'graffiti' ? PROMPT_LOOK : PROMPT_READ), reach: o.reach, tag: o.tag,
    })
  }
  const rec = { item, sign, interaction, w, h, x: o.x, y: o.y, z: o.z, angle: ang, kind: item.kind }
  if (ctx.registry) (ctx.registry.notices ||= []).push(rec)
  return rec
}

/** A paper notice (entrance doors, notice boards, poles). Default kind 'notice'. */
export function addNotice(ctx, o) { return addText(ctx, { kind: 'notice', ...o }) }

/** A colour advertising poster (bigger, faded), or a b/w flyer. Default kind 'ad'. */
export function addPoster(ctx, o) { return addText(ctx, { kind: 'ad', ...o }) }

/** Spray paint, marker, scratches, stencils, chalk on walls. Default kind 'graffiti'. h sets the letter height. */
export function addGraffiti(ctx, o) { return addText(ctx, { kind: 'graffiti', aged: 0, ...o }) }

/** A supermarket / kiosk price tag (about 7.5 × 5 cm). */
export function addPriceTag(ctx, o) { return addText(ctx, { kind: 'shop', sub: 'price', reach: 1.6, ...o }) }

/** Plates, labels, hours, stickers, metro light boxes, street name plates (kind 'street' | 'metro' | 'shop'). */
export function addPlate(ctx, o) { return addText(ctx, { kind: 'street', ...o }) }

/**
 * Several notices pasted on one surface (an entrance door, a notice board, a lamp pole),
 * loosely arranged, sometimes overlapping, never the same text twice.
 * o: { x, y, z, angle, w (area width, m), h (area height), count (default 3), seed,
 *      kinds: ['notice', 'ad'] , subs: [...], include: [ids that must appear], aged }
 */
export function addNoticeCluster(ctx, o) {
  const seed = seedOf(o)
  let s = seedInt(seed)
  const rnd = () => ((s = (Math.imul(s, 48271) % 2147483647 + 2147483647) % 2147483647) / 2147483647)
  const count = o.count ?? 3
  const kinds = o.kinds ?? ['notice']
  const used = new Set(o.exclude ?? [])
  const out = []
  const ang = o.angle ?? 0
  const rx = Math.cos(ang), rz = -Math.sin(ang)
  const areaW = o.w ?? 0.9, areaH = o.h ?? 0.7
  const cols = Math.max(1, Math.round(Math.sqrt(count * areaW / areaH)))
  const rows = Math.ceil(count / cols)
  const picks = [...(o.include ?? [])]
  for (let i = 0; picks.length < count && i < count * 8; i++) {
    const kind = kinds[Math.floor(rnd() * kinds.length)]
    let list = textsOf(kind, { sub: o.subs })
    if (kind === 'ad') list = list.filter(t => t.look === 'flyer')
    list = list.filter(t => !used.has(t.id))
    if (!list.length) continue
    const it = list[Math.floor(rnd() * list.length)]
    used.add(it.id); picks.push(it.id)
  }
  picks.forEach((id, i) => {
    const item = getText(id)
    if (!item) return
    const c = i % cols, r = Math.floor(i / cols)
    const cellW = areaW / cols, cellH = areaH / rows
    const [dw, dh] = defaultSize(item, item.look)
    const k = Math.min(1, (cellW * 1.08) / dw, (cellH * 1.1) / dh)
    const w = dw * k, h = dh * k
    const lx = -areaW / 2 + cellW * (c + 0.5) + (rnd() - 0.5) * Math.max(0, cellW - w) * 0.8
    const ly = areaH / 2 - cellH * (r + 0.5) + (rnd() - 0.5) * Math.max(0, cellH - h) * 0.8
    out.push(addText(ctx, {
      item, x: o.x + rx * lx, y: o.y + ly, z: o.z + rz * lx, angle: ang, w, h,
      seed: seed * 31 + i * 7 + 1, offset: 0.01 + i * 0.002, aged: o.aged, indoor: o.indoor,
    }))
  })
  return out.filter(Boolean)
}
