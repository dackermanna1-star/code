// Small yes/no confirmation (overwrite a save, quit to title, close the Register).
// args: { text, yes = 'Yes', no = 'No', danger } → resolves true | false.
import { Screen } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { steelPanel, rect, triangle, AP, snap } from '../gfx.js';
import * as svc from '../services.js';

export class ConfirmScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.sel = 1; // default to the safe answer
    this.dimWorld = 0.35;
  }
  update(dt, input) {
    if (!input) return;
    if (input.repeat('left') || input.repeat('right') || input.repeat('up') || input.repeat('down')) { this.sel ^= 1; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) { svc.sfx(this.sel === 0 ? 'ui_confirm' : 'ui_cancel'); this.close(this.sel === 0); }
    else if (input.pressed('cancel')) { svc.sfx('ui_cancel'); this.close(false); }
  }
  render(ctx) {
    const f = F.body, fs = F.small;
    const lines = f.wrap(this.args.text || 'Are you sure?', 560);
    const opts = [this.args.yes || 'Yes', this.args.no || 'No'];
    const w = 640, h = snap(lines.length * f.lineHeight + 110);
    const x = snap(W / 2 - w / 2), y = snap(H / 2 - h / 2);
    steelPanel(ctx, x, y, w, h, { fill: 'rgba(10,11,14,0.96)', rivets: true, seed: 8 });
    lines.forEach((l, i) => f.draw(ctx, l, W / 2, y + 26 + i * f.lineHeight, C.text, { align: 'center' }));
    const oy = y + h - 58;
    opts.forEach((o, i) => {
      const cx = W / 2 + (i === 0 ? -130 : 130);
      const sel = this.sel === i;
      const col = sel ? (i === 0 && this.args.danger ? C.red : C.textHi) : C.textMute;
      const tw = f.width(o);
      if (sel) triangle(ctx, snap(cx - tw / 2 - 28), oy + 10, 6, i === 0 && this.args.danger ? C.red : C.red, 'right');
      f.draw(ctx, o, cx, oy, col, { align: 'center' });
      if (sel) rect(ctx, snap(cx - tw / 2), oy + f.lineHeight - 2, snap(tw), AP, col);
    });
    void fs;
  }
}
