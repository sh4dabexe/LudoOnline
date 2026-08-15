/**
 * Ludo Online — Sound Effects (Web Audio API)
 * Pure synthesized sounds — no external audio files needed.
 */
const SFX = (() => {
  let _ctx = null;

  function getCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function beep(freq, type, dur, vol = 0.25, delay = 0) {
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime + delay);
      g.gain.setValueAtTime(vol, c.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
      o.connect(g); g.connect(c.destination);
      o.start(c.currentTime + delay);
      o.stop(c.currentTime + delay + dur + 0.01);
    } catch (e) {}
  }

  function noise(dur, vol = 0.18, delay = 0) {
    try {
      const c   = getCtx();
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      // Low-pass filter to remove harshness
      const filter = c.createBiquadFilter();
      filter.type            = 'lowpass';
      filter.frequency.value = 200; // only bass frequencies
      const g = c.createGain();
      g.gain.setValueAtTime(vol, c.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
      src.connect(filter); filter.connect(g); g.connect(c.destination);
      src.start(c.currentTime + delay);
    } catch (e) {}
  }

  return {
    // Smooth, soft dice tumble — low-frequency sine waves only, no harsh noise
    roll() {
      // Gentle low rumble (like dice sliding on a table)
      for (let i = 0; i < 6; i++) {
        beep(55 + Math.random() * 35, 'sine', 0.14, 0.055, i * 0.065);
      }
      // Very subtle soft taps — triangle wave (naturally smooth)
      for (let i = 0; i < 4; i++) {
        beep(220 + Math.random() * 100, 'triangle', 0.035, 0.035, i * 0.085 + 0.04);
      }
    },


    // Dice final result reveal
    land() {
      noise(0.06, 0.4);
      beep(350, 'triangle', 0.1, 0.35, 0.05);
      beep(450, 'triangle', 0.12, 0.25, 0.12);
    },

    // Token moved on board
    move() {
      beep(523, 'sine', 0.08, 0.3);
      beep(659, 'sine', 0.1,  0.25, 0.08);
    },

    // Single step tick during cell-by-cell slide animation
    step() {
      // Very soft, warm click — like a wooden piece touching the board.
      // Short sine pop at mid-range frequency, fast decay, low volume.
      beep(370 + Math.random() * 40, 'sine', 0.055, 0.12);
    },

    // Token captured! (dramatic)
    capture() {
      beep(220, 'sawtooth', 0.15, 0.5);
      beep(180, 'sawtooth', 0.2,  0.4, 0.12);
      beep(140, 'sawtooth', 0.3,  0.3, 0.28);
    },

    // Token reached home stretch
    home() {
      beep(523, 'sine', 0.1, 0.4);
      beep(659, 'sine', 0.1, 0.4, 0.12);
      beep(784, 'sine', 0.2, 0.4, 0.24);
    },

    // WIN! Fanfare
    win() {
      const notes = [523, 659, 784, 1047, 784, 1047, 1175, 1047];
      notes.forEach((f, i) => beep(f, 'sine', 0.22, 0.5, i * 0.12));
    },

    // Timer tick (last 8 seconds)
    tick() {
      beep(880, 'square', 0.04, 0.1);
    },

    // Urgent tick (last 3 seconds)
    urgent() {
      beep(1100, 'square', 0.06, 0.2);
      beep(1300, 'square', 0.06, 0.2, 0.08);
    },

    // It's your turn!
    yourTurn() {
      beep(440, 'sine', 0.1, 0.3);
      beep(554, 'sine', 0.1, 0.3, 0.13);
      beep(659, 'sine', 0.18, 0.4, 0.26);
    },

    // Chat message received
    chat() {
      beep(880, 'sine', 0.07, 0.18);
      beep(1100, 'sine', 0.05, 0.12, 0.07);
    },

    // Player eliminated
    eliminated() {
      beep(300, 'sawtooth', 0.3, 0.5);
      beep(240, 'sawtooth', 0.3, 0.4, 0.22);
      beep(180, 'sawtooth', 0.5, 0.3, 0.46);
    },
  };
})();
