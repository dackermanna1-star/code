import './ui/styles.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (root) {
  const game = new Game(root);
  void game.start();
  // Expose for debugging in the console.
  (window as unknown as { godline: Game }).godline = game;
}
