import { isItem, itemDef } from '../../shared/data/items';
import { restoreVitals } from '../../shared/sim/vitals';
import type { Game } from '../game';
import { log } from '../log';
import type { Player } from '../player';

/**
 * Console / chat box. Plain text is just echoed to the log; lines starting
 * with "/" are commands. Cheat commands require the world's `cheats` flag
 * (chosen at world creation, like most singleplayer survival games).
 */
export class Commands {
  constructor(private game: Game) {}

  chat(p: Player, raw: string) {
    const text = raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!text) return;
    if (text.startsWith('/')) return this.command(p, text.slice(1));
    p.link?.send({ t: 'msg', text, kind: 'chat', from: p.name });
  }

  private command(p: Player, line: string) {
    const [cmdRaw, ...args] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const reply = (s: string) => this.game.msg(p, s, 'info');
    switch (cmd) {
      case 'help':
        return reply('Commands: /help /kill /stats /status /save' + (this.game.config.cheats ? ' | cheats: /give <item> [n] /time <0-1> /heal /god /spawn <animal|scavenger> /tp <x> <y> <z> /items' : ' (cheats disabled for this world)'));
      case 'kill':
        return this.game.combat.kill(p, null, 'Suicide');
      case 'stats':
        return reply(`Kills ${p.kills}, deaths ${p.deaths}, blueprints ${p.blueprints.size}`);
      case 'status':
        for (const l of this.game.statusText().split('\n')) reply(l);
        return;
      case 'save':
        void this.game.save('command');
        return reply('Saving…');
    }
    if (!this.game.config.cheats) return this.game.msg(p, 'Unknown command (cheats are disabled in this world). Try /help', 'error');
    if (!p.alive) return this.game.msg(p, 'You are dead — respawn first', 'error');
    log.audit('Cheat command', { player: p.name, line });
    switch (cmd) {
      case 'give': {
        const id = args[0];
        const n = Math.max(1, Math.min(100000, Number(args[1] ?? 1) || 1));
        if (!id || !isItem(id)) return this.game.msg(p, 'Unknown item — /items lists keys', 'error');
        let left = n;
        while (left > 0) {
          const k = Math.min(left, itemDef(id).stack);
          this.game.entities.give(p, id, k);
          left -= k;
        }
        return reply(`Gave ${n} ${itemDef(id).name}`);
      }
      case 'items':
        return reply('Try: wood stone metal_frag hq_metal scrap cloth gunpowder building_plan hammer claim_totem workbench1 workbench2 workbench3 furnace pipe_pistol pistol_ammo service_rifle rifle_ammo breach_charge fuse_charge metal_door code_lock');
      case 'time': {
        const v = Math.max(0, Math.min(1, Number(args[0])));
        const cycle = this.game.config.dayLengthMin * 60;
        this.game.time = Math.floor(this.game.time / cycle) * cycle + v * cycle;
        return reply(`Time set to phase ${v}`);
      }
      case 'god':
        return this.game.setGod(p, !p.god);
      case 'heal':
        restoreVitals(p.vitals);
        return reply('Healed');
      case 'spawn': {
        const key = args[0] ?? 'boar';
        try {
          if (key === 'scavenger') this.game.wildlife.spawnNpc(p.x + 4, p.y + 0.5, p.z + 4);
          else this.game.wildlife.spawn(key, p.x + 3, p.y + 0.5, p.z + 3);
        } catch {
          this.game.msg(p, 'Unknown creature (stag, boar, wolf, bear, scavenger)', 'error');
        }
        return;
      }
      case 'tp': {
        const [x, y, z] = args.map(Number);
        if (![x, y, z].every(Number.isFinite)) return this.game.msg(p, 'Usage: /tp x y z', 'error');
        this.game.world.ensureSyncAt(x, z);
        p.move.x = x; p.move.y = y; p.move.z = z; p.move.vy = 0;
        p.ready = false;
        return;
      }
      default:
        return this.game.msg(p, 'Unknown command', 'error');
    }
  }
}
