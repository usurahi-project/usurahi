# 公開前チェックリスト

GitHubで公開する前に確認する項目。

## Repository settings

- Default branch is `develop` or an explicitly chosen public branch
- Branch protection requires CI before merge
- Branch protection requires at least one review for non-admin changes
- GitHub Actions are allowed only for trusted actions and Dependabot
- Private Vulnerability Reporting is enabled
- Secret scanning and push protection are enabled
- Dependabot alerts are enabled

## Files

- `README.md` is short enough for first-time readers
- `LICENSE` exists and matches `package.json`
- `CONTRIBUTING.md` explains local checks and PR expectations
- `CODE_OF_CONDUCT.md` sets public interaction expectations
- `SECURITY.md` explains where vulnerability reports should go
- `.github/workflows/ci.yml` runs typecheck, tests, dashboard build, and e2e
- `.github/workflows/codeql.yml` runs JavaScript/TypeScript analysis
- `.github/workflows/dependency-review.yml` blocks high-severity dependency changes
- `.github/dependabot.yml` opens dependency update PRs
- Issue and PR templates guide public contributions
- `docs/public-information-review.md` documents what is safe to publish

## Release hygiene

- No `.env` or secret-bearing local files are tracked
- No private Obsidian vault content is copied into public docs
- Example paths do not expose local usernames unless intentionally documented
- Public docs explain concepts, not private operating history
