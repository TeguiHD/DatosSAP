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


KKS_HEADERS = [
    "Clase de objeto tecnico",
    "Objeto tecnico superior",
    "Objeto tecnico",
    "Grupo de planificacion",
    "Emplazamiento",
    "Puesto de trabajo principal",
    "Estado del sistema",
    "Centro de emplazamiento",
    "Centro de coste",
    "Elemento PEP",
    "KKS",
    "Descripcion KKS",
    "Equipo",
    "Descripcion Equipo",
    "Centro",
]


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


def parse_kks(path: Path) -> DryRun:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["KKS ESSC General"] if "KKS ESSC General" in workbook.sheetnames else workbook[workbook.sheetnames[0]]
    rows = sheet.iter_rows(values_only=True)
    header = [normalize_header(value) for value in next(rows)]
    header_index = {name: index for index, name in enumerate(header)}
    missing_headers = [name for name in KKS_HEADERS if name not in header_index]
    issues = [
        Issue(
            severity="CRITICAL",
            code="KKS_HEADER_MISSING",
            message=f"Missing expected header: {name}",
            suggested_action="Review the Fiori export layout before apply.",
        )
        for name in missing_headers
    ]

    object_idx = header_index.get("Objeto tecnico")
    parent_idx = header_index.get("Objeto tecnico superior")
    type_idx = header_index.get("Clase de objeto tecnico")
    center_idx = header_index.get("Centro")

    objects: set[str] = set()
    parent_refs: list[tuple[int, str]] = []
    class_counts: Counter[str] = Counter()
    center_counts: Counter[str] = Counter()
    duplicate_objects: Counter[str] = Counter()
    row_count = 0

    for row_number, row in enumerate(rows, start=2):
        if not non_empty(row):
            continue
        row_count += 1
        technical_object = str(row[object_idx]).strip() if object_idx is not None and row[object_idx] else ""
        parent = str(row[parent_idx]).strip() if parent_idx is not None and row[parent_idx] else ""
        node_type = str(row[type_idx]).strip() if type_idx is not None and row[type_idx] else "UNKNOWN"
        center = str(row[center_idx]).strip() if center_idx is not None and row[center_idx] else "UNKNOWN"
        if technical_object:
            duplicate_objects[technical_object] += 1
            objects.add(technical_object)
        if parent:
            parent_refs.append((row_number, parent))
        class_counts[node_type] += 1
        center_counts[center] += 1
        _ = row_hash(row)

    missing_parent_refs = [(row_number, parent) for row_number, parent in parent_refs if parent not in objects]
    for row_number, parent in missing_parent_refs[:20]:
        issues.append(
            Issue(
                severity="WARNING",
                code="KKS_PARENT_NOT_FOUND",
                message=f"Parent object was not found in source: {parent}",
                row_number=row_number,
                suggested_action="Keep node importable but mark hierarchy issue for review.",
            )
        )

    duplicate_count = sum(count - 1 for count in duplicate_objects.values() if count > 1)
    if duplicate_count:
        issues.append(
            Issue(
                severity="WARNING",
                code="KKS_DUPLICATE_OBJECTS",
                message=f"Detected {duplicate_count} duplicate technical object rows.",
                suggested_action="Use source hash and latest row to reconcile duplicates.",
            )
        )

    return DryRun(
        file_type="KKS_FIORI",
        created=row_count,
        updated=0,
        skipped=0,
        errors=len([issue for issue in issues if issue.severity == "CRITICAL"]),
        issues=issues,
        metadata={
            "sheet": sheet.title,
            "rows": row_count,
            "technical_locations": class_counts.get("Ubicacion tecnica", 0) + class_counts.get("Ubicación técnica", 0),
            "equipment": class_counts.get("Equipo", 0),
            "centers": dict(center_counts.most_common(8)),
            "missing_parent_refs": len(missing_parent_refs),
        },
    )


