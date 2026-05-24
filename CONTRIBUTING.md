# Contributing

薄氷への改善提案やPRは歓迎します。
ただし、このリポジトリは会話型の部活運用そのものを扱うため、単にコードが動くことだけではなく、会話状態・安全性・公開情報の扱いを重視します。

## Before opening a PR

- `npm run typecheck` が通る
- `npm test` が通る
- UIを触った場合は `npm --prefix dashboard run build` または `npm run dashboard:e2e` を確認する
- 会話の進行を触った場合は liveness test か fixture を追加する
- 秘密情報、個人用パス、private Obsidian note を含めない

## Development commands

```bash
npm install
npm run typecheck
npm test
npm run meeting:liveness
```

Dashboard:

```bash
npm --prefix dashboard ci
npm --prefix dashboard run build
npm run dashboard:e2e
```

## Conversation changes

会話が止まる失敗は、自然文の印象ではなく状態として扱います。

- `phase`
- `progress.owner`
- `progress.waiting_for`
- `progress.next_action`
- `progress.completion_check`
- `meeting.log.updated_at`

新しい失敗パターンを見つけた場合は、まず `conversation-failures/README.md` に記録し、再現できるものは `fixtures/conversations/` に追加してください。

## Dependency updates

Dependabot PRは自動で作られます。
patch/minor updateでも、CIが通っていることを確認してからマージします。
major updateやCI failureは、変更点と失敗理由を読んでから扱います。

## Security

脆弱性は公開Issueに書かず、GitHub Private Vulnerability Reportingを使ってください。
詳細は `SECURITY.md` を参照してください。
