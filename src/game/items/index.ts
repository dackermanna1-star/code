/**
 * Item module entry point: the registry plus every vanilla item (`items.ts`).
 * Import this (rather than `registry.ts`) when you need non-block items to exist.
 * Behaviours (`behaviors.ts`) are installed by the item system (`itemSystem.ts`).
 */
export * from './registry';
export * from './items';
