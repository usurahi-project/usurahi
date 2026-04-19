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

## 実行環境

確認できている環境の目安:

- OS: macOS 26.3.1 (build `25D771280a`)
- マシン: MacBook Pro (`Mac16,8`)
- CPU: Apple M4 Pro
- コア数: 12 cores (`8 Performance + 4 Efficiency`)
- メモリ: 48 GB
- アーキテクチャ: `arm64`

前提ツール:

- `git`
- `node` / `npm`
- `tmux`
- `claude` (Claude Code CLI)
- `gum` は任意
  - なくても動くが、`meeting.sh` や `library.sh` の表示は簡素になる

想定している Node / npm:

- `node`: `v24.3.0`
- `npm`: `11.4.2`

### 必要なツール

最低限、次が通る状態にしておく。

```bash
git --version
node --version
npm --version
tmux -V
claude --version
```

macOS + Homebrew の例:

```bash
brew install node tmux gum
```

`claude` は別途インストールし、ログインも済ませておく。
内部では [`scripts/claude-app.sh`](./scripts/claude-app.sh) を通して `claude` を呼ぶ。
これは `ANTHROPIC_API_KEY` を外し、Claude App の Pro / Max 認証を優先するためのもの。

## セットアップ

### 1. clone する

```bash
git clone <repo-url>
cd usurahi
```

### 2. 依存を入れる

```bash
npm install
```

### 3. 必要なら環境変数を置く

```bash
cp .env.example .env
```

`.env` は必須ではない。
ただし Slack bridge や X 取得補助を使うなら設定する。

- `X_BEARER_TOKEN`
  - 任意
  - X URL を `excerpt` なしで補助取得したい時だけ使う

### 4. Claude / Codex 側で skill を使える状態にする

`/kaigi` `/board` `/library` を使える状態で始める。
必要なら skill の再読込やセッション再起動を行う。

## 使い始め

セットアップが終わったら、普段の入口は skill / slash command 側を使う。
主線は次の3つ。

- `/kaigi`
- `/board`
- `/library`

## 最初の1件を流す

最短で試すなら次の流れ。

1. `/kaigi` を開く
2. 依頼内容を入れる
3. 必要なら背景を入れる
4. 部会が始まる
5. `clubroom` で進行を見る

イメージ:

```text
/kaigi
したい依頼はなんですか？
> sample-project の TODO CLI を改善したいです。

背景やメモがあれば書いてください。なければこのまま始めます。
> 追加と一覧の流れが弱いです。
```

backend の動作確認を直接やりたい時は、次でも同じ流れを試せる。

```bash
bash ./kaigi.sh --request "sample-project の TODO CLI を改善したいです。" \
  --background "追加と一覧の流れが弱いです。"
```

起きること:

- 必要なら backend 側で部会が起動する
- 正式依頼が `queue/room_requests.yaml` に積まれる
- 必要なら掲示板にも共有される
- 最後に `clubroom` へ入る

backend で部室に入りたくない時は `--no-attach` を付ける。

```bash
bash ./kaigi.sh --request "sample-project の TODO CLI を改善したいです。" \
  --background "追加と一覧の流れが弱いです。" \
  --no-attach
```

### 途中経過を見る

```bash
tmux attach -t clubroom
```

部員たちのやり取りと、黒板の現在値を見られる。
現在の `clubroom` は 6 pane 構成。

- ハルヒ
- 折木
- 黒板
- キョン
- える（部室表示）
- 長門

### 掲示板を触る

掲示板は「話す場所」ではなく、「貼る / 見る」場所。

主線:

1. `/board`
2. メモを貼る、または貼られた内容を見る

イメージ:

```text
/board
貼る内容:
この論点はあとで見返したい
```

backend を直接使うなら次。

一覧:

```bash
bash ./board.sh list
```

貼る:

```bash
bash ./board.sh add "この論点はあとで見返したい"
```

### 図書室に本を入れる

主線:

1. `/library`
2. 摩耶花の受付に入る
3. 「本を入れる」を選ぶ
4. URL と必要ならメモを渡す

イメージ:

```text
/library
摩耶花「なに？」
1. 本を入れる
2. 入っている本を見る
3. 失敗した本を見る
...
```

