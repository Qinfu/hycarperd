# HycarPerd

スマホでも動く、なんちゃってHyperCard。白黒のクラシックMac風UIと、HyperTalk風の簡易言語を持つ。

## 起動

```sh
python3 -m http.server
```

`http://localhost:8000` を開く（`index.html` を直接開くとサンプルを読み込めない）。

## 画面

端末に合わせて画面を切り替える（幅600px以下、またはタッチ操作で幅900px以下ならスマホ用）。
操作はすべてメニューに入れ、画面にはカードだけを出す。

| | PC | スマホ |
| --- | --- | --- |
| メニュー | 上部のメニューバー（ファイル / 編集 / 移動 / ツール / オブジェクト） | 右上の「☰」で一覧 |
| カード名 | カードのタイトルバー | 上部にスタック名と並べて表示 |
| カード移動 | 移動メニュー、左右の矢印キー | 移動メニュー、左右にスワイプ |
| 部品の設定 | 編集中に部品をダブルクリック、またはオブジェクトメニュー | 編集中に部品をダブルタップ、またはメニュー |

部品・カード・背景・スタックの設定はモーダルのダイアログで開く（変更はその場で反映し、OKで閉じる）。

## カードの切り替え効果

閲覧中にカードを移ると、スタック情報で選んだ効果が付く（既定はワイプ）。

- ワイプ：次のカードへ進むときは左へ、前へ戻るときは右へ拭き取る。
- ディゾルブ：点々に崩れて入れ替わる。
- なし
- スクリプトで `visual effect` を指定したときは、その効果が優先される（`plain` で効果なし）。
- 編集中・描画中と、端末で「視差効果を減らす」（動きを減らす）を設定しているときは効果を付けない。

## 音

音声ファイルは使わず、ブラウザ（Web Audio）でその場で作る電子音を8種類持つ。

| 名前 | 音 |
| --- | --- |
| `beep` | 短い「ピッ」 |
| `click` | ボタンの「カチッ」 |
| `pop` | 軽い「ポン」 |
| `boing` | 跳ねる「ビョーン」 |
| `chime` | 2音の「ピンポン」 |
| `buzz` | 間違いの「ブブー」 |
| `coin` | 高く上がる「ピロン」 |
| `fanfare` | 短いファンファーレ |

- スクリプト：`play "chime"`（鳴らしたまま次の行へ進む）。
- ボタン情報の「押したときの音」：閲覧中にボタンを押すと、スクリプトより先に鳴る。
- スタック情報の「beep で鳴らす音」：`beep` 命令で鳴る音を選ぶ（既定は `beep`）。
- 設定で音を選ぶと、その場で試しに鳴る。
- iPhoneは本体の消音スイッチがオンだと鳴らない。
- 音を増やすときは `js/ui/Sound.js` で `xRegisterSound(名前, 表示名, 鳴らし方)` を足す。

## 背景

全カード共通の層が1つある。ツールメニューの「背景を編集」で切り替える（メニューバーが縞模様になる）。

- 背景に置いた部品と本文は、全カードのカード層の下に表示される。
- 背景のフィールドは、置き場所は共通で中身はカードごと（住所録型）。「全カードで同じ文字にする」をオンにすると中身も共通になる。
- カードを編集しているときの背景の部品は、薄く表示されて触れない。

## 描画

ツールメニューの「カードに描く」「背景に描く」で、カードと背景に白黒の絵を描ける。
描画中だけ道具パレットが出る（PCはカードの左、スマホはカードの下）。「完了」でブラウズに戻る。

- 道具：鉛筆、消しゴム、直線、四角、楕円、塗りつぶし。線の太さは 1 / 2 / 4 ドット（消しゴムはその4倍）。
- 塗りつぶしの模様：黒、白、チェック、縦縞、横縞（1ドットずつ）。塗りつぶしを選ぶと、太さの代わりに模様が出る。
  押した所とつながっている同じ色（黒・白・透明）の部分を塗る。
- 「取消」（⌘Z / Ctrl+Z、編集メニューの「描画を取り消す」）で20回まで戻せる。編集メニューの「絵をすべて消す」も取り消せる。
- 画像の取り込み：編集メニューの「画像を取り込む…」で写真や画像ファイルを選ぶ（描画中でなければ描画に切り替わる）。
  アトキンソン方式のディザで白黒にして、枠付きで重ねて見せる。枠のドラッグで移動、右下の四角で大きさ（縦横比は保つ）、
  パレットの明るさ・コントラストで見え方を調整し、「貼り付け」で絵に書き込む（「キャンセル」かEscでやめる）。
  貼り付けた後は描いた絵と同じで、鉛筆や消しゴムで手を入れられ、取り消しもできる。
