#!/usr/bin/env python3
"""Coarse grader for nestjs-dev-guidelines evals.

Checks that an agent's response to each eval prompt contains the
must_include keyphrases declared in evals.json. This is a substring
check, not an LLM judge — it catches gross misses (wrong topic, missing
required terms) rather than subtle correctness issues.

Input:  responses.json — list of { "id": int, "response": str }
Output: pass/fail per eval, with missing keyphrases listed for fails.
        Exit code 0 if all pass, 1 otherwise.

Usage:
    python3 grade.py responses.json
    python3 grade.py responses.json --threshold 0.8   # allow 20% misses
    python3 grade.py responses.json --evals path/to/evals.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_EVALS = Path(__file__).resolve().parents[1] / "evals.json"


def load_evals(path: Path) -> dict[int, dict]:
    data = json.loads(path.read_text())
    return {e["id"]: e for e in data["evals"]}


def grade_one(response: str, must_include: list[str]) -> tuple[list[str], list[str]]:
    """Return (hits, misses) — case-insensitive substring match."""
    hay = response.lower()
    hits, misses = [], []
    for needle in must_include:
        if needle.lower() in hay:
            hits.append(needle)
        else:
            misses.append(needle)
    return hits, misses


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("responses", type=Path, help="JSON: list of {id, response}")
    ap.add_argument("--evals", type=Path, default=DEFAULT_EVALS, help="evals.json path")
    ap.add_argument("--threshold", type=float, default=1.0,
                    help="Fraction of must_include tokens required to pass (default 1.0 = all)")
    ap.add_argument("--quiet", action="store_true", help="Only print summary + fails")
    args = ap.parse_args()

    evals = load_evals(args.evals)
    responses = json.loads(args.responses.read_text())
    if not isinstance(responses, list):
        print("error: responses file must be a JSON list", file=sys.stderr)
        return 2

    passed = 0
    failed = 0
    skipped = 0
    fail_details = []

    for r in responses:
        eid = r.get("id")
        resp = r.get("response", "")
        if eid not in evals:
            print(f"warn: response references unknown eval id {eid!r}", file=sys.stderr)
            skipped += 1
            continue
        must = evals[eid].get("must_include", [])
        if not must:
            skipped += 1
            continue
        hits, misses = grade_one(resp, must)
        ratio = len(hits) / len(must)
        ok = ratio >= args.threshold
        if ok:
            passed += 1
            if not args.quiet:
                print(f"PASS  eval {eid}: {len(hits)}/{len(must)} ({ratio:.0%})")
        else:
            failed += 1
            fail_details.append((eid, misses, ratio))
            print(f"FAIL  eval {eid}: {len(hits)}/{len(must)} ({ratio:.0%}) — missing: {', '.join(misses)}")

    total = passed + failed
    print()
    print(f"Summary: {passed}/{total} passed, {failed} failed, {skipped} skipped (threshold={args.threshold:.0%})")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
