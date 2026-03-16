from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/science-advisor", tags=["science-advisor"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=1000)
    athlete_id: Optional[int] = None
    discipline: Optional[str] = None


class CitationRead(BaseModel):
    ref_number: int
    authors_short: str
    year: Optional[int]
    title: str
    journal: Optional[str]
    doi: Optional[str]
    pmid: Optional[str]
    relevance_score: float


class SectionRead(BaseModel):
    heading: str
    content: str
    citations: list[int] = []


class AskResponse(BaseModel):
    question: str
    summary: str
    sections: list[SectionRead] = []
    citations: list[CitationRead] = []
    athlete_context: Optional[str] = None
    data_warnings: list[str] = []
    search_meta: Optional[dict] = None


@router.post("/ask", response_model=AskResponse)
async def ask_advisor(
    body: AskRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Pregunta al Science Advisor con evidencia científica en tiempo real."""
    from app.services.science_advisor.advisor_engine import ask

    try:
        response = await ask(
            question=body.question,
            db=db,
            athlete_id=body.athlete_id,
            discipline=body.discipline,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en Science Advisor: {exc}") from exc

    return AskResponse(
        question=response.question,
        summary=response.summary,
        sections=[
            SectionRead(heading=s.heading, content=s.content, citations=s.citations)
            for s in response.sections
        ],
        citations=[
            CitationRead(
                ref_number=c.ref_number,
                authors_short=c.authors_short,
                year=c.year,
                title=c.title,
                journal=c.journal,
                doi=c.doi,
                pmid=c.pmid,
                relevance_score=c.relevance_score,
            )
            for c in response.citations
        ],
        athlete_context=response.athlete_context,
        data_warnings=response.data_warnings,
        search_meta=response.search_meta,
    )
