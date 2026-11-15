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
    Guarantees backend/data/patchpilot.db is NEVER created or touched during testing.
    """
    temp_db_file = tmp_path / "patchpilot_test.db"
    monkeypatch.setenv("PATCHPILOT_DB_PATH", str(temp_db_file))
    yield
    assert not DATABASE_PATH.exists(), (
        f"CRITICAL SAFETY VIOLATION: Test created or touched live database file at {DATABASE_PATH}"
    )
