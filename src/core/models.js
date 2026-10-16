// Global model registry. Content modules call defineModel() at import time; geometry is
// built lazily (only for models that are actually placed) when the World finalizes.

import { VoxelModel } from './VoxelModel.js'
import { VOXEL } from './constants.js'

const defs = new Map()

/**
 * Register a voxel model.
 * @param {string} name unique model name
 * @param {() => VoxelModel} builder returns the model (called once, lazily)
 * @param {object} [opts]
 * @param {number[]} [opts.lods] downsample factors, e.g. [1,2,4]. Default: [1,2,4] for big models, [1,2] small.
 * @param {number[]} [opts.lodDistances] switch distances in meters (length = lods.length-1)
 * @param {number} [opts.maxDistance] cull distance in meters
 * @param {boolean} [opts.collide=true] participates in collision
 * @param {boolean} [opts.contact=true] darkens terrain beneath (contact AO)
 * @param {boolean} [opts.cullBottom=true] skip bottom faces of the lowest layer
 * @param {boolean} [opts.indoor=false] every face is lit as an indoor surface (underground spaces)
 * @param {boolean} [opts.occludesSnow=false] snowfall particles stop at its top (roofs, canopies)
 * @param {boolean} [opts.dynamic=false] intended to move (doors, vehicles): kept out of the static grid
 */
export function defineModel(name, builder, opts = {}) {
  if (defs.has(name)) console.warn(`Model "${name}" redefined`)
  defs.set(name, { name, builder, opts, model: null, built: false })
}

export function hasModel(name) { return defs.has(name) }

/** Get the built VoxelModel for a definition (builds on first access). */
export function getModelDef(name) {
  const d = defs.get(name)
  if (!d) return null
  if (!d.built) {
    const t0 = performance.now()
    let m
    try {
      m = d.builder()
    } catch (e) {
      console.error(`Model "${name}" builder failed`, e)
      m = new VoxelModel(1, 1, 1)
    }
    if (!(m instanceof VoxelModel)) throw new Error(`Model "${name}" builder must return a VoxelModel`)
    m.name = name
    d.model = m
    d.built = true
    d.buildMs = performance.now() - t0
    const maxDimM = Math.max(m.sx, m.sy, m.sz) * VOXEL
    const o = d.opts
    d.lods = o.lods ?? (maxDimM > 10 ? [1, 2, 4] : maxDimM > 3 ? [1, 2] : [1])
    d.lodDistances = o.lodDistances ?? (maxDimM > 10 ? [70, 180] : [45])
    d.maxDistance = o.maxDistance ?? (maxDimM > 20 ? 900 : maxDimM > 8 ? 320 : maxDimM > 2 ? 160 : 90)
    d.collide = o.collide ?? true
    d.contact = o.contact ?? true
    d.cullBottom = o.cullBottom ?? true
    d.indoor = !!o.indoor
    d.occludesSnow = !!o.occludesSnow
    d.dynamic = !!o.dynamic
    // local AABB in meters relative to the pivot
    d.min = [-m.pivot.x * VOXEL, -m.pivot.y * VOXEL, -m.pivot.z * VOXEL]
    d.max = [(m.sx - m.pivot.x) * VOXEL, (m.sy - m.pivot.y) * VOXEL, (m.sz - m.pivot.z) * VOXEL]
  }
  return d
}

export function allModelNames() { return [...defs.keys()] }
