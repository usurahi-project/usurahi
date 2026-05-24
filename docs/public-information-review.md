# 公開情報レビュー

公開リポジトリとして見る時の確認メモ。

## 現時点の結論

- 実シークレットそのものは確認されていない
- `.env.example` はダミー値で構成されている
- Obsidian Vault 連携は機能仕様として公開されている
- `--dangerously-skip-permissions` は環境変数で明示した時だけ使う設計になっている

## 公開してよいもの

- プロジェクトの思想、役割、会話状態の仕様
- サンプルの環境変数名
- Obsidian Vault 連携の保存先仕様
- tmux / MCP / dashboard の使い方
- 失敗を fixture 化する運用

## 公開しないもの

- 実トークン、API key、Slack app token
- 個人のprivate Obsidian note本文
- 実在のprivate workspaceに固有の判断履歴
- local machine 固有の絶対パス
- 未許可の外部サービス設定値

## 監査コマンド

```bash
rg -n "(/Users/|Obsidian Vault|token|secret|password|apikey|api_key|bearer|\\.env)" \
  -S \
  --glob '!node_modules/**' \
  --glob '!dashboard/node_modules/**' \
  --glob '!package-lock.json' \
  --glob '!dashboard/package-lock.json'
```

このコマンドは候補を出すだけです。
`Obsidian Vault` や環境変数名のように、仕様として必要な語も検出されます。
