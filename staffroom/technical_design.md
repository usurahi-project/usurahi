# 薄氷の技術設計

## 関連

- [README](../README.md)
- [準備室の案内](./overview.md)
- [薄氷の使い方](./how_to_use.md)
- [薄氷の世界観と役割](./world_and_roles.md)

## 技術的に成立させたいこと

薄氷は、次の3つを同時に成立させる。

- 会議が進む
- 課題が解ける
- 学びが残る

## 入口の原則

流入口は複数あってよいが、正本は1つにする。

- 正式依頼の正本: `queue/room_requests.yaml`
- 図書室投入の正本: `queue/library_queue.yaml`
- 掲示板メモの正本: `queue/noticeboard.yaml`

外部入口はあっても、必ずこの正本に正規化してから進める。

- `request.sh` は正式依頼の主線入口
- `library.sh add` は図書室の主線入口
- Slack は主線ではなく、必要なら主線入口へ流し込むアダプタ
- `noticeboard` は雑多メモ置き場で、正式依頼の入口ではない

## 情報の流れ

1. 正式依頼は `room_requests.yaml` に入る
2. えるが依頼を受け、背景を確認する
3. `create_meeting` で `gijiroku.yaml` に会議状態を作る
4. 会議中は `update_meeting` で内部状態を更新する
5. `meeting.blackboard` から `blackboard.md` を自動反映する
6. 提出時は `respond_room_request` で正式依頼を閉じる
7. 同時に活動記録を自動保存する
8. 条件が揃った時だけ `create_archive_entry` でアーカイブ化する

図書室は別の流れを持つ。

1. `./library.sh add <url>` で `queue/library_queue.yaml` に入る
2. Zenn / Qiita / 公式 docs は URL のまま扱う
3. X投稿は `excerpt` を一緒に持てる
4. 必要なら追加時に API で本文取得を試みる
5. `./library.sh` が pending を読み、保存処理の骨格を進める
6. `save_to_obsidian` で Obsidian の図書館へ保存する

Slack など外部経路を残す場合も、図書室では即時処理しない。
`library.sh add` 相当の入力へ正規化してからカウンターへ積む。

## 図書室処理の責務分離

図書室では、人格と処理を分ける。

- スクリプトがやること
  - `library_queue.yaml` から pending を読む
  - 入力を正規化する
  - 長い `excerpt` を要約用に圧縮する
  - 保存先ノートを組み立てる
  - 保存と status 更新を行う
- 摩耶花がやること
  - タイトルを付ける
  - 短い要約を返す
  - タグを数個選ぶ
  - 保存価値を返す
  - 薄氷での使いどころを返す
  - 関連トピックと次に見るものを返す

摩耶花に処理全体を背負わせない。基幹フローはスクリプトが握る。

## Claude 認証方針

薄氷の内部起動は API key 課金を主線にしない。

- `meeting.sh`
- `scripts/notify.sh`
- `scripts/library-run.mjs`

これらが Claude Code を呼ぶ時は、`scripts/claude-app.sh` を経由する。

`scripts/claude-app.sh` の責務:

- `ANTHROPIC_API_KEY` を環境から外す
- Claude App の Pro / Max 認証を優先させる

この方針により、部会と図書室は Claude App の契約枠で動かし、API key 残高に引きずられないようにする。

### 摩耶花の最小出力

摩耶花には次の項目を求める。

- `title`
- `summary`
- `tags`
- `use_case`
- `related_topics`
- `save_value`
- `next_read`

必要なら補助的に `highlights` を持てる。

### 図書室の棚語彙

`related_topics` と `next_read` は自由生成にしない。
棚として辿れることを優先し、候補語彙から選ばせる。

- `related_topics`
  - テーマの近さを書く
  - タグより一段広い概念にする
  - 候補:
    - `長期運用`
    - `セッション管理`
    - `コンテキスト管理`
    - `分割実行`
    - `エージェント協調`
    - `品質維持`
    - `役割分担`
    - `フロー設計`
    - `スキル設計`
    - `依存整理`
    - `判断基準`
    - `知識整理`
- `next_read`
  - 次に読むべき概念を書く
  - 具体記事名ではなく抽象名にする
  - 候補:
    - `失敗復帰`
    - `継続判断`
    - `分割実行`
    - `エージェント協調`
    - `コンテキスト管理`
    - `フロー設計`
    - `スキル設計`
    - `依存整理`
    - `判断基準`
    - `知識整理`

