import argparse
import json
import sqlite3
from pathlib import Path


RESTORE_ORDER = [
    "users",
    "athletes",
    "athlete_weight_history",
    "athlete_focus_blocks",
    "athlete_targets",
    "sessions",
    "session_intervals",
    "lactate_samples",
    "physiological_snapshots",
    "derived_metrics",
    "performance_estimates",
    "planned_sessions",
]


def table_columns(connection: sqlite3.Connection, table_name: str) -> list[str]:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return [row[1] for row in rows]


def restore_table(connection: sqlite3.Connection, table_name: str, rows: list[dict]) -> None:
    if not rows:
        return

    columns = table_columns(connection, table_name)
    insertable_columns = [column for column in columns if column in rows[0]]
    placeholders = ", ".join("?" for _ in insertable_columns)
    column_sql = ", ".join(insertable_columns)
    values = [tuple(normalize_value(row.get(column)) for column in insertable_columns) for row in rows]

    connection.execute(f"DELETE FROM {table_name}")
    connection.executemany(
        f"INSERT INTO {table_name} ({column_sql}) VALUES ({placeholders})",
        values,
    )


def normalize_value(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=True)
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore a JSON backup into the local SQLite database.")
    parser.add_argument("--backup", required=True, help="Path to the JSON backup file.")
    parser.add_argument("--database", required=True, help="Path to the SQLite database file.")
    args = parser.parse_args()

    backup_path = Path(args.backup).resolve()
    database_path = Path(args.database).resolve()

    snapshot = json.loads(backup_path.read_text())
    tables = snapshot.get("tables", {})

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        for table_name in reversed(RESTORE_ORDER):
            if table_name in tables:
                connection.execute(f"DELETE FROM {table_name}")
        for table_name in RESTORE_ORDER:
            if table_name in tables:
                restore_table(connection, table_name, tables[table_name])
        connection.commit()
        connection.execute("PRAGMA foreign_keys = ON")


if __name__ == "__main__":
    main()
