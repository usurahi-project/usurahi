# 薄氷

薄氷（うすらひ）は、学園アニメ的な部活動の流れでソフトウェア開発を進めるプロジェクトです。

ユーザーは依頼を持ち込み、途中で判断を返し、最後に採用を決める人として関わります。える・ハルヒ・折木・キョン・長門は、その依頼を部として受け止め、議論し、実装し、結論を返します。

このプロジェクトで大事にしているのは、最短で答えを返すことではなく、部員たちの視点が混ざって「今の部としての結論」が生まれることです。

## 何ができるか

- 部活として依頼を受ける
- 黒板を見ながら会議を進める
- 実装後に活動記録を残す
- 良いやり方だけをバックナンバーとして育てる
- 図書室に記事やナレッジを取り込む

## はじめ方

### 1. 部活を起動する

```bash
./meeting.sh -c
```

これは、状態を初期化してから部活を起動する一番わかりやすい始め方です。

### 2. 正式依頼入口を使う

```bash
./request.sh "sample-project の TODO CLI を改善したいです。"
```

背景も一緒に渡せます。

```bash
./request.sh --request "sample-project の TODO CLI を改善したいです。" \
  --background "追加と一覧の流れが弱いです。"
```

これは `queue/room_requests.yaml` に正式依頼を積む入口です。

### 3. えるに話しかける

```bash
tmux attach -t noticeboard
```

ここで、えるの受け答えを見たり、必要なら背景を補足したりします。
`noticeboard` は会話窓口ではあるが、正式依頼の主線入口そのものではありません。

例:

```text
sample-project の TODO CLI を改善したいです。
いまは追加と一覧の流れが弱いので、使いやすくしたいです。
```

### 4. 部室を見る

```bash
tmux attach -t clubroom
```

部員たちのやり取りと、黒板の現在値を見られます。
現在の `clubroom` は 6 pane 構成です。

- ハルヒ
- 折木
- 黒板
- キョン
- える（部室表示）
- 長門

### 5. 必要なら途中で口を挟む

```bash
./scripts/notify.sh kyon "その運用リスクは気になる"
```

## よく使うコマンド

```bash
./meeting.sh -c   # 初期化して起動
./meeting.sh -a   # 最初から全員起動
./meeting.sh -w   # 後から部員を呼ぶ
./meeting.sh -k   # 終了
./request.sh "依頼本文"  # 正式依頼入口
./request.sh -l          # 正式依頼一覧
./library.sh    # 図書室の未処理URLを処理
./library.sh -l # 図書室キュー一覧
```

## 情報はどこに残るか

- 進行中の議論: `blackboard.md`
- 会議の内部状態: `queue/gijiroku.yaml`
- 正式依頼: `queue/room_requests.yaml`
- 活動記録: `activity-log/` と Obsidian の `薄氷/部室/活動記録/`
- バックナンバー: `archive/` と Obsidian の `薄氷/図書館/薄氷バックナンバー/`

## 文書案内

- 職員室の案内: [職員室 / 職員室の案内](./staffroom/overview.md)
- 詳しい使い方: [職員室 / 薄氷の使い方](./staffroom/how_to_use.md)
- 世界観と役割: [職員室 / 薄氷の世界観と役割](./staffroom/world_and_roles.md)
- 技術設計: [職員室 / 薄氷の技術設計](./staffroom/technical_design.md)
- 職員室の入口: [staffroom/README.md](./staffroom/README.md)

## 補足

いまは `request.sh` が正式依頼入口です。
えるへの自然文は世界観として残しつつ、状態遷移の入口は薄いCLIで安定させています。
