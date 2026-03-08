from typing import Optional

from pydantic import BaseModel


class ImportColumnOption(BaseModel):
    key: str
    label: str
    required: bool
    aliases: list[str]


class ImportPreviewRow(BaseModel):
    row_number: int
    values: dict
    normalized: dict
    errors: list[str]


class ImportValidationIssue(BaseModel):
    row_number: Optional[int]
    message: str
    severity: str


class ImportPreviewResponse(BaseModel):
    filename: str
    headers: list[str]
    column_options: list[ImportColumnOption]
    suggested_mapping: dict[str, str]
    active_mapping: dict[str, str]
    defaults: dict[str, str]
    missing_required_fields: list[str]
    issues: list[ImportValidationIssue]
    preview_rows: list[ImportPreviewRow]
    total_rows: int
    can_import: bool


class ImportCommitResponse(BaseModel):
    imported_sessions: int
    imported_intervals: int
    affected_athletes: list[int]
    issues: list[ImportValidationIssue]

