// Keyboard and mouse state for the game. The game polls this every frame instead
// of reacting to events, which keeps driving and walking perfectly smooth.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;

    window.addEventListener('keydown', (event) => {
      if (!event.repeat) {
        this.keys.add(event.code);
        this.pressed.add(event.code);
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((event.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => {
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
  }

  down(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** True only on the frame the key first went down. Call endFrame after the update. */
  justPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Movement axes from WASD or the arrow keys: x is -1..1, y is -1..1. */
  axes() {
    const x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
