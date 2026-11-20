"""
Global pytest configuration and fixtures for PatchPilot backend tests.
"""

from pathlib import Path
import pytest

from app.core.config import DATABASE_PATH


@pytest.fixture(autouse=True)
def isolate_test_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """
    Autouse fixture ensuring every test runs against an isolated temporary SQLite database.
    Sets PATCHPILOT_DB_PATH to a fresh temporary file in tmp_path.
    Guarantees backend/data/patchpilot.db is NEVER created, deleted, or modified during testing.
    """
    temp_db_file = tmp_path / "patchpilot_test.db"
    monkeypatch.setenv("PATCHPILOT_DB_PATH", str(temp_db_file))

    existed_before = DATABASE_PATH.exists()
    mtime_before = DATABASE_PATH.stat().st_mtime_ns if existed_before else None
    size_before = DATABASE_PATH.stat().st_size if existed_before else None

    yield

    if not existed_before:
        assert not DATABASE_PATH.exists(), (
            f"CRITICAL SAFETY VIOLATION: Test created live database file at {DATABASE_PATH}"
        )
    else:
        assert DATABASE_PATH.exists(), (
            f"CRITICAL SAFETY VIOLATION: Test deleted live database file at {DATABASE_PATH}"
        )
        stat_after = DATABASE_PATH.stat()
        assert stat_after.st_mtime_ns == mtime_before, (
            f"CRITICAL SAFETY VIOLATION: Test modified live database file at {DATABASE_PATH} "
            f"(mtime changed from {mtime_before} to {stat_after.st_mtime_ns})"
        )
        assert stat_after.st_size == size_before, (
            f"CRITICAL SAFETY VIOLATION: Test modified live database file size at {DATABASE_PATH} "
            f"(size changed from {size_before} to {stat_after.st_size})"
        )
