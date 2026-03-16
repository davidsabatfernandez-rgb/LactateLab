from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import MetaData, create_engine, select, text


TABLE_COPY_ORDER = [
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
    "training_zone_sets",
    "training_zones",
]


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate local SQLite data into a PostgreSQL database.")
    parser.add_argument(
        "--sqlite-path",
        default="data/lactate_lab.db",
        help="Path to the local SQLite database, relative to backend/ by default.",
    )
    parser.add_argument(
        "--target-db-url",
        required=True,
        help="Target PostgreSQL connection string.",
    )
    parser.add_argument(
        "--truncate-target",
        action="store_true",
        help="Delete existing data from the target tables before importing.",
    )
    return parser.parse_args()


def reflect_metadata(engine) -> MetaData:
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata


def truncate_target_tables(connection, metadata: MetaData) -> None:
    for table_name in reversed(TABLE_COPY_ORDER):
        if table_name in metadata.tables:
            connection.execute(text(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY CASCADE'))


def copy_table(source_connection, target_connection, source_table, target_table) -> int:
    rows = [dict(row._mapping) for row in source_connection.execute(select(source_table)).fetchall()]
    if not rows:
        return 0
    target_connection.execute(target_table.insert(), rows)
    return len(rows)


def sync_postgres_sequences(connection, metadata: MetaData) -> None:
    for table_name in TABLE_COPY_ORDER:
        table = metadata.tables.get(table_name)
        if table is None or "id" not in table.c:
            continue
        max_id = connection.execute(text(f'SELECT COALESCE(MAX(id), 0) FROM "{table_name}"')).scalar_one()
        connection.execute(
            text(
                """
                SELECT setval(
                    pg_get_serial_sequence(:table_name, 'id'),
                    CASE WHEN :max_id = 0 THEN 1 ELSE :max_id END,
                    :is_called
                )
                """
            ),
            {
                "table_name": table_name,
                "max_id": max_id,
                "is_called": max_id != 0,
            },
        )


def main() -> None:
    args = parse_args()
    sqlite_path = Path(args.sqlite_path)
    if not sqlite_path.is_absolute():
        sqlite_path = Path(__file__).resolve().parents[1] / sqlite_path

    if not sqlite_path.exists():
        raise SystemExit(f"No se encontro la base SQLite en {sqlite_path}")

    source_engine = create_engine(f"sqlite:///{sqlite_path}", future=True)
    target_engine = create_engine(normalize_database_url(args.target_db_url), future=True)

    source_metadata = reflect_metadata(source_engine)
    target_metadata = reflect_metadata(target_engine)

    with source_engine.connect() as source_connection, target_engine.begin() as target_connection:
        if args.truncate_target:
            truncate_target_tables(target_connection, target_metadata)

        copied_counts: list[tuple[str, int]] = []
        for table_name in TABLE_COPY_ORDER:
            source_table = source_metadata.tables.get(table_name)
            target_table = target_metadata.tables.get(table_name)
            if source_table is None or target_table is None:
                continue
            copied = copy_table(source_connection, target_connection, source_table, target_table)
            copied_counts.append((table_name, copied))

        sync_postgres_sequences(target_connection, target_metadata)

    print("Migracion completada.")
    for table_name, copied in copied_counts:
        print(f"{table_name}: {copied} filas")


if __name__ == "__main__":
    main()
