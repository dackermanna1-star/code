import type { Game } from '../game/Game';
import type { Station } from './Station';
import { BoardStation } from './Board';
import { BowlStation } from './Bowl';
import { PanStation, PotStation, OvenStation } from './Stove';
import { FryerStation, BlenderStation, ToasterStation, MicrowaveStation, FreezerStation } from './Appliances';
import { PlateStation } from './Plate';

export interface StationMap {
  board: BoardStation;
  bowl: BowlStation;
  pan: PanStation;
  grill: PanStation;
  pot: PotStation;
  oven: OvenStation;
  fryer: FryerStation;
  blender: BlenderStation;
  toaster: ToasterStation;
  microwave: MicrowaveStation;
  freezer: FreezerStation;
  plate: PlateStation;
}

export function createStations(game: Game): StationMap {
  return {
    board: new BoardStation(game),
    bowl: new BowlStation(game),
    pan: new PanStation(game, 'pan'),
    grill: new PanStation(game, 'grill'),
    pot: new PotStation(game),
    oven: new OvenStation(game),
    fryer: new FryerStation(game),
    blender: new BlenderStation(game),
    toaster: new ToasterStation(game),
    microwave: new MicrowaveStation(game),
    freezer: new FreezerStation(game),
    plate: new PlateStation(game),
  };
}

export type { Station };
