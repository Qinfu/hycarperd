// 効果音。音声ファイルは使わず、Web Audio でその場で作る（すべてオリジナルの電子音）。

let pAudio = null;
let pNoise = null;

const MASTER_GAIN = 0.5;
const MIN_GAIN = 0.0001;

// 音の作り方。play(audio, out, start) で鳴らし、鳴り終わるまでの秒数を返す。
// 音を足すときは、ここに項目を足す（将来、スタックに読み込んだ音もこの形で登録できる）。
const SOUNDS = new Map();

export function xRegisterSound(xName, xLabel, xPlay) {
  SOUNDS.set(xName.toLowerCase(), { label: xLabel, play: xPlay });
}

// 設定の選択肢に使う [名前, 表示名] の一覧。
export function xSoundOptions() {
  return [...SOUNDS].map(([xName, xSound]) => [xName, xSound.label]);
}

export function xHasSound(xName) {
  return SOUNDS.has(String(xName).toLowerCase());
}

// 鳴らした音の長さ（ミリ秒）を返す。音がない・鳴らせないときは 0。
export function xPlaySound(xName) {
  const xSound = SOUNDS.get(String(xName).toLowerCase());

  if (!xSound) {
    return 0;
  }

  try {
    const xAudio = xGetAudio();
    const xOut = xAudio.createGain();
    xOut.gain.value = MASTER_GAIN;
    xOut.connect(xAudio.destination);

    // 少しだけ先に予約すると、出だしが欠けない。
    const xSeconds = xSound.play(xAudio, xOut, xAudio.currentTime + 0.01);
    setTimeout(() => xOut.disconnect(), (xSeconds + 0.5) * 1000);
    return Math.round(xSeconds * 1000);
  } catch {
    // 音が出せない環境では何もしない。
    return 0;
  }
}

