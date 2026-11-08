/*
 * 最初から使える効果音。音声ファイルは使わず、その場で作る（すべてオリジナルの電子音）。
 * play(voice, start) は SoundVoice で音を重ね、鳴り終わるまでの秒数を返す。
 * 音を足すときは、ここに項目を足す（名前は小文字。部品の sound やスクリプトの play で使う）。
 */

export const SOUND_PRESETS = [
  {
    name: "beep",
    label: "ピッ（beep）",
    play: (xVoice, xStart) => {
      xVoice.tone(xStart, { freq: 880, dur: 0.15, gain: 0.16, attack: 0.002 });
      return 0.15;
    }
  },
  {
    name: "click",
    label: "カチッ（click）",
    play: (xVoice, xStart) => {
      xVoice.noise(xStart, { dur: 0.025, gain: 0.5, cutoff: 3000 });
      xVoice.tone(xStart, { type: "triangle", freq: 1800, to: 900, dur: 0.02, gain: 0.25, attack: 0.001 });
      return 0.03;
    }
  },
  {
    name: "pop",
    label: "ポン（pop）",
    play: (xVoice, xStart) => {
      xVoice.tone(xStart, { type: "sine", freq: 700, to: 180, dur: 0.1, gain: 0.6, attack: 0.002 });
      return 0.1;
    }
  },
  {
    name: "boing",
    label: "ビョーン（boing）",
    play: (xVoice, xStart) => {
      const xOscillator = xVoice.tone(xStart, { type: "triangle", freq: 140, to: 420, dur: 0.55, gain: 0.5 });
      const xWobble = xVoice.audio.createOscillator();
      const xDepth = xVoice.audio.createGain();

      // 高さを細かく（毎秒14回）揺らして、ばねのように震わせる。揺れ幅は 60Hz から 5Hz へ小さくする。
      xWobble.frequency.value = 14;
      xDepth.gain.setValueAtTime(60, xStart);
      xDepth.gain.linearRampToValueAtTime(5, xStart + 0.55);
      xWobble.connect(xDepth).connect(xOscillator.frequency);
      xWobble.start(xStart);
      xWobble.stop(xStart + 0.6);
      return 0.55;
    }
  },
  {
    name: "chime",
    label: "ピンポン（chime）",
    play: (xVoice, xStart) => {
      // ミ（E6）→ ド（C6）。
      xVoice.tone(xStart, { type: "sine", freq: 1318.5, dur: 0.7, gain: 0.45 });
      xVoice.tone(xStart + 0.32, { type: "sine", freq: 1046.5, dur: 0.9, gain: 0.45 });
      return 1.22;
    }
  },
  {
    name: "buzz",
    label: "ブブー（buzz）",
    play: (xVoice, xStart) => {
      for (const xOffset of [0, 0.24]) {
        xVoice.tone(xStart + xOffset, { type: "sawtooth", freq: 120, dur: 0.18, gain: 0.25, attack: 0.01 });
      }

      return 0.42;
    }
  },
  {
    name: "coin",
    label: "ピロン（coin）",
    play: (xVoice, xStart) => {
      xVoice.tone(xStart, { type: "triangle", freq: 1174.7, dur: 0.07, gain: 0.4, attack: 0.002 });
      xVoice.tone(xStart + 0.06, { type: "triangle", freq: 1568, to: 1760, dur: 0.35, gain: 0.4, attack: 0.002 });
      return 0.41;
    }
  },
  {
    name: "fanfare",
    label: "ファンファーレ（fanfare）",
    play: (xVoice, xStart) => {
      // ド・ミ・ソ・高いド。[高さ Hz, 始まり 秒, 長さ 秒]。1オクターブ下の音を重ねて厚みを出す。
      const xNotes = [[523.3, 0, 0.12], [659.3, 0.12, 0.12], [784, 0.24, 0.12], [1046.5, 0.4, 0.5]];

      for (const [xFrequency, xOffset, xDuration] of xNotes) {
        xVoice.tone(xStart + xOffset, { freq: xFrequency, dur: xDuration, gain: 0.14, attack: 0.01 });
        xVoice.tone(xStart + xOffset, { type: "triangle", freq: xFrequency / 2, dur: xDuration, gain: 0.2, attack: 0.01 });
      }

      return 0.9;
    }
  }
];
