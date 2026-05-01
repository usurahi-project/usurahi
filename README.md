# 薄氷

> [!WARNING]
> このリポジトリは開発中です。想定どおり動作をしない箇所もあるため、Zenn の記事からアクセスされた方は「実装・動作の雰囲気を理解する」ために利用してもらえれば幸いです。

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

- OS: macOS
- アーキテクチャ: `arm64`
- CPU: Apple Silicon
- メモリ: 48 GB

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
- `OBSIDIAN_USURAHI_DIR`
  - 任意
  - Obsidian の保存先が `~/Documents/Obsidian Vault/薄氷` 以外なら指定する

配置場所について:

- リポジトリ自体は任意のディレクトリに clone してよい
- Obsidian 連携だけは `OBSIDIAN_USURAHI_DIR` で保存先を上書きできる

例:

```bash
export OBSIDIAN_USURAHI_DIR="$HOME/path/to/your/vault/薄氷"
```

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

### 会議

メインの入口は `/kaigi` です。
依頼を持ち込むと会議が始まり、部として結論を返します。

```text
/kaigi
したい依頼はなんですか？
> sample-project の TODO CLI を改善したいです。

背景やメモがあれば書いてください。なければこのまま始めます。
> 追加と一覧の流れが弱いです。
```

会議が始まると、進行は `clubroom` で見られます。

```bash
tmux attach -t clubroom
```

### 掲示板

`/board` はアイデアやメモの置き場です。
突発的に思いついたものや、次の議題に上げたいものを貼っておく場所で、学校の掲示板に近いイメージです。

```text
/board
貼る内容:
この論点はあとで見返したい
```

CLI で直接使うなら:

```bash
bash ./board.sh list
bash ./board.sh add "この論点はあとで見返したい"
```

### 図書館

`/library` はナレッジ置き場です。
記事や URL を取り込み、あとで参照できる形で残します。
その場で消えるメモではなく、後から読み返したい知識を置いておく場所です。

```text
/library
摩耶花「なに？」
1. 本を入れる
2. 入っている本を見る
3. 失敗した本を見る
...
```

CLI で直接使うなら:

```bash
bash ./ribrary.sh
bash ./ribrary.sh "https://zenn.dev/example/articles/abc"
```

図書室の入口と棚をまとめて整えたい時:

```bash
npm run library:maintain
```

摩耶花の定期整頓でやること:

- `図書館/開架` を再帰走査して `図書館/書架` を作り直す
- `図書館ダッシュボード` を更新する
- `library-shelves/` の fallback 棚も同期する
- `source` / `topic` 欠けや queue の `pending` / `failed` 件数を確認する
