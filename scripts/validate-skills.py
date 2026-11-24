#!/usr/bin/env python3
"""Repository-wide validation & shared-asset sync for vector-skills.

Usage:
    python3 scripts/validate-skills.py          # validate all skills, evals, manifests, and shared-file parity
    python3 scripts/validate-skills.py --sync   # sync canonical shared scripts/assets, then validate
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = ROOT / "skills"
MAX_SKILL_LINES = 500
MAX_DESC_CHARS = 980  # hard buffer below the 1024-char cross-tool limit

CANONICAL_GRADE = SKILLS_DIR / "react-native-expo-app-builder" / "evals" / "scripts" / "grade.py"
SHARED_EXPO_FILES = [
    (
        SKILLS_DIR / "react-native-expo-app-builder" / "assets" / "starter" / "core" / "plugins" / "with-upload-signing.js",
        SKILLS_DIR / "app-store-play-store-submission" / "assets" / "expo" / "with-upload-signing.js",
    ),
    (
        SKILLS_DIR / "react-native-expo-app-builder" / "assets" / "starter" / "core" / "scripts" / "bump-build.mjs",
        SKILLS_DIR / "app-store-play-store-submission" / "assets" / "expo" / "bump-build.mjs",
    ),
    (
        SKILLS_DIR / "react-native-expo-app-builder" / "assets" / "starter" / "core" / "scripts" / "ios-launch-test.mjs",
        SKILLS_DIR / "app-store-play-store-submission" / "assets" / "expo" / "ios-launch-test.mjs",
    ),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def skill_dirs() -> list[Path]:
    return sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir() and not p.name.startswith("."))


def parse_frontmatter(text: str) -> dict[str, str]:
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.DOTALL)
    if not m:
        raise ValueError("missing YAML frontmatter block")
    fm: dict[str, str] = {}
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not km:
            raise ValueError(f"unsupported frontmatter line: {line!r}")
        key, val = km.group(1), km.group(2).strip()
        if val in (">", ">-", "|", "|-"):
            block: list[str] = []
            i += 1
            while i < len(lines) and (lines[i].startswith("  ") or lines[i].strip() == ""):
                block.append(lines[i][2:] if lines[i].startswith("  ") else "")
                i += 1
            joined = " ".join(s.strip() for s in block if s.strip()) if val.startswith(">") else "\n".join(block).strip()
            fm[key] = joined
            continue
        if (val.startswith("'") and val.endswith("'") and len(val) >= 2):
            val = val[1:-1].replace("''", "'")
        elif (val.startswith('"') and val.endswith('"') and len(val) >= 2):
            val = val[1:-1].replace('\\"', '"')
        fm[key] = val
        i += 1
    return fm


def sync_shared() -> None:
    for sdir in skill_dirs():
        target = sdir / "evals" / "scripts" / "grade.py"
        if target != CANONICAL_GRADE:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(CANONICAL_GRADE, target)
    for src, dst in SHARED_EXPO_FILES:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def validate_skill(sdir: Path, errors: list[str]) -> int:
    name = sdir.name
    skill_md = sdir / "SKILL.md"
    if not skill_md.is_file():
        errors.append(f"{name}: missing SKILL.md")
        return 0

    text = skill_md.read_text(encoding="utf-8")
    line_count = len(text.splitlines())
    if line_count > MAX_SKILL_LINES:
        errors.append(f"{name}: SKILL.md has {line_count} lines (max {MAX_SKILL_LINES})")

    try:
        fm = parse_frontmatter(text)
    except ValueError as exc:
        errors.append(f"{name}: invalid frontmatter ({exc})")
        fm = {}

    if fm.get("name") != name:
        errors.append(f"{name}: frontmatter name {fm.get('name')!r} != folder {name!r}")
    desc = fm.get("description", "")
    if not desc:
        errors.append(f"{name}: missing frontmatter description")
    elif len(desc) > MAX_DESC_CHARS:
        errors.append(f"{name}: description is {len(desc)} chars (max {MAX_DESC_CHARS})")

    for match in re.finditer(r"`((?:references|scripts|assets|evals)/[^`\s]+)`", text):
        rel = match.group(1).rstrip(".,;:")
        if "<" in rel or "*" in rel:
            continue
        if not (sdir / rel).exists():
            errors.append(f"{name}: broken path reference in SKILL.md -> {rel}")

    evals_path = sdir / "evals" / "evals.json"
    if not evals_path.is_file():
        errors.append(f"{name}: missing evals/evals.json")
        return 0

    try:
        edata = json.loads(evals_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{name}: invalid evals/evals.json ({exc})")
        return 0

    if edata.get("skill_name") != name:
        errors.append(f"{name}: evals.json skill_name {edata.get('skill_name')!r} != {name!r}")

    evals = edata.get("evals")
    if not isinstance(evals, list) or not evals:
        errors.append(f"{name}: evals.json must contain a non-empty evals list")
        return 0

    seen_ids: set[int] = set()
    for idx, ev in enumerate(evals):
        eid = ev.get("id")
        if not isinstance(eid, int) or eid in seen_ids:
            errors.append(f"{name}: eval[{idx}] has duplicate or non-int id {eid!r}")
        else:
            seen_ids.add(eid)
        for req in ("prompt", "expected_output"):
            if not isinstance(ev.get(req), str) or not ev[req].strip():
                errors.append(f"{name}: eval {eid} missing non-empty {req}")
        must = ev.get("must_include")
        if not isinstance(must, list) or not must:
            errors.append(f"{name}: eval {eid} must define a non-empty must_include list")
        for opt_key in ("must_not_include", "must_match_regex"):
            if opt_key in ev:
                val = ev[opt_key]
                if not isinstance(val, list) or any(not isinstance(x, str) or not x for x in val):
                    errors.append(f"{name}: eval {eid} {opt_key} must be a list of non-empty strings")
                elif opt_key == "must_match_regex":
                    for pat in val:
                        try:
                            re.compile(pat, re.IGNORECASE)
                        except re.error as exc:
                            errors.append(f"{name}: eval {eid} invalid regex {pat!r}: {exc}")
    return len(evals)


def validate_shared_parity(errors: list[str]) -> None:
    grade_hashes = {sdir.name: sha256(sdir / "evals" / "scripts" / "grade.py") for sdir in skill_dirs() if (sdir / "evals" / "scripts" / "grade.py").is_file()}
    if len(grade_hashes) != len(skill_dirs()):
        errors.append("missing grade.py in one or more skills")
    elif len(set(grade_hashes.values())) > 1:
        errors.append(f"grade.py drifted across skills (run `python3 scripts/validate-skills.py --sync`): {grade_hashes}")

    for src, dst in SHARED_EXPO_FILES:
        if not src.is_file() or not dst.is_file():
            errors.append(f"missing shared Expo asset: {src} or {dst}")
        elif sha256(src) != sha256(dst):
            errors.append(f"shared Expo asset drifted ({src.name}); run `python3 scripts/validate-skills.py --sync`")


def self_test_grade_py(errors: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        evals_file = tmp_path / "evals.json"
        evals_file.write_text(json.dumps({
            "skill_name": "selftest",
            "evals": [
                {
                    "id": 1,
                    "prompt": "p1",
                    "expected_output": "e1",
                    "must_include": ["root cause", "boundary"],
                    "must_not_include": ["ignore error"],
                    "must_match_regex": [r"\.(?:ts|py|js):\d+"],
                }
            ],
        }), encoding="utf-8")

        def run_grade(payload: list[dict]) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                [sys.executable, str(CANONICAL_GRADE), "-", "--evals", str(evals_file)],
                input=json.dumps(payload),
                text=True,
                capture_output=True,
            )

        ok = run_grade([{"id": 1, "response": "Root cause at the boundary (app.ts:42)."}])
        if ok.returncode != 0:
            errors.append(f"grade.py self-test pass case failed: {ok.stdout} {ok.stderr}")

        miss = run_grade([{"id": 1, "response": "Root cause only (app.ts:42)."}])
        if miss.returncode == 0 or "missing:" not in miss.stdout:
            errors.append(f"grade.py self-test missing-token case failed: {miss.stdout}")

        forbid = run_grade([{"id": 1, "response": "Root cause at boundary (app.ts:42); ignore error."}])
        if forbid.returncode == 0 or "forbidden:" not in forbid.stdout:
            errors.append(f"grade.py self-test must_not_include case failed: {forbid.stdout}")

        bad_rx = run_grade([{"id": 1, "response": "Root cause at boundary without line ref."}])
        if bad_rx.returncode == 0 or "missing:" not in bad_rx.stdout:
            errors.append(f"grade.py self-test must_match_regex case failed: {bad_rx.stdout}")


def validate_manifests(errors: list[str]) -> None:
    manifest_paths = [
        ROOT / "package.json",
        ROOT / ".claude-plugin" / "plugin.json",
        ROOT / ".claude-plugin" / "marketplace.json",
        ROOT / ".antigravity-plugin" / "plugin.json",
        ROOT / ".cursor-plugin" / "plugin.json",
    ]
    versions: dict[str, str] = {}
    actual_skills = {s.name for s in skill_dirs()}

    for mp in manifest_paths:
        if not mp.is_file():
            errors.append(f"missing manifest: {mp.relative_to(ROOT)}")
            continue
        try:
            data = json.loads(mp.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON in {mp.relative_to(ROOT)}: {exc}")
            continue

        rel = str(mp.relative_to(ROOT))
        if rel == ".claude-plugin/marketplace.json":
            plugins = data.get("plugins", [])
            if not plugins or "version" not in plugins[0]:
                errors.append("marketplace.json missing plugins[0].version")
            else:
                versions[rel] = plugins[0]["version"]
        else:
            if "version" not in data:
                errors.append(f"{rel} missing version")
            else:
                versions[rel] = data["version"]

        if rel == ".claude-plugin/plugin.json":
            declared = {Path(p).name for p in data.get("skills", [])}
            if declared != actual_skills:
                errors.append(f".claude-plugin/plugin.json skills mismatch: declared={sorted(declared)} actual={sorted(actual_skills)}")
            for p in data.get("skills", []):
                if not (ROOT / p / "SKILL.md").is_file():
                    errors.append(f".claude-plugin/plugin.json broken skill path: {p}")

    if len(set(versions.values())) > 1:
        errors.append(f"manifest versions do not match: {versions}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sync", action="store_true", help="Copy canonical shared files before validating")
    args = ap.parse_args()

    if args.sync:
        sync_shared()

    errors: list[str] = []
    sdirs = skill_dirs()
    total_evals = sum(validate_skill(s, errors) for s in sdirs)
    validate_shared_parity(errors)
    self_test_grade_py(errors)
    validate_manifests(errors)

    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1

    print(f"OK: {len(sdirs)} skills, {total_evals} evals, 5 manifests, grade.py self-tests, and shared-asset parity passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
