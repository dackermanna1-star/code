import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Xform } from "../../geom/vec.ts";
import type { RoomId } from "../plan.ts";

export interface Placement {
  type: string;
  def: AssemblyDef;
  xf: Xform;
  room: RoomId;
}
