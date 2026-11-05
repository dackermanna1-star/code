/* =============================================================================
   nemuri II — TITLE (module 20): the sequel's title screen, main menu, first-time
   prologue, pause menu, controls help (F1 / ?), the waking graph, the ending
   sequence and big centred whispers.  API on N2.mods.title (see bottom).
   Visual identity: deep moonlit blue-black, pale moon-gold, soft teal, a little
   warm lantern-amber.  Lowercase, monospace, hushed.
   ============================================================================= */
var T = N2.mods.title = {};
var SAVE_KEY = "title";
var tsv = (function () { var s = N2.save.get(SAVE_KEY, null) || {}; return { seenPrologue: !!s.seenPrologue, starts: +s.starts || 0, nights: Array.isArray(s.nights) ? s.nights.slice(-40) : [] }; })();
function persist() { try { N2.save.set(SAVE_KEY, tsv); } catch (e) {} }
function reduced() { return !!(N2.settings && N2.settings.reducedMotion); }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function safe(fn) { try { return fn(); } catch (e) { if (window.console) console.warn("[N2 title]", e); } }
try { document.title = "nemuri II — the lucid hour"; } catch (e) {}

N2.bind("F1", "controls help", "title");

/* ===================================================================== css */
N2.ui.css([
  ":root{--t-bg:#050912;--t-moon:#f3e7c4;--t-gold:#f0d79a;--t-teal:#8fd0d2;--t-amber:#e8a860;--t-ink:#e6e4da;--t-dim:#7f8fa3;--t-faint:#3e4a5e;}",
  /* ---- title ---- */
  "#title{background:var(--t-bg)!important;cursor:default!important;}",
  "#title::before,#title::after{display:none!important;}",
  "#title .orb{display:none!important;}",
  "#n2t-cv{position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;will-change:transform;}",
  "#n2t-veil{position:absolute;inset:0;z-index:9;pointer-events:none;background:#e8e4ee;opacity:0;transition:opacity .5s ease-in;}",
  "#title.going #n2t-veil{opacity:1;}",
  ".n2t-logo{position:absolute;left:0;right:0;bottom:50%;z-index:3;display:flex;flex-direction:column;align-items:center;transform:translateY(7vh);transform-origin:50% 100%;transition:transform 1.6s cubic-bezier(.3,.7,.2,1);pointer-events:none;will-change:transform;}",
  "#title.armed .n2t-logo{transform:translateY(-50px) scale(.74);}",
  ".n2t-glyph{position:relative;font-family:'Hiragino Mincho ProN','Yu Mincho','Songti SC','IPAPGothic',serif;font-size:clamp(60px,min(17vw,30vh),200px);line-height:.95;letter-spacing:.06em;color:#efe5c9;",
  "  text-shadow:0 0 38px rgba(240,215,154,.38),0 0 90px rgba(143,208,210,.22);animation:n2tBreathe 8s ease-in-out infinite;white-space:nowrap;will-change:transform,opacity;}",
  ".n2t-glyph .gh{position:absolute;left:0;top:0;color:#8fd0d2;opacity:.26;filter:blur(2px);animation:n2tGhost 12s ease-in-out infinite;pointer-events:none;}",
  ".n2t-two{display:inline-block;margin-left:.12em;font-family:'Times New Roman',Georgia,serif;font-size:.46em;letter-spacing:.04em;vertical-align:.62em;",
  "  background:linear-gradient(100deg,#c9a660 0%,#fff6dc 38%,#f0d79a 50%,#9fe0e0 64%,#f0d79a 100%);-webkit-background-clip:text;background-clip:text;color:transparent;",
  "  filter:drop-shadow(0 0 14px rgba(240,215,154,.55)) drop-shadow(0 0 34px rgba(143,208,210,.28));animation:n2tTwo 9s ease-in-out infinite;will-change:opacity;}",
  ".n2t-sub{margin-top:.55em;display:flex;flex-direction:column;align-items:center;gap:.5em;}",
  ".n2t-jp{font-family:'IPAPGothic',sans-serif;font-size:clamp(10px,1.3vw,13px);letter-spacing:.9em;padding-left:.9em;color:var(--t-teal);opacity:.62;}",
  ".n2t-en{display:flex;align-items:center;gap:1.1em;font-size:clamp(12px,1.9vw,17px);letter-spacing:.78em;padding-left:.78em;color:var(--t-gold);opacity:.9;text-shadow:0 0 18px rgba(240,215,154,.35);}",
  ".n2t-en i{display:block;width:clamp(26px,6vw,70px);height:1px;background:linear-gradient(90deg,rgba(240,215,154,0),rgba(240,215,154,.6));}",
  ".n2t-en i:last-child{background:linear-gradient(270deg,rgba(240,215,154,0),rgba(240,215,154,.6));}",
  ".n2t-intro{position:absolute;left:0;right:0;top:calc(50% + 7vh + 22px);z-index:3;display:flex;flex-direction:column;align-items:center;text-align:center;transition:opacity 1s ease,transform 1.4s ease;pointer-events:none;will-change:transform,opacity;}",
  "#title.armed .n2t-intro{opacity:0;transform:translateY(16px);}",
  ".n2t-tag{max-width:min(90vw,66ch);font-size:clamp(12px,1.45vw,14px);line-height:2;color:var(--t-dim);}",
  ".n2t-tag em{display:block;color:#b7c6d3;font-style:italic;opacity:.85;}",
  ".n2t-prompt.prompt{margin-top:2.2em;font-size:11px;letter-spacing:.42em;padding-left:.42em;color:var(--t-gold);text-transform:lowercase;animation:n2tPulse 3.6s ease-in-out infinite;}",
  ".n2t-credit{position:absolute;bottom:16px;left:0;right:0;z-index:3;text-align:center;font-size:10px;letter-spacing:.2em;color:#46526a;pointer-events:none;}",
  ".n2t-ver{position:absolute;top:14px;right:16px;z-index:3;font-size:10px;letter-spacing:.2em;color:#3c4860;pointer-events:none;}",
  /* menu */
  ".n2t-menu{position:absolute;left:50%;top:calc(50% - 19px);z-index:4;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;opacity:0;pointer-events:none;transition:opacity .9s ease .25s;min-width:300px;will-change:opacity;}",
  "#title.armed .n2t-menu{opacity:1;pointer-events:auto;}",
  ".n2t-it{position:relative;height:38px;min-width:200px;padding:0 34px!important;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit;background:none;border:0;cursor:pointer;color:#8d9bb0;font-size:13px;letter-spacing:.36em;text-transform:lowercase;transition:color .35s ease,letter-spacing .5s ease;outline:none;}",
  ".n2t-it small{display:block;font-size:9px;letter-spacing:.24em;color:#56647a;margin-top:3px;transition:color .35s;}",
  ".n2t-it::before,.n2t-it::after{content:'\\25C7';position:absolute;top:50%;font-size:8px;color:var(--t-gold);opacity:0;transform:translateY(-50%);transition:opacity .35s ease,left .5s ease,right .5s ease;}",
  ".n2t-it::before{left:22px;}.n2t-it::after{right:22px;}",
  ".n2t-it.f{color:#fff4d8;letter-spacing:.44em;text-shadow:0 0 16px rgba(240,215,154,.55);}",
  ".n2t-it.f small{color:var(--t-teal);}",
  ".n2t-it.f::before,.n2t-it.f::after{opacity:.9;}.n2t-it.f::before{left:10px;}.n2t-it.f::after{right:10px;}",
  ".n2t-it.f .ln{opacity:1;transform:scaleX(1);}",
  ".n2t-it .ln{position:absolute;left:30px;right:30px;bottom:2px;height:1px;background:linear-gradient(90deg,rgba(143,208,210,0),rgba(240,215,154,.55),rgba(143,208,210,0));opacity:0;transform:scaleX(.2);transition:opacity .4s,transform .6s ease;}",
  ".n2t-q{font-size:11px;letter-spacing:.22em;color:#c9b88f;margin:0 0 10px;text-align:center;line-height:1.9;}",
  ".n2t-keys{position:absolute;left:0;right:0;bottom:38px;z-index:3;text-align:center;font-size:9px;letter-spacing:.26em;color:#3e4a60;opacity:0;transition:opacity 1.2s ease .8s;pointer-events:none;}",
  "#title.armed .n2t-keys{opacity:1;}",
  "@media (max-height:620px){.n2t-it{height:33px;}.n2t-it small{margin-top:1px;}#title.armed .n2t-logo{transform:translateY(-44px) scale(.62);}.n2t-keys{display:none;}}",
  "@media (max-height:470px){#title.armed .n2t-logo{transform:translateY(-36px) scale(.46);}}",
  /* ---- prologue ---- */
  "#n2t-pro{position:fixed;inset:0;z-index:97;background:#020308;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.35em;opacity:0;transition:opacity 1.4s ease;cursor:default;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;}",
  "#n2t-pro.on{opacity:1;}",
  "#n2t-pro .pl{font-size:clamp(12px,1.7vw,15px);letter-spacing:.16em;color:#cfd6dc;opacity:0;transform:translateY(5px);filter:blur(3px);transition:opacity 2.2s ease,transform 2.2s ease,filter 2.2s ease,color 3s ease;text-align:center;max-width:88vw;line-height:1.7;}",
  "#n2t-pro .pl.on{opacity:.9;transform:none;filter:none;}",
  "#n2t-pro .pl.old{opacity:.34;color:#7f8fa3;}",
  "#n2t-pro .pl.gold{color:var(--t-gold);text-shadow:0 0 18px rgba(240,215,154,.4);}",
  "#n2t-pro .ps{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:.3em;color:#3e4a60;}",
  "#n2t-pro .pgo{margin-top:1.6em;font-size:11px;letter-spacing:.42em;color:var(--t-gold);opacity:0;transition:opacity 1.6s ease;}",
  "#n2t-pro .pgo.on{opacity:1;animation:n2tPulse 3.6s ease-in-out infinite;}",
  /* ---- pause ---- */
  "#pause{background:radial-gradient(ellipse at 50% 45%,rgba(8,14,28,.78),rgba(3,5,11,.93))!important;cursor:default!important;}",
  ".n2p{display:flex;flex-direction:column;align-items:center;text-align:center;}",
  ".n2p-g{font-family:'Hiragino Mincho ProN','Yu Mincho','IPAPGothic',serif;font-size:34px;color:#efe5c9;letter-spacing:.06em;text-shadow:0 0 26px rgba(240,215,154,.3);opacity:.8;}",
  ".n2p-g span{font-family:'Times New Roman',Georgia,serif;font-size:.5em;vertical-align:.6em;margin-left:.12em;color:var(--t-gold);}",
  ".n2p-t{margin-top:12px;font-size:17px;letter-spacing:.5em;padding-left:.5em;color:var(--t-gold);}",
  ".n2p-w{margin:12px 0 22px;font-size:10px;letter-spacing:.22em;color:var(--t-dim);max-width:86vw;line-height:1.8;}",
  ".n2p-w b{font-weight:normal;color:var(--t-teal);}",
  ".n2p .n2t-it{height:34px;}",
  ".n2p-h{margin-top:20px;font-size:9px;letter-spacing:.28em;color:#3e4a60;}",
  /* ---- help ---- */
  "#n2-help .n2-sheet{width:min(94vw,900px);background:linear-gradient(180deg,rgba(9,15,30,.96),rgba(5,8,17,.97));border-color:rgba(143,208,210,.22);box-shadow:0 0 90px rgba(90,140,190,.16);position:relative;}",
  "#n2-help h2{color:var(--t-gold);letter-spacing:.4em;}",
  ".n2h-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px 26px;}",
  ".n2h-g h3{margin:0 0 8px;font-weight:normal;font-size:10px;letter-spacing:.34em;color:var(--t-teal);text-transform:lowercase;border-bottom:1px solid rgba(143,208,210,.14);padding-bottom:6px;}",
  ".n2h-r{display:flex;align-items:baseline;gap:12px;padding:3px 0;font-size:11px;letter-spacing:.08em;color:#c7ccd2;line-height:1.5;}",
  ".n2h-r.off{color:#566276;}",
  ".n2h-r.off em{color:#6b5a3a;font-style:normal;font-size:9px;letter-spacing:.18em;margin-left:6px;}",
  ".n2h-k{flex:0 0 74px;display:flex;gap:3px;flex-wrap:wrap;}",
  ".n2h-k kbd{font:inherit;font-size:10px;min-width:18px;text-align:center;padding:1px 5px;border:1px solid rgba(240,215,154,.3);border-bottom-width:2px;border-radius:3px;color:var(--t-gold);background:rgba(240,215,154,.04);}",
  ".n2h-tip{margin-top:20px;padding-top:12px;border-top:1px solid rgba(143,208,210,.12);font-size:10px;letter-spacing:.16em;color:var(--t-dim);line-height:1.9;text-align:center;}",
  /* ---- graph ---- */
  "#graphwrap{background:radial-gradient(ellipse at 50% 42%,rgba(9,16,32,.97),rgba(3,5,11,.985))!important;transition:opacity .85s ease;}",
  "#graphwrap.leaving{opacity:0;}",
  ".n2g{display:flex;align-items:center;justify-content:center;gap:34px;max-width:96vw;}",
  "#graphwrap #graph{width:min(64vh,440px,90vw);height:auto;aspect-ratio:22/19;image-rendering:auto;box-shadow:none;}",
  ".n2g-side{width:250px;font-size:11px;letter-spacing:.14em;color:#b9c2cc;}",
  ".n2g-n{font-size:11px;letter-spacing:.4em;color:var(--t-dim);opacity:0;transition:opacity 1.2s ease .3s;}",
  ".n2g-n b{display:block;font-weight:normal;font-size:30px;letter-spacing:.18em;color:var(--t-gold);text-shadow:0 0 20px rgba(240,215,154,.35);margin-top:2px;}",
  ".n2g-w{margin-top:6px;font-size:11px;color:var(--t-teal);opacity:0;transition:opacity 1.2s ease 1.1s;font-style:italic;letter-spacing:.12em;}",
  ".n2g-h{margin:18px 0 6px;font-size:9px;letter-spacing:.34em;color:#56647a;opacity:0;transition:opacity 1s ease .9s;}",
  ".n2g-d{list-style:none;margin:0;padding:0;}",
  ".n2g-d li{display:flex;align-items:center;gap:9px;padding:2px 0;font-size:10.5px;letter-spacing:.1em;color:#c7ccd2;opacity:0;transform:translateX(-6px);transition:opacity .8s ease,transform .8s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
  ".n2g-d li i{flex:0 0 6px;height:6px;border-radius:50%;box-shadow:0 0 8px currentColor;}",
  ".n2g-st{margin-top:16px;display:flex;flex-direction:column;gap:8px;}",
  ".n2g-s{opacity:0;transition:opacity 1s ease;font-size:10px;letter-spacing:.18em;color:#9aa6b4;}",
  ".n2g-s b{font-weight:normal;color:var(--t-gold);}",
  ".n2g-bar{margin-top:5px;height:3px;background:rgba(143,208,210,.12);position:relative;overflow:hidden;}",
  ".n2g-bar u{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#5e9fb0,#8fd0d2,#f0d79a);transition:width 2s cubic-bezier(.3,.7,.2,1);box-shadow:0 0 10px rgba(143,208,210,.6);}",
  "#graphwrap.show .n2g-n,#graphwrap.show .n2g-w,#graphwrap.show .n2g-h{opacity:1;}",
  "#graphwrap.show .n2g-d li,#graphwrap.show .n2g-s{opacity:1;transform:none;}",
  ".n2g-cap.gcap{margin-top:22px;font-size:11px;letter-spacing:.26em;color:#6f7f96;transition:color 1s;}",
  ".n2g-cap.ready{color:#c9b88f;}",
  "@media (max-width:720px){.n2g{flex-direction:column;gap:14px;}.n2g-side{width:min(88vw,440px);}.n2g-d{columns:2;column-gap:14px;}#graphwrap #graph{width:min(88vw,50vh);}}",
  /* ---- ending ---- */
  "#n2t-end{position:fixed;inset:0;z-index:96;background:#03050b;opacity:0;transition:opacity 2.4s ease;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;cursor:default;overflow:hidden;}",
  "#n2t-end.on{opacity:1;}#n2t-end.out{opacity:0;transition:opacity 2.2s ease;}",
  "#n2t-end canvas{position:absolute;inset:0;width:100%;height:100%;}",
  "#n2t-end .ev{position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 45%,rgba(3,5,11,0) 30%,rgba(3,5,11,.55) 100%);pointer-events:none;}",
  "#n2t-end .es{position:absolute;left:0;right:0;top:40%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:1.1em;text-align:center;padding:0 6vw;}",
  "#n2t-end .el{font-size:clamp(13px,1.9vw,17px);letter-spacing:.14em;color:#eae4d2;opacity:0;filter:blur(4px);transform:translateY(6px);transition:opacity 2.2s ease,filter 2.2s ease,transform 2.2s ease;text-shadow:0 0 14px rgba(3,5,11,.9),0 0 30px rgba(3,5,11,.8);line-height:1.6;}",
  "#n2t-end .el.on{opacity:.95;filter:none;transform:none;}",
  "#n2t-end .es.fade .el{opacity:0;filter:blur(3px);transition:opacity 1.5s ease,filter 1.5s ease;}",
  "#n2t-end .cr{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:.9em;text-align:center;opacity:0;transition:opacity 3s ease;}",
  "#n2t-end .cr.on{opacity:1;}",
  "#n2t-end .cg{font-family:'Hiragino Mincho ProN','Yu Mincho','IPAPGothic',serif;font-size:clamp(54px,10vw,120px);color:#efe5c9;letter-spacing:.06em;text-shadow:0 0 40px rgba(240,215,154,.4),0 0 90px rgba(143,208,210,.2);margin-bottom:.15em;}",
  "#n2t-end .cg span{font-family:'Times New Roman',Georgia,serif;font-size:.46em;vertical-align:.62em;margin-left:.12em;color:var(--t-gold);}",
  "#n2t-end .ct{font-size:clamp(12px,1.7vw,15px);letter-spacing:.5em;padding-left:.5em;color:var(--t-gold);}",
  "#n2t-end .cl{font-size:11px;letter-spacing:.24em;color:#9aa6b4;opacity:0;transition:opacity 2s ease;}",
  "#n2t-end .cl.on{opacity:1;}",
  "#n2t-end .ek{position:absolute;bottom:24px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:.32em;color:#56647a;opacity:0;transition:opacity 1.4s ease;}",
  "#n2t-end .ek.on{opacity:1;}",
  /* ---- flash ---- */
  "#n2t-flash{position:fixed;left:0;right:0;top:0;height:84%;justify-content:center;z-index:47;pointer-events:none;display:flex;flex-direction:column;align-items:center;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;}",
  "#n2t-flash::before{content:'';position:absolute;left:0;right:0;top:calc(50% - 90px);height:180px;background:radial-gradient(ellipse min(48vw,420px) 90px at 50% 50%,rgba(3,6,14,.5),rgba(3,6,14,.22) 55%,rgba(3,6,14,0));opacity:0;transition:opacity 1.1s ease;z-index:-1;}",
  "#n2t-flash.on::before{opacity:1;}#n2t-flash.off::before{opacity:0;transition:opacity 1.4s ease;}",
  "#n2t-flash .fw{position:relative;font-size:clamp(18px,3.3vw,32px);letter-spacing:.3em;padding-left:.3em;color:#fff1cf;text-transform:lowercase;text-shadow:0 0 3px rgba(3,6,14,.9),0 0 22px rgba(240,215,154,.7),0 0 60px rgba(143,208,210,.4);opacity:0;filter:blur(8px);transition:opacity 1.1s ease,filter 1.1s ease,letter-spacing 3.6s ease;text-align:center;max-width:92vw;line-height:1.5;}",
  "#n2t-flash .fl{position:relative;margin-top:14px;height:1px;width:0;background:linear-gradient(90deg,rgba(240,215,154,0),rgba(240,215,154,.8),rgba(143,208,210,0));transition:width 2.4s cubic-bezier(.2,.7,.2,1),opacity 1.2s;}",
  "#n2t-flash.on .fw{opacity:1;filter:none;letter-spacing:.4em;}",
  "#n2t-flash.on .fl{width:min(60vw,420px);}",
  "#n2t-flash.off .fw{opacity:0;filter:blur(6px);transition:opacity 1.3s ease,filter 1.3s ease;}",
  "#n2t-flash.off .fl{opacity:0;}",
  "@keyframes n2tBreathe{0%,100%{opacity:.93;transform:scale(1);}50%{opacity:1;transform:scale(1.012);}}",
  "@keyframes n2tGhost{0%,100%{transform:translate(-3px,2px);opacity:.18;}50%{transform:translate(4px,-3px);opacity:.34;}}",
  "@keyframes n2tTwo{0%,100%{opacity:.82;}50%{opacity:1;}}",
  "@keyframes n2tPulse{0%,100%{opacity:.38;}50%{opacity:.95;}}",
  "body.n2-calm .n2t-glyph,body.n2-calm .n2t-glyph .gh,body.n2-calm .n2t-two,body.n2-calm .n2t-prompt,body.n2-calm #n2t-pro .pgo.on{animation:none!important;}",
  "@media (prefers-reduced-motion: reduce){.n2t-glyph,.n2t-glyph .gh,.n2t-two,.n2t-prompt{animation:none!important;}}"
].join("\n"), "n2-title-css");
function applyCalm() { try { document.body.classList.toggle("n2-calm", reduced()); } catch (e) {} }
applyCalm();
N2.on("settings", function (s, k) { if (k === "reducedMotion") applyCalm(); });

