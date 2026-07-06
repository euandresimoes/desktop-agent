from abc import ABC, abstractmethod

from core.types import (
    LoadedProviderModel,
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)
from streaming.types import StreamingAudioChunk, StreamingEvent, StreamingSessionState


class STTProvider(ABC):
    provider_name: str

    def supports_streaming(self) -> bool:
        return False

    def open_stream_session(
        self,
        config: ProviderModelConfig,
        session: StreamingSessionState,
    ) -> None:
        return None

    def ingest_stream_audio(
        self,
        session: StreamingSessionState,
        chunk: StreamingAudioChunk,
    ) -> None:
        raise RuntimeError(
            f'STT streaming is not supported by provider: {self.provider_name}'
        )

    def poll_stream_events(
        self,
        loaded_model: LoadedProviderModel,
        session: StreamingSessionState,
    ) -> list[StreamingEvent]:
        return []

    def push_stream_audio(
        self,
        loaded_model: LoadedProviderModel,
        session: StreamingSessionState,
        chunk: StreamingAudioChunk,
    ) -> list[StreamingEvent]:
        self.ingest_stream_audio(session, chunk)
        return self.poll_stream_events(loaded_model, session)

    def commit_stream_session(
        self,
        loaded_model: LoadedProviderModel,
        session: StreamingSessionState,
    ) -> list[StreamingEvent]:
        raise RuntimeError(
            f'STT streaming is not supported by provider: {self.provider_name}'
        )

    def cancel_stream_session(
        self,
        session: StreamingSessionState,
        reason: str,
    ) -> None:
        return None

    @abstractmethod
    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        raise NotImplementedError

    @abstractmethod
    def load_model(self, config: ProviderModelConfig) -> LoadedProviderModel:
        raise NotImplementedError

    @abstractmethod
    def transcribe(
        self,
        loaded_model: LoadedProviderModel,
        request: TranscriptionRequest,
    ) -> TranscriptionResult:
        raise NotImplementedError
