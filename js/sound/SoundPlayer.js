/*
 * 効果音を鳴らす。Web Audio の AudioContext は、最初に鳴らすときに1つだけ作って使い回す。
 */
import { SoundVoice } from "./SoundVoice.js";

// 全体の音量。プリセットを重ねても割れないよう、半分にする。
const MASTER_GAIN = 0.5;

// 少しだけ先に予約すると、出だしが欠けない（秒）。
const SCHEDULE_AHEAD = 0.01;

// 鳴り終わってから、つないだ出口を外すまでの余裕（秒）。
const DISCONNECT_MARGIN = 0.5;

// 雑音のバッファの長さ（秒）。一番長い雑音の音より長くしておく。
const NOISE_BUFFER_SECONDS = 0.25;

const MILLISECONDS_PER_SECOND = 1000;
const SUSPENDED_STATE = "suspended";

export class SoundPlayer {
  constructor() {
    // 名前（小文字） → { label, play }
    this.sounds = new Map();
    this.audio = null;
    this.noiseBuffer = null;
  }

  register(xName, xLabel, xPlay) {
    this.sounds.set(xName.toLowerCase(), { label: xLabel, play: xPlay });
  }

  has(xName) {
    return this.sounds.has(String(xName).toLowerCase());
  }

  // 設定の選択肢に使う [名前, 表示名] の一覧。
  options() {
    return [...this.sounds].map(([xName, xSound]) => [xName, xSound.label]);
  }

  // 鳴らした音の長さ（ミリ秒）を返す。音がない・鳴らせないときは 0。
  play(xName) {
    const xSound = this.sounds.get(String(xName).toLowerCase());

    if (!xSound) {
      return 0;
    }

    try {
      const xAudio = this.readyAudio();
      const xOutput = xAudio.createGain();
      xOutput.gain.value = MASTER_GAIN;
      xOutput.connect(xAudio.destination);

      const xVoice = new SoundVoice(xAudio, xOutput, () => this.readNoiseBuffer(xAudio));
      const xSeconds = xSound.play(xVoice, xAudio.currentTime + SCHEDULE_AHEAD);
      setTimeout(() => xOutput.disconnect(), (xSeconds + DISCONNECT_MARGIN) * MILLISECONDS_PER_SECOND);
      return Math.round(xSeconds * MILLISECONDS_PER_SECOND);
    } catch {
      // 音が出せない環境では何もしない。
      return 0;
    }
  }

  // iPhoneなどは、画面に触れたときに一度音を有効にしないと、後から鳴らせない。
  unlockOnFirstTouch() {
    const xUnlock = () => {
      try {
        const xAudio = this.readyAudio();

        if (xAudio.state === SUSPENDED_STATE) {
          xAudio.resume();
        }
      } catch {
        // 音が出せない環境では何もしない。
      }
    };

    for (const xType of ["pointerdown", "keydown"]) {
      document.addEventListener(xType, xUnlock, { capture: true, passive: true });
    }
  }

  // 止まっている（タブを離れていた、など）なら、鳴らす前に動かし直す。
  readyAudio() {
    this.audio ??= new AudioContext();

    if (this.audio.state === SUSPENDED_STATE) {
      this.audio.resume();
    }

    return this.audio;
  }

  // 白色雑音。作るのに手間がかかるので一度だけ作る（サンプリング周波数が変わったら作り直す）。
  readNoiseBuffer(xAudio) {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === xAudio.sampleRate) {
      return this.noiseBuffer;
    }

    const xBuffer = xAudio.createBuffer(1, Math.round(xAudio.sampleRate * NOISE_BUFFER_SECONDS), xAudio.sampleRate);
    const xSamples = xBuffer.getChannelData(0);

    for (let xIndex = 0; xIndex < xSamples.length; xIndex += 1) {
      xSamples[xIndex] = Math.random() * 2 - 1;
    }

    this.noiseBuffer = xBuffer;
    return xBuffer;
  }
}
