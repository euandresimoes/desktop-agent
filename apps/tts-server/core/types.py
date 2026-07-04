from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class ProviderVoiceConfig:
    voice_id: str
    provider: str
    model_path: str
    config_path: str
    length_scale: float
    noise_scale: float
    noise_w: float


@dataclass(frozen=True)
class ProviderVoiceKey:
    provider: str
    voice_id: str
    model_path: str
    config_path: str


@dataclass(frozen=True)
class SynthesisRequest:
    text: str
    config: ProviderVoiceConfig
    request_id: Optional[str] = None


@dataclass(frozen=True)
class SynthesisResult:
    audio_bytes: bytes
    audio_content_type: str
    duration_ms: int
    provider: str
    voice_id: str


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    reason: Optional[str] = None
    normalized_model_path: Optional[str] = None
    normalized_config_path: Optional[str] = None


LoadedProviderVoice = Any
