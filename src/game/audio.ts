/** 水墨短合成：木鱼 / 磬 / 拨弦感，禁止锯齿电音主音色。尊重 setSfxEnabled。 */

let ctx: AudioContext | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;
/** 总线：所有合成音先经 master 再出，静音可立即切断在播声音 */
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setSfxEnabled(v: boolean) {
  enabled = v;
  // 立即拉总线，正在播放的余韵也一并静音/恢复
  if (ctx && master) {
    master.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.02);
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.35);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // 略偏粉噪，少刺耳
    d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.85;
  }
  noiseBuf = buf;
  return buf;
}

/** 短振荡：三角/正弦为主，指数衰减 */
function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  at = 0,
  slideTo?: number,
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur * 0.85);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master ?? c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** 噪声脉冲：木鱼敲击 / 风噪余韵 */
function burst(
  dur: number,
  vol: number,
  at = 0,
  opts?: { hp?: number; lp?: number; band?: number },
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let node: AudioNode = src;
  if (opts?.band) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = opts.band;
    bp.Q.value = 1.4;
    node.connect(bp);
    node = bp;
  }
  if (opts?.hp) {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.hp;
    node.connect(hp);
    node = hp;
  }
  if (opts?.lp) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.lp;
    node.connect(lp);
    node = lp;
  }
  node.connect(g);
  g.connect(master ?? c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** 磬/钟：正弦基音 + 弱泛音 + 短噪头 */
function bell(freq: number, dur: number, vol: number, at = 0) {
  tone(freq, dur, "sine", vol, at);
  tone(freq * 2.01, dur * 0.55, "sine", vol * 0.28, at + 0.01);
  tone(freq * 3.02, dur * 0.35, "triangle", vol * 0.12, at + 0.02);
  burst(Math.min(0.05, dur * 0.15), vol * 0.35, at, { band: freq * 1.2, lp: freq * 4 });
}

/** 拨弦感：三角主音微滑 + 噪声拨片 */
function pluck(freq: number, dur: number, vol: number, at = 0) {
  burst(0.028, vol * 0.55, at, { hp: 800, lp: 4200, band: freq * 2 });
  tone(freq, dur, "triangle", vol, at, freq * 0.97);
  tone(freq * 2, dur * 0.4, "sine", vol * 0.18, at + 0.008);
}

export const sfx = {
  unlock() {
    ac();
  },
  /** 轻木鱼；暴击叠清越泛音 */
  click(crit: boolean) {
    burst(0.055, crit ? 0.055 : 0.038, 0, { band: 380, lp: 1400, hp: 120 });
    tone(180 + Math.random() * 40, 0.07, "sine", crit ? 0.045 : 0.028, 0);
    if (crit) {
      tone(920 + Math.random() * 60, 0.14, "sine", 0.032, 0.02);
      tone(1380, 0.1, "triangle", 0.018, 0.035);
    }
  },
  /** 上行五度拨弦 */
  upgrade() {
    pluck(392, 0.12, 0.038, 0); // G4
    pluck(588, 0.14, 0.036, 0.07); // D5
    pluck(784, 0.18, 0.032, 0.14); // G5
  },
  /** 破层：低钟 + 余韵（必须走 ac→enabled） */
  layer() {
    bell(110, 0.42, 0.048, 0);
    tone(165, 0.35, "triangle", 0.028, 0.05);
    burst(0.22, 0.03, 0.02, { lp: 600, hp: 40 });
  },
  /** 印泥落印；高稀有多一声磬 */
  gacha(rarity: number) {
    burst(0.06, 0.045, 0, { band: 220, lp: 900, hp: 80 });
    pluck(440, 0.11, 0.032, 0.04);
    pluck(660, 0.12, 0.03, 0.11);
    if (rarity >= 3) bell(880, 0.28, 0.036, 0.18);
    if (rarity >= 5) bell(1320, 0.36, 0.03, 0.28);
  },
  /** 仙果：短琴泛音 */
  orb() {
    pluck(660, 0.14, 0.036, 0);
    tone(990, 0.18, "sine", 0.028, 0.05);
    tone(1320, 0.12, "sine", 0.016, 0.09);
  },
  /** 渡劫：钟磬长余韵 + 风噪，空间感大于破层 */
  prestige() {
    bell(98, 0.7, 0.05, 0);
    bell(147, 0.55, 0.035, 0.1);
    tone(220, 0.5, "triangle", 0.028, 0.18);
    burst(0.55, 0.04, 0.05, { lp: 480, hp: 60 });
    burst(0.4, 0.022, 0.25, { lp: 320, hp: 40 });
  },
};
