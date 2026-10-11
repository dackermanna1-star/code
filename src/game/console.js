// Developer console commands (a small subset of the GoldSrc/CS 1.6 cvars and commands).

import { TEAM_T, TEAM_CT } from './player.js';
import { setLightCurve } from '../map/meshbuilder.js';

export class Console {
  constructor(game, menus, settings, renderer, input, hud) {
    Object.assign(this, { game, menus, settings, renderer, input, hud });
    this.cheats = false;
  }

  print(t, color) { this.menus.print?.(t, color); }

  exec(line) {
    const parts = line.trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const arg = parts.slice(1).join(' ');
    const g = this.game, s = this.settings;
    const num = (d) => (arg === '' ? d : Number(arg));
    const setv = (k, v) => { s.set(k, v); this.print(`"${k}" is "${v}"`); };
    switch (cmd) {
      case '': return;
      case 'sensitivity': if (arg) { setv('sensitivity', num(2.5)); this.input.sensitivity = num(2.5); } else this.print(`"sensitivity" is "${s.get('sensitivity')}"`); break;
      case 'cl_showfps': setv('cl_showfps', num(1)); break;
      case 'net_graph': setv('net_graph', num(1)); break;
      case 'cl_dynamiccrosshair': setv('cl_dynamiccrosshair', num(1)); break;
      case 'announcer': setv('announcer', num(1)); break;
      case 'violence_hblood':
        if (arg === '') { this.print(`"violence_hblood" is "${s.get('violence_hblood') ?? 1}"`); break; }
        setv('violence_hblood', num(1) ? 1 : 0);
        if (!s.get('violence_hblood')) g.effects?.clearBlood?.();
        break;
      case 'name': if (arg) { setv('name', arg); if (g.local) g.local.name = arg; } break;
      case 'volume': setv('volume', num(0.8)); g.sound.setMasterVolume(num(0.8)); break;
      case 'fov': case 'default_fov': setv('fov', num(90)); this.renderer.configure(s.video()); break;
      case 'gamma': setv('gamma', num(2.5)); setLightCurve(s.get('gamma'), s.get('brightness')); break;
      case 'brightness': setv('brightness', num(1)); setLightCurve(s.get('gamma'), s.get('brightness')); break;
      case 'vid_mode': setv('mode', arg || 'native'); this.renderer.configure(s.video()); break;
      case 'vid_aspect': setv('aspect', arg || 'fill'); this.renderer.configure(s.video()); break;
      case 'cl_crosshair_color': { const c = arg.split(/\s+/).map(Number); if (c.length === 3) setv('crosshairColor', c); break; }
      case 'cl_crosshair_size': setv('crosshairSize', arg || 'auto'); break;
      case 'sv_cheats': this.cheats = num(1) === 1; this.print(`"sv_cheats" changed to "${this.cheats ? 1 : 0}"`); break;
      case 'mp_restartgame': case 'sv_restart': if (g.started) { g.rounds.startMatch(); this.print('Game will restart in 1 SECOND'); } break;
      case 'mp_roundtime': g.rounds.roundTime = num(2.5) * 60; this.print(`"mp_roundtime" is "${num(2.5)}"`); break;
      case 'mp_freezetime': g.rounds.freezeTime = num(6); break;
      case 'mp_c4timer': g.rounds.c4Time = num(45); break;
      case 'mp_friendlyfire': g.rounds.friendlyFire = num(0) === 1; break;
      case 'bot_add_t': g.bots.addBot(TEAM_T); break;
      case 'bot_add_ct': g.bots.addBot(TEAM_CT); break;
      case 'bot_add': g.bots.addBot(g.players.filter((p) => p.team === TEAM_T).length <= g.players.filter((p) => p.team === TEAM_CT).length ? TEAM_T : TEAM_CT); break;
      case 'bot_kick': {
        const b = g.bots.bots.pop();
        if (b) { g.removePlayer(b.p); this.print(`Kicked ${b.p.name}`); }
        break;
      }
      case 'bot_difficulty': g.bots.difficulty = ['easy', 'normal', 'hard', 'expert'][num(1)] || 'normal'; break;
      case 'god': if (this.cheats && g.local) { g.local.god = !g.local.god; this.print(`godmode ${g.local.god ? 'ON' : 'OFF'}`); } break;
      case 'impulse':
        if (arg === '101' && this.cheats && g.local) { g.local.money = 16000; this.print('$16000'); }
        break;
      case 'noclip': if (this.cheats) this.print('noclip is not supported'); break;
      case 'kill': if (g.local?.alive) g.killPlayer(g.local, null, 'world', false); break;
      case 'status': for (const p of g.players) this.print(`# ${p.id} "${p.name}" ${p.team} ${p.kills}/${p.deaths} ${p.isBot ? 'BOT' : ''}`); break;
      case 'quit': case 'disconnect': location.reload(); break;
      case 'help': case 'cmdlist':
        this.print('sensitivity, cl_showfps, net_graph, fov, vid_mode <640x480|800x600|1024x768|1280x960|native>, vid_aspect <fill|4:3>, cl_crosshair_color "r g b", cl_dynamiccrosshair, name, volume, announcer, violence_hblood 0/1, mp_restartgame, mp_roundtime, mp_freezetime, mp_c4timer, mp_friendlyfire, bot_add, bot_add_t, bot_add_ct, bot_kick, bot_difficulty 0-3, kill, status, sv_cheats, god, impulse 101');
        break;
      default: this.print(`Unknown command: ${cmd}`);
    }
  }
}