- 絵はスタックの大きさ（320×480など）のドットで、黒・白・透明の3つ。白は下の層を隠し、消しゴムは透明に戻す。拡大してもぼかさずに表示する。
- 重なり順は下から「背景の絵 → 背景の本文 → 背景の部品 → カードの絵 → カードの本文 → カードの部品」。
- 絵はPNGのデータURLとして、カード・背景の `picture` に保存する。

カードの大きさはスタックごとに持つ。新しいスタックは縦長の 320×480。

## 構成

| ファイル | 役割 |
| --- | --- |
| `js/app.js` | 画面全体のつなぎ込み |
| `js/storage/StackIO.js` | スタックの作成・検証・保存（JSON / localStorage） |
| `js/ui/MenuBar.js` | プルダウンメニュー（PC / スマホで描き分け） |
| `js/ui/CardView.js` | カードと部品の表示、画面に合わせた拡大縮小、スワイプ、編集中のドラッグ |
| `js/ui/Painter.js` | 絵の描画（ドット単位の線・図形・塗りつぶし、取り消し、PNGの読み書き） |
| `js/ui/PaintPalette.js` | 描画中の道具パレット |
| `js/ui/Inspector.js` | 部品・カード・スタックの設定ダイアログ |
| `js/ui/Dialog.js` | answer / ask のダイアログ |
| `js/ui/Sound.js` | 効果音（プリセットの合成と再生） |
| `js/hypertalk/` | 簡易言語（Lexer → Parser → Interpreter） |

## スクリプト

```
on mouseUp
  add 1 to field "count"
  if field "count" > 9 then
    answer "10回押しました！"
  end if
end mouseUp
```

メッセージは「部品 → カード → 背景 → スタック」の順に渡され、最初に見つかったハンドラが動く。
`pass mouseUp` で次へ渡せる。

### 画面から送られるメッセージ

`mouseUp`（ボタン、文字を固定したフィールド、カードの何もない所）、`openCard`、`closeCard`、`openStack`

### 命令

| 命令 | 例 |
| --- | --- |
| put | `put "こんにちは" into field "msg"` / `after` / `before`。書き込み先を省くとメッセージボックスへ |
| get | `get field 1`（結果は `it`） |
| go | `go next card` / `go prev card` / `go first card` / `go to card "ホーム"` / `go card 2` / `go back` |
| visual | `visual effect wipe left` / `wipe right` / `dissolve` / `plain`（効果なし）。速さ `very fast` / `fast` / `slow` / `very slow` を後ろに付けられる。次の1回の go にだけ効く |
| answer | `answer "保存しますか？" with "いいえ" or "はい"`（押したボタンが `it`） |
| ask | `ask "お名前は？" with "ゲスト"`（入力が `it`、キャンセルで `the result` が `Cancel`） |
| add / subtract / multiply / divide | `add 1 to field "count"` / `multiply x by 2` |
| hide / show | `hide button "ひみつ"` |
| set | `set the name of button 1 to "OK"`（name, text, visible, lockText, sharedText, sound, left, top, width, height） |
| beep / wait | `beep 2` / `wait 1 second` / `wait 30 ticks` |
| play | `play "chime"`（音の名前は上の「音」の表） |
| send | `send "mouseUp" to button "次へ"` |
| global | `global gScore` |
| 制御 | `if … then … else … end if` / `repeat` / `repeat 5 times` / `repeat with i = 1 to 10` / `repeat while …` / `repeat until …` / `exit repeat` / `next repeat` / `exit mouseUp` / `exit to HyperCard`（`exit to HycarPerd` も可） / `return 値` |

自分で作ったハンドラは命令として呼べる（`on greet who` … `end greet` → `greet "花子"`）。
`function` で作った関数は `double(21)` のように呼べる。

### 式

- 演算子：`+ - * / ^ div mod`、`&`（連結）、`&&`（空白を挟んで連結）、`= <> < > <= >=`、`is`、`is not`、`contains`、`is in`、`and or not`
- 定数：`empty` `true` `false` `return` `space` `tab` `quote` `comma`
- 部品：`field "名前"` / `field 2` / `button "名前"` / `me` / `the target`
  - `card field` / `bg field`（`card button` / `bg button`）で層を指定できる。
  - 指定がなければ、名前のときはカード→背景の順に探す。番号のときはカードの部品。
- 背景：`this background`（`the name of this bg` など）
- プロパティ：`the name of me` / `the visible of field 1` / `the number of this card`
- 数：`the number of cards` / `the number of buttons` / `the number of bg fields` / `the number of words in x`
- チャンク：`word 2 of x` / `char 1 to 3 of x` / `line 1 of field "memo"` / `item 2 of "a,b,c"`（読み取りのみ）
- 関数：`random(6)` `abs` `round` `trunc` `sqrt` `length` `max` `min` `sum` `average` `offset` `charToNum` `numToChar`
- `the date` / `the long date` / `the time` / `the seconds` / `the ticks` / `the result`

全角の数字は数値として扱う。iOSが自動で変換する引用符（“ ”）や「—」のコメントも受け付ける。
