from pathlib import Path

from main import dry_run


ROOT = Path(__file__).resolve().parents[3]


def test_posiciones_counts_real_excel() -> None:
    result = dry_run(ROOT / "Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx", None)
    assert result.metadata["templates"] == 283
    assert result.metadata["month_columns"] == 96
    assert result.metadata["occurrences"] == 3061
    assert any(issue.code == "CEMIN_ALIAS_REQUIRED" for issue in result.issues)


def test_kks_counts_real_excel() -> None:
    result = dry_run(ROOT / "26MayoPRUEBAPOWERBI/Arbol Jerarquico ESSC 2026 (Fiori).xlsx", None)
    assert result.metadata["rows"] == 4837
    assert result.metadata["equipment"] == 4169


def test_planes_counts_real_excel() -> None:
    result = dry_run(ROOT / "26MayoPRUEBAPOWERBI/Planes_Mantencion_ESSC.xlsx", None)
    assert result.metadata["work_orders"] == 12
    assert result.metadata["planned_hours"] == 432
    assert result.metadata["actual_hours"] == 178
