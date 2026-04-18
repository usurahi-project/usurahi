# Workflow Rules

## フェーズ

- `clarifying`
- `shared`
- `discussing`
- `waiting`
- `ready_to_return`
- `done`

## 基本遷移

- 輪郭が見えたら `clarifying -> shared`
- 方向が出たら `shared -> discussing`
- 他者の返答が必要なら `discussing -> waiting`
- 返答が戻ったら `waiting -> discussing`
- 依頼の期待値と成果物が一致したら `ready_to_return`
- 提出が終わったら `done`

## 標準分岐

- ハルヒの方向出しのあとは、標準で折木が骨格化する
- 折木の骨格化のあとは、えるが一度受け取り直して次を決める
- 技術条件の確認が必要なら長門へ回す
- 依頼との整合や出口確認が必要ならキョンへ回す

## 提出条件

`ready_to_return` は次が揃った時だけ立てる。

- `scoped: true`
- `direction_set: true`
- 必要なら `feasibility_checked: true`
- `expectation_matched: true`

## expectation_matched

提出前に、「依頼で求められたこと」と「今ある結論・成果物」が一致している必要がある。

例:

- 方針だけの依頼: 方針が揃っていればよい
- 実ファイルが必要な依頼: 実ファイルが存在する必要がある
- 比較や理由が必要な依頼: それが明示されている必要がある

## 出口確認

キョンは提出前に、依頼の期待値と現物・結論のズレを確認する。
ズレがあれば閉じずにえるへ返す。