/* ================================================================ painter */
// A slow nocturne on a 2D canvas at half resolution: moonlit sky, stars, a
// still sea, the ring of seven lantern posts far out on the water (lit ones
// glow), drifting motes and rings of ripples. Shared by title and ending.
function srand(seed) { var a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sprite(r, g, b) {
  var c = document.createElement("canvas"); c.width = c.height = 32; var x = c.getContext("2d");
  var gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",1)"); gr.addColorStop(0.28, "rgba(" + r + "," + g + "," + b + ",.42)"); gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return c;
}
var SPR = null;
function sprites() { if (!SPR) SPR = { teal: sprite(150, 220, 222), gold: sprite(245, 222, 160), amber: sprite(240, 168, 92), white: sprite(235, 240, 250) }; return SPR; }

function Painter(cv, opts) {
  this.cv = cv; this.ctx = cv.getContext("2d", { willReadFrequently: true }); this.bg = document.createElement("canvas");
  this.o = opts || {}; this.W = 0; this.H = 0; this.t = 0; this.lit = 0; this.dawn = 0; this.wake = 0;
  this.ripples = []; this.ripCd = 1; this.shoot = null; this.shootCd = 5 + Math.random() * 6; this.px = 0; this.py = 0; this.tpx = 0; this.tpy = 0;
  this.resize();
}
Painter.prototype.resize = function () {
  var sc = this.o.scale || 0.5, W = Math.max(200, Math.round((window.innerWidth || 960) * sc)), H = Math.max(140, Math.round((window.innerHeight || 600) * sc));
  if (W === this.W && H === this.H) return;
  this.W = this.cv.width = this.bg.width = W; this.H = this.cv.height = this.bg.height = H;
  var R = srand(7031), i, n;
  this.hy = Math.round(H * 0.645);
  this.moon = { x: W * 0.77, y: H * 0.17, r: Math.max(7, Math.min(W, H) * 0.052) };
  this.ring = { x: W * 0.5, y: this.hy + H * 0.04, rx: Math.min(W * 0.2, H * 0.5), ry: H * 0.026 };
  this.tw = []; n = Math.round(70 * Math.min(2, W * H / 144000));
  for (i = 0; i < n; i++) { var yy = Math.pow(R(), 1.5) * this.hy * 0.92; this.tw.push({ x: R() * W, y: yy, s: 0.6 + R() * 1.2, a: 0.35 + R() * 0.6, f: 0.4 + R() * 1.6, p: R() * 6.28, c: R() < 0.22 ? "gold" : (R() < 0.3 ? "teal" : "white") }); }
  this.motes = []; n = Math.round(30 * Math.min(2, W * H / 144000));
  for (i = 0; i < n; i++) this.motes.push(this._mote(R, true));
  this.posts = [];
  for (i = 0; i < 7; i++) { var a = -Math.PI / 2 + Math.PI / 7 + i / 7 * Math.PI * 2; this.posts.push({ i: i, a: a, d: (Math.sin(a) + 1) / 2, ph: R() * 6.28 }); }
  this.posts.sort(function (p, q) { return p.d - q.d; });
  this._bg(R);
};
Painter.prototype._mote = function (R, any) {
  var W = this.W, H = this.H, k = R();
  return { x: R() * W, y: any ? R() * H : H + 6, vy: -(1.2 + R() * 4.2), sw: 3 + R() * 12, sp: 0.2 + R() * 0.6, ph: R() * 6.28, s: 2 + R() * 5, a: 0.25 + R() * 0.5, c: k < 0.5 ? "teal" : (k < 0.88 ? "gold" : "amber") };
};
Painter.prototype._bg = function (R) {
  var x = this.bg.getContext("2d"), W = this.W, H = this.H, hy = this.hy, m = this.moon, i;
  var g = x.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, "#02040a"); g.addColorStop(0.42, "#06102a"); g.addColorStop(0.82, "#0f1d3a"); g.addColorStop(1, "#1c2c4a");
  x.fillStyle = g; x.fillRect(0, 0, W, hy + 1);
  // faint nebula / aurora breath
  var blobs = [[0.2, 0.18, 0.5, "rgba(80,150,170,.075)"], [0.38, 0.06, 0.4, "rgba(120,100,180,.06)"], [0.86, 0.42, 0.36, "rgba(90,160,180,.05)"], [0.55, 0.3, 0.6, "rgba(60,90,150,.05)"]];
  for (i = 0; i < blobs.length; i++) { var b = blobs[i], rg = x.createRadialGradient(W * b[0], H * b[1], 0, W * b[0], H * b[1], W * b[2]); rg.addColorStop(0, b[3]); rg.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, hy); }
  // a soft aurora ribbon high up (blurred so it reads as breath, not stripes)
  x.save(); x.globalCompositeOperation = "lighter";
  try { x.filter = "blur(" + Math.max(3, Math.round(H * 0.025)) + "px)"; } catch (e) {}
  for (var band = 0; band < 2; band++) {
    var y0 = H * (0.12 + band * 0.07), amp = H * (0.035 + band * 0.02), thick = H * (0.06 - band * 0.02);
    var ag = x.createLinearGradient(0, y0 - thick, 0, y0 + thick); ag.addColorStop(0, "rgba(110,215,200,0)"); ag.addColorStop(0.65, band ? "rgba(140,150,220,.07)" : "rgba(110,215,200,.10)"); ag.addColorStop(1, "rgba(110,215,200,0)");
    x.fillStyle = ag; x.beginPath();
    var x0 = W * (band ? 0.25 : -0.05), x1 = W * (band ? 0.75 : 0.6), steps = 24;
    for (i = 0; i <= steps; i++) { var u = i / steps, ax = x0 + (x1 - x0) * u, ay = y0 + Math.sin(u * 5.2 + band * 2) * amp - thick * Math.sin(u * Math.PI); if (i === 0) x.moveTo(ax, ay); else x.lineTo(ax, ay); }
    for (i = steps; i >= 0; i--) { var u2 = i / steps, bx = x0 + (x1 - x0) * u2, by = y0 + Math.sin(u2 * 5.2 + band * 2) * amp + thick * 0.35 * Math.sin(u2 * Math.PI); x.lineTo(bx, by); }
    x.closePath(); x.fill();
  }
  try { x.filter = "none"; } catch (e) {}
  x.restore();
  // stars
  var ns = Math.round(420 * Math.min(2.2, W * H / 144000));
  for (i = 0; i < ns; i++) { var sy = Math.pow(R(), 1.35) * hy * 0.96, sx = R() * W, a = (0.12 + R() * 0.55) * (1 - sy / hy * 0.6); x.fillStyle = R() < 0.15 ? "rgba(245,226,175," + a.toFixed(2) + ")" : "rgba(205,220,240," + a.toFixed(2) + ")"; var ss = R() < 0.08 ? 1.5 : 1; x.fillRect(sx, sy, ss, ss); }
  // moon halo + disc
  var hg = x.createRadialGradient(m.x, m.y, m.r * 0.8, m.x, m.y, m.r * 9); hg.addColorStop(0, "rgba(243,231,196,.22)"); hg.addColorStop(0.25, "rgba(200,210,215,.07)"); hg.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = hg; x.fillRect(0, 0, W, hy);
  var mg = x.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.1, m.x, m.y, m.r);
  mg.addColorStop(0, "#fffaea"); mg.addColorStop(0.7, "#f1e3bd"); mg.addColorStop(1, "#d9c595");
  x.fillStyle = mg; x.beginPath(); x.arc(m.x, m.y, m.r, 0, 6.2832); x.fill();
  x.fillStyle = "rgba(160,140,105,.16)";
  [[0.25, -0.2, 0.32], [-0.3, 0.15, 0.22], [0.05, 0.42, 0.18], [-0.12, -0.38, 0.12]].forEach(function (c) { x.beginPath(); x.arc(m.x + c[0] * m.r, m.y + c[1] * m.r, c[2] * m.r, 0, 6.2832); x.fill(); });
  // distant shores (low, far, either side)
  x.fillStyle = "#070c1a";
  x.beginPath(); x.moveTo(0, hy + 1);
  for (i = 0; i <= 40; i++) { var px = i / 40 * W * 0.36, k = i / 40; x.lineTo(px, hy - H * (0.05 * (1 - k) * (1 - k) + 0.008 * Math.sin(i * 1.7)) - 1); }
  x.lineTo(W * 0.36, hy + 1); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(W, hy + 1);
  for (i = 0; i <= 30; i++) { var qx = W - i / 30 * W * 0.26, k2 = i / 30; x.lineTo(qx, hy - H * (0.032 * (1 - k2) + 0.006 * Math.sin(i * 2.3)) - 1); }
  x.lineTo(W * 0.74, hy + 1); x.closePath(); x.fill();
  // horizon mist
  var hm = x.createLinearGradient(0, hy - H * 0.07, 0, hy + H * 0.04); hm.addColorStop(0, "rgba(150,190,210,0)"); hm.addColorStop(0.65, "rgba(150,190,210,.09)"); hm.addColorStop(1, "rgba(150,190,210,0)");
  x.fillStyle = hm; x.fillRect(0, hy - H * 0.07, W, H * 0.11);
  // the sea
  var wg = x.createLinearGradient(0, hy, 0, H); wg.addColorStop(0, "#0e1a33"); wg.addColorStop(0.3, "#081228"); wg.addColorStop(1, "#02040a");
  x.fillStyle = wg; x.fillRect(0, hy, W, H - hy);
  // star glints on the water
  for (i = 0; i < 90; i++) { var gy = hy + 2 + Math.pow(R(), 1.6) * (H - hy), gx = R() * W; x.fillStyle = "rgba(170,195,225," + (0.05 + R() * 0.12).toFixed(2) + ")"; x.fillRect(gx, gy, 1 + R() * 3, 1); }
  // faint mirrored sky glow under horizon
  var rg2 = x.createRadialGradient(m.x, hy, 0, m.x, hy, W * 0.4); rg2.addColorStop(0, "rgba(243,231,196,.07)"); rg2.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = rg2; x.fillRect(0, hy, W, H - hy);
  if (this.o.vignette !== false) {
    var vg = x.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.35, W * 0.5, H * 0.46, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(3,5,11,0)"); vg.addColorStop(1, "rgba(3,5,11,.7)");
    this.vig = vg;
  }
};
Painter.prototype.point = function (nx, ny) { this.tpx = nx; this.tpy = ny; };
Painter.prototype.draw = function (dt) {
  var x = this.ctx, W = this.W, H = this.H, hy = this.hy, m = this.moon, S = sprites(), calm = reduced(), i, t;
  this.t += dt; t = this.t;
  this.px += (this.tpx - this.px) * Math.min(1, dt * 1.5); this.py += (this.tpy - this.py) * Math.min(1, dt * 1.5);
  x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
  x.drawImage(this.bg, 0, 0);
  // dawn (ending): the sky remembers morning
  if (this.dawn > 0.001) {
    var dg = x.createLinearGradient(0, 0, 0, H); var d = this.dawn;
    dg.addColorStop(0, "rgba(110,140,190," + (0.32 * d).toFixed(3) + ")"); dg.addColorStop(0.5, "rgba(214,170,170," + (0.3 * d).toFixed(3) + ")"); dg.addColorStop(0.66, "rgba(250,205,150," + (0.48 * d).toFixed(3) + ")"); dg.addColorStop(0.8, "rgba(160,150,170," + (0.25 * d).toFixed(3) + ")"); dg.addColorStop(1, "rgba(40,50,80," + (0.2 * d).toFixed(3) + ")");
    x.fillStyle = dg; x.fillRect(0, 0, W, H);
  }
  x.globalCompositeOperation = "lighter";
  // twinkling stars
  for (i = 0; i < this.tw.length; i++) {
    var s = this.tw[i], a = s.a * (calm ? 0.8 : (0.45 + 0.55 * Math.sin(t * s.f + s.p))) * (1 - this.dawn * 0.85);
    if (a < 0.05) continue;
    var sz = s.s * 4.2; x.globalAlpha = a; x.drawImage(S[s.c], s.x - sz / 2 + this.px * 2, s.y - sz / 2 + this.py * 1.5, sz, sz);
    if (a > 0.7 && s.s > 1.3) { x.fillStyle = "rgba(255,250,235," + ((a - 0.7) * 1.4).toFixed(2) + ")"; x.fillRect(s.x - s.s * 2 + this.px * 2, s.y + this.py * 1.5, s.s * 4, 1); }
  }
  x.globalAlpha = 1;
  // a rare falling star
  if (!calm) {
    this.shootCd -= dt;
    if (!this.shoot && this.shootCd <= 0) { this.shoot = { x: W * (0.15 + Math.random() * 0.6), y: H * (0.05 + Math.random() * 0.2), vx: (Math.random() < 0.5 ? -1 : 1) * W * 0.45, vy: H * 0.14, t: 0 }; this.shootCd = 9 + Math.random() * 14; }
    if (this.shoot) {
      var sh = this.shoot; sh.t += dt; var k = sh.t / 0.9;
      if (k >= 1) this.shoot = null; else {
        var hx = sh.x + sh.vx * sh.t, hyy = sh.y + sh.vy * sh.t, lg = x.createLinearGradient(hx, hyy, hx - sh.vx * 0.18, hyy - sh.vy * 0.18), al = Math.sin(k * Math.PI) * 0.8;
        lg.addColorStop(0, "rgba(255,248,225," + al.toFixed(2) + ")"); lg.addColorStop(1, "rgba(255,248,225,0)");
        x.strokeStyle = lg; x.lineWidth = 1; x.beginPath(); x.moveTo(hx, hyy); x.lineTo(hx - sh.vx * 0.18, hyy - sh.vy * 0.18); x.stroke();
      }
    }
  }
  // the moon's path on the water
  var span = H - hy, rows = Math.max(10, Math.round(span / 3));
  for (i = 0; i < rows; i++) {
    var u = i / rows, y = hy + 2 + u * span, wv = m.r * (0.9 + u * 3.4) * (0.55 + 0.45 * Math.sin(i * 1.93 + (calm ? 0 : t * 1.25)) * Math.sin(i * 0.71 - (calm ? 0 : t * 0.6)));
    var al2 = (0.5 - u * 0.36) * (0.6 + 0.4 * Math.sin(i * 2.7 + t * 0.9)) * (1 - this.dawn * 0.5);
    if (wv < 1 || al2 < 0.03) continue;
    var ox = Math.sin(i * 0.5 + t * 0.7) * u * 3;
    x.fillStyle = "rgba(243,226,178," + al2.toFixed(3) + ")";
    x.fillRect(m.x - wv / 2 + ox, y, wv * 0.42, 1); x.fillRect(m.x + wv * 0.06 + ox, y, wv * 0.44, 1);
  }
  // the ring of seven lanterns, far out on the water
  x.globalCompositeOperation = "source-over";
  var rg = this.ring, unit = H / 300;
  // whoever sleeps in the middle (only a breath of light)
  x.globalCompositeOperation = "lighter";
  var br = 0.16 + 0.08 * Math.sin(t * 0.55) + this.wake * 0.5;
  x.globalAlpha = br; x.drawImage(S.white, rg.x - 9 * unit, rg.y - 6 * unit, 18 * unit, 9 * unit); x.globalAlpha = 1;
  for (i = 0; i < 7; i++) {
    var p = this.posts[i], px = rg.x + Math.cos(p.a) * rg.rx + this.px * (1 + p.d * 2), base = rg.y + Math.sin(p.a) * rg.ry, ph = (11 + 12 * p.d) * unit, pw = Math.max(1, (0.7 + 0.9 * p.d) * unit), hs = (1.8 + 1.8 * p.d) * unit;
    var litK = Math.max(0, Math.min(1, this.lit - p.i)), fl = calm ? 1 : (0.85 + 0.15 * Math.sin(t * 7 + p.ph) * Math.sin(t * 3.1 + p.ph * 2));
    x.globalCompositeOperation = "source-over";
    x.fillStyle = "#03050c"; x.fillRect(px - pw / 2, base - ph, pw, ph);
    x.fillStyle = "rgba(150,175,205,.18)"; x.fillRect(px + pw / 2 - 0.6, base - ph, 0.6, ph);
    x.fillStyle = "#04060e"; x.fillRect(px - hs / 2 - 0.5, base - ph - hs - 0.5, hs + 1, 1);
    if (litK > 0) {
      x.fillStyle = "rgba(255,214,150," + (0.95 * litK).toFixed(2) + ")"; x.fillRect(px - hs / 2, base - ph - hs, hs, hs);
      x.globalCompositeOperation = "lighter";
      var gs = hs * 11 * fl; x.globalAlpha = 0.75 * litK * fl; x.drawImage(S.amber, px - gs / 2, base - ph - hs / 2 - gs / 2, gs, gs);
      x.globalAlpha = 0.5 * litK; x.drawImage(S.gold, px - hs * 2, base - ph - hs / 2 - hs * 2, hs * 4, hs * 4);
      for (var k3 = 0; k3 < 7; k3++) { var ry2 = base + 2 + k3 * (1.6 + p.d * 1.6) * unit, rw = hs * (1.5 - k3 * 0.17) * fl; x.globalAlpha = 0.42 * litK * (1 - k3 / 7); x.fillStyle = "#f0a860"; x.fillRect(px - rw / 2 + Math.sin(t * 1.8 + k3 * 1.3 + p.ph) * 1.2, ry2, rw, 1); }
      x.globalAlpha = 1;
    } else {
      x.fillStyle = "rgba(120,150,175,.22)"; x.fillRect(px - hs / 2, base - ph - hs, hs, hs);
      x.fillStyle = "#050812"; x.fillRect(px - hs / 2 + 0.7, base - ph - hs + 0.7, Math.max(0.5, hs - 1.4), Math.max(0.5, hs - 1.4));
    }
  }
  x.globalCompositeOperation = "lighter";
  // rings of ripples
  if (!calm) {
    this.ripCd -= dt;
    if (this.ripCd <= 0) { this.ripCd = 1.2 + Math.random() * 2.4; this.ripples.push({ x: Math.random() * W, y: hy + 6 + Math.pow(Math.random(), 0.8) * (H - hy - 8), t: 0, max: 3.5 + Math.random() * 3 }); }
    for (i = this.ripples.length - 1; i >= 0; i--) {
      var r = this.ripples[i]; r.t += dt; var kr = r.t / r.max; if (kr >= 1) { this.ripples.splice(i, 1); continue; }
      var persp = 0.1 + 0.25 * (r.y - hy) / (H - hy), rad = (6 + 44 * (r.y - hy) / (H - hy)) * kr * unit + 1;
      x.strokeStyle = "rgba(160,205,222," + (0.32 * (1 - kr) * Math.min(1, kr * 6)).toFixed(3) + ")"; x.lineWidth = 1;
      x.beginPath(); x.ellipse(r.x, r.y, rad, rad * persp, 0, 0, 6.2832); x.stroke();
      if (kr > 0.25) { x.beginPath(); x.ellipse(r.x, r.y, rad * 0.62, rad * 0.62 * persp, 0, 0, 6.2832); x.stroke(); }
    }
  }
  // drifting motes
  for (i = 0; i < this.motes.length; i++) {
    var mo = this.motes[i];
    if (!calm) { mo.y += mo.vy * dt; mo.x += Math.sin(t * mo.sp + mo.ph) * mo.sw * dt * 0.3; }
    if (mo.y < -8) { var nm = this._mote(Math.random, false); this.motes[i] = nm; continue; }
    var fade = Math.min(1, (H - mo.y) / (H * 0.2)) * Math.min(1, mo.y / (H * 0.25) + 0.15);
    x.globalAlpha = Math.max(0, mo.a * fade * (0.7 + 0.3 * Math.sin(t * 2.2 + mo.ph))); var ms = mo.s * unit * 1.6;
    x.drawImage(S[mo.c], mo.x - ms / 2 + this.px * 6, mo.y - ms / 2 + this.py * 4, ms, ms);
  }
  x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  if (this.vig) { x.fillStyle = this.vig; x.fillRect(0, 0, W, H); }
};

