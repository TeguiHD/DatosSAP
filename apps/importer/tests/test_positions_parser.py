import calendar
from datetime import date
from pathlib import Path

import pytest

from parsers.positions_parser import parse_positions_file


ROOT = Path(__file__).resolve().parents[3]
POSITIONS_FILE = (
    ROOT.parent
    / "Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx"
)


@pytest.fixture(scope="module")
def parsed_positions():
    if not POSITIONS_FILE.exists():
        pytest.skip(
            "Excel real de Posiciones no disponible fuera del entorno local"
        )
    return parse_positions_file(
        POSITIONS_FILE,
        today=date(2026, 6, 11),
    )


def test_detects_real_header_and_complete_month_range(
    parsed_positions,
) -> None:
    metadata = parsed_positions.metadata

    assert metadata["sheet"] == "Actividades MP ESSC Sur"
    assert metadata["header_row"] == 5
    assert metadata["month_columns"] == 96
    assert metadata["first_month"] == "2022-01-01"
    assert metadata["last_month"] == "2029-12-01"


def test_preserves_expected_templates_and_occurrences(
    parsed_positions,
) -> None:
    dry_run = parsed_positions.dry_run()

    assert len(parsed_positions.templates) == 283
    assert dry_run.created == 283
    assert dry_run.updated == 0
    assert dry_run.skipped == 0
    assert dry_run.metadata["occurrences"] == 3061
    assert dry_run.metadata["historical_occurrences"] == 1722
    assert dry_run.metadata["future_occurrences"] == 1339


def test_reports_only_cemin_as_critical_blocker(
    parsed_positions,
) -> None:
    dry_run = parsed_positions.dry_run()
    critical_issues = [
        issue
        for issue in dry_run.issues
        if issue.severity == "CRITICAL"
    ]

    assert dry_run.errors == 1
    assert [issue.code for issue in critical_issues] == [
        "CEMIN_ALIAS_REQUIRED"
    ]
    assert dry_run.metadata["cemin_rows"] == 34
    assert dry_run.metadata["unknown_plant_rows"] == 0
    assert dry_run.metadata["unknown_frequency_rows"] == 0
    assert dry_run.metadata["frequency_mismatch_rows"] == 0


def test_marks_legacy_rows_without_inventing_asset_context(
    parsed_positions,
) -> None:
    inferred = [
        template
        for template in parsed_positions.templates
        if template.context_inferred
    ]

    assert len(inferred) == 95
    assert parsed_positions.metadata["asset_context_missing_rows"] == 95
    assert all(template.plant_code for template in inferred)
    assert all(template.technical_object is None for template in inferred)
    assert all(template.equipment_code is None for template in inferred)
    assert all(
        template.to_export_dict()["estimatedHours"] is None
        for template in parsed_positions.templates
    )


def test_frequency_mapping_matches_numeric_months(
    parsed_positions,
) -> None:
    expected = {
        "1M": ("ONE_MONTH", 1),
        "6M": ("SIX_MONTHS", 6),
        "1A": ("ONE_YEAR", 12),
        "5A": ("FIVE_YEARS", 60),
    }

    for template in parsed_positions.templates:
        frequency, months = expected[template.source_frequency]
        assert template.frequency == frequency
        assert template.months_interval == months


def test_occurrence_dates_and_idempotency_are_stable(
    parsed_positions,
) -> None:
    template_hashes = {
        template.idempotency_hash
        for template in parsed_positions.templates
    }
    occurrences = [
        (template.idempotency_hash, occurrence)
        for template in parsed_positions.templates
        for occurrence in template.occurrences
    ]
    occurrence_hashes = {
        occurrence.source_hash
        for _, occurrence in occurrences
    }
    occurrence_keys = {
        (template_hash, occurrence.scheduled_date)
        for template_hash, occurrence in occurrences
    }

    assert len(template_hashes) == 283
    assert len(occurrence_hashes) == 3061
    assert len(occurrence_keys) == 3061
    for _, occurrence in occurrences:
        assert occurrence.scheduled_date.day == 1
        assert occurrence.due_date.day == calendar.monthrange(
            occurrence.scheduled_date.year,
            occurrence.scheduled_date.month,
        )[1]
        assert occurrence.due_date.month == occurrence.scheduled_date.month
        assert occurrence.is_historical == (
            occurrence.scheduled_date < date(2026, 6, 11)
        )
