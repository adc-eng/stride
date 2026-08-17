import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.input import Input
from app.models.input_log import InputLog
from app.schemas.input_log import InputLogCreate

_RANGE_RE = re.compile(r"^(\d+)d$")


class InvalidRangeError(ValueError):
    """Raised when a `range` query value doesn't match the supported `<N>d` shape."""


def _get_owned_input(db: Session, user_id: uuid.UUID, input_id: uuid.UUID) -> Input | None:
    """Returns the input only if it exists AND belongs to user_id — otherwise None,
    so nonexistent and cross-user targets are indistinguishable to the caller."""
    return (
        db.query(Input)
        .filter(Input.id == input_id, Input.user_id == user_id)
        .one_or_none()
    )


def create_log(
    db: Session, user_id: uuid.UUID, input_id: uuid.UUID, payload: InputLogCreate
) -> InputLog | None:
    if _get_owned_input(db, user_id, input_id) is None:
        return None

    log = InputLog(
        user_id=user_id,
        input_id=input_id,
        value=payload.value,
        attributes=payload.attributes,
        occurred_at=payload.occurred_at,
        logged_at=datetime.now(UTC),
    )
    db.add(log)
    db.flush()
    db.refresh(log)
    return log


def _parse_range(range_str: str) -> timedelta:
    match = _RANGE_RE.fullmatch(range_str)
    if not match:
        raise InvalidRangeError(f"invalid range: {range_str!r}")
    return timedelta(days=int(match.group(1)))


def list_logs_in_range(
    db: Session, user_id: uuid.UUID, input_id: uuid.UUID, range_str: str
) -> list[InputLog] | None:
    """Returns the input's logs within the relative `range_str` window (e.g.
    "7d"), oldest first. None means the input doesn't exist or isn't owned by
    user_id — indistinguishable to the caller, same as create_log. A range
    with zero matches returns an empty list, never an error."""
    if _get_owned_input(db, user_id, input_id) is None:
        return None

    delta = _parse_range(range_str)
    # Both sides of the comparison are explicit-UTC-aware instants: occurred_at
    # is always stored tz-aware (clients supply it with an offset), and cutoff
    # is computed from datetime.now(UTC) here — so the boundary is a real
    # instant comparison, never dependent on the server process's local
    # timezone or on any naive/aware mismatch.
    cutoff = datetime.now(UTC) - delta

    return (
        db.query(InputLog)
        .filter(
            InputLog.input_id == input_id,
            InputLog.user_id == user_id,
            InputLog.occurred_at >= cutoff,
        )
        .order_by(InputLog.occurred_at)
        .all()
    )


def delete_log(
    db: Session, user_id: uuid.UUID, input_id: uuid.UUID, log_id: uuid.UUID
) -> bool:
    """Hard-deletes the log. Returns False (no exception) when the input
    doesn't exist/isn't owned, the log doesn't exist, belongs to someone
    else, doesn't belong to this input, or was already deleted — all
    indistinguishable to the caller and all uniformly 404 at the route.
    Not idempotent-success: a repeat call on an already-deleted log returns
    False, never a second True."""
    if _get_owned_input(db, user_id, input_id) is None:
        return False

    log = (
        db.query(InputLog)
        .filter(
            InputLog.id == log_id,
            InputLog.input_id == input_id,
            InputLog.user_id == user_id,
        )
        .one_or_none()
    )
    if log is None:
        return False

    db.delete(log)
    db.flush()
    return True