/* ================================================================== title */
var titleEl0 = $("title"), cv = null, painter = null, menuEl = null, items = [], focusI = 0, menuMode = "main", going = false, prologueOn = false, proEl = null;
function hasProgress() { var n = 1; try { n = loadNight(); } catch (e) {} return n > 1 || tsv.starts > 0; }
function nightNow() { try { return loadNight(); } catch (e) { return 1; } }
function storyLine() {
  var b = [], S = N2.mods.story;
  try { if (S && S.shards) { var s = S.shards(); if (s) b.push("◇ " + s); var l = S.lanterns(); if (l) b.push("✦ " + l); } } catch (e) {}
  return b.join("  ");
}
function buildTitle() {
  if (!titleEl0) return;
  titleEl0.innerHTML =
    "<canvas id='n2t-cv'></canvas>" +
    "<div class='n2t-ver'>II · " + esc(N2.version || "2") + "</div>" +
    "<div class='n2t-logo'>" +
      "<div class='n2t-glyph'><span class='gh'>ねむり</span>ねむり<span class='n2t-two'>II</span></div>" +
      "<div class='n2t-sub'><div class='n2t-jp'>めいせき</div><div class='n2t-en'><i></i>the lucid hour<i></i></div></div>" +
    "</div>" +
    "<div class='n2t-intro'>" +
      "<div class='n2t-tag'>you know you are dreaming now. so does the dream.<em>look at your hands. carry a small light. follow the letters home.</em></div>" +
      "<div class='n2t-prompt prompt'>click to begin</div>" +
    "</div>" +
    "<div class='n2t-menu' id='n2t-menu'></div>" +
    "<div class='n2t-keys'>↑ ↓ choose · enter · f1 controls</div>" +
    "<div class='n2t-credit'>a sequel to nemuri — an original dream toy</div>" +
    "<div id='n2t-veil'></div>";
  cv = $("n2t-cv"); menuEl = $("n2t-menu");
  try { painter = new Painter(cv, { scale: 0.5 }); } catch (e) { painter = null; }
  menuEl.addEventListener("mousemove", function (e) { var b = e.target.closest ? e.target.closest("[data-n2act]") : null; if (b && items.indexOf(b) !== focusI) setFocus(items.indexOf(b)); });
  menuEl.addEventListener("touchend", function (e) { var b = e.target.closest ? e.target.closest("[data-n2act]") : null; if (b && phase === "title") { e.preventDefault(); activate(b.getAttribute("data-n2act")); } }, { passive: false });
  titleEl0.addEventListener("touchend", function (e) { if (phase === "title" && !titleArmed && !N2.uiOpen) { e.preventDefault(); arm(); } }, { passive: false });
  window.addEventListener("mousemove", function (e) { if (painter && phase === "title") painter.point((e.clientX / Math.max(1, window.innerWidth) - 0.5), (e.clientY / Math.max(1, window.innerHeight) - 0.5)); });
  window.addEventListener("resize", function () { if (painter) painter.resize(); if (endP) endP.resize(); });
}
function menuItem(act, label, sub) { return "<button class='n2t-it' data-n2act='" + act + "'>" + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "<span class='ln'></span></button>"; }
function renderMenu(mode) {
  menuMode = mode || "main";
  if (!menuEl) return;
  var h = "";
  if (menuMode === "confirm") {
    h = "<div class='n2t-q'>forget every night, every dream, every letter?<br>it cannot be remembered again.</div>" + menuItem("keep", "no, keep them") + menuItem("wipe", "yes, forget");
  } else {
    var prog = hasProgress(), sl = storyLine();
    h += prog ? menuItem("continue", "continue", "night " + nightNow() + (sl ? "  ·  " + sl : "")) : menuItem("continue", "fall asleep", "night 1");
    if (prog) h += menuItem("new", "new dream");
    if (N2.mods.journal && N2.mods.journal.open) h += menuItem("journal", "journal");
    if (N2.mods.lens && N2.mods.lens.openSettings) h += menuItem("settings", "settings");
    h += menuItem("controls", "controls");
  }
  menuEl.innerHTML = h;
  items = Array.prototype.slice.call(menuEl.querySelectorAll("[data-n2act]"));
  setFocus(0);
}
function setFocus(i) {
  if (!items.length) return;
  focusI = (i + items.length) % items.length;
  for (var k = 0; k < items.length; k++) items[k].classList.toggle("f", k === focusI);
}
function tick(f) { N2.chime(f || 784, 0.9, 0.035, "sine"); }
function arm() {
  if (titleArmed && titleEl0 && titleEl0.classList.contains("armed")) return;
  safe(function () { audio.init(); audio.resume(); audio.menuMusic(); });
  titleArmed = true;
  renderMenu("main");
  if (titleEl0) titleEl0.classList.add("armed");
  setTimeout(function () { tick(587.3); }, 60);
}
function activate(act) {
  if (going || phase !== "title") return;
  if (act === "continue") begin();
  else if (act === "new") { tick(440); renderMenu("confirm"); }
  else if (act === "keep") { tick(523.3); renderMenu("main"); }
  else if (act === "wipe") { going = true; N2.chime(196, 3, 0.07, "triangle"); safe(function () { N2.save.wipeAll(); }); if (titleEl0) titleEl0.classList.add("going"); setTimeout(function () { location.reload(); }, 700); }
  else if (act === "journal") { tick(); safe(function () { N2.mods.journal.open(); }); }
  else if (act === "settings") { tick(); safe(function () { N2.mods.lens.openSettings(); }); }
  else if (act === "controls") { tick(); openHelp(); }
}
function wantPrologue() {
  if (tsv.seenPrologue) return false;
  // automated test runs (webdriver) skip it unless the url asks for it
  try { if (navigator.webdriver && !/[?&]prologue\b/.test(location.search)) return false; } catch (e) {}
  return true;
}
function begin() {
  if (going) return;
  if (wantPrologue()) { playPrologue(function () { realStart(); }); return; }
  going = true;
  N2.chime(392, 2.4, 0.05, "sine"); setTimeout(function () { N2.chime(587.3, 2.6, 0.04, "sine"); }, 160);
  if (titleEl0) titleEl0.classList.add("going");
  setTimeout(realStart, 480);
}
function realStart() {
  going = true;
  tsv.starts++; persist();
  if (phase === "title") safe(function () { start(); });
  setTimeout(function () { if (titleEl0) titleEl0.classList.remove("going"); }, 200);
}
function titleKey(e) {
  var c = e.code;
  if (going) return;
  if (!titleArmed || !(titleEl0 && titleEl0.classList.contains("armed"))) { if (c === "Enter" || c === "Space" || c === "NumpadEnter") arm(); return; }
  if (c === "ArrowUp" || c === "KeyW") { setFocus(focusI - 1); tick(659.3); }
  else if (c === "ArrowDown" || c === "KeyS" || c === "Tab") { setFocus(focusI + (e.shiftKey && c === "Tab" ? -1 : 1)); tick(659.3); }
  else if (c === "Enter" || c === "Space" || c === "NumpadEnter" || c === "KeyE") { var b = items[focusI]; if (b) activate(b.getAttribute("data-n2act")); }
  else if (c === "Escape" || c === "Backspace") { if (menuMode === "confirm") { renderMenu("main"); tick(523.3); } }
}

