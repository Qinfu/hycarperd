/*
 * 効果音を組み立てる部品。1回鳴らすごとに作り、プリセット（SoundPresets.js）はこれを使って音を重ねる。
 *   tone(start, options)  高さを変えながら消えていく1つの音
 *   noise(start, options) 高い音だけを通した雑音（「カチッ」）
 */

// 音量を 0 にすると指数で変化させられないので、聞こえないほど小さな値を使う。
export const SILENT_GAIN = 0.0001;

// 鳴らし終えてから止めるまでの余裕（秒）。消えきる前に止めて「プツッ」と鳴らないようにする。
const STOP_MARGIN = 0.02;

const TONE_DEFAULTS = { type: "square", gain: 0.2, attack: 0.005 };
const NOISE_DEFAULTS = { gain: 0.3, cutoff: 2000 };

export class SoundVoice {
  // audio：AudioContext。output：音をつなぐ先。readNoiseBuffer()：雑音のバッファ（使い回す）。
  constructor(xAudio, xOutput, xReadNoiseBuffer) {
    this.audio = xAudio;
    this.output = xOutput;
    this.readNoiseBuffer = xReadNoiseBuffer;
  }

  // options: { type, freq（始めの高さ Hz）, to（終わりの高さ。省くと freq のまま）, dur（秒）, gain, attack（立ち上がりの秒）}
  // 鳴らしている発振器を返す（高さを後から揺らすときに使う）。
  tone(xStart, xOptions) {
    const { type: xType, freq: xFrequency, dur: xDuration, gain: xGain, attack: xAttack } = { ...TONE_DEFAULTS, ...xOptions };
    const xEndFrequency = xOptions.to ?? xFrequency;
    const xOscillator = this.audio.createOscillator();
    const xEnvelope = this.audio.createGain();

    xOscillator.type = xType;
    xOscillator.frequency.setValueAtTime(xFrequency, xStart);

    if (xEndFrequency !== xFrequency) {
      xOscillator.frequency.exponentialRampToValueAtTime(xEndFrequency, xStart + xDuration);
    }

    xEnvelope.gain.setValueAtTime(SILENT_GAIN, xStart);
    xEnvelope.gain.exponentialRampToValueAtTime(xGain, xStart + xAttack);
    xEnvelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, xStart + xDuration);
    xOscillator.connect(xEnvelope).connect(this.output);
    xOscillator.start(xStart);
    xOscillator.stop(xStart + xDuration + STOP_MARGIN);
    return xOscillator;
  }

  // options: { dur（秒）, gain, cutoff（これより高い音だけを通す Hz）}
  noise(xStart, xOptions) {
    const { dur: xDuration, gain: xGain, cutoff: xCutoff } = { ...NOISE_DEFAULTS, ...xOptions };
    const xBuffer = this.readNoiseBuffer();
    const xSource = this.audio.createBufferSource();
    const xFilter = this.audio.createBiquadFilter();
    const xEnvelope = this.audio.createGain();

    xSource.buffer = xBuffer;
    xFilter.type = "highpass";
    xFilter.frequency.value = xCutoff;
    xEnvelope.gain.setValueAtTime(xGain, xStart);
    xEnvelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, xStart + xDuration);
    xSource.connect(xFilter).connect(xEnvelope).connect(this.output);
    xSource.start(xStart);
    xSource.stop(xStart + xDuration + STOP_MARGIN);
  }
}
