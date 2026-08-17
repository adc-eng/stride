from fastapi import FastAPI

import app.models  # noqa: F401  registers all models on Base.metadata
from app.api.routes.input_logs import router as input_logs_router

app = FastAPI(title="Stride API")
app.include_router(input_logs_router)
