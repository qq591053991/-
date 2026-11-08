import './style.css';
import { ENEMIES } from './data/enemies';
import { Game } from './game/game';
import { loadModelOverrides } from './render3d/glb';
import { Hud } from './render3d/hud';
import { Renderer3D } from './render3d/scene';
import { UI } from './ui/ui';

const glCanvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;

// 输入监听挂在最上层的 HUD 画布上（它覆盖整个画面）
const game = new Game(hudCanvas);
const ui = new UI(overlay, game);
game.ui = ui;

// 先读取可选的 GLB 模型替换清单（public/models/manifest.json），再创建场景
const overrides = await loadModelOverrides();
if (overrides.length) console.info('[models] 使用自定义模型：', overrides.join(', '));

try {
  const view = new Renderer3D(glCanvas);
  const hud = new Hud(hudCanvas, view);
  game.view = view;
  game.hud = hud;
  window.addEventListener('resize', () => hud.resize());
} catch (err) {
  overlay.classList.add('show');
  overlay.innerHTML = `<div class="panel"><h2>无法启动 3D 渲染</h2><p class="muted">当前浏览器不支持 WebGL：${String(err)}</p></div>`;
  throw err;
}

ui.render();
game.start();
void document.fonts?.ready.then(() => ui.render());

// 便于调试
(window as unknown as { game: Game; ENEMIES: typeof ENEMIES }).game = game;
(window as unknown as { ENEMIES: typeof ENEMIES }).ENEMIES = ENEMIES;
