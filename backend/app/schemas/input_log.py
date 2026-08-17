import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class InputLogCreate(BaseModel):
    value: float | None = None
    attributes: dict[str, Any] | None = None
    occurred_at: datetime


class InputLogRead(BaseModel):
    id: uuid.UUID
    input_id: uuid.UUID
    value: float | None
    attributes: dict[str, Any] | None
    occurred_at: datetime
    logged_at: datetime

    model_config = {"from_attributes": True}


# Range-scoped log history read (GET /inputs/{id}/logs?range=): a list of the
# same per-log shape returned by create.
InputLogListRead = list[InputLogRead]
