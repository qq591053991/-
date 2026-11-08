/** 键鼠输入。鼠标坐标会换算到游戏的逻辑分辨率。 */
export class Input {
  readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  readonly mouse = { x: 0, y: 0 };
  mouseDown = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly W: number, private readonly H: number) {
    this.mouse.x = W / 2;
    this.mouse.y = H / 2;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    const move = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * this.W;
      this.mouse.y = ((e.clientY - rect.top) / rect.height) * this.H;
    };
    window.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', (e) => {
      move(e);
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.pressed.add('Dash');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