backend を直接使うなら次。

摩耶花の受付から始める:

```bash
bash ./ribrary.sh
```

URL をそのまま渡す:

```bash
bash ./ribrary.sh "https://zenn.dev/example/articles/abc"
```

起きること:

- 摩耶花が次アクションを聞く
- 主線は「本を入れる」
- 必要ならメモ、保存意図、X の抜粋を聞く
- 実処理は `library.sh` が担当する

## 旧入口と backend

通常は `/kaigi` `/board` `/library` を表の入口として使う。
次はその backend / 実装入口。

- `bash ./kaigi.sh`
- `bash ./board.sh`
- `bash ./ribrary.sh`

従来の backend / 運用入口もそのまま残している。

- `./meeting.sh`
- `./request.sh`
- `./library.sh`
- `./scripts/notify.sh`

手で backend を起動したい時だけ、次を使う。

```bash
./meeting.sh -a
```

これは `noticeboard` と `clubroom` の tmux セッションを作り、部員を最初から起動する運用コマンド。

正式依頼だけを直接積みたい時は、今でも `request.sh` を使える。

```text
./request.sh "sample-project の TODO CLI を改善したいです。"
./request.sh --request "sample-project の TODO CLI を改善したいです。" --background "追加と一覧の流れが弱いです。"
```

必要なら途中で口を挟む:

```bash
./scripts/notify.sh kyon "その運用リスクは気になる"
```

## よく使うコマンド

```bash
./meeting.sh -a                                   # 最初から全員起動
./meeting.sh -c                                   # 初期化して起動
./meeting.sh -w                                   # 後から部員を呼ぶ
./meeting.sh -k                                   # 終了
bash ./kaigi.sh                                   # 依頼を持ち込んで部会を始める
bash ./kaigi.sh "依頼本文"                        # 引数付きで依頼する
bash ./board.sh list                              # 掲示板を見る
bash ./board.sh add "メモ本文"                    # 掲示板に貼る
bash ./ribrary.sh                                 # 摩耶花の受付から図書室を触る
bash ./ribrary.sh <url>                           # URL を本として入れる
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
| `staffroom/` | `準備室/` | 使い方、設計、役割などの共有資料 |
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

- 準備室の案内: [準備室 / 準備室の案内](./staffroom/overview.md)
- 詳しい使い方: [準備室 / 薄氷の使い方](./staffroom/how_to_use.md)
- 世界観と役割: [準備室 / 薄氷の世界観と役割](./staffroom/world_and_roles.md)
- 技術設計: [準備室 / 薄氷の技術設計](./staffroom/technical_design.md)
- 準備室の入口: [staffroom/README.md](./staffroom/README.md)

## 補足

いまは、表の入口を `kaigi / board / library` に寄せつつ、backend として `kaigi.sh / board.sh / ribrary.sh / request.sh / library.sh / meeting.sh` を残している。
世界観の入口と、状態遷移の安定した入口を分けるためである。

図書室は `add -> list -> run -> retry/refetch` の流れで回せます。
Zenn / Qiita / 公式 docs は URL のまま主線に乗せられます。
X 投稿は `URL + excerpt` を主線にしておくと、課金なしでも安定して回せます。
`X_BEARER_TOKEN` は任意の補助機能です。

- `retry`: 取得済み本文は残し、要約だけやり直す
- `refetch`: 取得済み本文も捨てて、材料から取り直す

入口は複数に見えても、主線は絞っている。

- 部会開始: `/kaigi`
- 掲示板: `/board`
- 図書室受付: `/library`
- `noticeboard` はメモ置き場であり、会話窓口ではない
- Slack を使う場合も、主線入口へ流し込む補助経路として扱います

図書室では、摩耶花に処理全体を背負わせません。
`library.sh` が進行と保存を握り、摩耶花はタイトル・要約・タグ・一言に集中します。
摩耶花は `clubroom` の部員ではなく、`library` の独立オペレータです。

内部で Claude Code を呼ぶ時は、`scripts/claude-app.sh` を経由します。
これは `ANTHROPIC_API_KEY` を無効化して、Claude App の Pro / Max 認証を優先するためです。
