// Babylon.js is loaded as a UMD global by index.html (CDN with a local fallback).
// Importing it through this module keeps the dependency explicit and lets pure-logic
// modules stay engine-free (they never import this file) so they can run under Node tests.
export const BABYLON = globalThis.BABYLON;
if (!BABYLON) throw new Error('Babylon.js failed to load');
