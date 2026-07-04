from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class ProviderModelConfig:
    model_id: str
    provider: str
    model_path: str
    device: str
    compute_type: str
    language: Optional[str]
    beam_size: int
    vad_filter: bool
    cpu_threads: int


@dataclass(frozen=True)
class ProviderModelKey:
    provider: str
    model_id: str
    model_path: str
    device: str
    compute_type: str
    cpu_threads: int


@dataclass(frozen=True)
class TranscriptionRequest:
    audio_path: str
    config: ProviderModelConfig


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: Optional[str]
    language_probability: Optional[float]
    duration_ms: int
    inference_duration_ms: int


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    reason: Optional[str] = None
    normalized_model_path: Optional[str] = None


LoadedProviderModel = Any
