# Contributing to audius-tools

Thanks for helping independent artists ship faster.

- **One command = one function** in `src/commands/*.mjs`, registered in `bin/audius-tools.mjs` and documented in `HELP` + README.
- **Writes are dry runs** unless `--yes` (use `confirm(a, plan)` from `src/core.mjs`). Destructive actions need an extra guard.
- **Never print credentials.** Use `apiError(e)` to show the API's answer.
- Read-only commands must work **without** an account (`client(env)` without `{ write: true }`).
- Check syntax with `npm test` before opening a PR, and describe what you ran against the real API.

Bug? Open an issue with the command, the output (tokens removed) and your Node version.
