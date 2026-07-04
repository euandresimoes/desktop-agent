import time
from pathlib import Path

from faster_whisper import WhisperModel

from core.types import (
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)
from providers.base import STTProvider


class FasterWhisperProvider(STTProvider):
    provider_name = 'faster-whisper'

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
                required_dir / 'preprocessor_config.json',
            ]

            missing_files = [str(file) for file in required_files if not file.exists()]

            if missing_files:
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

        return TranscriptionResult(
            text=text,
            language=info.language,
            language_probability=info.language_probability,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )
