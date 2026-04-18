# 薄氷 命名対応表

## 目的

薄氷の内部実装で残っているローマ字・和名ベースの名前を、英単語へ統一するための対応表。
この文書を基準に、tmux セッション名、スクリプト名、ファイル名、queue 名、MCP ツール名を順に揃える。

## 方針

- 表の世界観はそのまま保つ
- 裏の実装名は英単語に統一する
- 似た概念は同じ語幹で揃える
- 入口、会議、保存先、図書館の流れが読み取れる名前を優先する

## 命名対応

| 旧名 | 新名 | 用途 |
|------|------|------|
| `noticeboard` | `noticeboard` | 掲示板系全般、受付窓口、雑多メモ |
| `clubroom` | `clubroom` | 部員が集まる会議の場 |
| `blackboard.md` | `blackboard.md` | 会議の現在値を表す共有面 |
| `nisshi/` | `activity-log/` | 完了した依頼の活動記録 |
| `backnumber/` | `archive/` | 再利用可能な知見の保管先 |
| `meeting.sh` | `meeting.sh` | 部活起動・召集・終了の入口 |
| `renraku.sh` | `notify.sh` | 部員への通知 |
| `library.sh` | `library.sh` | 図書館系の処理入口 |

## tmux / スクリプト

| 旧名 | 新名 |
|------|------|
| `noticeboard` session | `noticeboard` session |
| `clubroom` session | `clubroom` session |
| `meeting.sh` | `meeting.sh` |
| `renraku.sh` | `notify.sh` |
| `library.sh` | `library.sh` |

## Queue / ファイル

| 旧名 | 新名 |
|------|------|
| `queue/noticeboard.yaml` | `queue/noticeboard.yaml` |
| `queue/toshoshitsu_queue.yaml` | `queue/library_queue.yaml` |
| `blackboard.md` | `blackboard.md` |
| `nisshi/` | `activity-log/` |
| `backnumber/` | `archive/` |

## MCP / 内部キー

| 旧名 | 新名 |
|------|------|
| `add_to_toshoshitsu_queue` | `add_to_library_queue` |
| `get_toshoshitsu_queue` | `get_library_queue` |
| `update_toshoshitsu_queue` | `update_library_queue` |
| `create_backnumber` | `create_archive_entry` |
| `backnumber` | `archive` |
| `nisshi` | `activity_log` |

## 実装順

1. tmux セッション名とスクリプト名を変更する
2. queue とファイル名を変更する
3. MCP ツール名と内部キーを変更する
4. README と職員室文書を追従させる
5. 必要なら旧名互換を削除する
