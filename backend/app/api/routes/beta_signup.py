from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from app.db.session import get_db
from app.models.beta_signup import BetaSignup

router = APIRouter(tags=["beta"])


class BetaSignupRequest(BaseModel):
    email: EmailStr


@router.post("/beta-signup")
def beta_signup(payload: BetaSignupRequest, db: Session = Depends(get_db)):
    existing = db.execute(
        select(BetaSignup).where(BetaSignup.email == payload.email)
    ).scalar_one_or_none()

    if existing:
        return JSONResponse(content={"status": "already_registered"}, status_code=200)

    signup = BetaSignup(email=payload.email)
    db.add(signup)
    db.commit()
    return JSONResponse(content={"status": "registered"}, status_code=201)
