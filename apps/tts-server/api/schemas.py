from typing import Optional

from pydantic import BaseModel


class SpeakRequest(BaseModel):
    text: str
    voiceId: Optional[str] = None
    provider: Optional[str] = None
    modelPath: Optional[str] = None
    configPath: Optional[str] = None
    lengthScale: float = 1.15
    noiseScale: float = 0.667
    noiseW: float = 0.8
