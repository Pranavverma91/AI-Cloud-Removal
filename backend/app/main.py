import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import verify_schema
from .routers import auth, science
from .security import csrf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app):
    verify_schema()
    yield


app = FastAPI(
    title="SPACE EYE research API",
    version="4.0.0",
    lifespan=lifespan,
    dependencies=[Depends(csrf)],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Space-Eye"],
)
app.include_router(auth.router)
app.include_router(science.router)


@app.get("/health")
def health():
    verify_schema()
    return {"status": "ready", "service": "SPACE EYE research API", "version": "4.0.0"}
