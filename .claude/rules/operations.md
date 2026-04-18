# Operations Rules

## キュー操作

キュー操作は MCP ツール `usurahi-queue` を使う。
YAML を直接編集しない。

## 正式依頼

- 正式依頼の入口: `room_requests.yaml`
- 掲示板: `keijiban.yaml`
- 掲示板は正式依頼の入口ではない

## 連絡

```bash
~/usurahi/scripts/renraku.sh <送信先> "<メッセージ>"
```

送信先:

- `eru`
- `haruhi`
- `oreki`
- `kyon`
- `nagato`

メッセージは簡潔にする。

## 実作業

- 実装・編集は `project_path` 内で行う
- `~/usurahi/` はシステムファイル

## ナレッジ

- `backnumber`: 図書館/薄氷バックナンバー/
- `nisshi`: 部室/活動記録/
- `library`: 図書館/開架/
