from pathlib import Path

import pytest

from parsers.kks_parser import (
    extract_last_parenthetical_code,
    normalize_header,
    parse_kks_file,
    plant_code_from_equipment,
)


ROOT = Path(__file__).resolve().parents[3]
KKS_FILE = (
    ROOT.parent
    / "archivo-versiones-antiguas"
    / "26MayoPRUEBAPOWERBI"
    / "Arbol Jerarquico ESSC 2026 (Fiori).xlsx"
)


def test_normalizes_sap_headers_without_accents() -> None:
    assert normalize_header("Clase de objeto técnico") == "clase de objeto tecnico"
    assert normalize_header("  Grupo de planificación  ") == "grupo de planificacion"


def test_extracts_last_sap_code_from_parent_display() -> None:
    assert extract_last_parenthetical_code("ESTACIONES DE RADIO (ERA) (EGZN-10-TUR10)") == "EGZN-10-TUR10"
    assert extract_last_parenthetical_code("(EGZN)") == "EGZN"
    assert extract_last_parenthetical_code(None) is None


def test_derives_operational_plant_code() -> None:
    assert plant_code_from_equipment("ESZS-B2-VNG10", "ESZS") == "ESZS-B2"
    assert plant_code_from_equipment("ESZN-50-VNG10", "ESZN") == "ESZN-50"
    assert plant_code_from_equipment("EGZN-10-TUR10", "EGZN") == "EGZN"


def test_real_kks_file_has_complete_identity_and_hierarchy() -> None:
    if not KKS_FILE.exists():
        pytest.skip("Excel real KKS no disponible fuera del entorno local")

    result = parse_kks_file(KKS_FILE)
    dry_run = result.dry_run()

    assert len(result.nodes) == 4837
    assert len({node.technical_object for node in result.nodes}) == 4837
    assert len({node.equipment_code for node in result.nodes}) == 4837
    assert dry_run.created == 4837
    assert dry_run.updated == 0
    assert dry_run.skipped == 0
    assert dry_run.errors == 0
    assert dry_run.metadata["root_nodes"] == 27
    assert dry_run.metadata["resolved_parent_refs"] == 4810
    assert dry_run.metadata["missing_parent_refs"] == 0
