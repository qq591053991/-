import './style.css';
import { H, W } from './game/constants';
import { Game } from './game/game';
import { UI } from './ui/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;

const game = new Game(canvas);
const ui = new UI(overlay, game);
game.ui = ui;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.dpr = dpr;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}
window.addEventListener('resize', resize);
resize();

ui.render();
game.start();

// 字体加载后重绘背景字形（Canvas 不会自动刷新）
void document.fonts?.ready.then(() => ui.render());

// 便于调试
(window as unknown as { game: Game }).game = game;
