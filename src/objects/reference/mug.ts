// Reference object: ceramic coffee mug (Ø 8.2 cm, 9.5 cm tall, ~0.35 kg). A thick-walled lathe
// shell (fused wall tiles + a fitted base disc) with a D-shaped handle swept as a mitred tube whose
// ends are sunk into the wall. Drop it on tile and it shatters into curved shards; on a rug it
// usually survives or chips; whack the handle and it snaps off at its joints.
//
// Frame: origin at the centre of the base on the table, +Y up, handle on +X.

import { Builder } from "../lib/builder.ts";
import { mug } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface MugOpts {
  /** Glaze colour (outside). */
  tint?: number;
  seed?: number;
}

export function buildMug(o: MugOpts = {}): AssemblyDef {
  const b = new Builder("mug", "Coffee Mug", "kitchenware", 8, o.seed);
  mug(b, "mug", { tint: o.tint ?? 0x2f5f8f });
  return b.build();
}
