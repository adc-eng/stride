import uuid

from pydantic import BaseModel

STUB_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class CurrentUser(BaseModel):
    """The identity shape every handler/service consumes (Constitution Principle I).

    Fixed now so the stub -> real-Google-OAuth swap in feature 003 is
    non-breaking: only get_current_user's body changes, never this shape or
    any of its callers. email/google_sub are left as room to grow once real
    verification supplies them — unused by this stub.
    """

    user_id: uuid.UUID
    email: str | None = None
    google_sub: str | None = None


def get_current_user() -> CurrentUser:
    """Identity seam (Constitution Principle I).

    Stubbed for this feature: returns a fixed CurrentUser in the exact shape
    the real Google-OAuth-backed verifier will return later. No handler,
    query, or test may branch on whether this dependency is stubbed or
    real — only this function's body changes when real auth lands.
    """
    return CurrentUser(user_id=STUB_USER_ID)
