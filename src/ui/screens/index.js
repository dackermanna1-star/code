// Screen registry: name → class (HW.ui.open(name, args)).
import { CardScreen } from './card.js';
import { ConfirmScreen } from './confirm.js';
import { DocReader } from './docreader.js';
import { TitleScreen } from './title.js';
import { GameOverScreen } from './gameover.js';
import { PauseScreen } from './pause.js';
import { InventoryScreen } from './inventory.js';
import { SketchbookScreen } from './sketchbook.js';
import { SettingsScreen } from './settings.js';
import { SaveLoadScreen } from './saveload.js';
import { CreditsScreen } from './credits.js';
import { PAScreen } from '../special/pa.js';
import { SafeScreen } from '../special/safe.js';
import { TerminalScreen } from '../special/terminal.js';
import { RegisterScreen } from '../special/register.js';
import { BreathScreen } from '../special/breath.js';
import { WriteScreen } from '../special/write.js';
import { VhsScreen } from '../special/vhs.js';

export const SCREENS = {
  // modal menus & documents (above dialogue)
  card: CardScreen,
  confirm: ConfirmScreen,
  doc: DocReader,
  pause: PauseScreen,
  inventory: InventoryScreen,
  sketchbook: SketchbookScreen,
  settings: SettingsScreen,
  saveload: SaveLoadScreen,
  credits: CreditsScreen,
  // title & game over (top)
  title: TitleScreen,
  gameover: GameOverScreen,
  // special screens (below dialogue, so scripts can talk over them)
  pa: PAScreen,
  safe: SafeScreen,
  terminal: TerminalScreen,
  register: RegisterScreen,
  breath: BreathScreen,
  write: WriteScreen,   // generic hold-to-write meter (the expulsion)
  vhs: VhsScreen,       // Leah's tape: frame scrubber
};
