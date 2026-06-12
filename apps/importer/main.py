from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from openpyxl import load_workbook
from parsers.kks_parser import KksDryRun, parse_kks_file
from parsers.positions_parser import (
    PositionsDryRun,
    parse_positions_file,
)


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    row_number: int | None = None
    suggested_action: str | None = None


@dataclass
class DryRun:
    file_type: str
    created: int
    updated: int
    skipped: int
    errors: int
    issues: list[Issue]
    metadata: dict[str, Any]


def normalize_header(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    replacements = {
        "técnico": "tecnico",
        "planificación": "planificacion",
        "Descripción": "Descripcion",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


def row_hash(values: Iterable[Any]) -> str:
    payload = json.dumps([str(value) if value is not None else None for value in values], ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def non_empty(values: Iterable[Any]) -> list[Any]:
    return [value for value in values if value not in (None, "")]


def json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def raw_row(header: list[str], row: Iterable[Any]) -> dict[str, Any]:
    return {header[index] if index < len(header) and header[index] else f"col_{index}": json_value(value) for index, value in enumerate(row)}


def plant_code_from(value: Any) -> str | None:
    if value is None:
        return None
    match = re.search(r"\b(ESZS-[A-Z0-9]+|EGZN)\b", str(value).strip())
    return match.group(1) if match else None


def detect_file(path: Path) -> str:
    workbook = load_workbook(path, read_only=True, data_only=True)
    names = {name.lower() for name in workbook.sheetnames}
    if "actividades mp essc sur" in names:
        return "POSICIONES_ESSC_SUR"
    if "planes" in names:
        return "PLANES_MANTENCION"
    if any("kks essc" in name for name in names):
        return "KKS_FIORI"
    raise ValueError(f"Unsupported Excel structure: {path.name}")


def parse_kks(path: Path) -> KksDryRun:
    return parse_kks_file(path).dry_run()


def parse_posiciones(path: Path) -> PositionsDryRun:
    return parse_positions_file(path).dry_run()


def parse_planes(path: Path) -> DryRun:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Planes"]
    rows = sheet.iter_rows(values_only=True)
    header = [str(value).strip() if value is not None else "" for value in next(rows)]
    header_index = {name: index for index, name in enumerate(header)}
    required = {
        "plan_id",
        "equipo",
        "kks",
        "descripcion_plan",
        "fecha_inicio",
        "fecha_termino",
        "hh_planificadas",
        "hh_ejecutadas",
        "porcentaje_avance",
        "estado",
        "criticidad",
        "puesto_trabajo",
        "especialidad",
        "personal_asignado",
    }
    issues = [
        Issue(
            severity="CRITICAL",
            code="PLANES_HEADER_MISSING",
            message=f"Missing expected header: {name}",
            suggested_action="Review Planes_Mantencion_ESSC layout.",
        )
        for name in sorted(required - set(header_index))
    ]
    total = 0
    planned_hours = 0.0
    actual_hours = 0.0
    states: Counter[str] = Counter()
    criticalities: Counter[str] = Counter()
    for row_number, row in enumerate(rows, start=2):
        if not non_empty(row):
            continue
        total += 1
        planned_hours += float(row[header_index["hh_planificadas"]] or 0)
        actual_hours += float(row[header_index["hh_ejecutadas"]] or 0)
        states[str(row[header_index["estado"]]).strip()] += 1
        criticalities[str(row[header_index["criticidad"]]).strip()] += 1
        _ = row_number

    return DryRun(
        file_type="PLANES_MANTENCION",
        created=total,
        updated=0,
        skipped=0,
        errors=len([issue for issue in issues if issue.severity == "CRITICAL"]),
        issues=issues,
        metadata={
            "sheet": sheet.title,
            "work_orders": total,
            "planned_hours": planned_hours,
            "actual_hours": actual_hours,
            "states": dict(states),
            "criticalities": dict(criticalities),
        },
    )


def export_kks(path: Path) -> dict[str, Any]:
    return parse_kks_file(path).export_payload()


def export_posiciones(path: Path) -> dict[str, Any]:
    return parse_positions_file(path).export_payload()


def export_planes(path: Path) -> dict[str, Any]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Planes"]
    rows = sheet.iter_rows(values_only=True)
    header = [str(value).strip() if value is not None else "" for value in next(rows)]
    header_index = {name: index for index, name in enumerate(header)}
    work_orders: list[dict[str, Any]] = []

    for row_number, row in enumerate(rows, start=2):
        if not non_empty(row):
            continue
        kks = json_value(row[header_index["kks"]])
        work_orders.append(
            {
                "rowNumber": row_number,
                "planId": json_value(row[header_index["plan_id"]]),
                "plantCode": plant_code_from(kks),
                "equipment": json_value(row[header_index["equipo"]]),
                "kks": kks,
                "title": json_value(row[header_index["descripcion_plan"]]),
                "plannedStart": json_value(row[header_index["fecha_inicio"]]),
                "plannedEnd": json_value(row[header_index["fecha_termino"]]),
                "plannedHours": float(row[header_index["hh_planificadas"]] or 0),
                "actualHours": float(row[header_index["hh_ejecutadas"]] or 0),
                "importedProgress": float(row[header_index["porcentaje_avance"]] or 0),
                "status": json_value(row[header_index["estado"]]),
                "criticality": json_value(row[header_index["criticidad"]]),
                "workCenter": json_value(row[header_index["puesto_trabajo"]]),
                "specialty": json_value(row[header_index["especialidad"]]),
                "assignedTo": json_value(row[header_index["personal_asignado"]]),
                "raw": raw_row(header, row),
                "sourceHash": row_hash(row),
            }
        )

    return {"fileType": "PLANES_MANTENCION", "workOrders": work_orders}


def export_rows(path: Path, file_type: str | None) -> dict[str, Any]:
    detected = file_type or detect_file(path)
    if detected == "KKS_FIORI":
        return export_kks(path)
    if detected == "POSICIONES_ESSC_SUR":
        return export_posiciones(path)
    if detected == "PLANES_MANTENCION":
        return export_planes(path)
    raise ValueError(f"Unsupported file type: {detected}")


def to_json(
    result: DryRun | KksDryRun | PositionsDryRun,
) -> str:
    payload = asdict(result)
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)


def dry_run(
    path: Path,
    file_type: str | None,
) -> DryRun | KksDryRun | PositionsDryRun:
    detected = file_type or detect_file(path)
    if detected == "KKS_FIORI":
        return parse_kks(path)
    if detected == "POSICIONES_ESSC_SUR":
        return parse_posiciones(path)
    if detected == "PLANES_MANTENCION":
        return parse_planes(path)
    raise ValueError(f"Unsupported file type: {detected}")


def main() -> None:
    parser = argparse.ArgumentParser(description="datos.nicoholas Excel importer")
    sub = parser.add_subparsers(dest="command", required=True)
    dry = sub.add_parser("dry-run")
    dry.add_argument("--file", required=True)
    dry.add_argument("--type", choices=["KKS_FIORI", "POSICIONES_ESSC_SUR", "PLANES_MANTENCION"])
    export = sub.add_parser("export")
    export.add_argument("--file", required=True)
    export.add_argument("--type", choices=["KKS_FIORI", "POSICIONES_ESSC_SUR", "PLANES_MANTENCION"])
    args = parser.parse_args()

    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    if args.command == "dry-run":
        print(to_json(dry_run(path, args.type)))
    if args.command == "export":
        print(json.dumps(export_rows(path, args.type), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
