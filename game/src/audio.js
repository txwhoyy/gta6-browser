// All sound is synthesized with WebAudio: a lazy engine hum whose pitch follows
// the car's speed, a two-tone police siren, a small bass-and-pad music loop and
// one-shot effects for pickups, crashes, punches and mission jingles. No audio
// files, nothing loaded; the context only starts after the first key or click,
// which is what browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  /** Create the context on the first user gesture; safe to call every frame. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startSiren();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, seconds, type, volume, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  noise(seconds, volume, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t);
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  /** speedRatio 0..1 while driving, or null when on foot (engine fades out). */
  setEngine(speedRatio) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (speedRatio === null) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.1);
  }

  startSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  /** closeness 0..1: how near the nearest police car is; 0 silences the siren. */
  setSiren(closeness, timeSeconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (closeness <= 0) {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const wail = Math.sin(timeSeconds * 5.2) > 0 ? 940 : 690;
    this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
    this.sirenGain.gain.setTargetAtTime(0.012 + closeness * 0.03, t, 0.2);
  }

  pickup() {
    this.tone(880, 0.09, 'square', 0.08);
    setTimeout(() => this.tone(1318, 0.12, 'square', 0.08), 55);
  }

  cashRegister() {
    this.tone(1046, 0.08, 'square', 0.09);
    setTimeout(() => this.tone(1568, 0.16, 'square', 0.09), 70);
  }

  crash(strength) {
    this.noise(0.22, Math.min(0.5, 0.15 + strength * 0.4), 900);
    this.tone(90, 0.2, 'sine', 0.25, 40);
  }

  punch() {
    this.noise(0.08, 0.2, 1600);
  }

  doorSlam() {
    this.noise(0.07, 0.18, 500);
    this.tone(140, 0.08, 'sine', 0.15, 70);
  }

  busted() {
    this.tone(392, 0.25, 'square', 0.12);
    setTimeout(() => this.tone(311, 0.25, 'square', 0.12), 180);
    setTimeout(() => this.tone(233, 0.5, 'square', 0.12), 360);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => setTimeout(() => this.tone(freq, 0.22, 'triangle', 0.14), i * 95));
  }

  missionFailed() {
    this.tone(330, 0.3, 'triangle', 0.12, 220);
  }

  /** A slow synthwave loop: bass pulse and a soft pad, one step every 0.24 s. */
  updateMusic(dt, playing) {
    if (!this.ctx || this.muted || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.24;
    const bassLine = [55, 55, 82.4, 55, 65.4, 55, 98, 73.4];
    const step = this.musicStep % bassLine.length;
    this.tone(bassLine[step], 0.22, 'triangle', 0.055);
    if (this.musicStep % 8 === 0) {
      const chord = [220, 261.6, 329.6];
      chord.forEach((freq) => this.tone(freq, 1.7, 'sine', 0.016));
    }
    if (this.musicStep % 2 === 0) this.noise(0.03, 0.012, 6000);
    this.musicStep += 1;
  }
}
