from dataclasses import dataclass


@dataclass
class StreamingSessionMetrics:
    audio_chunks_sent: int = 0
    text_chunks_sent: int = 0
