import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.schemas.input_log import InputLogCreate, InputLogListRead, InputLogRead
from app.services import input_logs as input_logs_service
from app.services.input_logs import InvalidRangeError

router = APIRouter(prefix="/inputs", tags=["input-logs"])


@router.post("/{input_id}/logs", response_model=InputLogRead, status_code=201)
def create_input_log(
    input_id: uuid.UUID,
    payload: InputLogCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> InputLogRead:
    log = input_logs_service.create_log(db, current_user.user_id, input_id, payload)
    if log is None:
        raise HTTPException(status_code=404, detail="Not found")
    return log


@router.get("/{input_id}/logs", response_model=InputLogListRead)
def read_input_logs(
    input_id: uuid.UUID,
    range: str = Query(..., alias="range"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> InputLogListRead:
    try:
        logs = input_logs_service.list_logs_in_range(db, current_user.user_id, input_id, range)
    except InvalidRangeError:
        raise HTTPException(status_code=422, detail="Invalid range") from None
    if logs is None:
        raise HTTPException(status_code=404, detail="Not found")
    return logs


@router.delete("/{input_id}/logs/{log_id}", status_code=204)
def delete_input_log(
    input_id: uuid.UUID,
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    deleted = input_logs_service.delete_log(db, current_user.user_id, input_id, log_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(status_code=204)
