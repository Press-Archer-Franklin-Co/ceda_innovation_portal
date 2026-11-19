#!/usr/bin/env python3
"""Fail only on test failures that are not already known to fail on main.

Reads a pytest JUnit XML report and compares failing tests with a list of
known failures (one pytest node id per line, `#` comments allowed).

Exit codes:
  0  no new failures
  1  at least one new failure or error, or the report has no tests
  2  the report or the known-failures file cannot be read

It also prints known failures that now pass, so the list can be shortened.
Never add a test to the known-failures list to hide a new failure.
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def load_known(path: Path) -> list[str]:
    known = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line:
            known.append(line)
    return known


def node_id(classname: str, name: str, root: Path) -> str:
    """Turn JUnit classname + name back into a pytest node id.

    pytest writes classname as the dotted module path plus any class names, for
    example `tests.api.test_media_api.MediaApiTests`. The module part is found by
    looking for the longest prefix that is a .py file under `root`.
    """
    if not classname:
        # Collection errors are reported with an empty classname and the module
        # path as the name.
        return name
    parts = classname.split(".")
    for cut in range(len(parts), 0, -1):
        candidate = Path(*parts[:cut]).with_suffix(".py")
        if (root / candidate).is_file():
            return "::".join([candidate.as_posix(), *parts[cut:], name])
    # Fall back to the usual layout: module is everything up to the first
    # capitalised part (a class name).
    for cut, part in enumerate(parts):
        if part[:1].isupper():
            module = "/".join(parts[:cut]) + ".py"
            return "::".join([module, *parts[cut:], name])
    return "/".join(parts) + ".py::" + name


def one_line(text: str | None, limit: int = 200) -> str:
    text = (text or "").strip()
    first = text.splitlines()[0] if text else ""
    return first if len(first) <= limit else first[: limit - 1] + "…"


def parse_report(path: Path, root: Path) -> dict:
    tree = ET.parse(path)
    results = {"passed": [], "failed": {}, "skipped": []}
    for case in tree.iter("testcase"):
        test_id = node_id(case.get("classname", ""), case.get("name", ""), root)
        problems = [child for child in case if child.tag in ("failure", "error")]
        if problems:
            first = problems[0]
            reason = one_line(first.get("message")) or one_line(first.text)
            detail = "\n\n".join((child.text or child.get("message") or "").strip() for child in problems)
            results["failed"][test_id] = {"reason": reason or first.tag, "detail": detail}
        elif any(child.tag == "skipped" for child in case):
            results["skipped"].append(test_id)
        else:
            results["passed"].append(test_id)
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("report", type=Path, help="pytest JUnit XML report")
    parser.add_argument("--known", type=Path, required=True, help="known failures file")
    parser.add_argument("--root", type=Path, default=Path("."), help="directory pytest ran from")
    parser.add_argument("--summary-json", type=Path, help="write a machine-readable summary here")
    parser.add_argument("--details", type=Path, help="write full tracebacks of new failures here")
    args = parser.parse_args(argv)

    try:
        known = load_known(args.known)
    except OSError as exc:
        print(f"Cannot read known failures file: {exc}", file=sys.stderr)
        return 2
    try:
        results = parse_report(args.report, args.root)
    except (OSError, ET.ParseError) as exc:
        print(f"Cannot read test report {args.report}: {exc}", file=sys.stderr)
        if args.summary_json:
            args.summary_json.write_text(json.dumps({"error": f"Cannot read test report: {exc}"}, indent=2))
        return 2

    known_set = set(known)
    failed = results["failed"]
    new_failures = {test_id: info for test_id, info in failed.items() if test_id not in known_set}
    known_still_failing = sorted(test_id for test_id in failed if test_id in known_set)
    passed_set = set(results["passed"])
    known_now_passing = sorted(test_id for test_id in known if test_id in passed_set)
    seen = passed_set | set(failed) | set(results["skipped"])
    known_not_found = sorted(test_id for test_id in known if test_id not in seen)
    total = len(results["passed"]) + len(failed) + len(results["skipped"])

    print(
        f"{len(results['passed'])} passed, {len(failed)} failed "
        f"({len(known_still_failing)} known on main, {len(new_failures)} new), {len(results['skipped'])} skipped"
    )
    if new_failures:
        print("\nNew failures (not in known failures):")
        for test_id, info in sorted(new_failures.items()):
            print(f"  - {test_id}: {info['reason']}")
    if known_now_passing:
        print("\nKnown failures that now pass (remove them from the known failures file):")
        for test_id in known_now_passing:
            print(f"  - {test_id}")
    if known_not_found:
        print("\nKnown failures that did not run (renamed or deleted?):")
        for test_id in known_not_found:
            print(f"  - {test_id}")
    if total == 0:
        print("\nThe report contains no tests.", file=sys.stderr)

    if args.summary_json:
        args.summary_json.write_text(
            json.dumps(
                {
                    "passed": len(results["passed"]),
                    "failed": len(failed),
                    "skipped": len(results["skipped"]),
                    "known_failing": len(known_still_failing),
                    "new_failures": [
                        {"id": test_id, "reason": info["reason"]} for test_id, info in sorted(new_failures.items())
                    ],
                    "known_now_passing": known_now_passing,
                    "known_not_found": known_not_found,
                },
                indent=2,
            )
        )
    if args.details:
        blocks = [f"===== {test_id}\n{info['detail']}\n" for test_id, info in sorted(new_failures.items())]
        args.details.write_text("\n".join(blocks) if blocks else "No new failures.\n")

    return 1 if new_failures or total == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
