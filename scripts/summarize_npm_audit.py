import json
import sys


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: summarize_npm_audit.py <audit-json>")
    with open(sys.argv[1], encoding="utf-8") as stream:
        report = json.load(stream)
    if report.get("error"):
        raise SystemExit(f"npm audit registry error: {report['error'].get('code', 'unknown')}")
    metadata = (report.get("metadata") or {}).get("vulnerabilities")
    if metadata is None:
        raise SystemExit("npm audit response has no vulnerability metadata")
    print(json.dumps(metadata, sort_keys=True))
    for package, item in sorted((report.get("vulnerabilities") or {}).items()):
        for advisory in item.get("via") or []:
            if isinstance(advisory, dict):
                print(json.dumps({"package": package, "severity": advisory.get("severity"), "range": advisory.get("range"), "fixAvailable": advisory.get("fixAvailable"), "url": advisory.get("url")}))


if __name__ == "__main__":
    main()
