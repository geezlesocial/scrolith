"""Create a complete, non-sensitive CodeQL disposition inventory from SARIF."""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CATEGORIES = {
    "confirmed vulnerability",
    "likely vulnerability",
    "verified false positive",
    "accepted safe pattern",
    "build/test-only finding",
}


def spreadsheet_safe(value: object) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@"} else text


def rule_map(run: dict) -> dict[str, dict]:
    driver = ((run.get("tool") or {}).get("driver") or {})
    return {str(rule.get("id")): rule for rule in driver.get("rules") or [] if rule.get("id")}


def location(result: dict) -> tuple[str, str]:
    locations = result.get("locations") or []
    physical = ((locations[0].get("physicalLocation") or {}) if locations else {})
    artifact = physical.get("artifactLocation") or {}
    region = physical.get("region") or {}
    return str(artifact.get("uri") or ""), str(region.get("startLine") or "")


def fingerprint(result: dict) -> str:
    partial = result.get("partialFingerprints") or result.get("fingerprints") or {}
    if isinstance(partial, dict):
        for key in sorted(partial):
            if partial[key]:
                return f"{key}:{partial[key]}"
    return ""


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: generate-codeql-disposition.py INPUT.sarif OUTPUT.csv", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    document = json.loads(source.read_text(encoding="utf-8"))
    rows: list[dict[str, str]] = []
    review_date = os.environ.get("CODEQL_REVIEW_DATE") or datetime.now(timezone.utc).date().isoformat()
    for run_index, run in enumerate(document.get("runs") or []):
        rules = rule_map(run)
        for result_index, result in enumerate(run.get("results") or []):
            rule_id = str(result.get("ruleId") or "")
            rule = rules.get(rule_id, {})
            properties = rule.get("properties") or {}
            file_name, line = location(result)
            test_only = bool(re.search(r"(^|/)(tests?|__tests__|fixtures?)(/|$)|\.test\.[jt]sx?$|\.spec\.[jt]sx?$", file_name, re.I))
            category = "build/test-only finding" if test_only else "likely vulnerability"
            reachability = (
                "test-only path; production runtime reachability not present"
                if test_only
                else "production reachability requires manual call-path review"
            )
            rows.append({
                "finding_id": f"run-{run_index + 1}-result-{result_index + 1}",
                "fingerprint": fingerprint(result),
                "rule_id": rule_id,
                "severity": str((result.get("level") or rule.get("defaultConfiguration", {}).get("level") or "")),
                "security_severity": str(properties.get("security-severity") or ""),
                "file": file_name,
                "line": line,
                "message": str((result.get("message") or {}).get("text") or "").replace("\r", " ").replace("\n", " "),
                "category": category,
                "runtime_reachability": reachability,
                "evidence": "Source location retained; manual call-path and runtime-image review required before final disposition.",
                "remediation": "Review source path, add regression test if confirmed, or document positive safe-pattern evidence.",
                "owner": "Security owner",
                "review_date": review_date,
                "expiry_date": "",
            })
    fields = [
        "finding_id", "fingerprint", "rule_id", "severity", "security_severity",
        "file", "line", "message", "category", "runtime_reachability", "evidence",
        "remediation", "owner", "review_date", "expiry_date",
    ]
    invalid = [row for row in rows if row["category"] not in CATEGORIES or not row["rule_id"] or not row["fingerprint"] or not row["file"] or not row["line"]]
    if invalid:
        print(f"invalid disposition rows: {len(invalid)}", file=sys.stderr)
        return 1
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: spreadsheet_safe(value) for key, value in row.items()} for row in rows)
    print(json.dumps({"sarif_version": document.get("version"), "runs": len(document.get("runs") or []), "findings": len(rows)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
