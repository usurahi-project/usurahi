# 受付UX

薄氷の初回入口は、機能別コマンドを覚えさせるのではなく、受付から選べる形にする。

## 方針

- 初めてなら `./usurahi.sh` だけ覚えればよい
- 既存の `/kaigi`、`/board`、`/library` は残す
- 受付は状態を持ちすぎず、既存スクリプトへ委譲する
- 進行中の会議がある時は「続きから見る」を自然に選べるようにする
- 非対話コマンドも用意し、テストと自動化で使えるようにする

## 入口

```bash
./usurahi.sh
```

受付の選択肢:

1. 会議を始める
2. 進行中の会議を見る
3. 掲示板に書く
4. 図書館に入れる
5. 状態を確認する

## 非対話コマンド

```bash
./usurahi.sh start
./usurahi.sh start --all
./usurahi.sh start --clean
./usurahi.sh room
./usurahi.sh status
./usurahi.sh board list
./usurahi.sh library list
./usurahi.sh stop
```

## 裏側

- 会議: `meeting.sh`
- 掲示板: `board.sh`
- 図書館: `ribrary.sh`
- 会議状態: `scripts/meeting-highlight.mjs --print`

受付は入口の認知負荷を下げるための薄い層であり、会議状態や図書館処理の本体にはならない。
