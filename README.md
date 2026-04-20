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

## Slack 連携

図書室には Slack Bridge があり、Slack からの入力を `library.sh add` に正規化して流し込めます。
Slack は主線そのものではなく、図書室カウンターへの補助入口として扱います。

### できること

- URL つきメッセージに `:tosyositsu:` リアクションを付けて投入
- `@薄氷図書室 <url>` で URL を投入
- `@薄氷図書室 TypeScript 調べて` で Obsidian 内のナレッジ検索

### 事前準備

1. `.env.example` を `.env` にコピーする
2. Slack App を作る
3. Bot Token と App-Level Token を `.env` に入れる
4. 図書室を使うチャンネル ID を `.env` の `SLACK_CHANNEL_ID` に入れる
5. 必要ならリアクション絵文字名を `TRIGGER_EMOJI` で変える

```bash
cp .env.example .env
```

`.env` の最低限はこれです。

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_CHANNEL_ID=C0123456789
TRIGGER_EMOJI=tosyositsu
```

### Slack App 側の設定

- Socket Mode: 有効
- Event Subscriptions: `app_mention`, `reaction_added`
- Bot Token Scopes: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `reactions:read`

使うチャンネルが private channel の場合は、対応する履歴参照スコープと、そのチャンネルへの bot 招待も必要です。

### 起動

```bash
npm run slack:bridge
```

起動後の入口は次です。

- `:tosyositsu:` を URL つき投稿に付ける
- `@薄氷図書室 https://example.com/article`
- `@薄氷図書室 TypeScript 調べて`

X 投稿は Slack からは主線に乗せません。これは既存設計どおりで、`./library.sh add <x-url> --excerpt "抜粋本文"` を使います。
