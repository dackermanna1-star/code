import { test } from "node:test";
import assert from "node:assert/strict";
import { Layer } from "../../src/core/context.ts";
import { defaultCollideMask, layersCollide, layerName, ALL_LAYERS } from "../../src/physics/layers.ts";

const L = Layer;
const pair = (a: number, b: number) => layersCollide(a, defaultCollideMask(a), b, defaultCollideMask(b));

test("default masks implement the brief's collision matrix", () => {
  // STATIC <-> everything
  for (const l of [L.STATIC, L.DYNAMIC, L.DEBRIS, L.PLAYER, L.HELD]) assert.equal(pair(L.STATIC, l), true, `STATIC-${layerName(l)}`);
  // DYNAMIC <-> STATIC|DYNAMIC|DEBRIS|PLAYER|HELD
  for (const l of [L.DYNAMIC, L.DEBRIS, L.PLAYER, L.HELD]) assert.equal(pair(L.DYNAMIC, l), true, `DYNAMIC-${layerName(l)}`);
  // DEBRIS <-> STATIC|DYNAMIC|DEBRIS|HELD, NOT PLAYER
  assert.equal(pair(L.DEBRIS, L.DEBRIS), true);
  assert.equal(pair(L.DEBRIS, L.HELD), true);
  assert.equal(pair(L.DEBRIS, L.PLAYER), false);
  // PLAYER <-> STATIC|DYNAMIC only
  assert.equal(pair(L.PLAYER, L.PLAYER), false);
  assert.equal(pair(L.PLAYER, L.HELD), false);
  // HELD <-> STATIC|DYNAMIC|DEBRIS, not PLAYER, not another HELD
  assert.equal(pair(L.HELD, L.HELD), false);
});

test("pair rule is symmetric and one-sided exclusion wins", () => {
  for (const a of [L.STATIC, L.DYNAMIC, L.DEBRIS, L.PLAYER, L.HELD, L.TRIGGER])
    for (const b of [L.STATIC, L.DYNAMIC, L.DEBRIS, L.PLAYER, L.HELD, L.TRIGGER]) assert.equal(pair(a, b), pair(b, a));
  // debris that WANTS the player still does not collide when the player excludes debris
  assert.equal(layersCollide(L.DEBRIS, ALL_LAYERS, L.PLAYER, defaultCollideMask(L.PLAYER)), false);
});

test("triggers see movable layers but not static", () => {
  for (const l of [L.DYNAMIC, L.DEBRIS, L.PLAYER, L.HELD]) assert.equal(pair(L.TRIGGER, l), true);
  assert.equal(layersCollide(L.TRIGGER, defaultCollideMask(L.TRIGGER), L.STATIC, defaultCollideMask(L.STATIC)), false);
});

test("multi-bit memberships union their masks; unknown bits behave like STATIC", () => {
  const m = defaultCollideMask(L.DEBRIS | L.HELD);
  assert.equal(m, defaultCollideMask(L.DEBRIS) | defaultCollideMask(L.HELD));
  assert.equal(m & L.PLAYER, 0, "neither debris nor held objects collide with the player");
  assert.equal(defaultCollideMask(1 << 12), ALL_LAYERS);
  assert.equal(layerName(L.DYNAMIC | L.HELD), "DYNAMIC|HELD");
  assert.equal(layerName(0), "NONE");
  assert.equal(layerName(ALL_LAYERS), "ALL");
});
