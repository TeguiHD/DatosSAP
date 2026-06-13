from pathlib import Path

import pytest

from main import dry_run


ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = ROOT.parent
POSITIONS_FILE = SOURCE_ROOT / "Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx"
ARCHIVE_ROOT = SOURCE_ROOT / "archivo-versiones-antiguas" / "26MayoPRUEBAPOWERBI"
KKS_FILE = ARCHIVE_ROOT / "Arbol Jerarquico ESSC 2026 (Fiori).xlsx"
PLANS_FILE = ARCHIVE_ROOT / "Planes_Mantencion_ESSC.xlsx"


def test_posiciones_counts_real_excel() -> None:
    if not POSITIONS_FILE.exists():
        pytest.skip("Excel real de Posiciones no disponible fuera del entorno local")
    result = dry_run(POSITIONS_FILE, None)
    assert result.metadata["templates"] == 283
    assert result.metadata["month_columns"] == 96
    assert result.metadata["occurrences"] == 3061
    critical_issues = [
        issue
        for issue in result.issues
        if issue.severity == "CRITICAL"
    ]
    assert result.created == 283
    assert result.skipped == 0
    assert result.errors == 1
    assert [issue.code for issue in critical_issues] == [
        "CEMIN_ALIAS_REQUIRED"
    ]


def test_kks_counts_real_excel() -> None:
    if not KKS_FILE.exists():
        pytest.skip("Excel real KKS no disponible fuera del entorno local")
    result = dry_run(KKS_FILE, None)
    assert result.metadata["rows"] == 4837
    assert result.metadata["equipment"] == 4169
    assert result.metadata["technical_locations"] == 668
    assert result.metadata["root_nodes"] == 27
    assert result.metadata["resolved_parent_refs"] == 4810
    assert result.metadata["missing_parent_refs"] == 0
    assert result.errors == 0


def test_planes_counts_real_excel() -> None:
    if not PLANS_FILE.exists():
        pytest.skip("Excel real de Planes no disponible fuera del entorno local")
    result = dry_run(PLANS_FILE, None)
    assert result.metadata["work_orders"] == 12
    assert result.metadata["planned_hours"] == 432
    assert result.metadata["actual_hours"] == 178
    assert result.metadata["statuses"] == {
        "COMPLETED": 2,
        "IN_PROGRESS": 10,
    }
    assert result.metadata["criticalities"] == {"CRITICAL": 12}
    assert result.errors == 0
