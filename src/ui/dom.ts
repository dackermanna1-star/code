// Tiny DOM helpers.
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(markup: string, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = 'svg-ico ' + cls;
  span.innerHTML = markup;
  return span;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Animate a number counting up inside an element. */
export function countUp(el: HTMLElement, from: number, to: number, ms: number, fmt: (v: number) => string, onTick?: () => void) {
  const start = performance.now();
  let lastTick = 0;
  return new Promise<void>((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (onTick && now - lastTick > 55 && t < 1) {
        lastTick = now;
        onTick();
      }
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