def parse_posiciones(path: Path) -> DryRun:
    values_workbook = load_workbook(path, read_only=True, data_only=True)
    formula_workbook = load_workbook(path, read_only=True, data_only=False)
    sheet = values_workbook["Actividades MP ESSC Sur"]
    formula_sheet = formula_workbook["Actividades MP ESSC Sur"]
    header_row = 5
    header = list(next(sheet.iter_rows(min_row=header_row, max_row=header_row, values_only=True)))
    month_columns = [
        (index, value)
        for index, value in enumerate(header)
        if index >= 12 and isinstance(value, datetime)
    ]
    issues: list[Issue] = []
    if len(month_columns) != 96:
        issues.append(
            Issue(
                severity="CRITICAL",
                code="POSITION_MONTH_COUNT_INVALID",
                message=f"Expected 96 month columns, found {len(month_columns)}.",
                suggested_action="Verify the header row and Excel export.",
            )
        )

    template_count = 0
    occurrence_count = 0
    frequency_counts: Counter[str] = Counter()
    occurrence_counts: Counter[str] = Counter()
    cemin_rows: list[int] = []
    formulas_seen = False

    value_rows = sheet.iter_rows(min_row=header_row + 1, values_only=True)
    formula_rows = formula_sheet.iter_rows(min_row=header_row + 1, values_only=True)
    for row_number, (row, formula_row) in enumerate(zip(value_rows, formula_rows), start=header_row + 1):
        if not non_empty(row):
            continue
        template_count += 1
        frequency = str(row[9]).strip() if len(row) > 9 and row[9] else ""
        formula_frequency = str(formula_row[9]).strip() if len(formula_row) > 9 and formula_row[9] else ""
        if formula_frequency.startswith("="):
            formulas_seen = True
        frequency_counts[frequency] += 1
        location = str(row[4]).strip() if len(row) > 4 and row[4] else ""
        if "ESZS-A1" in location:
            cemin_rows.append(row_number)
        for index, month in month_columns:
            value = row[index] if index < len(row) else None
            if value not in (None, ""):
                occurrence_count += 1
                occurrence_counts[str(value).strip()] += 1
                _ = month

    if formulas_seen:
        issues.append(
            Issue(
                severity="INFO",
                code="POSITION_FREQUENCY_FORMULAS",
                message="Frec. column contains formulas in workbook; importer used data_only=True cached values.",
                suggested_action="Keep data_only=True enabled for this file type.",
            )
        )
    if cemin_rows:
        issues.append(
            Issue(
                severity="CRITICAL",
                code="CEMIN_ALIAS_REQUIRED",
                message="CEMIN appears as ESZS-A1 but KKS Fiori uses ESZS-B2 / PLANTA 012 CEMIN CATEMU.",
                row_number=cemin_rows[0],
                suggested_action="Create PlantAlias or ImportMapping ESZS-A1 -> ESZS-B2 before apply.",
            )
        )

    return DryRun(
        file_type="POSICIONES_ESSC_SUR",
        created=template_count + occurrence_count,
        updated=0,
        skipped=0,
        errors=len([issue for issue in issues if issue.severity == "CRITICAL"]),
        issues=issues,
        metadata={
            "sheet": sheet.title,
            "header_row": header_row,
            "templates": template_count,
            "month_columns": len(month_columns),
            "occurrences": occurrence_count,
            "frequencies": dict(frequency_counts),
            "occurrences_by_frequency": dict(occurrence_counts),
            "first_month": month_columns[0][1].date().isoformat() if month_columns else "",
            "last_month": month_columns[-1][1].date().isoformat() if month_columns else "",
        },
    )


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
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["KKS ESSC General"] if "KKS ESSC General" in workbook.sheetnames else workbook[workbook.sheetnames[0]]
    rows = sheet.iter_rows(values_only=True)
    header = [normalize_header(value) for value in next(rows)]
    header_index = {name: index for index, name in enumerate(header)}
    parsed_rows: list[dict[str, Any]] = []

    for row_number, row in enumerate(rows, start=2):
        if not non_empty(row):
            continue
        technical_object = str(row[header_index["Objeto tecnico"]]).strip()
        node_class = str(row[header_index["Clase de objeto tecnico"]]).strip()
        plant_code = plant_code_from(technical_object) or plant_code_from(row[header_index.get("Centro", 0)])
        parsed_rows.append(
            {
                "rowNumber": row_number,
                "technicalObject": technical_object,
                "superiorObject": str(row[header_index["Objeto tecnico superior"]]).strip()
                if row[header_index["Objeto tecnico superior"]]
                else None,
                "nodeType": "EQUIPMENT" if "Equipo" in node_class else "TECHNICAL_LOCATION",
                "plantCode": plant_code,
                "kks": json_value(row[header_index["KKS"]]),
                "kksDescription": json_value(row[header_index["Descripcion KKS"]]),
                "equipmentCode": json_value(row[header_index["Equipo"]]),
                "equipmentDescription": json_value(row[header_index["Descripcion Equipo"]]),
                "planningGroup": json_value(row[header_index["Grupo de planificacion"]]),
                "site": json_value(row[header_index["Emplazamiento"]]),
                "systemStatus": json_value(row[header_index["Estado del sistema"]]),
                "center": json_value(row[header_index["Centro"]]),
                "workCenter": json_value(row[header_index["Puesto de trabajo principal"]]),
                "costCenter": json_value(row[header_index["Centro de coste"]]),
                "raw": raw_row(header, row),
                "sourceHash": row_hash(row),
            }
        )

    return {"fileType": "KKS_FIORI", "rows": parsed_rows}


