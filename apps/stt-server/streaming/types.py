from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np

from core.types import ProviderModelConfig


StreamingEventType = Literal[
    'session.ready',
    'transcript.partial',
    'transcript.confirmed',
    'transcript.final',
    'session.cancelled',
    'session.error',
]


@dataclass(frozen=True)
class StreamingOpenRequest:
    session_id: str
    config: ProviderModelConfig
    sample_rate: int
    channels: int
    encoding: str


@dataclass(frozen=True)
class StreamingAudioChunk:
    session_id: str
    chunk_id: str
    sequence: int
    pcm: np.ndarray
    frame_count: int


@dataclass
class StreamingSessionState:
    session_id: str
    config: ProviderModelConfig
    sample_rate: int
    channels: int
    encoding: str
    chunks: list[np.ndarray] = field(default_factory=list)
    partial_text: str = ''
    revision: int = 0
    confirmed_segments: list[str] = field(default_factory=list)
    total_frames: int = 0
    last_partial_frame_count: int = 0
    last_partial_inference_at_ms: float = 0.0


@dataclass(frozen=True)
class StreamingEvent:
    type: StreamingEventType
    payload: dict[str, Any]