// iPhoneなどは、画面に触れたときに一度音を有効にしないと、後から鳴らせない。
export function xUnlockSound() {
  const xUnlock = () => {
    try {
      const xAudio = xGetAudio();

      if (xAudio.state === "suspended") {
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

function xGetAudio() {
  pAudio ??= new AudioContext();

  if (pAudio.state === "suspended") {
    pAudio.resume();
  }

  return pAudio;
}

// ---- 音を組み立てる部品 ----

// 1つの音。freq から to へ高さを変えながら、gain から消えていく。
function xTone(xAudio, xOut, xStart, { type = "square", freq, to = freq, dur, gain = 0.2, attack = 0.005 }) {
  const xOscillator = xAudio.createOscillator();
  const xGain = xAudio.createGain();

  xOscillator.type = type;
  xOscillator.frequency.setValueAtTime(freq, xStart);

  if (to !== freq) {
    xOscillator.frequency.exponentialRampToValueAtTime(to, xStart + dur);
  }

  xGain.gain.setValueAtTime(MIN_GAIN, xStart);
  xGain.gain.exponentialRampToValueAtTime(gain, xStart + attack);
  xGain.gain.exponentialRampToValueAtTime(MIN_GAIN, xStart + dur);
  xOscillator.connect(xGain).connect(xOut);
  xOscillator.start(xStart);
  xOscillator.stop(xStart + dur + 0.02);
  return xOscillator;
}

// 雑音。高い音だけを通して「カチッ」を作る。
function xNoise(xAudio, xOut, xStart, { dur, gain = 0.3, cutoff = 2000 }) {
  if (!pNoise || pNoise.sampleRate !== xAudio.sampleRate) {
    pNoise = xAudio.createBuffer(1, Math.round(xAudio.sampleRate * 0.25), xAudio.sampleRate);
    const xData = pNoise.getChannelData(0);

    for (let xIndex = 0; xIndex < xData.length; xIndex += 1) {
      xData[xIndex] = Math.random() * 2 - 1;
    }
  }

  const xSource = xAudio.createBufferSource();
  const xFilter = xAudio.createBiquadFilter();
  const xGain = xAudio.createGain();

  xSource.buffer = pNoise;
  xFilter.type = "highpass";
  xFilter.frequency.value = cutoff;
  xGain.gain.setValueAtTime(gain, xStart);
  xGain.gain.exponentialRampToValueAtTime(MIN_GAIN, xStart + dur);
  xSource.connect(xFilter).connect(xGain).connect(xOut);
  xSource.start(xStart);
  xSource.stop(xStart + dur + 0.02);
}

// ---- プリセット ----

xRegisterSound("beep", "ピッ（beep）", (xAudio, xOut, xStart) => {
  xTone(xAudio, xOut, xStart, { freq: 880, dur: 0.15, gain: 0.16, attack: 0.002 });
  return 0.15;
});

xRegisterSound("click", "カチッ（click）", (xAudio, xOut, xStart) => {
  xNoise(xAudio, xOut, xStart, { dur: 0.025, gain: 0.5, cutoff: 3000 });
  xTone(xAudio, xOut, xStart, { type: "triangle", freq: 1800, to: 900, dur: 0.02, gain: 0.25, attack: 0.001 });
  return 0.03;
});

xRegisterSound("pop", "ポン（pop）", (xAudio, xOut, xStart) => {
  xTone(xAudio, xOut, xStart, { type: "sine", freq: 700, to: 180, dur: 0.1, gain: 0.6, attack: 0.002 });
  return 0.1;
});

xRegisterSound("boing", "ビョーン（boing）", (xAudio, xOut, xStart) => {
  const xOscillator = xTone(xAudio, xOut, xStart, { type: "triangle", freq: 140, to: 420, dur: 0.55, gain: 0.5 });
  const xWobble = xAudio.createOscillator();
  const xDepth = xAudio.createGain();

  // 高さを細かく揺らして、ばねのように震わせる。
  xWobble.frequency.value = 14;
  xDepth.gain.setValueAtTime(60, xStart);
  xDepth.gain.linearRampToValueAtTime(5, xStart + 0.55);
  xWobble.connect(xDepth).connect(xOscillator.frequency);
  xWobble.start(xStart);
  xWobble.stop(xStart + 0.6);
  return 0.55;
});

xRegisterSound("chime", "ピンポン（chime）", (xAudio, xOut, xStart) => {
  xTone(xAudio, xOut, xStart, { type: "sine", freq: 1318.5, dur: 0.7, gain: 0.45 });
  xTone(xAudio, xOut, xStart + 0.32, { type: "sine", freq: 1046.5, dur: 0.9, gain: 0.45 });
  return 1.22;
});

xRegisterSound("buzz", "ブブー（buzz）", (xAudio, xOut, xStart) => {
  for (const xOffset of [0, 0.24]) {
    xTone(xAudio, xOut, xStart + xOffset, { type: "sawtooth", freq: 120, dur: 0.18, gain: 0.25, attack: 0.01 });
  }
  return 0.42;
});

xRegisterSound("coin", "ピロン（coin）", (xAudio, xOut, xStart) => {
  xTone(xAudio, xOut, xStart, { type: "triangle", freq: 1174.7, dur: 0.07, gain: 0.4, attack: 0.002 });
  xTone(xAudio, xOut, xStart + 0.06, { type: "triangle", freq: 1568, to: 1760, dur: 0.35, gain: 0.4, attack: 0.002 });
  return 0.41;
});

xRegisterSound("fanfare", "ファンファーレ（fanfare）", (xAudio, xOut, xStart) => {
  const xNotes = [[523.3, 0, 0.12], [659.3, 0.12, 0.12], [784, 0.24, 0.12], [1046.5, 0.4, 0.5]];

  for (const [xFreq, xOffset, xDur] of xNotes) {
    xTone(xAudio, xOut, xStart + xOffset, { freq: xFreq, dur: xDur, gain: 0.14, attack: 0.01 });
    xTone(xAudio, xOut, xStart + xOffset, { type: "triangle", freq: xFreq / 2, dur: xDur, gain: 0.2, attack: 0.01 });
  }
  return 0.9;
});
