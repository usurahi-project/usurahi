# 薄氷の使い方

## 関連

- [README](../README.md)
- [職員室の案内](./usurahi_shokuinshitsu_annai.md)
- [薄氷の世界観と役割](./usurahi_world_and_roles.md)
- [薄氷の技術設計](./usurahi_technical_design.md)

## 何をするシステムか

薄氷は、ユーザーが部室に依頼を持ち込み、える・ハルヒ・折木・キョン・長門が部活として受け止め、結論と成果物を返すための運用システムである。

ユーザー体験は大きく3つある。

1. 部活を起動して、部室に入る
2. えるに依頼を持ち込んで、会議を進めてもらう
3. 必要なら図書室で記事や知識を取り込む

## 最初に打つコマンド

### 部活を起動する

```bash
./kaigi.sh
```

起きること:

- えるとハルヒが起動する
- `keijiban` セッションがえる用に立ち上がる
- `bushitsu` セッションが部室として立ち上がる

### まっさらな状態から始める

```bash
./kaigi.sh -c
```

起きること:

- キューを初期化する
- 黒板を初期状態に戻す
- その上で部活を起動する

### 最初から全員呼ぶ

```bash
./kaigi.sh -a
```

### 途中で部員を呼ぶ

```bash
./kaigi.sh -w
```

### 下校する

```bash
./kaigi.sh -k
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
tmux attach -t keijiban
```

ここでは、えるの受け答えを見たり、背景を補足したりする。

### 部室を覗く

```bash
tmux attach -t bushitsu
```

ここでは、部員たちのやり取りと黒板の現在値を見る。

## 途中で口を挟む

```bash
./scripts/renraku.sh <送信先> "<メッセージ>"
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
./toshoshitsu.sh
```

### 未処理URLを確認する

```bash
./toshoshitsu.sh -l
```

## 基本導線

1. `./kaigi.sh -c`
2. `tmux attach -t keijiban`
3. えるに依頼を自然文で話す
4. 必要なら `tmux attach -t bushitsu` で部室を見る
5. 途中で口を挟みたければ `./scripts/renraku.sh ...`
6. 結論を受け取る
7. 必要なら `./kaigi.sh -k`

## 補足

正式依頼の入口は `request.sh` である。
えるへの自然文は世界観のために残しつつ、入口の状態遷移は薄いCLIで安定させる。
