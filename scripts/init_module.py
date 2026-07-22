#!/usr/bin/env python3
"""Initialize a repository cloned from zmk-module-template-with-custom-studio-rpc.

Deterministically replaces every template placeholder (identifiers, paths,
URLs, artifact names), renames the placeholder files, and then verifies that
no placeholder is left behind. Run it once, right after cloning the template:

    python3 scripts/init_module.py --namespace cormoran --module my-feature

After it succeeds, follow the manual steps it prints (README rewrite,
AGENTS.md Initialization section removal) and run the test suite.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Paths that intentionally keep references to the template and must be
# neither rewritten nor scanned for leftovers.
EXCLUDED_PATHS = (
    "scripts/",
    "skills/",
    "DESIGN.md",
    ".github/workflows/template-sync.yml",
    "web/src/proto/",  # generated
)

# These hold the initialization instructions themselves. They are rewritten
# by hand (the agent removes the Initialization section), so the scan skips
# them here; scripts/check_placeholders.py covers them afterwards.
INSTRUCTION_FILES = ("AGENTS.md", "CLAUDE.md")

# A line containing this marker is left untouched by both apply_replacements
# and scan_placeholders, even if it contains a token that would otherwise be
# rewritten/flagged. Use it for text that must keep referring to the template
# itself forever (e.g. an attribution link), as opposed to a placeholder that
# every fork is expected to replace with its own values.
IGNORE_MARKER = "zmk-module-template:keep"

# If any of these strings survives outside the excluded paths, the
# initialization is incomplete. scripts/check_placeholders.py enforces the
# same list from pre-commit once the AGENTS.md Initialization section is gone.
PLACEHOLDER_TOKENS = (
    "your-name",
    "your_name",
    "ZMK_TEMPLATE_FEATURE",
    "module_template_board",
    "template_handler",
    "template_feature_meta",
    "template_rpc_handle_request",
    "template_sample_bool",
    "/repo-name/",
    "zmk-module-template",
)

NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")


def kebab(value: str) -> str:
    return value.strip().lower().replace("_", "-").replace(" ", "-")


def snake(value: str) -> str:
    return kebab(value).replace("-", "_")


def tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        check=True,
    ).stdout
    return [REPO_ROOT / line for line in out.splitlines() if line]


def is_excluded(path: Path, *, for_scan: bool) -> bool:
    rel = path.relative_to(REPO_ROOT).as_posix()
    if any(
        rel.startswith(prefix) or rel == prefix.rstrip("/") for prefix in EXCLUDED_PATHS
    ):
        return True
    if for_scan and rel in INSTRUCTION_FILES:
        return True
    return False


def read_text(path: Path) -> str | None:
    if path.is_symlink() or not path.is_file():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def build_replacements(
    ns_kebab: str, mod_kebab: str, repo: str, owner: str
) -> list[tuple[str, str]]:
    ns_snake = snake(ns_kebab)
    mod_snake = snake(mod_kebab)
    mod_upper = mod_snake.upper()
    # Ordered: most specific strings first so partially-overlapping rules
    # never see already-rewritten text.
    return [
        ("zmk-module-template-with-custom-studio-rpc", repo),
        ("zmk-module-template-rename-please", repo),
        (
            "http://cormoran.github.io/zmk-module-template/",
            f"https://{owner}.github.io/{repo}/",
        ),
        (
            "# cormoran's ZMK Module Template for ZMK (with Custom Studio RPC)",
            f"# {repo}",
        ),
        ("cormoran/zmk-module-template", f"{owner}/{repo}"),
        ("- name: zmk-module-template", f"- name: {repo}"),
        ('"/repo-name/"', f'"/{repo}/"'),
        ("ZMK_TEMPLATE_FEATURE", f"ZMK_{mod_upper}"),
        ("module_template_board", f"{mod_snake}_board"),
        ("your_name_template_", f"{ns_snake}_{mod_snake}_"),
        ("your_name__template", f"{ns_snake}__{mod_snake}"),
        ("your_name.template", f"{ns_snake}.{mod_snake}"),
        (
            "your-name/template/template.pb.h",
            f"{ns_kebab}/{mod_kebab}/{mod_snake}.pb.h",
        ),
        (
            "proto/your-name/template/template",
            f"proto/{ns_kebab}/{mod_kebab}/{mod_snake}",
        ),
        ("your-name/template", f"{ns_kebab}/{mod_kebab}"),
        ("template_handler.c", f"{mod_snake}_handler.c"),
        ("template_feature_meta", f"{mod_snake}_subsystem_meta"),
        ("template_rpc_handle_request", f"{mod_snake}_rpc_handle_request"),
        ("template_sample_bool", f"{mod_snake}_sample_bool"),
        ("template.proto", f"{mod_snake}.proto"),
        ("template.options", f"{mod_snake}.options"),
        ("template.ts", f"{mod_snake}.ts"),
        ("Enable template feature", f"Enable {mod_kebab} feature"),
        ("the template module", f"the {mod_kebab} module"),
        ("Failed to decode template request", f"Failed to decode {mod_snake} request"),
        (
            "Unsupported template request type",
            f"Unsupported {mod_snake} request type",
        ),
        ("ZMK Module Template", repo),
        ("Template Module", repo),
    ]


def build_renames(ns_kebab: str, mod_kebab: str) -> list[tuple[str, str]]:
    mod_snake = snake(mod_kebab)
    proto_dir = f"proto/{ns_kebab}/{mod_kebab}"
    return [
        ("proto/your-name/template/template.proto", f"{proto_dir}/{mod_snake}.proto"),
        (
            "proto/your-name/template/template.options",
            f"{proto_dir}/{mod_snake}.options",
        ),
        ("src/studio/template_handler.c", f"src/studio/{mod_snake}_handler.c"),
    ]


def apply_replacements(replacements: list[tuple[str, str]], dry_run: bool) -> int:
    changed = 0
    for path in tracked_files():
        if is_excluded(path, for_scan=False):
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in INSTRUCTION_FILES:
            continue
        text = read_text(path)
        if text is None:
            continue
        # Applied line-by-line (rather than over the whole file) so a line
        # carrying IGNORE_MARKER can opt out of every rule; no current rule's
        # "old" string spans multiple lines, so this is behaviorally
        # equivalent for everything else.
        lines = text.split("\n")
        new_lines = []
        for line in lines:
            if IGNORE_MARKER in line:
                new_lines.append(line)
                continue
            new_line = line
            for old, new in replacements:
                new_line = new_line.replace(old, new)
            new_lines.append(new_line)
        new_text = "\n".join(new_lines)
        if new_text != text:
            changed += 1
            print(f"rewrite {rel}")
            if not dry_run:
                path.write_text(new_text, encoding="utf-8")
    return changed


def apply_renames(renames: list[tuple[str, str]], dry_run: bool) -> None:
    for old_rel, new_rel in renames:
        old_path = REPO_ROOT / old_rel
        if not old_path.exists():
            print(f"skip rename (missing): {old_rel}")
            continue
        print(f"rename {old_rel} -> {new_rel}")
        if dry_run:
            continue
        (REPO_ROOT / new_rel).parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "mv", old_rel, new_rel], cwd=REPO_ROOT, check=True)
    if not dry_run:
        for leftover in ("proto/your-name/template", "proto/your-name"):
            leftover_path = REPO_ROOT / leftover
            if leftover_path.is_dir() and not any(leftover_path.iterdir()):
                leftover_path.rmdir()


def scan_placeholders(
    skip_instruction_files: bool = True,
) -> list[tuple[str, int, str]]:
    """Return (relative path, line number, line) for every leftover token."""
    findings = []
    for path in tracked_files():
        if is_excluded(path, for_scan=skip_instruction_files):
            continue
        text = read_text(path)
        if text is None:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if IGNORE_MARKER in line:
                continue
            if any(token in line for token in PLACEHOLDER_TOKENS):
                rel = path.relative_to(REPO_ROOT).as_posix()
                findings.append((rel, lineno, line.strip()))
    return findings


def report_findings(findings: list[tuple[str, int, str]]) -> None:
    for rel, lineno, line in findings:
        print(f"  {rel}:{lineno}: {line}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--namespace",
        help="Module author namespace, e.g. your GitHub user name (kebab-case).",
    )
    parser.add_argument(
        "--module",
        help="Module feature name in kebab-case, e.g. my-feature.",
    )
    parser.add_argument(
        "--repo",
        help="Repository name. Default: zmk-<module>.",
    )
    parser.add_argument(
        "--owner",
        help="GitHub owner used for the web UI URL. Default: same as --namespace.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without modifying files.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only scan for leftover placeholders and exit non-zero if any.",
    )
    args = parser.parse_args()

    if args.verify_only:
        findings = scan_placeholders()
        if findings:
            print("Leftover template placeholders found:")
            report_findings(findings)
            return 1
        print("OK: no template placeholders left.")
        return 0

    if not args.namespace or not args.module:
        parser.error("--namespace and --module are required (or use --verify-only)")

    ns_kebab = kebab(args.namespace)
    mod_kebab = kebab(args.module)
    for label, value in (("--namespace", ns_kebab), ("--module", mod_kebab)):
        if not NAME_RE.match(value):
            parser.error(f"{label} must be kebab-case ([a-z][a-z0-9-]*), got: {value}")
    if mod_kebab == "template" or ns_kebab == "your-name":
        parser.error("--namespace/--module must not be the placeholder values")

    repo = args.repo or f"zmk-{mod_kebab}"
    owner = args.owner or ns_kebab

    replacements = build_replacements(ns_kebab, mod_kebab, repo, owner)
    renames = build_renames(ns_kebab, mod_kebab)

    changed = apply_replacements(replacements, args.dry_run)
    apply_renames(renames, args.dry_run)
    print(f"{changed} files rewritten{' (dry run)' if args.dry_run else ''}.")

    if args.dry_run:
        return 0

    findings = scan_placeholders()
    if findings:
        print("\nWARNING: leftover placeholders need manual fixes:")
        report_findings(findings)
    else:
        print("Verification OK: no template placeholders left.")

    print(
        "\nRemaining manual steps:\n"
        "  1. Rewrite README.md for your module (description, Module User\n"
        "     Guide, west.yml sample remotes if the owner is not cormoran).\n"
        "  2. Remove the Initialization section from AGENTS.md\n"
        "     (CLAUDE.md is a symlink, do not edit it separately).\n"
        "  3. Run: python3 -m unittest\n"
        "  4. Run: cd web && npm ci && npm run generate && npm test\n"
        "  5. Commit the result before implementing features."
    )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