/* =============================================================== prologue */
var PROLOGUE = [
  "for a long time, you only drifted.",
  "the dream carried you from room to room, and you let it.",
  "then one night you looked down at your hands,",
  "and there were too many fingers, and you knew.",
  "somewhere in here, someone else is still asleep.",
  "they left a light on for you."
];
var proState = null;
function playPrologue(done) {
  if (prologueOn) return;
  prologueOn = true; tsv.seenPrologue = true; persist();
  if (proEl && proEl.parentNode) proEl.parentNode.removeChild(proEl);
  proEl = N2.ui.el("div", "", "", document.body); proEl.id = "n2t-pro";
  var els = PROLOGUE.map(function (l, i) { var d = N2.ui.el("div", "pl" + (i === PROLOGUE.length - 1 ? " gold" : ""), "", proEl); d.textContent = l; return d; });
  var go = N2.ui.el("div", "pgo", "click to fall asleep", proEl);
  N2.ui.el("div", "ps", "click to skip", proEl);
  proState = { i: 0, els: els, go: go, done: done, timers: [], ready: false, t0: Date.now() };
  requestAnimationFrame(function () { if (proEl) proEl.classList.add("on"); });
  var notes = [392, 440, 493.9, 587.3, 659.3, 784];
  function step() {
    if (!proState) return;
    var k = proState.i;
    if (k < els.length) {
      if (k > 0) els[k - 1].classList.add("old");
      els[k].classList.add("on"); N2.chime(notes[k % notes.length] / 2, 3.5, 0.03, "sine");
      proState.i++;
      proState.timers.push(setTimeout(step, k === 3 ? 3600 : 2900));
    } else { proState.ready = true; go.classList.add("on"); }
  }
  proState.timers.push(setTimeout(step, 1500));
}
function endPrologue() {
  if (!proState) return;
  var st = proState; proState = null;
  st.timers.forEach(clearTimeout);
  prologueOn = false;
  try { st.done && st.done(); } catch (e) {}
  if (proEl) { var el = proEl; el.style.transition = "opacity 1.6s ease"; el.classList.remove("on"); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (proEl === el) proEl = null; }, 1700); }
}
function prologueInput() {
  if (!proState) return;
  if (Date.now() - proState.t0 < 700) return;
  endPrologue();
}

