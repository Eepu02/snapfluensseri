# Contributing

Thanks for your interest in improving Snapfluensseri.

## Development workflow

1. Fork the repository and create a focused branch from `main`.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Make the smallest coherent change and add or update tests.
4. Run `pnpm run check`.
5. Open a pull request explaining the problem, the chosen approach, and how you
   verified it.

Keep unrelated refactors out of feature and bug-fix pull requests. Update the
README when behavior, setup, commands, configuration, or stored data changes.

## Database changes

Edit `src/db/schema.ts`, then generate a migration with:

```sh
pnpm run db:generate
```

Review the generated SQL and metadata before committing them. Test migrations
against a local D1 database; do not use a contributor or production database.

## Security and privacy

- Never include real Telegram updates, chat IDs, user IDs, names, database
  exports, or secrets in code, tests, fixtures, logs, issues, or pull requests.
- Keep webhook authentication enabled.
- Use synthetic data in tests and bug reports.
- Follow [SECURITY.md](SECURITY.md) for vulnerability reports.

## Commit and pull request style

Clear, imperative commit messages are preferred. Conventional Commit prefixes
such as `feat:`, `fix:`, `docs:`, and `test:` are welcome but not required.

By contributing, you agree that your contribution will be licensed under the
[MIT License](LICENSE).
