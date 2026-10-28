// The player (implements PlayerSystem): `new Player(ctx)` = PlayerCore (character controller,
// camera rig, footsteps, grab/throw/slam/pull/use, input routing — see playerCore.ts) wired to
// the real tool system (src/player/tools/toolSystem.ts). Tests can inject a tool system.

import type { GameContext } from "../core/context.ts";
import type { IToolSystem } from "./contracts.ts";
import { PlayerCore } from "./playerCore.ts";
import { ToolSystem } from "./tools/toolSystem.ts";

export { PLAYER, TOOL_SLOTS, PlayerCore } from "./playerCore.ts";

export interface PlayerOptions {
  /** Inject a tool system (tests); `null` = no tools. Default: `new ToolSystem(ctx)`. */
  tools?: IToolSystem | null;
}

export class Player extends PlayerCore {
  constructor(ctx: GameContext, opts: PlayerOptions = {}) {
    super(ctx, opts.tools !== undefined ? opts.tools : new ToolSystem(ctx));
  }
}