### 入力サイズの原則

- `excerpt` をそのまま全文渡さない
- 要約入力は必要な長さまで圧縮する
- 1件ずつ deterministic に処理する

### ソース種別ごとの扱い

- `zenn.dev`
  - URL のまま摩耶花に渡してよい
- `qiita.com`
  - URL のまま摩耶花に渡してよい
- 公式 docs
  - URL のまま摩耶花に渡してよい
- `x.com`
  - 生URLだけでは渡さない
  - 人間が `excerpt` を添えてから摩耶花に渡す

## 進行原則

### 依頼者確認フェーズと部室共有フェーズを分ける

依頼者判断が必要な論点は、えるが先に相手へ確認し切る。

進行順:

1. えるが論点を依頼を持ち込んだ相手へ確認する
2. その返答を受けて、論点を確定させる
3. 論点が確定してから、ハルヒや他の部員へ共有する

この順番にする理由:

- 未確定の論点を部室に流さないため
- えるが `依頼者入力待ち` と `部員返答待ち` を同時に抱えないため
- ハルヒや他の部員が、確定済みの前提で考えられるようにするため

つまり、

- `依頼者確認フェーズ`
- `部室共有フェーズ`

は重ねない。

## 主要ファイル

- `queue/room_requests.yaml`
  正式依頼の入口
- `queue/gijiroku.yaml`
  会議の内部状態
- `blackboard.md`
  人間向けの現在値
- `queue/tasks/*.yaml`
  部員ごとの担当タスク
- `queue/reports/*_report.yaml`
  部員ごとの作業報告
- `activity-log/`
  活動記録
- `archive/`
  再利用パターン
- `queue/library_queue.yaml`
  図書室カウンター

### library_queue の最小状態

図書室キューは、単なる URL 一覧ではなく独立パイプラインの状態を持つ。

- `status`
  - `pending / done / failed`
- `stage`
  - `queued / fetch / normalize / summarize / save / done`
- `fetched_text`
  - 記事本文の取得結果
- `normalized_text`
  - 摩耶花へ渡す前の整形済み入力
- `draft`
  - `title / summary / tags / save_value / use_case / related_topics / next_read`
- `error`
  - `stage / message / at`

運用上は `failed` を終端にしない。
失敗した入力は `retry` で `pending + queued` に戻せるようにしておく。

- `retry`
  - `fetched_text` を残す
  - `normalized_text / draft / error` を消す
  - 要約失敗や保存失敗の再実行に使う
- `refetch`
  - `fetched_text` も捨てる
  - 外部ページ更新や取得不良の時だけ使う

## 会議状態

会議状態は `why / how / what / revision / blackboard / log` を持つ。

### why

- 依頼本文
- 背景
- 動機
- 依頼者意図
- 成功条件

### how

- 論点
- 懸念
- 案
- 進め方
- タスク分解
- 割り当て
- 可否
- 決まったこと
- 保留
- 完了

### what

- 結論
- 理由
- 成果物
- 提出内容

## 黒板

黒板は読み物ではなく現在値である。
常に1枚だけ存在し、進行中の依頼だけを表示する。

表示項目:

- 依頼
- 背景
- 論点
- 懸念
- タスク
- 決まったこと
- 保留
- 完了
- 今の部としての結論
- 提出

## 活動記録

提出完了時に自動生成する。

入力:

- `gijiroku.yaml`
- 黒板の最終状態
- 各部員の報告

出力先:

- `activity-log/`
- `薄氷/部室/活動記録/`

## アーカイブ

アーカイブは活動記録の圧縮版ではない。
活動記録から抽出した「次も使いたいやり方」である。

作成条件:

- ハルヒが面白いと感じる
- えるが次に使えると判断する

両方そろった時だけ生成する。

## 今の強み

- 世界観と内部状態がつながっている
- 黒板が自動反映される
- 提出と活動記録保存がつながっている
- 学びをアーカイブへ昇華できる

## 今後の拡張候補

- 専用の依頼CLI
- 準備室ノートの Obsidian 自動保存
- アーカイブから skill / instruction への昇格フローの明文化

## 外部連携

- `X_BEARER_TOKEN`
  任意。X投稿を図書室へ取り込む時の補助用 Bearer Token。主線は `excerpt` 運用
