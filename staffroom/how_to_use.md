# 薄氷の使い方

## 関連

- [README](../README.md)
- [職員室の案内](./overview.md)
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
./library.sh
./library.sh -l
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

### URLキューを処理する

```bash
./library.sh
```

### 未処理URLを確認する

```bash
./library.sh -l
```

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
