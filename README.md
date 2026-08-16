# 薄氷

> [!WARNING]
> このリポジトリは開発中です。想定どおり動作しない箇所があります。

薄氷（うすらひ）は、学園アニメ的な部活動の流れでソフトウェア開発を進めるプロジェクトです。

ユーザーが依頼を持ち込み、える・ハルヒ・折木・キョン・長門が部として受け止め、議論し、実装し、結論を返します。
大事にしているのは、最短回答ではなく、複数の視点が混ざって「今の部としての結論」が生まれることです。

## できること

- `/kaigi`: 依頼を部活として受け、会議を進める
- `/board`: アイデアや論点を掲示板に残す
- `/library`: 記事やナレッジを図書館に取り込む
- `clubroom`: herdr の部室で会議の状態を見る
- `dashboard`: 学校運営の状態を見る

## セットアップ

必要なもの:

- `git`
- `node` / `npm`
- `herdr` 0.7.5 以降（`brew install herdr`）
- `claude` (Claude Code CLI)
- `gum` は任意

部員の状態（作業中・返答済み・承認待ち）を薄氷から見えるようにするため、
herdr の Claude Code 連携を一度だけ入れておく。

```bash
herdr integration install claude
```

```bash
git clone <repo-url>
cd usurahi
npm install
```

`claude` は別途インストールし、ログインしておく。
Obsidian の保存先を変える場合だけ、次を設定する。

```bash
export OBSIDIAN_USURAHI_DIR="$HOME/path/to/your/vault/薄氷"
```

## 使い方

普段の入口はこの3つです。

```bash
./usurahi.sh
```

受付から、会議・掲示板・図書館・状態確認へ進めます。
初めてなら、先にチュートリアルを見る。

```bash
./usurahi.sh tutorial
```

既存の入口を直接使うなら:

```text
/kaigi
/board
/library
```

会議の状態を見る:

```bash
./usurahi.sh clubroom
```

会話のボールを持っている人は、部室で `● 名前` として表示されます。

CLI から直接使う:

```bash
bash ./usurahi.sh status
bash ./meeting.sh
bash ./board.sh list
bash ./ribrary.sh
```

## 開発

型とテスト:

```bash
npm run typecheck
npm test
```

会議が止まっていないかを見る:

```bash
npm run meeting:liveness
```

ダッシュボードを作る:

```bash
npm run dashboard:build
```

自動運転:

```bash
npm run autopilot:start
npm run autopilot:status
npm run autopilot:stop
```

## 会話品質

会話が止まる失敗は、感想で終わらせず fixture とテストにします。

- 記録: [conversation-failures/README.md](./conversation-failures/README.md)
- fixture: [fixtures/conversations/](./fixtures/conversations/)
- テスト: [test/conversation_fixtures.test.ts](./test/conversation_fixtures.test.ts)
- 校則: [school-rules/0006-会話の失敗はfixtureに昇格する.md](./school-rules/0006-会話の失敗はfixtureに昇格する.md)

## 詳細

- 全体像: [usurahi_school_life_vision.md](./usurahi_school_life_vision.md)
- チュートリアル: [docs/tutorial.md](./docs/tutorial.md)
- 使い方の流れ: [usage_flow.md](./usage_flow.md)
- 受付UX設計: [docs/reception-ux.md](./docs/reception-ux.md)
- 設計の土台: [usurahi_design_foundation.md](./usurahi_design_foundation.md)
- セキュリティと自律性: [security_and_autonomy.md](./security_and_autonomy.md)
- 公開前チェックリスト: [docs/publication-checklist.md](./docs/publication-checklist.md)
- 公開情報レビュー: [docs/public-information-review.md](./docs/public-information-review.md)
- コントリビューション: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 校則: [school-rules/README.md](./school-rules/README.md)
