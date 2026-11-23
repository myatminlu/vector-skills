#!/bin/sh
# Workspace bootstrap — save as <repo>/.conductor/setup.sh (referenced by `scripts.setup` in settings.toml).
#
# It fails loudly on purpose. A workspace without dependencies or with an incomplete .env does not
# error on its own: the app simply behaves differently (hidden sign-in buttons, an empty paywall), and
# somebody spends an afternoon looking for a bug that is a missing file.
set -eu

echo "→ installing dependencies"
npm ci

if [ ! -f .env.example ]; then
  echo "✖ .env.example is missing from the repository — it is the list of keys the app reads." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "✖ .env was not copied into this workspace." >&2
  echo "  Put the real .env in the repository root directory (${CONDUCTOR_ROOT_PATH:-the main checkout})" >&2
  echo "  so that new workspaces copy it (see file_include_globs in .conductor/settings.toml)." >&2
  exit 1
fi

# Every key in .env.example must exist in .env. Values may differ, and may be empty.
missing=""
for key in $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example | cut -d= -f1); do
  grep -qE "^${key}=" .env || missing="${missing} ${key}"
done

if [ -n "${missing}" ]; then
  echo "✖ .env lacks keys that .env.example has:${missing}" >&2
  echo "  Append them to the .env in the repository root directory (${CONDUCTOR_ROOT_PATH:-the main checkout})," >&2
  echo "  then copy that file here or recreate the workspace." >&2
  exit 1
fi

echo "✓ workspace ready"
