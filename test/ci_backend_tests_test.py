from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "ci_backend_tests.py"
SPEC = importlib.util.spec_from_file_location("ci_backend_tests", SCRIPT_PATH)
assert SPEC and SPEC.loader
ci_backend_tests = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ci_backend_tests)


class CiBackendTestsScriptTest(unittest.TestCase):
    def test_run_command_streams_output_and_records_original_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            log_file = root / "backend-tests.log"
            output_file = root / "github-output.txt"
            command = [
                sys.executable,
                "-c",
                "print('backend output'); raise SystemExit(3)",
            ]

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = ci_backend_tests.run_and_capture(command, log_file, output_file)

            self.assertEqual(exit_code, 3)
            self.assertEqual(log_file.read_text(encoding="utf-8"), "backend output\n")
            self.assertEqual(output_file.read_text(encoding="utf-8"), "exit_code=3\n")
            self.assertIn("backend output", stdout.getvalue())

    def test_failure_summary_keeps_totals_and_failed_test_section(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_file = Path(temporary_directory) / "backend-tests.log"
            log_file.write_text(
                "✔ passing test\n"
                "ℹ tests 2\n"
                "ℹ pass 1\n"
                "ℹ fail 1\n"
                "✖ failing tests:\n\n"
                "test at test/example.test.js:1:1\n"
                "✖ example failure\n",
                encoding="utf-8",
            )

            summary = ci_backend_tests.build_summary(log_file, 1)

            self.assertIn("ℹ tests 2", summary)
            self.assertIn("ℹ fail 1", summary)
            self.assertIn("✖ failing tests:", summary)
            self.assertIn("✖ example failure", summary)
            self.assertNotIn("✅", summary)

    def test_success_summary_reports_passing_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_file = Path(temporary_directory) / "backend-tests.log"
            log_file.write_text("ℹ tests 4\nℹ pass 4\nℹ fail 0\n", encoding="utf-8")

            summary = ci_backend_tests.build_summary(log_file, 0)

            self.assertIn("✅ All backend tests and coverage thresholds passed.", summary)
            self.assertNotIn("### Failure details", summary)

    def test_enforce_returns_captured_status_and_emits_annotation(self) -> None:
        stdout = io.StringIO()
        args = type("Args", (), {"exit_code": None})()
        with mock.patch.dict(os.environ, {"TEST_EXIT_CODE": "7"}, clear=False):
            with contextlib.redirect_stdout(stdout):
                exit_code = ci_backend_tests.command_enforce(args)

        self.assertEqual(exit_code, 7)
        self.assertIn("::error title=Backend tests failed::", stdout.getvalue())

    def test_missing_log_produces_an_explicit_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            missing_log = Path(temporary_directory) / "missing.log"
            summary = ci_backend_tests.build_summary(missing_log, 1)

        self.assertIn("No backend test log was produced", summary)


if __name__ == "__main__":
    unittest.main()
