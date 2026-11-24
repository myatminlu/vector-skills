# Contributing to vector-skills

Thank you for contributing! Whether you are fixing an Expo SDK compatibility quirk, sharpening a NestJS rule, or adding a new skill or language module, please follow the repository conventions below.

## Repository layout

- `skills/<skill-name>/SKILL.md` — entrypoint instructions (≤ 500 lines) with YAML frontmatter (`name`, `description`).
- `skills/<skill-name>/references/` — modular deep-dive docs (`TL;DR → rules → anti-patterns → review checklist`).
- `skills/<skill-name>/evals/evals.json` — substantive evaluation prompts with `must_include` (and optional `must_not_include` / `must_match_regex`) assertions.
- `scripts/validate-skills.py` — repo-wide validator and shared-asset syncer.
- `tests/starter-scripts.test.mjs` — Node unit/integration tests for starter scripts, build guards, and repo signals.

## Authoring & compatibility rules

1. **Frontmatter limits:** Keep `name` identical to the skill folder name and keep `description` concise (≤ 980 characters so it stays safely within cross-tool 1,024-character limits).
2. **Universal agent support:** Keep generated project instructions centered on `AGENTS.md` (with `CLAUDE.md` importing `@AGENTS.md`) and avoid macOS-only paths or personal machine paths in tracked files.
3. **Sync shared files:** Several files are shared across skills (`evals/scripts/grade.py`, `with-upload-signing.js`, `bump-build.mjs`, `ios-launch-test.mjs`). Always edit the canonical copy in `skills/react-native-expo-app-builder/` and run:

   ```bash
   python3 scripts/validate-skills.py --sync
   ```

4. **Adding a starter language module:** Copy `skills/react-native-expo-app-builder/assets/starter/modules/lang-my/` to `lang-<code>/` and set `"language": { "code": "<code>", "exportName": "<export>", "stringsExport": "<export>" }` in `module.json`. Both `create-app.mjs` and `add-module.mjs` discover and wire it automatically.

## Before opening a PR

```bash
npm run check
```

Verify that:
- `python3 scripts/validate-skills.py` exits `0` (all skills, evals, manifests, `grade.py` self-tests, and shared-asset hashes pass).
- `npm test` (`node --test tests/starter-scripts.test.mjs`) passes on all test cases.
- If you added or removed a skill directory, update `.claude-plugin/plugin.json` and `README.md`.
