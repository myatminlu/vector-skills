# Changelog

All notable changes to `vector-skills` will be documented in this file.

## [1.0.0] - 2026-11-24

### Added
- Multi-ecosystem plugin manifests for Claude Code (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`), Antigravity (`.antigravity-plugin/plugin.json`), and Cursor (`.cursor-plugin/plugin.json`).
- Root `package.json` with `create-vector-expo-app` bin entrypoint and `npm run check` (`validate` + `test`) scripts.
- Repository-wide validator and shared-asset syncer (`scripts/validate-skills.py`) checking frontmatter budgets, relative links, `evals.json` schemas, `grade.py` behavior, shared-file SHA-256 parity, and manifest version alignment.
- Offline Node test suite (`tests/starter-scripts.test.mjs`) and cross-OS GitHub Actions matrix workflow (`.github/workflows/validate.yml` on Ubuntu, macOS, and Windows).
- `CONTRIBUTING.md` and anonymized production benchmark evidence in `README.md`.

### Changed
- Made `AGENTS.md` the canonical project-rules target in generated Expo apps (preserving `create-expo-app` guidance), while keeping `CLAUDE.md` synced via `@AGENTS.md`.
- Made starter language module discovery and `src/modules/strings.ts` generation data-driven via `"language"` metadata in `module.json` (`lang-*`).
- Replaced POSIX-only `api:types` script with cross-platform `scripts/api-types.mjs`, fixed Windows `.cmd`/`.bat` execution in `starter.mjs` and `e2e.mjs`, added Linux/Windows `JAVA_HOME` + `adb` discovery, and switched CLI flag parsing to `node:util` `parseArgs`.
- Added EAS Build / EAS Submit cloud release guidance and RTL / CJK / text-expansion verification checks.
- Clarified trigger boundaries between `code-implementation` and `bug-fixing`, trimmed near-limit skill descriptions below 980 characters, normalized skill directory permissions (`0755`), and upgraded `evals/scripts/grade.py` with stdin (`-`), `must_not_include`, and `must_match_regex` support.
