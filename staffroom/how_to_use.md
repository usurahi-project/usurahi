# 薄氷の使い方

## 関連

- [README](../README.md)
- [準備室の案内](./overview.md)
- [薄氷の世界観と役割](./world_and_roles.md)
- [薄氷の技術設計](./technical_design.md)

## 何をするシステムか

薄氷は、ユーザーが部室に依頼を持ち込み、える・ハルヒ・折木・キョン・長門が部活として受け止め、結論と成果物を返すための運用システムである。

ユーザー体験は大きく3つある。

1. 部活を起動して、部室に入る
2. えるに依頼を持ち込んで、会議を進めてもらう
3. 必要なら図書室で記事や知識を取り込む

## 最初に打つコマンド

### 部活を起動する

```bash
./meeting.sh
```

起きること:

- えるとハルヒが起動する
- `noticeboard` セッションがえる用に立ち上がる
- `clubroom` セッションが部室として立ち上がる
- `clubroom` には上段にハルヒ・黒板・える表示、下段に折木・キョン・長門の 6 pane が並ぶ

今の tmux 構成:

- `noticeboard.0`: える
- `clubroom.0`: ハルヒ
- `clubroom.1`: 折木
- `clubroom.2`: 黒板
- `clubroom.3`: キョン
- `clubroom.4`: える（部室表示）
- `clubroom.5`: 長門

### まっさらな状態から始める

```bash
./meeting.sh -c
```

起きること:

- キューを初期化する
- 黒板を初期状態に戻す
- その上で部活を起動する

### 最初から全員呼ぶ

```bash
./meeting.sh -a
```

### 途中で部員を呼ぶ

```bash
./meeting.sh -w
```

### 下校する

```bash
./meeting.sh -k
```

## どこに入るか

### 正式依頼入口を使う

```bash
./request.sh "依頼本文"
```

背景も一緒に渡せる。

```bash
./request.sh --request "依頼本文" --background "背景"
```

### えるに話しかける

```bash
tmux attach -t noticeboard
```

ここでは、えるの受け答えを見たり、背景を補足したりする。
`noticeboard` は背景や判断を返す窓口であり、正式依頼そのものは `request.sh` と `room_requests.yaml` が主線である。

### 部室を覗く

```bash
tmux attach -t clubroom
```

ここでは、部員たちのやり取りと黒板の現在値を見る。
黒板は `clubroom` の専用 pane で常時表示される。
えるは `noticeboard` に本体があり、`clubroom` では表示 pane として見える。

## すぐ使うコマンド

```bash
./meeting.sh -c
./meeting.sh -a
./meeting.sh -w
./meeting.sh -k
./request.sh "依頼本文"
./request.sh -l
./scripts/notify.sh <送信先> "<メッセージ>"
./library.sh add <url> --note "ひとこと"
./library.sh add <x-url> --excerpt "抜粋本文"
./library.sh
./library.sh -l
./library.sh --failed
./library.sh retry --failed
./library.sh refetch --failed
tmux attach -t noticeboard
tmux attach -t clubroom
```

## 途中で口を挟む

```bash
./scripts/notify.sh <送信先> "<メッセージ>"
```

送信先:

- `eru`
- `haruhi`
- `oreki`
- `kyon`
- `nagato`

## 図書室を使う

### カウンターへ入れる

```bash
./library.sh add <url>
```

ひとことメモや保存意図も付けられる。

```bash
./library.sh add "https://zenn.dev/example/articles/abc" \
  --note "設計の参考" \
  --intent keep-for-later
```

Zenn / Qiita / 公式 docs はこの形でそのまま図書室カウンターに入れる。

X 投稿 URL は、非課金で回すなら `excerpt` を一緒に入れる。

```bash
./library.sh add "https://x.com/SuguruKun_ai/status/2036449312939630908" \
  --excerpt "Claude Code のスキル、調べてみたら GitHub に6万個以上ある..." \
  --note "スキル設計の参考" \
  --intent interesting
```

`X_BEARER_TOKEN` がある場合だけ、`excerpt` なしでも追加時に本文取得を試みる。

### URLキューを処理する

```bash
./library.sh
```

### 未処理URLを確認する

```bash
./library.sh -l
```

### 失敗URLを確認する

```bash
./library.sh --failed
```

失敗一覧には `suggest:retry` または `suggest:refetch` が出る。
通常はその提案に従えばよい。

### 失敗を再試行に戻す

```bash
./library.sh retry --failed
./library.sh retry <url>
```

`retry` は取得済み本文を残したまま、要約と保存のやり直しに戻す。

### 材料から取り直す

```bash
./library.sh refetch --failed
./library.sh refetch <url>
```

`refetch` は取得済み本文も捨てて、外部ソースから取り直す前提で戻す。
ページ更新や取得不良の時だけ使う。

`./library.sh` の実行結果で失敗が出た場合も、末尾に `suggest:retry` または `suggest:refetch` が出る。

## 認証の前提

薄氷の内部起動は `scripts/claude-app.sh` を通す。
このラッパーは `ANTHROPIC_API_KEY` を無効化し、Claude App の Pro / Max 認証を優先するためのもの。

つまり、部員起動と図書室処理は API key 課金ではなく、Claude App 側で回す前提にそろえている。

## 図書室ノートの形

摩耶花の出力は感想ではなく、次に使える整理を優先する。

- `summary`
  - 何が書いてあるかを短くまとめる
- `tags`
  - 概念の精度を優先する
  - 固有名詞や定着語は英語のまま許す
  - 一般語は保存前に正規化辞書で寄せる
- `save_value`
  - なぜ残すかを 1 文で書く
- `use_case`
  - 「薄氷でどう使うか」を 1 文で書く
- `related_topics`
  - 周辺論点を 2-4 個で並べる
- `next_read`
  - 次に見に行く対象を 1-3 個で置く

X 由来の `excerpt` は長く残しすぎず、短い抜粋に圧縮して保存する。

## 基本導線

1. `./meeting.sh -c`
2. 必要なら `./request.sh "依頼本文"` で正式依頼を積む
3. `tmux attach -t noticeboard`
4. えるに背景や判断を補足する
5. 必要なら `tmux attach -t clubroom` で部室を見る
6. 途中で口を挟みたければ `./scripts/notify.sh ...`
7. 結論を受け取る
8. 必要なら `./meeting.sh -k`

## 補足

正式依頼の入口は `request.sh` である。
えるへの自然文は世界観のために残しつつ、入口の状態遷移は薄い CLI で安定させる。

図書室は `counter` として振る舞う。
まず `./library.sh add ...` でカウンターへ置き、摩耶花が `./library.sh` で整理する。
特に X は `URLだけ` より `URL + excerpt` の方が運用が安定する。
失敗したものは `./library.sh --failed` で見て、通常は `retry` で pending に戻してから再処理する。
本文自体を取り直したい時だけ `refetch` を使う。

補足:

- 図書室の進行骨格は `library.sh` が握る
- 摩耶花はタイトル・要約・タグ・保存価値・使いどころ・関連導線を返す整理役として振る舞う
- 保存や status 更新はスクリプト側で行う
- Zenn / Qiita / 公式 docs は摩耶花が直接読む対象
- X は人間が `excerpt` を添えてから摩耶花へ渡す
