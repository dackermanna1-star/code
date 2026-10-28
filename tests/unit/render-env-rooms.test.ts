import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_BIT,
  ROOM_IDS,
  ALL_ROOM_BITS,
  WORLD_LAYER_BIT,
  DEFAULT_LAYER_MASK,
  roomAdjacency,
  roomMaskForBox,
  lightMaskForRoom,
  nearestRoom,
  popcount,
} from "../../src/render/env/roomGraph.ts";

test("room bits are unique, inside the default camera mask and disjoint from the world bit", () => {
  const seen = new Set<number>();
  for (const id of ROOM_IDS) {
    const b = ROOM_BIT[id];
    assert.equal(popcount(b), 1, id);
    assert.ok(!seen.has(b), `duplicate bit for ${id}`);
    seen.add(b);
    assert.equal(b & WORLD_LAYER_BIT, 0);
    assert.equal(b & DEFAULT_LAYER_MASK, b);
  }
  assert.equal(popcount(ALL_ROOM_BITS), ROOM_IDS.length);
  assert.equal(WORLD_LAYER_BIT & DEFAULT_LAYER_MASK, WORLD_LAYER_BIT);
});

test("adjacency follows doors, openings and open-plan boundaries but not solid walls", () => {
  const adj = roomAdjacency();
  const yes: Array<[string, string]> = [
    ["living", "kitchen"],
    ["living", "balcony"],
    ["hallW", "living"],
    ["hallW", "kitchen"],
    ["master", "hallW"],
    ["bath", "hallW"],
    ["utility", "hallW"],
    ["kitchen", "foyer"],
    ["living", "foyer"],
    ["bed2", "foyer"],
  ];
  const no: Array<[string, string]> = [
    ["master", "living"],
    ["bed2", "living"],
    ["bath", "utility"],
    ["utility", "kitchen"],
    ["master", "bed2"],
    ["bath", "kitchen"],
    ["master", "balcony"],
  ];
  for (const [a, b] of yes) {
    assert.ok(adj.get(a as never)?.has(b as never), `${a} should connect to ${b}`);
    assert.ok(adj.get(b as never)?.has(a as never), `${b} should connect to ${a} (symmetry)`);
  }
  for (const [a, b] of no) assert.ok(!adj.get(a as never)?.has(b as never), `${a} must not connect to ${b}`);
});

test("light masks include the own room plus neighbours only", () => {
  const m = lightMaskForRoom("master");
  assert.ok(m & ROOM_BIT.master);
  assert.ok(m & ROOM_BIT.hallW);
  assert.equal(m & ROOM_BIT.living, 0);
  assert.equal(m & ROOM_BIT.bath, 0);
  const k = lightMaskForRoom("kitchen");
  assert.ok(k & ROOM_BIT.living && k & ROOM_BIT.foyer && k & ROOM_BIT.hallW);
  assert.equal(k & ROOM_BIT.bed2, 0);
});

test("mesh room masks from AABBs", () => {
  // A chair in the middle of the living room.
  assert.equal(roomMaskForBox(6.0, 6.5, 2.0, 2.5), ROOM_BIT.living);
  // The master/living partition (centre line x = 4.0, 115 mm thick) spans both rooms.
  assert.equal(roomMaskForBox(3.9425, 4.0575, 0.0, 4.4), ROOM_BIT.master | ROOM_BIT.living);
  // Something merely touching the boundary from inside is not assigned to the neighbour.
  assert.equal(roomMaskForBox(3.5, 4.0, 1.0, 2.0), ROOM_BIT.master);
  // A large slab overlaps many rooms.
  assert.ok(popcount(roomMaskForBox(0, 12.8, 0, 8.8)) >= 8);
  // Outside the apartment (city side) → no rooms.
  assert.equal(roomMaskForBox(30, 31, 30, 31), 0);
  // NaN / inverted boxes are rejected.
  assert.equal(roomMaskForBox(Number.NaN, 1, 0, 1), 0);
  assert.equal(roomMaskForBox(2, 1, 0, 1), 0);
  // A degenerate (point) box still resolves its room.
  assert.equal(roomMaskForBox(11, 11, 6, 6), ROOM_BIT.foyer);
});

test("nearestRoom resolves inside points and snaps outside points", () => {
  assert.equal(nearestRoom(1.0, 7.0).id, "bath");
  assert.equal(nearestRoom(13.5, 2.0).id, "bed2");
  assert.equal(nearestRoom(6.0, -1.0).id, "balcony");
  assert.equal(nearestRoom(Number.NaN, Number.NaN).id.length > 0, true);
});
