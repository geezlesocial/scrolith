import hashlib
import json
import pathlib
import shutil
import sys


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: validate_codeql_sarif.py <directory> <raw-output> <summary-output>")
    source_dir, raw_output, summary_output = map(pathlib.Path, sys.argv[1:])
    files = sorted(source_dir.rglob("*.sarif"))
    if len(files) != 1:
        raise SystemExit(f"expected exactly one SARIF file, found {len(files)}")
    source = files[0]
    data = json.loads(source.read_text(encoding="utf-8"))
    if data.get("version") != "2.1.0":
        raise SystemExit("SARIF version is not 2.1.0")
    runs = data.get("runs") or []
    rules = [rule for run in runs for rule in (run.get("tool", {}).get("driver", {}).get("rules") or [])]
    results = [result for run in runs for result in (run.get("results") or [])]
    if not rules:
        raise SystemExit("SARIF rules section is empty")
    if any(not result.get("ruleId") for result in results):
        raise SystemExit("SARIF result is missing ruleId")
    if results and all(not result.get("level") for result in results):
        raise SystemExit("all SARIF result levels are blank")
    if any(not (result.get("partialFingerprints") or result.get("fingerprints")) for result in results):
        raise SystemExit("SARIF result is missing a fingerprint")
    rule_by_id = {rule.get("id"): rule for rule in rules}
    groups = {}
    for result in results:
        rule = rule_by_id.get(result["ruleId"], {})
        props = rule.get("properties") or {}
        key = (result["ruleId"], result.get("level"), props.get("security-severity"))
        group = groups.setdefault(key, {"ruleId": key[0], "level": key[1], "securitySeverity": key[2], "count": 0, "references": [], "fingerprints": []})
        group["count"] += 1
        group["fingerprints"].extend((result.get("partialFingerprints") or result.get("fingerprints") or {}).values())
        for location in result.get("locations") or []:
            physical = location.get("physicalLocation") or {}
            uri = (physical.get("artifactLocation") or {}).get("uri")
            line = (physical.get("region") or {}).get("startLine")
            if uri and line:
                group["references"].append(f"{uri}:{line}")
    for group in groups.values():
        group["references"] = sorted(set(group["references"]))
        group["fingerprints"] = sorted(set(group["fingerprints"]))
    summary = {"schema": data["version"], "ruleCount": len(rules), "resultCount": len(results), "groups": sorted(groups.values(), key=lambda item: (item["ruleId"], item["level"] or ""))}
    shutil.copyfile(source, raw_output)
    pathlib.Path(summary_output).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"schema": data["version"], "ruleCount": len(rules), "resultCount": len(results), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
