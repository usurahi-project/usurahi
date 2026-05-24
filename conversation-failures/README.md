# 会話失敗台帳

ここは、会話が止まった・ボールが返らなかった・部員間の受け渡しが曖昧だった、という失敗を再発防止へ変える場所。

薄氷の会話品質は、発話の文面ではなく状態で見る。
つまり、口調や説明順は揺れてよいが、次の状態は曖昧にしない。

- 今の `phase`
- ボールを持っている人
- 待っている相手
- 次の一手
- 完了条件
- 最終更新時刻

## 運用

1. 失敗を見つけたら、この台帳へ記録する
2. 再現できる形にできるなら `fixtures/conversations/` へ昇格する
3. fixture を `test/conversation_fixtures.test.ts` で検査する
4. 同じ型の失敗が繰り返されるなら `school-rules/` や boot instruction へ昇格する

## 昇格条件

- 1回目: 台帳へ記録する
- 2回目: fixture と回帰テストにする
- 3回目: 校則・instruction・skill のどれかに昇格する

## 記録テンプレート

```md
## YYYY-MM-DD failure-id

- **Symptom**:
- **Where**:
- **Observed state**:
- **Expected state**:
- **Liveness code**:
- **Root cause**:
- **Fixture**:
- **Promoted to**:
- **Status**:
```

## 未解決

まだなし。