/* ================================================================== pause */
var pauseEl0 = $("pause"), pItems = [], pFocus = 0;
function buildPause() {
  if (!pauseEl0) return;
  pauseEl0.innerHTML = "<div class='n2p'><div class='n2p-g'>ねむり<span>II</span></div><div class='n2p-t'>paused</div><div class='n2p-w' id='n2p-w'></div><div class='n2p-m' id='n2p-m'></div><div class='n2p-h'>click anywhere else to wake back in</div></div>";
  pauseEl0.addEventListener("mousemove", function (e) { var b = e.target.closest ? e.target.closest("[data-n2p]") : null; if (b && pItems.indexOf(b) !== pFocus) setPFocus(pItems.indexOf(b)); });
  pauseEl0.addEventListener("touchend", function (e) { var b = e.target.closest ? e.target.closest("[data-n2p]") : null; if (b && paused) { e.preventDefault(); pauseAct(b.getAttribute("data-n2p")); } }, { passive: false });
}
function refreshPause() {
  var w = $("n2p-w"), m = $("n2p-m"); if (!m) return;
  var bits = ["night <b>" + esc(day) + "</b>"];
  safe(function () { bits.push(inBedroom ? "the waking room" : "<b>" + esc(N2.prettyName(N2.dreamName())) + "</b>"); });
  safe(function () { var L = N2.mods.lucid; if (L && L.word && !inBedroom) bits.push(esc(L.word())); });
  safe(function () { var sl = storyLine(); if (sl) bits.push(esc(sl)); });
  if (w) w.innerHTML = bits.join("  ·  ");
  var h = "<button class='n2t-it' data-n2p='resume'>resume<span class='ln'></span></button>";
  if (N2.mods.journal && N2.mods.journal.open) h += "<button class='n2t-it' data-n2p='journal'>journal<span class='ln'></span></button>";
  if (N2.mods.lens && N2.mods.lens.openSettings) h += "<button class='n2t-it' data-n2p='settings'>settings<span class='ln'></span></button>";
  h += "<button class='n2t-it' data-n2p='controls'>controls<span class='ln'></span></button>";
  h += "<button class='n2t-it' data-n2p='title'>return to title<small>tonight's dreams will fade</small><span class='ln'></span></button>";
  m.innerHTML = h;
  pItems = Array.prototype.slice.call(m.querySelectorAll("[data-n2p]"));
  setPFocus(0);
}
function setPFocus(i) { if (!pItems.length) return; pFocus = (i + pItems.length) % pItems.length; for (var k = 0; k < pItems.length; k++) pItems[k].classList.toggle("f", k === pFocus); }
function pauseAct(a) {
  if (a === "resume") { if (paused) { togglePause(); safe(function () { tryLock(); }); } }
  else if (a === "journal") { tick(); safe(function () { N2.mods.journal.open(); }); }
  else if (a === "settings") { tick(); safe(function () { N2.mods.lens.openSettings(); }); }
  else if (a === "controls") { tick(); openHelp(); }
  else if (a === "title") { N2.chime(220, 2, 0.05); safe(function () { audio.fadeMaster(0, 0.4); }); if (fadeEl) { fadeEl.style.background = "#050912"; } setTimeout(function () { location.reload(); }, 450); }
}
var _togglePause = togglePause;
togglePause = function () {
  var r = _togglePause.apply(this, arguments);
  if (paused) safe(refreshPause);
  return r;
};
function pauseKey(e) {
  var c = e.code;
  if (c === "ArrowUp" || c === "KeyW") { setPFocus(pFocus - 1); tick(659.3); return true; }
  if (c === "ArrowDown" || c === "KeyS" || c === "Tab") { setPFocus(pFocus + 1); tick(659.3); return true; }
  if (c === "Enter" || c === "Space" || c === "NumpadEnter" || c === "KeyE") { var b = pItems[pFocus]; if (b) pauseAct(b.getAttribute("data-n2p")); return true; }
  return false;
}

