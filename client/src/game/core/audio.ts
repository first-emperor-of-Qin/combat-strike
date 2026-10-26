import type { WeaponClass } from '@combat-strike/shared';

/**
 * 程序化音频引擎 —— 零音频资源文件，全部实时合成。
 * 枪声按武器类别分层（瞬态噪声 + 低频冲击 + 尾音），
 * 换弹/命中/UI 有独立音色，菜单有合成器配乐循环。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private started = false;

  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  volumes = { master: 0.8, sfx: 1, music: 0.5 };

  /** 必须在用户手势中调用一次 */
  ensure(): void {
    if (this.started) return;
    try {
      this.ctx = new AudioContext();
    } catch { return; }
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.applyVolumes();

    // 预生成白噪声缓冲
    const len = ctx.sampleRate * 1.2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music;
  }

  resume(): void { this.ctx?.resume(); }
  suspend(): void { this.ctx?.suspend(); }

  // ---------- 基础单元 ----------
  private noise(dur: number, gain: number, filterType: BiquadFilterType, freq: number, q = 1, when = 0): void {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, bus?: GainNode): void {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ---------- 枪声（按类别） ----------
  shoot(cls: WeaponClass): void {
    switch (cls) {
      case 'pistol':
        this.noise(0.09, 0.5, 'bandpass', 2400, 0.8);
        this.tone('triangle', 190, 60, 0.09, 0.5);
        break;
      case 'smg':
        this.noise(0.06, 0.4, 'bandpass', 3200, 1.2);
        this.tone('triangle', 240, 80, 0.05, 0.4);
        break;
      case 'ar':
        this.noise(0.08, 0.55, 'bandpass', 2000, 0.9);
        this.tone('sawtooth', 160, 55, 0.08, 0.45);
        this.noise(0.16, 0.12, 'lowpass', 900, 0.5, 0.02);
        break;
      case 'shotgun':
        this.noise(0.24, 0.75, 'lowpass', 1400, 0.6);
        this.tone('sine', 110, 35, 0.22, 0.8);
        break;
      case 'dmr':
        this.noise(0.13, 0.6, 'bandpass', 1700, 0.8);
        this.tone('triangle', 150, 45, 0.13, 0.6);
        this.noise(0.3, 0.1, 'lowpass', 700, 0.4, 0.03);
        break;
      case 'sniper':
        this.noise(0.2, 0.85, 'bandpass', 1200, 0.7);
        this.tone('sine', 95, 28, 0.3, 0.9);
        this.noise(0.6, 0.14, 'lowpass', 500, 0.3, 0.06);
        break;
      case 'lmg':
        this.noise(0.07, 0.5, 'bandpass', 1500, 1.0);
        this.tone('sawtooth', 130, 50, 0.06, 0.5);
        break;
      case 'energy':
        this.tone('sine', 1400, 300, 0.12, 0.4);
        this.tone('square', 700, 180, 0.1, 0.18);
        this.noise(0.08, 0.15, 'highpass', 4000, 1);
        break;
      case 'launcher':
        this.noise(0.35, 0.7, 'lowpass', 800, 0.5);
        this.tone('sawtooth', 120, 30, 0.35, 0.7);
        break;
    }
  }

  dryFire(): void { this.noise(0.04, 0.25, 'highpass', 3000, 2); }

  reloadStage(stage: 'out' | 'in' | 'bolt'): void {
    if (stage === 'out') { this.noise(0.07, 0.35, 'bandpass', 1800, 3); this.tone('square', 400, 250, 0.04, 0.1); }
    else if (stage === 'in') { this.noise(0.06, 0.45, 'bandpass', 1200, 2.5); this.tone('square', 300, 180, 0.05, 0.16); }
    else { this.noise(0.09, 0.5, 'bandpass', 2400, 2); this.tone('square', 520, 320, 0.05, 0.2, 0.02); }
  }

  hit(headshot: boolean): void {
    if (headshot) { this.tone('square', 2100, 1500, 0.06, 0.3); this.tone('sine', 2600, 2000, 0.08, 0.22); }
    else this.tone('square', 1300, 900, 0.045, 0.22);
  }

  killConfirm(): void { this.tone('sine', 880, 660, 0.1, 0.3); this.tone('sine', 1320, 990, 0.14, 0.25, 0.06); }

  explosion(): void {
    this.noise(0.55, 0.9, 'lowpass', 700, 0.4);
    this.tone('sine', 90, 24, 0.5, 0.95);
    this.noise(0.9, 0.2, 'lowpass', 300, 0.3, 0.08);
  }

  enemyShoot(): void { this.tone('sawtooth', 520, 140, 0.12, 0.22); this.noise(0.08, 0.12, 'bandpass', 2600, 1); }

  hurt(): void { this.tone('sine', 130, 55, 0.18, 0.5); this.noise(0.12, 0.2, 'lowpass', 600, 0.6); }

  footstep(): void { this.noise(0.05, 0.12, 'lowpass', 500, 0.5); }

  jump(): void { this.noise(0.06, 0.1, 'bandpass', 800, 1); }

  waveStart(): void { this.tone('sawtooth', 220, 220, 0.18, 0.25); this.tone('sawtooth', 330, 330, 0.22, 0.25, 0.12); }

  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.28, 0.3, i * 0.13));
  }

  defeat(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.34, 0.28, i * 0.18));
  }

  uiClick(): void { this.tone('square', 900, 700, 0.035, 0.12); }
  uiHover(): void { this.tone('sine', 1400, 1400, 0.02, 0.05); }
  levelUp(): void { [440, 554, 659, 880, 1109].forEach((f, i) => this.tone('sine', f, f, 0.22, 0.28, i * 0.09)); }
  purchase(): void { this.tone('sine', 700, 1100, 0.1, 0.25); this.tone('sine', 1050, 1650, 0.12, 0.2, 0.08); }

  lowHpBeep(): void { this.tone('sine', 1000, 1000, 0.08, 0.15); }

  // ---------- 配乐（菜单循环） ----------
  startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    // A 小调暗色琶音
    const chords = [
      [110, 130.81, 164.81], [98, 116.54, 146.83], [87.31, 110, 130.81], [82.41, 98, 123.47],
    ];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const step = this.musicStep % 16;
      const chord = chords[Math.floor(this.musicStep / 4) % 4]!;
      // 低音（每 4 步）
      if (step % 4 === 0) this.tone('triangle', chord[0]!, chord[0]!, 0.9, 0.16, 0, this.musicBus);
      // 琶音
      const notes = [chord[1]! * 2, chord[2]! * 2, chord[0]! * 4, chord[2]! * 2];
      const n = notes[step % 4]!;
      this.tone('sine', n, n, 0.32, 0.07, 0, this.musicBus);
      this.tone('square', n * 2, n * 2, 0.18, 0.018, 0, this.musicBus);
      this.musicStep++;
    }, 260);
  }

  stopMusic(): void {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
