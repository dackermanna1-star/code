import './ui/styles.css';
import { App } from './app';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
(window as unknown as { __cosmos: App }).__cosmos = app;
app.boot(new URLSearchParams(location.search));
app.start();
