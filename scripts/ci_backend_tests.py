#!/usr/bin/env python3
"""Run backend tests and publish GitHub Actions diagnostics without shell-specific logic."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Sequence

DEFAULT_LOG_FILE = Path("test-results/ci/backend-tests.log")
FAILURE_MARKER = "✖ failing tests:"
TOTAL_PREFIX = "ℹ "


def normalize_exit_code(value: object, fallback: int = 1) -> int:
    """Return a shell-safe process exit code."""
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return fallback
    return parsed if 0 <= parsed <= 255 else fallback


def append_github_value(path: Path, name: str, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"{name}={value}\n")


def run_and_capture(command: Sequence[str], log_file: Path, output_file: Path | None) -> int:
    """Stream a command to the console and a UTF-8 log while preserving its exit code."""
    if not command:
        raise ValueError("A command is required after '--'.")

    log_file.parent.mkdir(parents=True, exist_ok=True)
    exit_code = 1

    try:
        with log_file.open("w", encoding="utf-8", newline="\n") as log_handle:
            try:
                process = subprocess.Popen(
                    list(command),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                )
            except OSError as error:
                message = f"Unable to start backend test command: {error}\n"
                sys.stdout.write(message)
                sys.stdout.flush()
                log_handle.write(message)
                exit_code = 127
            else:
                assert process.stdout is not None
                with process.stdout:
                    for line in process.stdout:
                        sys.stdout.write(line)
                        sys.stdout.flush()
                        log_handle.write(line)
                exit_code = normalize_exit_code(process.wait())
    finally:
        if output_file is not None:
            append_github_value(output_file, "exit_code", exit_code)

    return exit_code


def select_failure_details(lines: Sequence[str], exit_code: int) -> list[str]:
    if exit_code == 0:
        return []

    try:
        start_index = lines.index(FAILURE_MARKER)
    except ValueError:
        return list(lines[-100:])
    return list(lines[start_index:][-220:])


def markdown_code_block(lines: Iterable[str]) -> str:
    content = "\n".join(lines)
    fence = "````" if "```" in content else "```"
    return f"{fence}text\n{content}\n{fence}"


def build_summary(log_file: Path, exit_code: int) -> str:
    sections = ["## Backend test results", ""]

    if not log_file.is_file() or log_file.stat().st_size == 0:
        sections.append("> No backend test log was produced.")
        return "\n".join(sections) + "\n"

    lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
    totals = [line for line in lines if line.startswith(TOTAL_PREFIX)][-8:]

    sections.extend(["### Totals", "", markdown_code_block(totals), ""])
    if exit_code == 0:
        sections.append("✅ All backend tests and coverage thresholds passed.")
    else:
        sections.extend([
            "### Failure details",
            "",
            markdown_code_block(select_failure_details(lines, exit_code)),
        ])
    return "\n".join(sections) + "\n"


def append_summary(summary_file: Path, summary: str) -> None:
    summary_file.parent.mkdir(parents=True, exist_ok=True)
    with summary_file.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(summary)


def resolve_exit_code(argument: str | None) -> int:
    return normalize_exit_code(argument if argument is not None else os.getenv("TEST_EXIT_CODE"))


def command_run(args: argparse.Namespace) -> int:
    command = list(args.command)
    if command and command[0] == "--":
        command.pop(0)

    github_output = os.getenv("GITHUB_OUTPUT")
    output_file = Path(github_output) if github_output else None
    run_and_capture(command, args.log_file, output_file)
    # The dedicated enforce step reapplies the recorded status after artifacts and summary are published.
    return 0


def command_summary(args: argparse.Namespace) -> int:
    summary_path = args.summary_file or os.getenv("GITHUB_STEP_SUMMARY")
    if not summary_path:
        raise RuntimeError("GITHUB_STEP_SUMMARY or --summary-file is required.")

    append_summary(Path(summary_path), build_summary(args.log_file, resolve_exit_code(args.exit_code)))
    return 0


def command_enforce(args: argparse.Namespace) -> int:
    exit_code = resolve_exit_code(args.exit_code)
    if exit_code != 0:
        print(
            "::error title=Backend tests failed::"
            "See the job summary and backend-test-log artifact for full details."
        )
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    run_parser = subparsers.add_parser("run", help="Run and capture backend tests.")
    run_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_FILE)
    run_parser.add_argument("command", nargs=argparse.REMAINDER)
    run_parser.set_defaults(handler=command_run)

    summary_parser = subparsers.add_parser("summary", help="Publish a GitHub job summary.")
    summary_parser.add_argument("--log-file", type=Path, default=DEFAULT_LOG_FILE)
    summary_parser.add_argument("--summary-file", type=Path)
    summary_parser.add_argument("--exit-code")
    summary_parser.set_defaults(handler=command_summary)

    enforce_parser = subparsers.add_parser("enforce", help="Return the captured backend test status.")
    enforce_parser.add_argument("--exit-code")
    enforce_parser.set_defaults(handler=command_enforce)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
