# vector-skills

A personal library of [Claude Code](https://claude.com/claude-code) skills. Each skill
teaches the agent a domain — how to think, what rules to follow, what mistakes to avoid —
when working on that kind of code.

## Skills in this collection

| Skill | What it does |
|---|---|
| [`nestjs-dev-guidelines`](./nestjs-dev-guidelines/) | Senior NestJS / Node.js backend engineer: folder structure, naming, code quality, API design, DB design, security, auth, pagination, error handling, testing, AI product patterns (LLM gateway, SSE, usage metering), code review rules. SKILL.md + 31 granular reference files + evals. |

(More skills planned — `react-frontend-guidelines`, `expo-mobile-guidelines`, etc.)

## Install

Skills live in `~/.claude/skills/` so Claude Code auto-discovers them. Clone this repo
and symlink each skill you want active:

```bash
# one-time: clone the library
git clone https://github.com/myatminlu/vector-skills.git ~/Documents/Dev/vector-skills

# for each skill you want, add a symlink
ln -s ~/Documents/Dev/vector-skills/nestjs-dev-guidelines \
      ~/.claude/skills/nestjs-dev-guidelines
```

Next Claude Code session will load the skill automatically. No restart or install step.

## Editing a skill

Edit the files in place. Changes take effect on the next Claude Code session.

```bash
cd ~/Documents/Dev/vector-skills/nestjs-dev-guidelines
vim references/08-pagination-filters-sorting.md

# optional structural validation
python3 ~/.claude/skills/skill-creator/scripts/quick_validate.py .

git add . && git commit -m "tighten pagination rule"
git push
```

## Adding a new skill

```bash
cd ~/Documents/Dev/vector-skills
mkdir my-new-skill
cd my-new-skill
# Create SKILL.md (required) + optional references/, evals/, assets/, scripts/
ln -s $PWD ~/.claude/skills/my-new-skill
git add . && git commit -m "Add my-new-skill"
```

A skill is a folder with at least a `SKILL.md` file containing YAML frontmatter
(`name`, `description`). See any existing skill as a template.

## Authoring conventions

- Keep `SKILL.md` scannable (≤ 500 lines). Deep dives go in `references/`.
- Each reference file: TL;DR → rules (good/bad code) → anti-patterns → review checklist.
- Write `description` in the frontmatter so Claude triggers the skill reliably
  (concrete keywords + "use when X" framing). Max 1024 characters.
- Add `evals/evals.json` with 5–10 substantive test tasks to catch regressions.

## License

MIT — feel free to fork and adapt.
