/* What Derry Keeps — "Say something else…"
 * The player writes Gus's words or actions. When this page can reach Claude
 * (claude.use('sample')), Claude picks the scripted branch that best matches
 * the player's intent and writes a short in-character reaction to their exact
 * words. Otherwise a small tone/keyword matcher picks the branch. Either way
 * the story stays on its rails and the player's words stay theirs. */
(function () {
  'use strict';
  const E = window.ENGINE;
  const $ = (s) => document.querySelector(s);
  const FREE = window.FREE = {};
  let samplePromise = null, sampleFn = null, permanentOff = false, lastError = '';

  function getSample() {
    if (!samplePromise) {
      samplePromise = (async () => {
        try { if (window.claude && typeof window.claude.use === 'function') { sampleFn = await window.claude.use('sample'); } } catch (e) { sampleFn = null; }
        return sampleFn;
      })();
    }
    return samplePromise;
  }
  getSample();
  FREE.status = () => {
    if (permanentOff) return 'Claude isn\'t available in this view, so your words are matched to the nearest scripted reply.';
    if (sampleFn) return 'Claude is available: characters will answer what you actually write. The first time, you\'ll be asked to allow it.';
    return 'Claude isn\'t available here (it is on claude.ai), so your words are matched to the nearest scripted reply.';
  };

  /* ---------- branch previews: what each option leads to ---------- */
  function preview(index) {
    const S = E.story;
    const saved = S.state.ToJson();
    const out = [];
    try {
      S.ChooseChoiceIndex(index);
      let guard = 0;
      while (S.canContinue && out.length < 3 && guard++ < 40) {
        const l = (S.Continue() || '').trim();
        if (!l || l[0] === '@') continue;
        out.push(l.replace(/\(([a-z_]+)\):/, ' ($1):'));
      }
    } catch (e) { /* ignore */ }
    S.state.LoadJson(saved);
    return out;
  }

  /* ---------- offline matcher ---------- */
  const LEX = {
    joke: ['lol', 'haha', 'kidding', 'joke', 'funny', 'heh', 'lmao', 'jk'],
    sarcastic: ['sure', 'obviously', 'wow', 'great', 'totally', 'whatever', 'yeah right', 'oh good', 'shocking', 'thrilled'],
    kind: ['sorry', 'thank', 'are you ok', "it's ok", 'it’s ok', 'that sucks', "i'm here", 'hug', 'love', 'miss', 'care', 'safe', 'promise'],
    friendly: ['hi', 'hey', 'hello', 'nice', 'cool', 'glad', 'welcome', 'awesome', 'thanks'],
    shy: ['um', 'uh', 'i guess', 'maybe', 'sorry', 'kind of', 'i dunno'],
    blunt: ['no', 'just', 'actually', 'fine', 'look', 'stop', 'whatever'],
    confront: ['shut up', 'back off', 'leave him', 'leave her', 'leave them', "what's your problem", 'screw', 'jerk', 'idiot', 'hell', 'damn', 'loser', 'make me', 'try it'],
    manipulate: ['if you', 'unless', 'deal', 'favor', 'or else', "i'll tell", 'i will tell', 'owe me', 'trade'],
    lie: ["i didn't", 'nothing', 'never', 'i swear', 'no idea', 'not me'],
    honest: ['honestly', 'truth', 'i feel', "i'm scared", 'i am scared', "i don't know", 'to be honest', 'actually'],
    ask: ['?', 'who', 'what', 'why', 'how', 'where', 'when', 'tell me'],
    probe: ['explain', 'that doesn', "that doesn't", 'but you said', 'weird', 'strange', 'why would'],
    silent: ['...', 'nothing', 'nod', 'shrug', 'stare', 'silence', 'say nothing'],
    leave: ['bye', 'leave', 'walk away', 'later', 'gotta go', 'go home', 'run'],
    flirt: ['cute', 'pretty', 'date', 'like you', 'handsome', 'beautiful'],
    look: ['look', 'search', 'check', 'examine', 'inspect', 'read', 'open'],
    record: ['record', 'tape', 'recorder']
  };
  const STOP = new Set('the a an and or but i you me my your to of in on at it is are was be that this with for just so do not no what'.split(' '));
  function offline(input, opts, kind) {
    const t = ' ' + input.toLowerCase() + ' ';
    const words = new Set(t.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)));
    let best = null, bestScore = -1;
    for (const o of opts) {
      let sc = 0;
      const lex = LEX[o.tone] || [];
      for (const k of lex) if (t.includes(k)) sc += 2.2;
      const ow = (o.text || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/);
      for (const w of ow) if (w && !STOP.has(w) && words.has(w)) sc += 1;
      const say = E.isSay(o.text);
      if (kind === 'say' && say) sc += 0.6;
      if (kind === 'do' && !say) sc += 0.6;
      if (o.flags && o.flags.clue) sc -= 0.4;
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    return best || opts[0];
  }
  function asAction(input) {
    let s = input.trim().replace(/^\*+|\*+$/g, '');
    if (/^(i|i'm|im)\b/i.test(s)) s = s.replace(/^i'm\b/i, "You're").replace(/^im\b/i, "You're").replace(/^i\b/i, 'You');
    else if (!/^you\b/i.test(s)) s = 'You ' + s.charAt(0).toLowerCase() + s.slice(1);
    s = s.replace(/\bmy\b/gi, 'your').replace(/\bmyself\b/gi, 'yourself').replace(/\bme\b/gi, 'you');
    if (!/[.!?…]$/.test(s)) s += '.';
    return s;
  }
  function asSpeech(input) {
    let s = input.trim().replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ');
    s = s.replace(/(^|[\s.!?])i(?=[\s',.!?]|$)/g, '$1I').replace(/\bi'(m|ll|d|ve)\b/g, "I'$1");
    if (s && s[0] === s[0].toLowerCase()) s = s[0].toUpperCase() + s.slice(1);
    if (s && !/[.!?…—-]$/.test(s)) s += '.';
    return s;
  }

  /* ---------- Claude ---------- */
  const EXPRS = ['neutral', 'smile', 'grin', 'laugh', 'sad', 'angry', 'surprised', 'afraid', 'worried', 'thinking', 'smirk', 'flat', 'blush', 'cry'];
  function presentCast() {
    const D = window.DATA || {};
    const out = [];
    for (const id of Object.keys(E.vis.sprites || {})) {
      const key = Object.keys(D.chars || {}).find((k) => D.chars[k].sprite === id);
      if (key) out.push({ key, name: D.chars[key].name, voice: D.chars[key].voice || '', rel: relLine(id) });
    }
    return out;
  }
  function relLine(id) {
    const p = window.DATA && DATA.people && DATA.people[id];
    try { return p && p.describe ? p.describe(E.v, E.eng) : ''; } catch (e) { return ''; }
  }
  async function askClaude(input, kind, opts) {
    const sample = await getSample();
    if (!sample || permanentOff || !E.settings.claude) return null;
    const cast = presentCast();
    const branches = opts.map((o, i) => {
      const prev = preview(o.index);
      return `[${i}] (${E.isSay(o.text) ? 'Gus says' : 'Gus does'}; tone: ${o.tone || 'neutral'}) ${o.text}\n    → the scene continues: ${prev.join(' / ') || '(scene moves on)'}`;
    }).join('\n');
    const transcript = E.lastLines.slice(-12).map((l) => (l.who ? l.who + ': ' : '') + l.text).join('\n');
    const earlier = (E.eng.freeLog || []).slice(-5).map((f) => '- ' + f.said).join('\n');
    const prompt =
`You help run a choice-driven visual novel, "What Derry Keeps": Derry, Maine, autumn 1991. Small-town horror with real teenage life; warm, wry, unsettling. The player is Gus (Augusta Brennan), 14, new in town, who records sounds on a cassette recorder. Instead of picking a scripted option, the player wrote what Gus ${kind === 'do' ? 'does' : 'says'}.

SCENE: ${E.eng.ctx || 'An ordinary moment in Derry.'}
PRESENT: ${cast.length ? cast.map((c) => `${c.key} = ${c.name}${c.voice ? ' (' + c.voice + ')' : ''}${c.rel ? ' — ' + c.rel : ''}`).join('; ') : 'nobody else on screen (narration only)'}
RECENT LINES:
${transcript || '(scene just began)'}
${earlier ? 'THINGS GUS SAID EARLIER IN HER OWN WORDS:\n' + earlier + '\n' : ''}
The story must continue down exactly one of these scripted branches:
${branches}

PLAYER WROTE: "${input.replace(/"/g, "'")}"

Choose the branch whose intent and attitude best match what the player wrote. Then write a short reaction (1–2 sentences, under 40 words) from the most relevant character present, answering the player's actual words in that character's voice, so that the branch's scripted lines that follow still make sense right after it. If the scripted continuation already answers it well, leave the reaction empty. If nobody is present, the reaction may be a single line of second-person present-tense narration with speaker NARRATOR. Stay in 1991 (no anachronisms), never reveal anything the recent lines haven't, never mention options, branches, players or games. If the input is cruel, unsafe or nonsensical, pick the closest branch and react the way a real person in the scene would (confused, hurt, or moving on).

Reply with only JSON:
{"branch": <number>, "speaker": "<one of: ${cast.map((c) => c.key).concat(['NARRATOR']).join(', ')}>", "expression": "<one of: ${EXPRS.join(' ')}>", "reaction": "<text, may be empty>", "gus": "<the player's words lightly cleaned up (typos fixed, meaning and voice kept)${kind === 'do' ? ' as a short second-person present-tense sentence starting with You' : ''}>", "gus_expression": "<one of: ${EXPRS.join(' ')}>"}`;
    try {
      const res = await sample.json(prompt, { modelTier: 'quick' });
      if (!res || typeof res !== 'object') return null;
      let bi = parseInt(res.branch, 10);
      if (!(bi >= 0 && bi < opts.length)) bi = 0;
      const out = { index: opts[bi].index, gusText: (res.gus && String(res.gus).trim()) || null, gusExpr: EXPRS.includes(res.gus_expression) ? res.gus_expression : null, reaction: null };
      const text = res.reaction && String(res.reaction).trim();
      if (text) {
        const sp = String(res.speaker || '').toUpperCase();
        const ex = EXPRS.includes(res.expression) ? res.expression : null;
        if (sp === 'NARRATOR' || !cast.find((c) => c.key === sp)) out.reaction = { kind: 'narr', text };
        else out.reaction = { kind: 'char', key: sp, expr: ex, text };
      }
      return out;
    } catch (e) {
      lastError = e && e.code || 'error';
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(lastError)) permanentOff = true;
      console.warn('sample failed', e);
      return null;
    }
  }

  /* ---------- the input card ---------- */
  FREE.open = function ({ opts, sayMode }) {
    return new Promise((resolve) => {
      const form = $('#freeform'), ta = $('#ff-text'), note = $('#ff-note'), go = $('#ff-go'), back = $('#ff-back');
      let kind = sayMode ? 'say' : 'do';
      let doBtn = $('#ff-do');
      if (!doBtn) { doBtn = document.createElement('button'); doBtn.type = 'button'; doBtn.id = 'ff-do'; doBtn.className = 'btn'; go.parentNode.insertBefore(doBtn, go); go.parentNode.insertBefore(document.createTextNode(' '), go); }
      const setKind = (k) => {
        kind = k;
        $('#ff-label').textContent = k === 'say' ? 'Say something else' : 'Do something else';
        ta.placeholder = k === 'say' ? 'What does Gus say?' : 'What does Gus do? (e.g. "I check the closet")';
        go.textContent = k === 'say' ? 'Say it' : 'Do it';
        doBtn.textContent = k === 'say' ? 'Switch to doing' : 'Switch to saying';
      };
      setKind(kind);
      note.textContent = sampleFn && E.settings.claude && !permanentOff ? 'Characters will answer what you actually write.' : 'Your words will be matched to the closest reply.';
      ta.value = '';
      form.hidden = false;
      setTimeout(() => ta.focus(), 30);
      let busy = false, cancelled = false;
      const cleanup = () => { form.hidden = true; form.onsubmit = null; back.onclick = null; doBtn.onclick = null; ta.onkeydown = null; go.disabled = false; doBtn.disabled = false; ta.disabled = false; };
      back.onclick = () => { cancelled = true; cleanup(); resolve(null); };
      doBtn.onclick = () => setKind(kind === 'say' ? 'do' : 'say');
      ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.onsubmit(e); } else if (e.key === 'Escape') { back.onclick(); } };
      form.onsubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (busy) return;
        const input = ta.value.trim();
        if (!input) { ta.focus(); return; }
        busy = true; go.disabled = true; doBtn.disabled = true; ta.disabled = true;
        note.textContent = sampleFn && E.settings.claude && !permanentOff ? 'Thinking…' : '';
        let res = await askClaude(input, kind, opts);
        if (cancelled) return;
        if (!res) {
          const o = offline(input, opts, kind);
          res = { index: o.index, gusText: null, gusExpr: null, reaction: null };
        }
        const gusText = res.gusText || (kind === 'do' ? asAction(input) : asSpeech(input));
        cleanup();
        resolve({ index: res.index, kind, input, gusText, gusExpr: res.gusExpr, reaction: res.reaction });
      };
    });
  };
})();