/* =================================================================== help */
var HELP = "n2-help";
var GROUPS = { base: "moving through", lucid: "lucidity", nightmare: "the dark", journal: "remembering", lens: "seeing", input: "touch & controller", story: "the letters", core: "the screen", title: "help" };
var ORDER = ["base", "lucid", "nightmare", "journal", "lens", "story", "input", "core", "title"];
function keyChips(code, owner) {
  var m = { KeyW: owner === "base" ? ["wasd"] : ["w"], Space: ["space"], ShiftLeft: ["shift"], KeyP: ["p", "esc"], F1: ["f1", "?"], Escape: ["esc"], Enter: ["enter"], ControlLeft: ["ctrl"], Slash: ["?"] };
  if (m[code]) return m[code];
  return [String(code).replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "").toLowerCase()];
}
function powerOf(b) { if (b.owner !== "lucid" || !/\(power\)/.test(b.label)) return null; var m = /(glide|blink|flight|stillness|steer|recall)/.exec(b.label); return m ? m[1] : null; }
function openHelp() {
  var p = N2.ui.panel(HELP, "how to dream");
  if (!p._body) {
    p.sheet.style.position = "relative";
    var cl = N2.ui.el("button", "n2-btn n2-close", "close", p.sheet); cl.addEventListener("click", function () { N2.ui.close(HELP); });
    p._body = N2.ui.el("div", "", "", p.sheet);
  }
  var groups = {}, L = N2.mods.lucid, seen = {};
  (N2.bindings || []).forEach(function (b) {
    var key = b.code + "|" + b.label; if (seen[key]) return; seen[key] = 1;
    (groups[b.owner || "other"] = groups[b.owner || "other"] || []).push(b);
  });
  var owners = ORDER.filter(function (o) { return groups[o]; }).concat(Object.keys(groups).filter(function (o) { return ORDER.indexOf(o) < 0; }));
  var h = "<div class='n2h-grid'>";
  owners.forEach(function (o) {
    h += "<div class='n2h-g'><h3>" + esc(GROUPS[o] || o) + "</h3>";
    if (o === "base") h += "<div class='n2h-r'><span class='n2h-k'><kbd>mouse</kbd></span><span>look (or drag)</span></div>";
    groups[o].forEach(function (b) {
      var pw = powerOf(b), off = false;
      try { off = !!(pw && L && L.has && !L.has(pw)); } catch (e) {}
      var label = String(b.label).replace(/\s*\(power\)/, "");
      if (o === "base" && b.code === "KeyW") label = "move · arrows work too";
      h += "<div class='n2h-r" + (off ? " off" : "") + "'><span class='n2h-k'>" + keyChips(b.code, o).map(function (k) { return "<kbd>" + esc(k) + "</kbd>"; }).join("") + "</span><span>" + esc(label) + (off ? "<em>not yet learned</em>" : "") + "</span></div>";
    });
    h += "</div>";
  });
  h += "</div><div class='n2h-tip'>when something feels wrong, look at your hands.<br>doors, edges and walls carry you onward — press v to stay a while.<br><span style='color:#56647a'>esc to close</span></div>";
  p._body.innerHTML = h;
  N2.ui.open(HELP);
}
function toggleHelp() { if (N2.ui.isOpen(HELP)) N2.ui.close(HELP); else if (!N2.uiOpen) openHelp(); }
N2.on("uiClose", function (id) { if (id === HELP && phase === "play" && !paused && !N2.uiOpen && !useDrag) safe(function () { tryLock(); }); });