def export_posiciones(path: Path) -> dict[str, Any]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Actividades MP ESSC Sur"]
    header_row = 5
    header = list(next(sheet.iter_rows(min_row=header_row, max_row=header_row, values_only=True)))
    normalized_header = [normalize_header(value) for value in header]
    month_columns = [
        (index, value)
        for index, value in enumerate(header)
        if index >= 12 and isinstance(value, datetime)
    ]
    templates: list[dict[str, Any]] = []

    for row_number, row in enumerate(sheet.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        if not non_empty(row):
            continue
        location = str(row[4]).strip() if len(row) > 4 and row[4] else ""
        frequency = str(row[9]).strip() if len(row) > 9 and row[9] else "CUSTOM"
        occurrences: list[dict[str, Any]] = []
        for index, month in month_columns:
            value = row[index] if index < len(row) else None
            if value not in (None, ""):
                occurrences.append(
                    {
                        "scheduledFor": datetime(month.year, month.month, 1).isoformat(),
                        "sourceMonthKey": f"{month.year}-{month.month:02d}",
                        "sourceValue": str(value).strip(),
                        "sourceHash": hashlib.sha256(f"{row_hash(row)}:{month.year}-{month.month:02d}:{value}".encode()).hexdigest(),
                    }
                )
        templates.append(
            {
                "rowNumber": row_number,
                "plantCode": plant_code_from(location),
                "wbsElement": json_value(row[1] if len(row) > 1 else None),
                "planName": json_value(row[2] if len(row) > 2 else None),
                "routeSheet": json_value(row[3] if len(row) > 3 else None),
                "technicalLocation": location,
                "equipment": json_value(row[5] if len(row) > 5 else None),
                "sourcePosition": json_value(row[6] if len(row) > 6 else None),
                "activityName": json_value(row[7] if len(row) > 7 else None),
                "frequencyLabel": json_value(row[8] if len(row) > 8 else None),
                "frequency": frequency,
                "monthsInterval": int(row[10]) if len(row) > 10 and isinstance(row[10], (int, float)) else None,
                "startMonth": int(row[11]) if len(row) > 11 and isinstance(row[11], (int, float)) else None,
                "occurrences": occurrences,
                "raw": raw_row(normalized_header, row),
                "sourceHash": row_hash(row),
            }
        )

    return {"fileType": "POSICIONES_ESSC_SUR", "templates": templates}


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


def to_json(result: DryRun) -> str:
    payload = asdict(result)
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)


def dry_run(path: Path, file_type: str | None) -> DryRun:
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
