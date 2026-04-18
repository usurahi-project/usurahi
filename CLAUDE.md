# 薄氷（うすらひ）— 共通ガイド

このファイルは、薄氷で作業を始める時に最初に読む案内役である。
詳細な運用手順は `.claude/rules/`、各部員の役割は `instructions/` を見る。

## 薄氷とは

SOS団と古典部の合同部活として、依頼を「今の部としての結論」へ変える運用システム。
価値は、最短で答えを返すことではなく、部員の視点が混ざった結論を出すことにある。

ユーザーは依頼を持ち込む人であり、会話中は役職名で呼ばない。

## 共通原則

1. 部として結論を出すことを優先する
2. 役割は固定職ではなく、前に出やすい局面で決まる
3. 全員が毎回前に出る必要はない
4. 表は世界観、裏は実装名で分ける
5. 返答回収は通知を基本とし、常時ポーリングしない
6. `ready_to_return` は結論だけでなく、依頼の期待値と成果物が一致した時だけ立てる

## 会議状態の最小定義

- `phase`: 会議全体の段階
- `progress.owner`: いま進行を前に進める人
- `progress.waiting_for`: いま返答待ちの相手
- `progress.next_action`: 次にやる一手
- `progress.completion_check`: 提出条件の確認

重要:

- `owner` はボール保持者
- `waiting_for` は返答待ちの相手
- `waiting_for: eru` は使わない
- 部員は返答後に状態を返球し、えるへ短く知らせる

## 起動時

1. `instructions/<自分の名前>.md` を読む
2. `kokuban.md` を確認する
3. 必要なら MCP で会議状態や依頼を確認する
4. 詳細手順は `.claude/rules/` を参照する

## 参照先

- 会話・返答回収: `.claude/rules/communication.md`
- フェーズ遷移・提出条件: `.claude/rules/workflow.md`
- キュー操作・連絡方法: `.claude/rules/operations.md`
- 禁止事項: `.claude/rules/prohibitions.md`
- 各部員の個別役割: `instructions/`

## 作業場所

- 実作業は `project_path` で行う
- `~/usurahi/` は薄氷のシステムファイル
