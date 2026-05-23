# 薄氷

> [!WARNING]
> このリポジトリは開発中です。想定どおり動作をしない箇所もあるため、Zenn の記事からアクセスされた方は「実装・動作の雰囲気を理解する」ために利用してもらえれば幸いです。

薄氷（うすらひ）は、学園アニメ的な部活動の流れでソフトウェア開発を進めるプロジェクトです。

ユーザーは依頼を持ち込み、途中で判断を返し、最後に採用を決める人として関わります。える・ハルヒ・折木・キョン・長門は、その依頼を部として受け止め、議論し、実装し、結論を返します。

このプロジェクトで大事にしているのは、最短で答えを返すことではなく、部員たちの視点が混ざって「今の部としての結論」が生まれることです。

加えて、薄氷そのものも学校生活の中で育てていく。
困りごとを自分たちで見つけ、必要なら校則や新しい教室や機能として実装してよい、という前提を置く。
この方針は [usurahi_school_life_vision.md](./usurahi_school_life_vision.md) と [security_and_autonomy.md](./security_and_autonomy.md) にまとめてある。

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

Claude Code の permission bypass はデフォルトでは使わない。
ローカル検証用に明示して使う場合だけ、次を設定する。

```bash
export USURAHI_DANGEROUS_SKIP_PERMISSIONS=1
```

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

## 開発時の確認

TypeScript 側の型と会話契約は次で確認する。

```bash
npm run typecheck
npm test
```

`npm test` では、図書室キューの挙動に加えて、ペルソナの役割境界や安全側のデフォルトも検査する。

### 自動運転

学校生活を止めずに回したいなら、先に autopilot を上げる。

```bash
npm run autopilot:start
```

状態確認と停止:

```bash
npm run autopilot:status
npm run autopilot:stop
```

autopilot がやること:

- `noticeboard` / `clubroom` が落ちていたら `meeting.sh -a` で立ち上げ直す
- 図書館キューに `pending` があれば `library.sh` を裏で起動する
- `school-cycle` を回して、掲示板巡回・AI記事巡回・摩耶花の図書室整頓を間欠実行する

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
3. 詰まった本の履歴を見る
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
- `source` / `topic` 欠けや queue の `pending` / `failed履歴` 件数を確認する

### 学校運営ダッシュボード

職員室には、学校の状態を見る運営盤がある。
React + Vite で作った静的 UI を Obsidian Vault 側へ出力して使う。

```bash
npm run school:status
npm run dashboard:build
```

- `school:status`
  - 運営状態の JSON を更新する
- `dashboard:build`
  - UI を build して `薄氷/職員室/dashboard/` に出力する

### 学校巡回

学校生活を自律運用する巡回役は 2 つある。

- `board-scout`
  - 掲示板や図書館や校則の状態を見て、改善候補を掲示板へ起票する
- `school-watch`
  - 許可した外部ソースだけを巡回し、図書館へ入れる候補をキューに積む

手動で回すなら:

```bash
npm run school:cycle
npm run school:watch
```

外部巡回の方針:

- allowlist に入っているドメインだけを見る
- `school-watch` は明示的にネットワーク許可された時だけ外へ出る
- 見つけた記事は直接実装に使わず、まず図書館キューへ送る