/* ================================================================== graph */
var graphEl0 = $("graphwrap"), gOn = false, gAge = 0, gData = null, gReady = false;
var night = { dreams: [], path: [], shards: 0, lanterns: 0, powers: [] };
function resetNight() { night = { dreams: [], path: [], shards: 0, lanterns: 0, powers: [] }; }
N2.on("dreamBuilt", function (z, first) {
  try {
    if (first) resetNight();
    if (!z || z.bedroom) return;
    var col = "#8fd0d2";
    try { if (z.palette && z.palette.glow && z.palette.glow.clone) { var c = z.palette.glow.clone(), hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, Math.min(0.75, hsl.s), Math.max(0.62, Math.min(0.82, hsl.l))); col = "#" + c.getHexString(); } } catch (e) {}
    var nm = N2.prettyName(z.archetypeName), last = night.dreams[night.dreams.length - 1];
    if (!last || last.name !== nm) night.dreams.push({ name: nm, col: col });
    if (night.dreams.length > 24) night.dreams.shift();
  } catch (e) {}
});
N2.on("commitTransition", function (nudge) {
  try { var b = dayMood.b + ((nudge && nudge.b) || 0), e = dayMood.e + ((nudge && nudge.e) || 0); night.path.push({ x: clamp(tanh(e * 0.25), -1, 1), y: clamp(tanh(b * 0.25), -1, 1) }); if (night.path.length > 40) night.path.shift(); } catch (er) {}
});
N2.on("shard", function () { night.shards++; });
N2.on("lanternLit", function () { night.lanterns++; });
N2.on("powerUnlocked", function (id, title) { night.powers.push(title || id); });
function buildGraph() {
  if (!graphEl0) return;
  graphEl0.innerHTML = "<div class='n2g'><canvas id='graph' width='440' height='380'></canvas><div class='n2g-side' id='n2g-side'></div></div><div class='gcap n2g-cap' id='n2g-cap'>you wake for a moment, then sleep again</div>";
}
function moodWord(x, y) {
  var a = y > 0.28 ? "bright" : (y < -0.28 ? "heavy" : ""), b = x > 0.28 ? "restless" : (x < -0.28 ? "still" : "");
  if (!a && !b) return "a quiet, even night";
  if (a && b) return "a " + a + ", " + b + " night";
  return "a " + (a || b) + " night";
}
function lucWord(v) { var W = [[0.15, "asleep"], [0.35, "stirring"], [0.6, "aware"], [0.85, "lucid"], [9, "awake within"]]; for (var i = 0; i < W.length; i++) if (v < W[i][0]) return W[i][1]; return "awake within"; }
var _drawGraph = drawGraph, _showGraph = showGraph, _hideGraph = hideGraph;
drawGraph = function () {
  try {
    var gp = graphHistory[graphHistory.length - 1] || { day: day, x: 0, y: 0 };
    var n = gp.day != null ? gp.day : day;
    tsv.nights = tsv.nights.filter(function (q) { return q.n !== n; });
    tsv.nights.push({ n: n, x: +gp.x.toFixed(3), y: +gp.y.toFixed(3) }); tsv.nights = tsv.nights.slice(-40); persist();
    gData = { n: n, x: gp.x, y: gp.y, hist: tsv.nights.slice(), path: night.path.slice(), dreams: night.dreams.slice(), shards: night.shards, lanterns: night.lanterns, powers: night.powers.slice() };
    if (!gData.path.length || Math.abs(gData.path[gData.path.length - 1].x - gp.x) > 1e-3 || Math.abs(gData.path[gData.path.length - 1].y - gp.y) > 1e-3) gData.path.push({ x: gp.x, y: gp.y });
    fillGraphSide();
    gAge = 0; gReady = false; gOn = true;
    paintGraph(0);
  } catch (e) { gOn = false; if (window.console) console.warn("[N2 title] graph", e); try { _drawGraph(); } catch (e2) {} }
};
showGraph = function () { _showGraph(); if (graphEl0) { graphEl0.classList.remove("leaving"); graphEl0.classList.remove("show"); void graphEl0.offsetWidth; requestAnimationFrame(function () { if (graphEl0 && gOn) graphEl0.classList.add("show"); }); } };
hideGraph = function () { _hideGraph(); gOn = false; gData = null; if (graphEl0) { graphEl0.classList.remove("leaving"); graphEl0.classList.remove("show"); } var c = $("n2g-cap"); if (c) c.classList.remove("ready"); };
N2.on("nightEnd", function () { if (gOn && phase === "graph" && graphTimer > 0 && graphTimer < 60) graphTimer = 11; });
function fillGraphSide() {
  var side = $("n2g-side"), cap = $("n2g-cap"); if (!side || !gData) return;
  var h = "<div class='n2g-n'>you wake from<b>night " + esc(gData.n) + "</b></div><div class='n2g-w'>" + esc(moodWord(gData.x, gData.y)) + "</div>";
  var ds = gData.dreams.slice(-10);
  h += "<div class='n2g-h'>" + (ds.length ? "you dreamed of" : "you do not remember dreaming") + "</div><ol class='n2g-d'>";
  ds.forEach(function (d, i) { h += "<li style='transition-delay:" + (1.3 + i * 0.22).toFixed(2) + "s'><i style='background:" + esc(d.col) + ";color:" + esc(d.col) + "'></i>" + esc(d.name) + "</li>"; });
  h += "</ol><div class='n2g-st'>";
  var dl = 1.4 + ds.length * 0.22 + 0.3, L = N2.mods.lucid, S = N2.mods.story;
  if (L && L.peak) { var pk = 0; try { pk = +L.peak() || 0; } catch (e) {} h += "<div class='n2g-s' style='transition-delay:" + dl.toFixed(2) + "s'>lucidity reached · <b>" + esc(lucWord(pk)) + "</b><div class='n2g-bar'><u data-w='" + Math.round(Math.max(0, Math.min(1, pk)) * 100) + "'></u></div></div>"; dl += 0.35; }
  if (S && S.shards) { var tot = 0, of = S.total || 49; try { tot = S.shards(); } catch (e) {} h += "<div class='n2g-s' style='transition-delay:" + dl.toFixed(2) + "s'>letters · <b>" + (gData.shards ? "◇ +" + gData.shards + " tonight" : "none tonight") + "</b><span style='display:block;margin-top:3px;color:#56647a;font-size:9px'>" + tot + " of " + of + " found</span></div>"; dl += 0.35;
    var ln = 0; try { ln = S.lanterns(); } catch (e) {} if (ln || gData.lanterns) { h += "<div class='n2g-s' style='transition-delay:" + dl.toFixed(2) + "s'>lanterns · <b>✦ " + ln + " of 7</b>" + (gData.lanterns ? "  <span style='color:#e8a860'>lit tonight</span>" : "") + "</div>"; dl += 0.35; } }
  if (gData.powers.length) h += "<div class='n2g-s' style='transition-delay:" + dl.toFixed(2) + "s'>learned · <b>" + esc(gData.powers.join(", ")) + "</b></div>";
  h += "</div>";
  side.innerHTML = h;
  if (cap) { cap.classList.remove("ready"); cap.textContent = "you wake for a moment, then sleep again"; }
  setTimeout(function () { var u = side.querySelector(".n2g-bar u"); if (u) u.style.width = u.getAttribute("data-w") + "%"; }, Math.round(dl * 1000));
}
function ease(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
function paintGraph(dt) {
  var c = $("graph"); if (!c || !gData) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1), W = 440, H = 380;
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
  var x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  var t = gAge, calm = reduced(); if (calm) t = Math.max(t, 6);
  var L = 46, R = W - 46, Tp = 34, B = H - 40, cx = (L + R) / 2, cy = (Tp + B) / 2, sx = (R - L) / 2 - 8, sy = (B - Tp) / 2 - 8;
  function PX(v) { return cx + v * sx; } function PY(v) { return cy - v * sy; }
  x.clearRect(0, 0, W, H);
  var bg = x.createRadialGradient(cx, cy, 10, cx, cy, W * 0.56); bg.addColorStop(0, "rgba(18,32,60,.9)"); bg.addColorStop(0.7, "rgba(10,18,36,.5)"); bg.addColorStop(1, "rgba(5,8,17,0)");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // dust
  var R2 = srand(99 + (gData.n | 0)); x.fillStyle = "rgba(200,215,235,.25)";
  for (var i = 0; i < 70; i++) { var a0 = R2(); x.globalAlpha = 0.15 + 0.4 * R2() * (0.6 + 0.4 * Math.sin(t * (0.5 + a0) + i)); x.fillRect(R2() * W, R2() * H, 1, 1); }
  x.globalAlpha = 1;
  var gk = ease(t / 0.9);
  // rings + grid
  x.strokeStyle = "rgba(143,208,210," + (0.09 * gk).toFixed(3) + ")"; x.lineWidth = 1;
  for (i = 1; i <= 4; i++) { x.beginPath(); x.ellipse(cx, cy, sx * i / 4, sy * i / 4, 0, 0, 6.2832); x.stroke(); }
  x.strokeStyle = "rgba(143,208,210," + (0.05 * gk).toFixed(3) + ")";
  for (i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(PX(i / 4), Tp); x.lineTo(PX(i / 4), B); x.stroke(); x.beginPath(); x.moveTo(L, PY(i / 4)); x.lineTo(R, PY(i / 4)); x.stroke(); }
  // axes, drawn outward from the centre
  var ak = ease((t - 0.15) / 0.9);
  x.strokeStyle = "rgba(240,215,154,.42)"; x.lineWidth = 1;
  x.beginPath(); x.moveTo(cx - (cx - L) * ak, cy); x.lineTo(cx + (R - cx) * ak, cy); x.stroke();
  x.beginPath(); x.moveTo(cx, cy - (cy - Tp) * ak); x.lineTo(cx, cy + (B - cy) * ak); x.stroke();
  x.font = "10px ui-monospace, Menlo, Consolas, monospace"; x.fillStyle = "rgba(143,208,210," + (0.75 * ak).toFixed(2) + ")";
  x.textAlign = "center"; x.fillText("u p p e r", cx, Tp - 12); x.fillText("d o w n e r", cx, B + 22);
  x.textAlign = "left"; x.fillText("static", L - 34, cy - 8); x.textAlign = "right"; x.fillText("dynamic", R + 34, cy - 8);
  // earlier nights: a faint constellation
  var hist = gData.hist.slice(0, -1).slice(-24), hk = ease((t - 0.5) / 1.1);
  if (hist.length) {
    x.strokeStyle = "rgba(180,200,230," + (0.16 * hk).toFixed(3) + ")"; x.setLineDash([2, 4]); x.beginPath();
    for (i = 0; i < hist.length; i++) { var X = PX(hist[i].x), Y = PY(hist[i].y); if (i === 0) x.moveTo(X, Y); else x.lineTo(X, Y); }
    x.lineTo(PX(gData.x), PY(gData.y)); x.stroke(); x.setLineDash([]);
    for (i = 0; i < hist.length; i++) {
      var age = (hist.length - i) / hist.length, sk = ease((t - 0.5 - i * 0.05) / 0.6);
      x.globalAlpha = sk * (0.35 + 0.5 * (1 - age)); x.fillStyle = "#cfd8e6";
      x.fillRect(PX(hist[i].x) - 1.5, PY(hist[i].y) - 1.5, 3, 3);
      if (i === hist.length - 1 || i % 3 === 0) { x.globalAlpha = sk * 0.45; x.fillStyle = "#7f8fa3"; x.textAlign = "left"; x.font = "9px ui-monospace, Menlo, monospace"; x.fillText(String(hist[i].n), PX(hist[i].x) + 5, PY(hist[i].y) - 4); }
    }
    x.globalAlpha = 1;
  }
  // tonight's thread: from the centre, through every warp, to where you woke
  var pts = [{ x: 0, y: 0 }].concat(gData.path), segs = pts.length - 1, pk = ease((t - 0.9) / 2.4) * segs;
  if (segs > 0) {
    x.lineCap = "round"; x.lineJoin = "round";
    for (var pass = 0; pass < 2; pass++) {
      x.strokeStyle = pass === 0 ? "rgba(143,208,210,.18)" : "rgba(220,235,230,.85)"; x.lineWidth = pass === 0 ? 6 : 1.4;
      x.beginPath(); x.moveTo(PX(0), PY(0));
      for (i = 1; i <= segs && i - 1 < pk; i++) {
        var f = Math.min(1, pk - (i - 1)), p0 = pts[i - 1], p1 = pts[i];
        x.lineTo(PX(p0.x + (p1.x - p0.x) * f), PY(p0.y + (p1.y - p0.y) * f));
      }
      x.stroke();
    }
    for (i = 1; i < segs && i <= pk; i++) { var dcol = (gData.dreams[i - 1] && gData.dreams[i - 1].col) || "#8fd0d2"; x.fillStyle = dcol; x.globalAlpha = 0.9; x.beginPath(); x.arc(PX(pts[i].x), PY(pts[i].y), 2.2, 0, 6.2832); x.fill(); }
    x.globalAlpha = 1;
    if (pk < segs) {
      var hi = Math.floor(pk), hf = pk - hi, q0 = pts[hi], q1 = pts[Math.min(segs, hi + 1)], hx = PX(q0.x + (q1.x - q0.x) * hf), hy2 = PY(q0.y + (q1.y - q0.y) * hf);
      var hg = x.createRadialGradient(hx, hy2, 0, hx, hy2, 12); hg.addColorStop(0, "rgba(255,246,220,.95)"); hg.addColorStop(1, "rgba(255,246,220,0)"); x.fillStyle = hg; x.fillRect(hx - 12, hy2 - 12, 24, 24);
    }
  }
  // where you woke: a star that settles
  var wk = ease((t - 3.1) / 0.9);
  if (wk > 0 || segs === 0) {
    if (segs === 0) wk = ease((t - 1) / 0.9);
    var ex = PX(gData.x), ey = PY(gData.y), pulse = 1 + 0.15 * Math.sin(t * 2.4), rr2 = 22 * pulse * wk;
    var sg = x.createRadialGradient(ex, ey, 0, ex, ey, rr2 + 1); sg.addColorStop(0, "rgba(255,240,200," + (0.9 * wk).toFixed(2) + ")"); sg.addColorStop(0.3, "rgba(240,215,154," + (0.35 * wk).toFixed(2) + ")"); sg.addColorStop(1, "rgba(240,215,154,0)");
    x.fillStyle = sg; x.fillRect(ex - rr2 - 1, ey - rr2 - 1, rr2 * 2 + 2, rr2 * 2 + 2);
    x.strokeStyle = "rgba(255,244,214," + (0.55 * wk).toFixed(2) + ")"; x.lineWidth = 1; var ray = 9 + 5 * pulse;
    x.beginPath(); x.moveTo(ex - ray, ey); x.lineTo(ex + ray, ey); x.moveTo(ex, ey - ray); x.lineTo(ex, ey + ray); x.stroke();
    x.fillStyle = "rgba(255,255,255," + wk.toFixed(2) + ")"; x.fillRect(ex - 2, ey - 2, 4, 4);
    x.font = "11px ui-monospace, Menlo, monospace"; x.textAlign = ex > cx + sx * 0.6 ? "right" : "left"; x.fillStyle = "rgba(240,215,154," + (0.9 * wk).toFixed(2) + ")";
    x.fillText("night " + gData.n, ex + (x.textAlign === "right" ? -12 : 12), ey - 10);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
function skipGraph() {
  if (!gOn || phase !== "graph") return;
  if (gAge < 2.2) { gAge = Math.max(gAge, 4.2); return; }   // first press: finish drawing
  if (graphTimer > 0.95) graphTimer = 0.95;
}

/* ================================================================= ending */
var endEl2 = null, endP = null, endS = null;
function parseEnding(lines) {
  var stanzas = [], cur = [], credits = null, blanks = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i] == null ? "" : String(lines[i]);
    if (credits) { credits.push(l); continue; }
    if (!l.trim()) { blanks++; if (cur.length) { stanzas.push(cur); cur = []; } if (blanks >= 2 && stanzas.length) credits = []; continue; }
    blanks = 0; cur.push(l);
  }
  if (cur.length) stanzas.push(cur);
  if (credits) credits = credits.filter(function (l, j) { return !(j === 0 && !l.trim()); });
  return { stanzas: stanzas, credits: credits };
}
T.showEnding = function (lines, onDone) {
  try {
    if (endS) closeEnding(true);
    lines = Array.isArray(lines) && lines.length ? lines : ["you wake.", "", "", "nemuri II — the lucid hour"];
    var P = parseEnding(lines);
    endEl2 = N2.ui.el("div", "", "", document.body); endEl2.id = "n2t-end";
    var c = N2.ui.el("canvas", "", "", endEl2); N2.ui.el("div", "ev", "", endEl2);
    var stEl = N2.ui.el("div", "es", "", endEl2), crEl = N2.ui.el("div", "cr", "", endEl2), kEl = N2.ui.el("div", "ek", "click to wake", endEl2);
    try { endP = new Painter(c, { scale: 0.5 }); endP.lit = 7; endP.wake = 0; } catch (e) { endP = null; }
    endEl2.addEventListener("mousedown", function (e) { e.stopPropagation(); endInput(); });
    endS = { P: P, si: -1, li: 0, timers: [], onDone: onDone, done: false, total: P.stanzas.length, stEl: stEl, crEl: crEl, kEl: kEl, last: Date.now(), phase: "lines", started: Date.now(), cred: false };
    for (var k in keys) keys[k] = false;
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    requestAnimationFrame(function () { if (endEl2) endEl2.classList.add("on"); });
    endS.timers.push(setTimeout(nextStanza, 2600));
    endS.timers.push(setTimeout(function () { if (endS) finishEnding(); }, 60000 + lines.length * 6000));
    return true;
  } catch (e) { if (window.console) console.error("[N2 title] showEnding", e); try { onDone && onDone(); } catch (e2) {} return false; }
};
var PENT = [523.3, 587.3, 659.3, 784, 880];
function nextStanza() {
  var s = endS; if (!s) return;
  s.timers.forEach(clearTimeout); s.timers = [];
  s.si++; s.last = Date.now();
  if (s.si >= s.P.stanzas.length) { showCredits(); return; }
  var lines = s.P.stanzas[s.si];
  s.stEl.classList.remove("fade"); s.stEl.innerHTML = "";
  var els = lines.map(function (l) { var d = N2.ui.el("div", "el", "", s.stEl); d.textContent = l; return d; });
  if (endP) endP.dawnTarget = (s.si + 1) / (s.P.stanzas.length + 1);
  var i = 0;
  function line() {
    if (endS !== s) return;
    if (i < els.length) { els[i].classList.add("on"); N2.chime(PENT[(s.si * 2 + i) % 5] / (i % 2 ? 2 : 1), 3.2, 0.025, "sine"); i++; s.timers.push(setTimeout(line, 2500 + Math.min(2000, lines[i - 1].length * 30))); }
    else s.timers.push(setTimeout(function () { if (endS !== s) return; s.stEl.classList.add("fade"); s.timers.push(setTimeout(nextStanza, 1700)); }, 2600));
  }
  s.timers.push(setTimeout(line, 300));
}
function showCredits() {
  var s = endS; if (!s) return;
  s.phase = "credits"; s.cred = true; s.stEl.classList.add("fade");
  if (endP) endP.dawnTarget = 1;
  var cr = s.P.credits || [], h = "<div class='cg'>ねむり<span>II</span></div>", first = cr[0] || "", rest = cr.slice(1);
  if (/nemuri/i.test(first)) { var m = /(?:—|-)\s*(.+)$/.exec(first); h += "<div class='ct'>" + esc(m ? m[1] : first) + "</div>"; } else if (first) rest.unshift(first);
  if (!cr.length) h += "<div class='ct'>the lucid hour</div>";
  rest.forEach(function (l) { h += l.trim() ? "<div class='cl'>" + esc(l) + "</div>" : "<div style='height:.6em'></div>"; });
  s.crEl.innerHTML = h;
  N2.chime(261.6, 6, 0.05, "triangle"); setTimeout(function () { N2.chime(392, 6, 0.04, "sine"); N2.chime(659.3, 6, 0.03, "sine"); }, 220);
  s.timers.push(setTimeout(function () { if (endS === s) s.crEl.classList.add("on"); }, 1400));
  var cls = s.crEl.querySelectorAll(".cl");
  Array.prototype.forEach.call(cls, function (el, i) { s.timers.push(setTimeout(function () { el.classList.add("on"); }, 3600 + i * 1300)); });
  s.timers.push(setTimeout(function () { if (endS === s) s.kEl.classList.add("on"); }, 4200 + cls.length * 1300));
  s.timers.push(setTimeout(function () { if (endS === s) finishEnding(); }, 22000 + cls.length * 1300));
}
function endInput() {
  var s = endS; if (!s) return;
  if (Date.now() - s.last < 1400) return;
  if (s.phase === "credits") { if (Date.now() - s.last > 3000) finishEnding(); return; }
  nextStanza();
}
function finishEnding() {
  var s = endS; if (!s || s.done) return;
  s.done = true; s.timers.forEach(clearTimeout); s.timers = [];
  try { if (s.onDone) s.onDone(); } catch (e) { if (window.console) console.error("[N2 title] ending callback", e); }
  closeEnding(false);
}
function closeEnding(now) {
  var el = endEl2, s = endS; endS = null;
  if (s) s.timers.forEach(clearTimeout);
  if (!el) { endP = null; return; }
  endEl2 = null;
  if (now) { if (el.parentNode) el.parentNode.removeChild(el); endP = null; return; }
  el.classList.add("out");
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (!endEl2) endP = null; }, 2400);
}

