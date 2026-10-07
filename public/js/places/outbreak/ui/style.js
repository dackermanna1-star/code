// The look of the Outbreak's interface: quiet, dark glass panels, condensed
// type, amber for what matters, red for what's killing you.
export const CSS = `
.rbx-gui.ob-mode > :not(.ob){display:none!important}
.ob{position:absolute;inset:0;pointer-events:none;font-family:"DIN Alternate","Bahnschrift","Barlow Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif;color:#e9e5db;user-select:none;-webkit-user-select:none;font-size:14px;letter-spacing:.02em;z-index:30}
.ob *{box-sizing:border-box}
.ob-hud{position:absolute;inset:0;pointer-events:none}
.ob .hide{display:none!important}
.ob .fade{transition:opacity .4s}
/* the dot and hit marker */
.ob-dot{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 2px rgba(0,0,0,.8);transition:opacity .15s}
.ob-hit{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;opacity:0}
.ob-hit:before,.ob-hit:after{content:"";position:absolute;left:50%;top:0;width:2px;height:100%;margin-left:-1px;background:linear-gradient(#fff 0 30%,transparent 30% 70%,#fff 70%)}
.ob-hit:before{transform:rotate(45deg)}.ob-hit:after{transform:rotate(-45deg)}
.ob-hit.kill:before,.ob-hit.kill:after{background:linear-gradient(#e0483a 0 30%,transparent 30% 70%,#e0483a 70%)}
/* the prompt */
.ob-prompt{position:absolute;left:50%;top:calc(50% + 34px);transform:translateX(-50%);font-size:15px;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap;display:flex;gap:8px;align-items:center}
.ob-key{display:inline-flex;min-width:22px;height:22px;padding:0 6px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.65);border-radius:4px;font-size:12px;font-weight:700;background:rgba(0,0,0,.35)}
.ob-prompt .sub{color:#b8b2a4;font-size:13px}
/* action progress */
.ob-action{position:absolute;left:50%;top:calc(50% + 60px);transform:translateX(-50%);width:220px;text-align:center;font-size:13px;color:#d8d2c4;text-shadow:0 1px 2px #000}
.ob-action .bar{margin-top:5px;height:3px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden}
.ob-action .bar i{display:block;height:100%;background:#e8c070;width:0}
/* status icons, bottom right */
.ob-status{position:absolute;right:22px;bottom:22px;display:flex;gap:7px;align-items:flex-end}
.ob-st{width:30px;height:30px;position:relative;opacity:.9;transition:opacity .4s,transform .3s}
.ob-st svg{width:100%;height:100%;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
.ob-st .lvl{position:absolute;left:3px;right:3px;bottom:-6px;height:2px;background:rgba(255,255,255,.15);border-radius:1px;overflow:hidden}
.ob-st .lvl i{display:block;height:100%;background:currentColor}
.ob-st.ok{color:#e9e5db;opacity:.32}.ob-st.warn{color:#e8c070;opacity:1}.ob-st.bad{color:#e0483a;opacity:1;animation:obpulse 1.1s infinite}
.ob-st .n{position:absolute;right:-4px;top:-6px;font-size:11px;font-weight:700;color:#e0483a}
@keyframes obpulse{50%{transform:scale(1.12)}}
/* stamina */
.ob-stam{position:absolute;left:50%;bottom:34px;width:260px;margin-left:-130px;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden;transition:opacity .6s}
.ob-stam i{display:block;height:100%;background:#e9e5db;width:100%;transition:width .1s}
.ob-stam .cap{position:absolute;right:0;top:0;bottom:0;background:rgba(224,72,58,.5)}
/* weapon */
.ob-weap{position:absolute;right:24px;bottom:72px;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.9)}
.ob-weap .nm{font-size:13px;color:#cfc9bb;text-transform:uppercase;letter-spacing:.08em}
.ob-weap .am{font-size:30px;font-weight:700;line-height:1.05}
.ob-weap .am small{font-size:15px;color:#a8a294;font-weight:400}
.ob-weap .md{font-size:11px;color:#a8a294;text-transform:uppercase;letter-spacing:.1em}
.ob-weap .warn{color:#e0483a}
/* compass */
.ob-comp{position:absolute;left:50%;top:14px;width:420px;margin-left:-210px;height:30px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}
.ob-comp .strip{position:absolute;top:0;height:30px;white-space:nowrap}
.ob-comp .t{position:absolute;top:2px;width:40px;margin-left:-20px;text-align:center;font-size:12px;color:#d8d2c4;text-shadow:0 1px 2px #000}
.ob-comp .t.c{font-size:15px;font-weight:700;color:#fff}
.ob-comp .t.n{color:#e8c070}
.ob-comp .tk{position:absolute;top:21px;width:1px;height:5px;background:rgba(255,255,255,.5)}
.ob-comp .mark{position:absolute;left:50%;top:22px;width:0;height:0;margin-left:-4px;border:4px solid transparent;border-bottom-color:#e8c070}
/* notes */
.ob-notes{position:absolute;left:24px;bottom:24px;max-width:calc(50vw - 260px);display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.ob-note{font-size:14px;padding:4px 10px;background:linear-gradient(90deg,rgba(10,12,11,.7),rgba(10,12,11,0));border-left:2px solid #e8c070;animation:obnote .35s;transition:opacity .6s}
@keyframes obnote{from{opacity:0;transform:translateX(-12px)}}
/* location */
.ob-loc{position:absolute;left:0;right:0;top:22%;text-align:center;opacity:0;transition:opacity 1.6s}
.ob-loc .big{font-size:46px;letter-spacing:.42em;font-weight:300;text-indent:.42em;text-shadow:0 2px 12px rgba(0,0,0,.7)}
.ob-loc .small{font-size:13px;letter-spacing:.3em;color:#cfc9bb;margin-top:6px;text-transform:uppercase}
/* hotbar */
.ob-hot{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);display:flex;gap:4px;transition:opacity .5s}
.ob-hot .s{width:46px;height:46px;border:1px solid rgba(255,255,255,.14);background:rgba(12,14,13,.55);position:relative;border-radius:3px}
.ob-hot .s.on{border-color:#e8c070;background:rgba(40,36,24,.6)}
.ob-hot .s img{position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain}
.ob-hot .s b{position:absolute;left:3px;top:1px;font-size:10px;color:#a8a294}
/* damage edge */
.ob-dmg{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(140,0,0,.55));transition:opacity .2s}
/* screens */
.ob-screen{position:absolute;inset:0;pointer-events:auto;background:rgba(6,8,8,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);display:flex}
.ob-panel{background:rgba(14,16,15,.78);border:1px solid rgba(255,255,255,.07);border-radius:4px}
.ob-h{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#a8a294;padding:10px 14px 6px}
.ob-btn{pointer-events:auto;display:block;width:100%;padding:12px 18px;margin:6px 0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#e9e5db;font:inherit;font-size:16px;letter-spacing:.18em;text-transform:uppercase;text-align:left;cursor:pointer;transition:background .15s,border-color .15s,padding .15s;border-radius:2px}
.ob-btn:hover{background:rgba(232,192,112,.12);border-color:rgba(232,192,112,.6);padding-left:24px}
.ob-btn[disabled]{opacity:.35;pointer-events:none}
/* inventory */
.ob-inv{gap:14px;padding:28px 34px 92px;justify-content:center;align-items:stretch}
.ob-col{display:flex;flex-direction:column;min-width:0;overflow:hidden}
.ob-col .scroll{overflow-y:auto;overflow-x:hidden;flex:1;padding:0 12px 12px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}
.ob-sec{margin-top:10px}
.ob-sec .hdr{display:flex;align-items:center;gap:8px;font-size:13px;color:#d8d2c4;padding:4px 0}
.ob-sec .hdr img{width:28px;height:28px;object-fit:contain}
.ob-sec .hdr .c{margin-left:auto;font-size:11px}
.ob-grid{position:relative;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-color:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08)}
.ob-it{position:absolute;pointer-events:auto;cursor:grab;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.1);border-radius:2px}
.ob-it:hover{background:rgba(232,192,112,.13);border-color:rgba(232,192,112,.5)}
.ob-it img{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain;pointer-events:none}
.ob-it .q{position:absolute;right:3px;bottom:2px;font-size:11px;font-weight:700;text-shadow:0 1px 2px #000}
.ob-it .cd{position:absolute;left:2px;bottom:2px;width:5px;height:5px;border-radius:50%}
.ob-it.drag{opacity:.35}
.ob-ghost{position:fixed;pointer-events:none;z-index:99;opacity:.85;border:1px solid #e8c070;background:rgba(40,36,24,.5)}
.ob-ghost img{width:100%;height:100%;object-fit:contain}
.ob-cell-hint{position:absolute;pointer-events:none;border:1px solid}
.ob-slot{position:relative;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.28);border-radius:3px;pointer-events:auto}
.ob-slot .lab{position:absolute;left:5px;top:3px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7a766c}
.ob-slot.hl{border-color:#e8c070;background:rgba(232,192,112,.1)}
.ob-tip.hide{display:none}
.ob-tip,.ob-menu,.ob-ghost{color:#e9e5db;font-family:"DIN Alternate","Bahnschrift","Barlow Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif;user-select:none;-webkit-user-select:none;letter-spacing:.02em;box-sizing:border-box}
.ob-tip{position:fixed;z-index:100;pointer-events:none;max-width:300px;padding:10px 12px;background:rgba(10,12,11,.94);border:1px solid rgba(255,255,255,.12);border-radius:3px;font-size:13px;line-height:1.35}
.ob-tip .t{font-size:15px;color:#fff;margin-bottom:3px}
.ob-tip .d{color:#b8b2a4}
.ob-tip .k{margin-top:5px;font-size:12px;color:#d8d2c4}
.ob-menu{position:fixed;z-index:101;pointer-events:auto;min-width:170px;padding:4px;background:rgba(14,16,15,.97);border:1px solid rgba(255,255,255,.14);border-radius:3px}
.ob-menu div{padding:7px 12px;font-size:14px;cursor:pointer;border-radius:2px}
.ob-menu div:hover{background:rgba(232,192,112,.16)}
.ob-bars .r{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12px;color:#b8b2a4;text-transform:uppercase;letter-spacing:.1em}
.ob-bars .r span{width:70px}
.ob-bars .b{flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
.ob-bars .b i{display:block;height:100%;background:#e9e5db}
/* map */
.ob-map{cursor:grab}
.ob-map canvas{position:absolute;left:0;top:0}
.ob-map .legend{position:absolute;left:20px;bottom:20px;padding:12px 16px;font-size:12px;color:#cfc9bb;line-height:1.7}
.ob-map .title{position:absolute;left:24px;top:18px;font-size:22px;letter-spacing:.3em;text-transform:uppercase}
/* the title screen */
.ob-title{flex-direction:column;justify-content:center;padding-left:9vw;background:linear-gradient(90deg,rgba(4,6,6,.88),rgba(4,6,6,.35) 55%,rgba(4,6,6,0));backdrop-filter:none;-webkit-backdrop-filter:none}
.ob-title .logo{font-size:72px;letter-spacing:.32em;font-weight:300;line-height:1;text-shadow:0 4px 30px rgba(0,0,0,.6)}
.ob-title .logo b{font-weight:700;color:#e8c070}
.ob-title .tag{font-size:14px;letter-spacing:.5em;color:#b8b2a4;margin:14px 0 46px;text-transform:uppercase}
.ob-title .menu{width:320px}
.ob-title .foot{position:absolute;left:9vw;bottom:28px;font-size:12px;color:#7a766c;letter-spacing:.08em}
.ob-dead{flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(40,0,0,.35),rgba(0,0,0,.92));backdrop-filter:none}
.ob-dead .big{font-size:64px;letter-spacing:.5em;text-indent:.5em;font-weight:400;color:#e9e5db;text-shadow:0 2px 24px rgba(160,20,10,.6),0 1px 2px #000;animation:obdead 2.2s}
@keyframes obdead{from{opacity:0;letter-spacing:.9em}}
.ob-dead .cause{color:#b8b2a4;margin:12px 0 30px;letter-spacing:.12em}
.ob-dead .stats{display:flex;gap:40px;margin-bottom:40px}
.ob-dead .stats div{text-align:center;font-size:12px;letter-spacing:.2em;color:#8a867c;text-transform:uppercase}
.ob-dead .stats b{display:block;text-transform:none;font-size:30px;color:#e9e5db;letter-spacing:.04em;font-weight:400}
.ob-pause{flex-direction:column;align-items:flex-start;justify-content:center;padding-left:9vw}
.ob-set{width:440px;padding:6px 18px 16px}
.ob-set label{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:14px;color:#cfc9bb}
.ob-set input[type=range]{width:200px;accent-color:#e8c070}
.ob-set select{background:#1a1c1b;color:#e9e5db;border:1px solid rgba(255,255,255,.2);padding:4px 8px;font:inherit}
.ob-keys{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:14px;color:#cfc9bb;padding:6px 18px 16px}
.ob-loading{position:absolute;inset:0;background:#070908;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto}
.ob-loading .bar{width:300px;height:2px;background:rgba(255,255,255,.12);margin-top:20px}
.ob-loading .bar i{display:block;height:100%;background:#e8c070;width:0;transition:width .3s}
.ob-fps{position:absolute;right:8px;top:6px;font-size:11px;color:#8a867c}
`;
