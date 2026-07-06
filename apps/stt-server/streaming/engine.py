import base64

import numpy as np

from core.model_resolver import ModelResolver
from core.registry import ProviderRegistry
from core.types import ProviderModelKey
from services.model_cache import ModelCache
from streaming.session_manager import StreamingSessionManager
from streaming.types import (
    StreamingAudioChunk,
    StreamingEvent,
    StreamingOpenRequest,
    StreamingSessionState,
)


class STTStreamingEngine:
    def __init__(
        self,
        registry: ProviderRegistry,
        resolver: ModelResolver,
        cache: ModelCache,
        sessions: StreamingSessionManager,
    ) -> None:
        self._registry = registry
        self._resolver = resolver
        self._cache = cache
        self._sessions = sessions

    def open_session(self, request: StreamingOpenRequest) -> StreamingSessionState:
        validation = self._resolver.validate(request.config)

        if not validation.valid:
            raise ValueError(validation.reason or 'Invalid STT streaming model')

        provider = self._registry.get(request.config.provider)

        if not provider.supports_streaming():
            raise ValueError(
                f'STT streaming is not supported by provider: {request.config.provider}'
            )

        session = StreamingSessionState(
            session_id=request.session_id,
            config=request.config,
            sample_rate=request.sample_rate,
            channels=request.channels,
            encoding=request.encoding,
        )
        self._sessions.create(session)
        provider.open_stream_session(request.config, session)
        self._get_or_load_model(session)
        return session

    def push_audio(
        self,
        session_id: str,
        chunk_id: str,
        sequence: int,
        audio_base64: str,
        frame_count: int,
    ) -> None:
        session = self._require_session(session_id)
        provider = self._registry.get(session.config.provider)
        pcm_bytes = base64.b64decode(audio_base64)
        pcm = np.frombuffer(pcm_bytes, dtype=np.float32).copy()
        chunk = StreamingAudioChunk(
          session_id=session_id,
          chunk_id=chunk_id,
          sequence=sequence,
          pcm=pcm,
          frame_count=frame_count,
        )
        provider.ingest_stream_audio(session, chunk)

    def poll_partial(self, session_id: str) -> list[StreamingEvent]:
        session = self._require_session(session_id)
        provider = self._registry.get(session.config.provider)
        loaded_model = self._get_or_load_model(session)
        return provider.poll_stream_events(loaded_model, session)

    def commit(self, session_id: str) -> list[StreamingEvent]:
        session = self._require_session(session_id)
        provider = self._registry.get(session.config.provider)
        loaded_model = self._get_or_load_model(session)
        events = provider.commit_stream_session(loaded_model, session)
        self._sessions.close(session_id)
        return events

    def cancel(self, session_id: str, reason: str) -> list[StreamingEvent]:
        session = self._require_session(session_id)
        provider = self._registry.get(session.config.provider)
        provider.cancel_stream_session(session, reason)
        self._sessions.close(session_id)
        return [StreamingEvent(type='session.cancelled', payload={'reason': reason})]

    def _require_session(self, session_id: str) -> StreamingSessionState:
        session = self._sessions.get(session_id)

        if session is None:
            raise ValueError(f'Unknown STT streaming session: {session_id}')

        return session

    def _get_or_load_model(self, session: StreamingSessionState):
        key = ProviderModelKey(
            provider=session.config.provider,
            model_id=session.config.model_id,
            model_path=session.config.model_path,
            device=session.config.device,
            compute_type=session.config.compute_type,
            cpu_threads=session.config.cpu_threads,
        )
        cached_model = self._cache.get(key)

        if cached_model is not None:
            return cached_model

        provider = self._registry.get(session.config.provider)
        loaded_model = provider.load_model(session.config)
        self._cache.set(key, loaded_model)
        return loaded_model
