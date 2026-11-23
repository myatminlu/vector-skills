#!/usr/bin/env python3
"""Prompt census for one repository from Conductor's local history (read-only).

Prints every user prompt per workspace and session, with counts, so the prompts can be labelled with the eight
categories in references/00-evidence-and-gaps.md (section 2) and compared with the case study.

    python3 -I prompt-census.py --list                    # repositories Conductor knows
    python3 -I prompt-census.py --repo my-app > "$TMPDIR/my-app-prompts.txt"

Rules:
- The database is opened read-only (sqlite URI mode=ro); nothing is written to it.
- People paste secrets into prompts. Any line that mentions a password, token, key or secret is replaced with a
  marker, and an email followed by a password-like word is masked — but redaction is best effort, so write the output
  only under the temp directory, never into a repository or shared notes.
- Table and column names are what Conductor used when this was written (workspaces link to repositories through
  `repository_id` or, in newer builds, `project_id` — both are detected); if they change again, read
  `pragma table_info(...)`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys

DB = os.path.expanduser("~/Library/Application Support/com.conductor.app/conductor.db")
SECRET = re.compile(r"(password|passcode|passwd|pwd|စကားဝှက်|storepass|keypass|secret|api[_ -]?key|token|private key)", re.I)
EMAIL_THEN_WORD = re.compile(r"([\w.+-]+@[\w-]+\.[\w.]+)(\s*[,/:]?\s*)(\S{6,})")


def redact(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if SECRET.search(line):
            lines.append("[line redacted: mentions a secret]")
            continue

        def mask(match: re.Match) -> str:
            word = match.group(3)
            looks_like_password = re.search(r"\d", word) and re.search(r"[A-Za-z]", word) and not word.startswith("http")
            return match.group(1) + match.group(2) + "[redacted]" if looks_like_password else match.group(0)

        lines.append(EMAIL_THEN_WORD.sub(mask, line))
    return "\n".join(lines)


def prompt_text(content: str | None) -> str | None:
    """User rows are plain text or an SDK JSON event; tool results are not prompts."""
    if not content:
        return None
    try:
        event = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return content.strip() or None
    if isinstance(event, dict) and isinstance(event.get("message"), dict):
        body = event["message"].get("content")
        if isinstance(body, str):
            return body.strip() or None
        if isinstance(body, list):
            if any(isinstance(part, dict) and part.get("type") == "tool_result" for part in body):
                return None
            text = "\n".join(part.get("text", "") for part in body if isinstance(part, dict) and part.get("type") == "text")
            return text.strip() or None
    return content.strip() or None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", help="repository name as shown in Conductor")
    parser.add_argument("--list", action="store_true", help="list repositories and exit")
    parser.add_argument("--max-chars", type=int, default=2000, help="truncate long prompts (pasted logs)")
    args = parser.parse_args()

    if not os.path.exists(DB):
        print(f"No Conductor database at {DB}", file=sys.stderr)
        return 1
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    if args.list or not args.repo:
        for row in con.execute("select id, name, root_path from repos order by name"):
            print(f"{row['name']:40} {row['root_path']}")
        return 0

    repo = con.execute("select id from repos where name = ?", (args.repo,)).fetchone()
    if not repo:
        print(f"No repository named {args.repo!r}; use --list", file=sys.stderr)
        return 1

    # The column linking a workspace to its repository was `repository_id` until late 2026 and `project_id` after.
    columns = {row[1] for row in con.execute("pragma table_info(workspaces)")}
    link = "repository_id" if "repository_id" in columns else "project_id"

    total = 0
    per_workspace = []
    for ws in con.execute(f"select * from workspaces where {link} = ? order by created_at", (repo["id"],)):
        ws = dict(ws)
        label = ws.get("workspace_name") or ws.get("directory_name")
        print(f"\n######## {label} ({ws.get('directory_name')}) · branch {ws.get('branch')} · created {ws.get('created_at')}")
        count = 0
        for session in con.execute("select * from sessions where workspace_id = ? order by created_at", (ws.get("local_id") or ws.get("id"),)):
            session = dict(session)
            print(f"\n==== session · {session.get('title')} · model {session.get('model')} · effort {session.get('claude_effort_level')}")
            for message in con.execute("select content, sent_at from session_messages where session_id = ? and role = 'user' order by sent_at", (session["id"],)):
                text = prompt_text(message["content"])
                if not text:
                    continue
                text = redact(text)
                if len(text) > args.max_chars:
                    text = text[: args.max_chars] + f"\n…[truncated, {len(text)} chars]"
                count += 1
                total += 1
                print(f"\n--- [{message['sent_at']}] #{total}\n{text}")
        per_workspace.append((label, count))

    print("\n######## Summary")
    for label, count in per_workspace:
        print(f"{count:5}  {label}")
    print(f"{total:5}  total prompts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
