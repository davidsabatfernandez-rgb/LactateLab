from typing import Optional

from pydantic import BaseModel


class AthleteAIInterpretationRequest(BaseModel):
    custom_goal: Optional[str] = None
    focus: Optional[str] = None
    question: Optional[str] = None


class AthleteAIInterpretationResponse(BaseModel):
    athlete_id: int
    model: str
    goal_used: str
    interpretation: str


class AthleteReasoningInterpretationRequest(BaseModel):
    custom_goal: Optional[str] = None
    focus: Optional[str] = None
    question: Optional[str] = None
    provider: str = "local"
    include_prompt: bool = True


class AthleteReasoningInterpretationResponse(BaseModel):
    athlete_id: int
    provider: str
    model: str
    goal_used: str
    interpretation: str
    prompt: Optional[str] = None
