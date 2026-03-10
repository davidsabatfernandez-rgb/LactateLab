from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import MetaData, create_engine, select


TABLE_EXPORT_ORDER = [
    "users",
    "athletes",
    "athlete_weight_history",
    "athlete_focus_blocks",
    "athlete_targets",
    "sessions",
    "session_intervals",
    "lactate_samples",
    "planned_sessions",
    "physiological_snapshots",
    "derived_metrics",
    "performance_estimates",
]


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def serialize_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a PostgreSQL database snapshot to JSON.")
    parser.add_argument("--db-url", required=True, help="PostgreSQL connection string.")
    parser.add_argument(
        "--output",
        default=None,
        help="Output file path. Defaults to backend/backups/render-backup-<timestamp>.json",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    engine = create_engine(normalize_database_url(args.db_url), future=True)
    metadata = MetaData()
    metadata.reflect(bind=engine)

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else Path(__file__).resolve().parents[1] / "backups" / f"render-backup-{timestamp}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    snapshot: dict[str, object] = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "tables": {},
    }

    with engine.connect() as connection:
        for table_name in TABLE_EXPORT_ORDER:
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            rows = [
                {key: serialize_value(value) for key, value in row._mapping.items()}
                for row in connection.execute(select(table)).fetchall()
            ]
            snapshot["tables"][table_name] = rows

    output_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
