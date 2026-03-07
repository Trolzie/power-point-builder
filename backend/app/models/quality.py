from enum import Enum

from pydantic import BaseModel


class IssueSeverity(str, Enum):
    info = "info"
    warning = "warning"
    error = "error"


class QualityIssue(BaseModel):
    severity: IssueSeverity
    category: str
    message: str
    suggestion: str | None = None
    slide_index: int | None = None
    placeholder_idx: int | None = None


class SlideQuality(BaseModel):
    slide_index: int
    layout_name: str
    utilization_pct: float
    issues: list[QualityIssue]


class QualityReport(BaseModel):
    overall_score: float
    summary: str
    total_issues: int
    issues_by_severity: dict[str, int]
    slides: list[SlideQuality]
    llm_analysis: str | None = None
