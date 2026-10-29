/** 输入系统：指针锁定鼠标视角 + 键盘状态 */

export class Input {
  private keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  enabled = true;

  // 本帧按下的键（一次性消费）
  private pressed = new Set<string>();
  // 鼠标按键状态
  mouseButtons = [false, false, false];

  private sens = 1.0;
  private invertY = false;

  // 本帧按下过的鼠标键（一次性消费）
  private buttonsPressed = new Set<number>();

  private canvas: HTMLCanvasElement;
  private onLockChange?: (locked: boolean) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // 阻止游戏键的浏览器默认行为（空格滚动等）
      if (['Space', 'Tab', 'KeyR'].includes(e.code) && this.locked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons = [false, false, false]; });

    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
      this.buttonsPressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => { this.mouseButtons[e.button] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      const s = 0.0022 * this.sens;
      this.mouseDX += e.movementX * s;
      this.mouseDY += e.movementY * s * (this.invertY ? -1 : 1);
    });
    window.addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouseButtons = [false, false, false]; }
      this.onLockChange?.(this.locked);
    });
  }

  setSettings(sens: number, invertY: boolean): void {
    this.sens = sens;
    this.invertY = invertY;
  }

  onLock(cb: (locked: boolean) => void): void { this.onLockChange = cb; }

  async requestLock(): Promise<void> {
    try { await this.canvas.requestPointerLock(); } catch { /* 用户拒绝 */ }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean { return this.enabled && this.keys.has(code); }
  hit(code: string): boolean {
    if (this.pressed.has(code)) { return true; }
    return false;
  }
  /** 本帧是否按下过某鼠标键 */
  buttonHit(button: number): boolean {
    return this.enabled && this.buttonsPressed.has(button);
  }

  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
