// Tiny DOM helpers for the HUD/menus (no framework).

export type Child = Node | string | number | null | undefined | false;

/** Create an element: h("div.cls1.cls2", { title: "x", onclick: fn }, child, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tagAndClasses: K | `${K}.${string}`,
  attrs?: Record<string, unknown> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = tagAndClasses.split(".");
  const el = document.createElement(tag as K);
  if (classes.length) el.className = classes.join(" ");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k === "html") {
        el.innerHTML = String(v);
      } else if (k === "dataset" && typeof v === "object") {
        Object.assign(el.dataset, v);
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** Set textContent only when it changed (avoids layout work every frame). */
export function setText(el: { textContent: string | null }, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Toggle a class only when needed. */
export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** "$12,345" style money formatting. */
export function money(v: number): string {
  if (!Number.isFinite(v) || v < 0) v = 0;
  return "$" + Math.round(v).toLocaleString("en-US");
}

/** Escape text for innerHTML usage. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
