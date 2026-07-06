import time
import tempfile
import wave
from pathlib import Path

import numpy as np

from faster_whisper import WhisperModel

from core.types import (
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)
from providers.base import STTProvider
from streaming.types import StreamingAudioChunk, StreamingEvent, StreamingSessionState


class FasterWhisperProvider(STTProvider):
    provider_name = 'faster-whisper'
    _initial_partial_audio_ms = 220
    _partial_audio_step_ms = 160
    _partial_wall_interval_ms = 140
    _partial_window_ms = 2600
    _partial_regression_ratio = 0.55

    def supports_streaming(self) -> bool:
        return True

    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        model_path = config.model_path.strip()

        # Remote ids are still allowed here; the Node backend decides whether
        # they should be persisted locally before registration.
        if not model_path:
            return ValidationResult(valid=False, reason='Model path is empty')

        path_candidate = Path(model_path)

        if path_candidate.exists():
            resolved_path = (
                str(path_candidate)
                if path_candidate.name == 'model.bin'
                else str(path_candidate / 'model.bin')
            )

            model_bin = Path(resolved_path)
            required_dir = model_bin.parent
            required_files = [
                model_bin,
                required_dir / 'config.json',
                required_dir / 'tokenizer.json',
            ]
            has_vocabulary = (
                (required_dir / 'vocabulary.json').exists()
                or (required_dir / 'vocabulary.txt').exists()
            )

            missing_files = [str(file) for file in required_files if not file.exists()]

            if missing_files or not has_vocabulary:
                return ValidationResult(
                    valid=False,
                    reason='Incomplete Faster-Whisper/CTranslate2 bundle',
                )

            return ValidationResult(
                valid=True,
                normalized_model_path=str(required_dir),
            )

        return ValidationResult(valid=True, normalized_model_path=model_path)

    def load_model(self, config: ProviderModelConfig) -> WhisperModel:
        return WhisperModel(
            config.model_path,
            device=config.device,
            compute_type=config.compute_type,
            cpu_threads=config.cpu_threads,
        )

    def transcribe(
        self,
        loaded_model: WhisperModel,
        request: TranscriptionRequest,
    ) -> TranscriptionResult:
        print({
            'module': 'stt-server',
            'event': 'faster-whisper-transcribe-start',
            'modelId': request.config.model_id,
            'modelPath': request.config.model_path,
            'device': request.config.device,
            'computeType': request.config.compute_type,
            'language': request.config.language,
            'beamSize': request.config.beam_size,
            'vadFilter': request.config.vad_filter,
            'cpuThreads': request.config.cpu_threads,
        })
        started_at = time.perf_counter()
        segments, info = loaded_model.transcribe(
            request.audio_path,
            language=request.config.language,
            beam_size=request.config.beam_size,
            vad_filter=request.config.vad_filter,
        )
        text = ' '.join(
            segment.text.strip() for segment in segments if segment.text.strip()
        ).strip()
        duration_ms = round((time.perf_counter() - started_at) * 1000)

        print({
            'module': 'stt-server',
            'event': 'faster-whisper-transcribe-finished',
            'modelId': request.config.model_id,
            'durationMs': duration_ms,
            'textLength': len(text),
            'language': info.language,
            'languageProbability': info.language_probability,
        })

        return TranscriptionResult(
            text=text,
            language=info.language,
            language_probability=info.language_probability,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )

    def open_stream_session(
        self,
        config: ProviderModelConfig,
        session: StreamingSessionState,
    ) -> None:
        session.partial_text = ''
        session.revision = 0
        session.confirmed_segments = []
        session.total_frames = 0
        session.last_partial_frame_count = 0
        session.last_partial_inference_at_ms = 0.0

    def ingest_stream_audio(
        self,
        session: StreamingSessionState,
        chunk: StreamingAudioChunk,
    ) -> None:
        session.chunks.append(chunk.pcm)
        session.total_frames += chunk.frame_count

    def poll_stream_events(
        self,
        loaded_model: WhisperModel,
        session: StreamingSessionState,
    ) -> list[StreamingEvent]:
        accumulated_audio_ms = (
            (session.total_frames / session.sample_rate) * 1000
            if session.sample_rate > 0
            else 0
        )
        audio_since_last_partial_ms = (
            ((session.total_frames - session.last_partial_frame_count) / session.sample_rate)
            * 1000
            if session.sample_rate > 0
            else 0
        )
        now_ms = time.perf_counter() * 1000

        if accumulated_audio_ms < self._initial_partial_audio_ms:
            return []

        if audio_since_last_partial_ms < self._partial_audio_step_ms:
            return []

        if (
            session.last_partial_inference_at_ms > 0
            and now_ms - session.last_partial_inference_at_ms
            < self._partial_wall_interval_ms
        ):
            return []

        session.last_partial_inference_at_ms = now_ms
        session.last_partial_frame_count = session.total_frames
        partial_text = self._transcribe_stream_audio(
            loaded_model,
            session,
            max_window_ms=self._partial_window_ms,
            use_vad_filter=False,
            condition_on_previous_text=False,
        )
        partial_text = self._select_partial_text(session.partial_text, partial_text)

        if not partial_text or partial_text == session.partial_text:
            return []

        session.revision += 1
        session.partial_text = partial_text
        print({
            'module': 'stt-server',
            'event': 'faster-whisper-stream-partial',
            'modelId': session.config.model_id,
            'revision': session.revision,
            'textLength': len(partial_text),
            'accumulatedFrames': session.total_frames,
        })

        return [
            StreamingEvent(
                type='transcript.partial',
                payload={
                    'text': partial_text,
                    'revision': session.revision,
                },
            )
        ]

    def commit_stream_session(
        self,
        loaded_model: WhisperModel,
        session: StreamingSessionState,
    ) -> list[StreamingEvent]:
        final_text = self._transcribe_stream_audio(loaded_model, session)
        print({
            'module': 'stt-server',
            'event': 'faster-whisper-stream-final',
            'modelId': session.config.model_id,
            'textLength': len(final_text),
            'accumulatedFrames': session.total_frames,
        })
        segments = self._split_confirmed_segments(final_text)
        session.confirmed_segments = segments
        session.partial_text = ''

        events: list[StreamingEvent] = [
            StreamingEvent(
                type='transcript.confirmed',
                payload={
                    'text': text,
                    'index': index,
                },
            )
            for index, text in enumerate(segments)
        ]
        events.append(
            StreamingEvent(
                type='transcript.final',
                payload={
                    'text': final_text,
                },
            )
        )
        return events

    def cancel_stream_session(
        self,
        session: StreamingSessionState,
        reason: str,
    ) -> None:
        session.chunks.clear()
        session.partial_text = ''
        session.confirmed_segments = []

    def _transcribe_stream_audio(
        self,
        loaded_model: WhisperModel,
        session: StreamingSessionState,
        max_window_ms: int | None = None,
        use_vad_filter: bool | None = None,
        condition_on_previous_text: bool | None = None,
    ) -> str:
        audio = self._merge_chunks(session, max_window_ms=max_window_ms)

        if audio.size == 0:
            return ''

        temp_path = self._write_temp_wav(audio, session.sample_rate)

        try:
            segments, _info = loaded_model.transcribe(
                temp_path,
                language=session.config.language,
                beam_size=1 if max_window_ms is not None else session.config.beam_size,
                vad_filter=(
                    session.config.vad_filter
                    if use_vad_filter is None
                    else use_vad_filter
                ),
                condition_on_previous_text=(
                    True
                    if condition_on_previous_text is None
                    else condition_on_previous_text
                ),
            )
            return ' '.join(
                segment.text.strip() for segment in segments if segment.text.strip()
            ).strip()
        finally:
            Path(temp_path).unlink(missing_ok=True)

    def _merge_chunks(
        self,
        session: StreamingSessionState,
        max_window_ms: int | None = None,
    ) -> np.ndarray:
        if not session.chunks:
            return np.array([], dtype=np.float32)

        if not max_window_ms or session.sample_rate <= 0:
            return np.concatenate(session.chunks).astype(np.float32, copy=False)

        max_frames = int((max_window_ms / 1000) * session.sample_rate)
        if max_frames <= 0:
            return np.concatenate(session.chunks).astype(np.float32, copy=False)

        collected: list[np.ndarray] = []
        remaining_frames = max_frames

        for chunk in reversed(session.chunks):
            if remaining_frames <= 0:
                break

            if len(chunk) <= remaining_frames:
                collected.append(chunk)
                remaining_frames -= len(chunk)
                continue

            collected.append(chunk[-remaining_frames:])
            remaining_frames = 0

        if not collected:
            return np.array([], dtype=np.float32)

        collected.reverse()
        return np.concatenate(collected).astype(np.float32, copy=False)

    def _select_partial_text(self, previous: str, current: str) -> str:
        normalized_previous = ' '.join(previous.strip().split())
        normalized_current = ' '.join(current.strip().split())

        if not normalized_current:
            return normalized_previous

        if not normalized_previous:
            return normalized_current

        if normalized_current.startswith(normalized_previous):
            return normalized_current

        previous_words = normalized_previous.split()
        current_words = normalized_current.split()

        if (
            len(current_words) < len(previous_words) * self._partial_regression_ratio
            and not normalized_previous.startswith(normalized_current)
        ):
            return normalized_previous

        return normalized_current

    def _write_temp_wav(self, audio: np.ndarray, sample_rate: int) -> str:
        clipped = np.clip(audio, -1.0, 1.0)
        pcm16 = (clipped * 32767).astype(np.int16)

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_path = temp_file.name

        with wave.open(temp_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm16.tobytes())

        return temp_path

    def _split_confirmed_segments(self, text: str) -> list[str]:
        normalized = ' '.join(text.strip().split())

        if not normalized:
            return []

        segments = [
            segment.strip()
            for segment in normalized.replace('?', '.').replace('!', '.').split('.')
            if segment.strip()
        ]

        return segments or [normalized]
