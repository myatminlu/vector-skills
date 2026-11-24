#!/usr/bin/env python3
"""Coarse grader for skill evals.

Checks that an agent's response to each eval prompt contains the
must_include keyphrases (and optional must_match_regex patterns) while
excluding any must_not_include anti-pattern phrases declared in evals.json.
This is a coarse deterministic check, not an LLM judge — it catches gross
misses (wrong topic, missing required terms, or blatant anti-patterns)
rather than subtle correctness issues.

Input:  responses.json (or `-` for stdin) — list of { "id": int, "response": str }
Output: pass/fail per eval, with missing/forbidden keyphrases listed for fails.
        Exit code 0 if all pass, 1 otherwise.

Usage:
    python3 grade.py responses.json
    python3 grade.py - < responses.json
    python3 grade.py responses.json --threshold 0.8   # allow 20% misses on required terms
    python3 grade.py responses.json --evals path/to/evals.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_EVALS = Path(__file__).resolve().parents[1] / "evals.json"


def load_evals(path: Path) -> dict[int, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {e["id"]: e for e in data["evals"]}


def grade_one(
    response: str,
    must_include: list[str],
    must_not_include: list[str] | None = None,
    must_match_regex: list[str] | None = None,
) -> tuple[list[str], list[str], list[str]]:
    """Return (hits, misses, forbidden_hits) — case-insensitive matching."""
    hay = response.lower()
    hits: list[str] = []
    misses: list[str] = []
    for needle in must_include:
        if needle.lower() in hay:
            hits.append(needle)
        else:
            misses.append(needle)

    for pattern in must_match_regex or []:
        if re.search(pattern, response, re.IGNORECASE):
            hits.append(f"/{pattern}/")
        else:
            misses.append(f"/{pattern}/")

    forbidden_hits: list[str] = []
    for forbidden in must_not_include or []:
        if forbidden.lower() in hay:
            forbidden_hits.append(forbidden)

    return hits, misses, forbidden_hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("responses", type=str, help="JSON file path or `-` for stdin: list of {id, response}")
    ap.add_argument("--evals", type=Path, default=DEFAULT_EVALS, help="evals.json path")
    ap.add_argument("--threshold", type=float, default=1.0,
                    help="Fraction of must_include tokens required to pass (default 1.0 = all)")
    ap.add_argument("--quiet", action="store_true", help="Only print summary + fails")
    args = ap.parse_args()

    evals = load_evals(args.evals)
    raw = sys.stdin.read() if args.responses == "-" else Path(args.responses).read_text(encoding="utf-8")
    responses = json.loads(raw)
    if not isinstance(responses, list):
        print("error: responses file must be a JSON list", file=sys.stderr)
        return 2

    passed = 0
    failed = 0
    skipped = 0

    for r in responses:
        eid = r.get("id")
        resp = r.get("response", "")
        if eid not in evals:
            print(f"warn: response references unknown eval id {eid!r}", file=sys.stderr)
            skipped += 1
            continue
        ev = evals[eid]
        must = ev.get("must_include", [])
        must_regex = ev.get("must_match_regex", [])
        must_not = ev.get("must_not_include", [])
        total_required = len(must) + len(must_regex)
        if total_required == 0 and not must_not:
            skipped += 1
            continue
        hits, misses, forbidden_hits = grade_one(resp, must, must_not, must_regex)
        ratio = (len(hits) / total_required) if total_required else 1.0
        ok = (ratio >= args.threshold) and not forbidden_hits
        if ok:
            passed += 1
            if not args.quiet:
                print(f"PASS  eval {eid}: {len(hits)}/{total_required} ({ratio:.0%})")
        else:
            failed += 1
            reasons = []
            if misses and ratio < args.threshold:
                reasons.append(f"missing: {', '.join(misses)}")
            if forbidden_hits:
                reasons.append(f"forbidden: {', '.join(forbidden_hits)}")
            detail = " | ".join(reasons) if reasons else "threshold not met"
            print(f"FAIL  eval {eid}: {len(hits)}/{total_required} ({ratio:.0%}) — {detail}")

    total = passed + failed
    print()
    print(f"Summary: {passed}/{total} passed, {failed} failed, {skipped} skipped (threshold={args.threshold:.0%})")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
