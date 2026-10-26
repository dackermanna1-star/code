// Base class for anything the player can aim at and act on.
// getActions() returns [{ key: 'E'|'F'|'X'|'R'|'LMB', label, run(), hold?: seconds, disabled?: string }]
export class Interactable {
  constructor(name, kind = 'fixture') {
    this.name = name;
    this.kind = kind;
    this.object = null;
    this.outline = true; // false to disable outline highlight
    this.subtitle = '';
  }
  attach(obj) {
    obj.userData.interactable = this;
    this.object = obj;
    return this;
  }
  getName() { return typeof this.name === 'function' ? this.name() : this.name; }
  getActions() { return []; }
  outlineTarget() { return this.outline === true ? this.object : this.outline || null; }
}

// Simple helper for one-off interactables defined inline
export function makeInteractable(obj, name, actionsFn, opts = {}) {
  const it = new Interactable(name, opts.kind || 'fixture');
  it.getActions = actionsFn;
  if (opts.outline !== undefined) it.outline = opts.outline;
  if (opts.subtitle) it.subtitle = opts.subtitle;
  it.attach(obj);
  return it;
}