/* ================================================================== flash */
var flashQ = [], flashBusy = false, flashEl = null;
T.flash = function (text, sub) {
  try { if (!text) return; flashQ.push({ text: String(text), sub: sub }); if (!flashBusy) nextFlash(); } catch (e) {}
};
var flashCur = null;
function nextFlash() {
  var it = flashQ.shift(); if (!it) { flashBusy = false; flashCur = null; return; }
  flashBusy = true;
  if (!flashEl) { flashEl = N2.ui.el("div", "", "<div class='fw'></div><div class='fl'></div>", document.body); flashEl.id = "n2t-flash"; }
  flashEl.className = ""; flashEl.querySelector(".fw").textContent = it.text.toLowerCase();
  void flashEl.offsetWidth;          // restart the transition without waiting a frame
  flashEl.classList.add("on");
  N2.chime(880, 2.4, 0.03, "sine");
  // timed by game frames (dt is clamped), so a long first frame cannot swallow it
  flashCur = { t: 0, hold: Math.min(5.2, 2.8 + it.text.length * 0.06), off: false };
  if (it.sub) { try { N2.ui.toast(it.sub); } catch (e) {} }
}
function tickFlash(dt) {
  var f = flashCur; if (!f || !flashEl) return;
  f.t += dt;
  if (!f.off && f.t > f.hold) { f.off = true; flashEl.classList.add("off"); }
  if (f.t > f.hold + 1.4) { flashEl.className = ""; flashCur = null; nextFlash(); }
}

/* ============================================================ input hooks */
N2.on("mousedown", function (e) {
  if (endS) { endInput(); return true; }
  if (prologueOn) { prologueInput(); return true; }
  if (phase === "title") {
    if (N2.uiOpen) return false;
    if (!titleArmed || !(titleEl0 && titleEl0.classList.contains("armed"))) { arm(); return true; }
    var b = e && e.target && e.target.closest ? e.target.closest("#title [data-n2act]") : null;
    if (b) activate(b.getAttribute("data-n2act"));
    return true;
  }
  if (phase === "graph" && gOn) { skipGraph(); return true; }
  if (paused && !N2.uiOpen) {
    var pb = e && e.target && e.target.closest ? e.target.closest("#pause [data-n2p]") : null;
    if (pb) { pauseAct(pb.getAttribute("data-n2p")); return true; }
  }
  return false;
}, 70);
N2.on("keydown", function (e) {
  var c = e.code;
  if (endS) { if (!e.repeat) endInput(); return true; }
  if (prologueOn) { if (!e.repeat) prologueInput(); return true; }
  if (c === "F1" || c === "Slash") { if (N2.ui.top() === HELP) { N2.ui.close(HELP); return true; } if (!N2.uiOpen) { openHelp(); return true; } return false; }
  if (N2.uiOpen) return false;
  if (phase === "title") { if (c === "KeyO") return false; titleKey(e); return true; }
  if (phase === "graph" && gOn) { if (c === "Enter" || c === "Space" || c === "Escape" || c === "KeyE") { if (!e.repeat) skipGraph(); return true; } return false; }
  if (paused && phase !== "title") return pauseKey(e);
  return false;
}, 70);

/* ================================================================== frame */
var tAcc = 1, gAcc = 0;
// nothing of the 3D world shows while the title covers the screen: skip its render
// (the same while the white fade or the waking graph fully covers it). Installed on
// the first frame so it wraps whatever render() other modules have installed.
var renderWrapped = false;
function wrapRender() {
  renderWrapped = true;
  var inner = render;
  render = function () {
    if (phase === "title" && titleEl0 && titleEl0.style.display !== "none") return;
    if (phase === "graph" && fade >= 0.999 && (gOn || endS)) return;
    return inner.apply(this, arguments);
  };
}
N2.on("frame", function (dt) {
  try {
    if (!renderWrapped) wrapRender();
    if (phase === "title" && painter && titleEl0 && titleEl0.style.display !== "none") { tAcc += dt; if (tAcc >= (reduced() ? 0.25 : 0.03)) { painter.draw(tAcc); tAcc = 0; } }
    if (endP && endEl2) { endP.dawn += ((endP.dawnTarget || 0) - endP.dawn) * Math.min(1, dt * 0.25); endP.lit = Math.max(0, 7 * (1 - endP.dawn * 1.15)); endP.wake = Math.min(0.5, endP.dawn); endP.draw(dt); }
    tickFlash(dt);
    if (gOn) {
      gAge += dt; gAcc += dt; if (gAcc >= 0.03 || gAge < 0.1) { paintGraph(gAcc); gAcc = 0; }
      if (!gReady && gAge > 4.4) { gReady = true; var cap = $("n2g-cap"); if (cap) { cap.textContent = "click to sleep again"; cap.classList.add("ready"); } }
      if (phase === "graph" && graphTimer < 0.95 && graphEl0 && !graphEl0.classList.contains("leaving")) graphEl0.classList.add("leaving");
    }
  } catch (e) {}
});
N2.on("start", function () {
  try {
    if (hintEl) {
      var have = {}; (N2.bindings || []).forEach(function (b) { have[b.code] = 1; });
      var bits = ["move  wasd", "look  mouse", "e  touch"];
      if (have.KeyR) bits.push("r  look at your hands"); if (have.KeyF) bits.push("f  lantern"); if (have.KeyJ) bits.push("j  journal");
      bits.push("f1  all controls");
      hintEl.textContent = bits.join("  ·  ");
    }
  } catch (e) {}
});

/* ==================================================================== api */
T.prologue = function (cb) { playPrologue(cb || function () {}); return true; };
T.openHelp = openHelp;
T.closeHelp = function () { N2.ui.close(HELP); };
T.isEnding = function () { return !!endS; };
T.arm = arm;
T.begin = begin;
T.state = function () { return { armed: !!titleArmed, menu: menuMode, focus: items[focusI] ? items[focusI].getAttribute("data-n2act") : null, prologue: prologueOn, ending: !!endS, graph: gOn, nightDreams: night.dreams.length, seenPrologue: tsv.seenPrologue }; };
T.debug = {
  endNight: function () { try { if (phase === "play" || phase === "transition") { startGraph(false); return true; } } catch (e) { return String(e); } return false; },
  ending: function () { return T.showEnding(["the lanterns go out one by one —", "not because they are failing,", "but because the morning doesn't need them.", "", "you wake.", "it is yours.", "", "", "nemuri II — the lucid hour", "a sequel to nemuri — an original dream toy", "thank you for noticing."], function () {}); },
  finishEnding: function () { finishEnding(); },
  flash: function (t) { T.flash(t || "you learned to glide"); },
  painter: function () { return painter; }
};

/* ================================================================== build */
safe(buildTitle);
safe(buildPause);
safe(buildGraph);
