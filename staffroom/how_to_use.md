# 薄氷の使い方

## 関連

- [README](../README.md)
- [準備室の案内](./overview.md)
- [薄氷の世界観と役割](./world_and_roles.md)
- [薄氷の技術設計](./technical_design.md)

## 何をするシステムか

薄氷は、ユーザーが依頼を持ち込み、える・ハルヒ・折木・キョン・長門が部活として受け止め、結論と成果物を返すための運用システムである。

日常的な入口は次の3つに寄せている。

- `/kaigi`
- `/board`
- `/library`

## セットアップ

最低限の流れは README と同じでよい。

1. `git clone <repo-url>`
2. `cd usurahi`
3. `npm install`
4. 必要なら `cp .env.example .env`
5. Claude / Codex 側で `/kaigi` `/board` `/library` を使える状態にする

## 基本導線

### 依頼する

主線は `/kaigi` である。

```text
/kaigi
したい依頼はなんですか？
> 依頼本文

背景やメモがあれば書いてください。なければこのまま始めます。
> 補足
```

起きること:

- 依頼が受け付けられる
- 必要なら部会が起動する
- `clubroom` で進行を見られる

### 進行を見る

```bash
tmux attach -t clubroom
```

ここでは部員たちのやり取りと黒板の現在値を見る。

### 掲示板を使う

主線は `/board` である。
掲示板は「話す場所」ではなく、「貼る / 見る」場所として扱う。

backend を直接使う場合:

```bash
bash ./board.sh list
bash ./board.sh add "この論点はあとで見返したい"
```

### 図書室を使う

主線は `/library` である。
摩耶花の受付から入り、「本を入れる」を起点に進める。

backend を直接使う場合:

```bash
bash ./ribrary.sh
bash ./ribrary.sh "https://zenn.dev/example/articles/abc"
```

起きること:

- 摩耶花が次アクションを聞く
- 主線は「本を入れる」
- 必要ならメモ、保存意図、X の抜粋を聞く

## 補助コマンド

必要な時だけ、次の backend / 運用コマンドを使う。

```bash
./meeting.sh -a
./meeting.sh -k
tmux attach -t clubroom
bash ./board.sh list
bash ./board.sh add "メモ本文"
bash ./ribrary.sh
bash ./ribrary.sh <url>
```

`./meeting.sh -a` は部活の tmux セッションと部員を最初から起動する運用コマンドである。

## 図書室の補足

図書室は `add -> list -> run` の流れで回る。
Zenn / Qiita / 公式 docs は URL のまま主線に乗せられる。
X 投稿は `URL + excerpt` を主線にしておくと運用が安定する。
整理が終わった本や、途中で詰まった本はキューに残さない。
うまくいかなかった時は、同じ URL をもう一度送る前提で扱う。

## さらに知りたい時

- 世界観と役割: [薄氷の世界観と役割](./world_and_roles.md)
- 技術設計: [薄氷の技術設計](./technical_design.md)
- 準備室の入口: [staffroom/README.md](./README.md)
