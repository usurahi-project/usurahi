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
./meeting.sh -c                                   # 初期化して起動
./meeting.sh -a                                   # 最初から全員起動
./meeting.sh -w                                   # 後から部員を呼ぶ
./meeting.sh -k                                   # 終了
./request.sh "依頼本文"                           # 正式依頼入口
./request.sh -l                                   # 正式依頼一覧
./library.sh add <url> --note "ひとこと"          # 図書室カウンターへ追加
./library.sh add <x-url> --excerpt "抜粋本文"     # X投稿を非課金で追加
./library.sh                                      # 図書室の未処理URLを処理
./library.sh -l                                   # 図書室キュー一覧
./library.sh --failed                             # 失敗したURL一覧
./library.sh retry --failed                       # 失敗したURLを再試行へ戻す
./library.sh refetch --failed                     # 失敗したURLを再取得前提で戻す
```

## 情報はどこに残るか

- 進行中の議論: `blackboard.md`
- 会議の内部状態: `queue/gijiroku.yaml`
- 正式依頼: `queue/room_requests.yaml`
- 活動記録: `activity-log/` と Obsidian の `薄氷/部室/活動記録/`
- バックナンバー: `archive/` と Obsidian の `薄氷/図書館/薄氷バックナンバー/`

## Repo と Obsidian の対応

薄氷には 2 つの空間があります。

- repo 側: 実装と運用を動かすための構造
- Obsidian 側: 人が理解しやすいように世界観で整理した構造

完全に同じ名前にする必要はありません。  
大事なのは `名前` ではなく `役割` が対応していることです。

| repo 側 | Obsidian 側 | 役割 |
| --- | --- | --- |
| `staffroom/` | `職員室/` | 使い方、設計、役割などの共有資料 |
| `queue/room_requests.yaml` | `部室` まわりの依頼導線 | 正式依頼の入口 |
| `blackboard.md` | `黒板` | 進行中の現在地 |
| `queue/library_queue.yaml` / `library.sh` | `図書館/` | ナレッジの投入と整理 |
| `noticeboard` / `queue/noticeboard.yaml` | `掲示板/` | 雑多メモや一次情報 |
| `activity-log/` | `部室/活動記録/` | 活動の記録 |
| `archive/` | `図書館/薄氷バックナンバー/` | 再利用する知見の保存 |

基本ルールは次のとおりです。

- repo は、初見の人が役割を読める名前を優先する
- Obsidian は、人が思い出しやすい世界観の名前を優先する
- 配布物としての骨格は repo に置き、体験としての表札は Obsidian に置く

## 文書案内

- 職員室の案内: [職員室 / 職員室の案内](./staffroom/overview.md)
- 詳しい使い方: [職員室 / 薄氷の使い方](./staffroom/how_to_use.md)
- 世界観と役割: [職員室 / 薄氷の世界観と役割](./staffroom/world_and_roles.md)
- 技術設計: [職員室 / 薄氷の技術設計](./staffroom/technical_design.md)
- 職員室の入口: [staffroom/README.md](./staffroom/README.md)

## 補足

いまは `request.sh` が正式依頼入口です。
えるへの自然文は世界観として残しつつ、状態遷移の入口は薄いCLIで安定させています。

図書室は `add -> list -> run -> retry/refetch` の流れで回せます。
Zenn / Qiita / 公式 docs は URL のまま主線に乗せられます。
X 投稿は `URL + excerpt` を主線にしておくと、課金なしでも安定して回せます。
`X_BEARER_TOKEN` は任意の補助機能です。

- `retry`: 取得済み本文は残し、要約だけやり直す
- `refetch`: 取得済み本文も捨てて、材料から取り直す

入口は複数に見えても、主線は絞っています。

- 正式依頼: `./request.sh`
- 図書室投入: `./library.sh add`
- `noticeboard` はメモ置き場で、正式依頼入口ではない
- Slack を使う場合も、主線入口へ流し込む補助経路として扱います

図書室では、摩耶花に処理全体を背負わせません。
`library.sh` が進行と保存を握り、摩耶花はタイトル・要約・タグ・一言に集中します。
摩耶花は `clubroom` の部員ではなく、`library` の独立オペレータです。

内部で Claude Code を呼ぶ時は、`scripts/claude-app.sh` を経由します。
これは `ANTHROPIC_API_KEY` を無効化して、Claude App の Pro / Max 認証を優先するためです。
