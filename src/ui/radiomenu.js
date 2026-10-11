// The old-style CS radio menus (Z / X / C): plain text list at the left edge.

const MENUS = {
  1: { title: 'Radio Commands', items: ['Cover Me', 'You Take the Point', 'Hold This Position', 'Regroup Team', 'Follow Me', 'Taking Fire, Need Assistance'] },
  2: { title: 'Group Radio Commands', items: ['Go', 'Fall Back', 'Stick Together Team', 'Get in Position', 'Storm the Front', 'Report In'] },
  3: { title: 'Radio Responses/Reports', items: ['Affirmative/Roger', 'Enemy Spotted', 'Need Backup', 'Sector Clear', "I'm in Position", 'Reporting In', "She's gonna Blow!", 'Negative', 'Enemy Down'] },
};

const SAY = {
  'Cover Me': 'Cover me!', 'You Take the Point': 'You take the point.', 'Hold This Position': 'Hold this position.',
  'Regroup Team': 'Regroup team.', 'Follow Me': 'Follow me.', 'Taking Fire, Need Assistance': 'Taking fire, need assistance!',
  Go: 'Go go go!', 'Fall Back': 'Team, fall back!', 'Stick Together Team': 'Stick together, team.', 'Get in Position': 'Get in position and wait for my go.',
  'Storm the Front': 'Storm the front!', 'Report In': 'Report in, team.', 'Affirmative/Roger': 'Affirmative.', 'Enemy Spotted': 'Enemy spotted.',
  'Need Backup': 'Need backup.', 'Sector Clear': 'Sector clear.', "I'm in Position": "I'm in position.", 'Reporting In': 'Reporting in.',
  "She's gonna Blow!": "Get out of there, it's gonna blow!", Negative: 'Negative.', 'Enemy Down': 'Enemy down.',
};

export class RadioMenu {
  constructor(container, onSay) {
    this.onSay = onSay;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;left:12px;top:38%;font:bold 13px Verdana,Tahoma,sans-serif;color:#fff;line-height:17px;white-space:pre;pointer-events:none;display:none;text-shadow:1px 1px 0 #000;z-index:20';
    container.appendChild(this.el);
    this.open = 0;
  }

  show(n) {
    const m = MENUS[n];
    this.open = n;
    this.el.innerHTML = '';
    const t = document.createElement('div');
    t.style.color = '#ffb000';
    t.textContent = m.title;
    this.el.appendChild(t);
    this.el.appendChild(document.createElement('br'));
    m.items.forEach((it, i) => {
      const d = document.createElement('div');
      d.textContent = `${i + 1}. ${it}`;
      this.el.appendChild(d);
    });
    const ex = document.createElement('div');
    ex.innerHTML = '<br>0. Exit';
    this.el.appendChild(ex);
    this.el.style.display = 'block';
  }

  choose(k) {
    const m = MENUS[this.open];
    if (!m) return;
    if (k >= 1 && k <= m.items.length) this.onSay(SAY[m.items[k - 1]] || m.items[k - 1]);
    this.close();
  }

  close() { this.open = 0; this.el.style.display = 'none'; }
}
