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

## 使い方

### 依頼する

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

起きること:

- 部会が始まる
- 進行は `clubroom` で見られる
- 必要なら途中で判断や補足を返せる

### 進行を見る

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

### 掲示板を使う

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

一覧:

```bash
bash ./board.sh list
```

貼る:

```bash
bash ./board.sh add "この論点はあとで見返したい"
```

### 図書室を使う

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

## 補助コマンド

```bash
./meeting.sh -a                                   # 部活を起動する
./meeting.sh -k                                   # 終了する
tmux attach -t clubroom                           # 部室を見る
bash ./board.sh list                              # 掲示板を見る
bash ./board.sh add "メモ本文"                    # 掲示板に貼る
bash ./ribrary.sh                                 # 摩耶花の受付から図書室を使う
bash ./ribrary.sh <url>                           # URL を本として入れる
```

## さらに知りたい時

- 詳しい使い方: [準備室 / 薄氷の使い方](./staffroom/how_to_use.md)
- 世界観と役割: [準備室 / 薄氷の世界観と役割](./staffroom/world_and_roles.md)
- 技術設計: [準備室 / 薄氷の技術設計](./staffroom/technical_design.md)
- 準備室の入口: [staffroom/README.md](./staffroom/README.md)
