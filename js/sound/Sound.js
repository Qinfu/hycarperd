/*
 * 効果音の窓口。アプリ全体で1つの SoundPlayer を使い、最初から使える音（SoundPresets.js）を登録しておく。
 */
import { SOUND_PRESETS } from "./SoundPresets.js";
import { SoundPlayer } from "./SoundPlayer.js";

// 音を鳴らす機械は端末に1つあればよく、どこから鳴らしても同じものを使う。
const pSoundPlayer = new SoundPlayer();

for (const xPreset of SOUND_PRESETS) {
  pSoundPlayer.register(xPreset.name, xPreset.label, xPreset.play);
}

// 音を足す（将来、スタックに読み込んだ音もこの形で登録できる）。play(voice, start) は鳴り終わるまでの秒数を返す。
export const fsRegisterSound = (xName, xLabel, xPlay) => pSoundPlayer.register(xName, xLabel, xPlay);

// 設定の選択肢に使う [名前, 表示名] の一覧。
export const fsSoundOptions = () => pSoundPlayer.options();

export const fsHasSound = (xName) => pSoundPlayer.has(xName);

// 鳴らした音の長さ（ミリ秒）を返す。音がない・鳴らせないときは 0。
export const fsPlaySound = (xName) => pSoundPlayer.play(xName);

export const fsUnlockSound = () => pSoundPlayer.unlockOnFirstTouch();
