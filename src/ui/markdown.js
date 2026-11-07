// Minimal, safe Markdown -> HTML for the credits panel (headings, paragraphs,
// lists, tables, emphasis, inline code, links). Input is escaped first.
import { esc } from './dom.js';

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  // bare URLs (not already inside an href)
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  return t;
}

export function markdown(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) { flush(); const n = Math.min(3, hm[1].length); out.push(`<h${n}>${inline(hm[2])}</h${n}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      let html = '<table>';
      rows.forEach((r, k) => {
        if (/^[\s|:-]+$/.test(r)) return;
        const tag = k === 0 ? 'th' : 'td';
        html += `<tr>${cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;
      });
      out.push(html + '</table>');
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}
