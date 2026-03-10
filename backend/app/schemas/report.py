from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class PhysiologyReportProfileRead(BaseModel):
    full_name: str
    age: Optional[int] = None
    sex: Optional[str] = None
    weight_kg: Optional[float] = None
    discipline: str
    performance_goal: Optional[str] = None
    target_competition: Optional[str] = None
    training_background: Optional[str] = None
    coach_notes: Optional[str] = None


class PhysiologyReportStageRead(BaseModel):
    stage_number: int
    duration_seconds: int
    load_value: float
    load_label: str
    heart_rate_bpm: Optional[int] = None
    lactate_mmol: float
    cadence: Optional[int] = None


class PhysiologyReportThresholdRead(BaseModel):
    name: str
    anchor_mmol: float
    metric_value: Optional[float] = None
    metric_label: str
    heart_rate_bpm: Optional[int] = None
    interpretation: str
    confidence: Optional[float] = None
    agreement_score: Optional[float] = None
    evidence_level: Optional[str] = None
    supporting_sessions: Optional[int] = None


class PhysiologyReportZoneRead(BaseModel):
    zone: str
    objective: str
    primary_label: str
    heart_rate_label: Optional[str] = None


class PhysiologyReportSectionRead(BaseModel):
    key: str
    title: str
    body: list[str]


class PhysiologyReportTestSummaryRead(BaseModel):
    session_id: int
    performed_at: datetime
    power_source: Optional[str] = None
    stage_count: int
    total_duration_seconds: int
    average_stage_duration_seconds: int
    peak_lactate_mmol: float
    load_start_label: str
    load_end_label: str


class PhysiologyReportRead(BaseModel):
    athlete_id: int
    athlete_name: str
    generated_on: datetime
    discipline: str
    power_source: Optional[str] = None
    profile_tag: str
    profile: PhysiologyReportProfileRead
    test_summary: PhysiologyReportTestSummaryRead
    stages: list[PhysiologyReportStageRead]
    thresholds: list[PhysiologyReportThresholdRead]
    individual_thresholds: list[PhysiologyReportThresholdRead] = []
    individual_threshold_sample_count: int = 0
    individual_threshold_min_samples: int = 15
    individual_threshold_note: Optional[str] = None
    zones: list[PhysiologyReportZoneRead]
    sections: list[PhysiologyReportSectionRead]
    limitations: list[str]
    disclaimer: str
    final_coach_summary: list[str]
    report_title: str
    report_subtitle: str
