from typing import Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    ok: bool
    defaultModelId: str
    defaultModelPath: str
    provider: str
    device: str
    computeType: str
    language: Optional[str]
    beamSize: int
    vadFilter: bool
    cpuThreads: int
    cachedModels: list[dict[str, str]]
