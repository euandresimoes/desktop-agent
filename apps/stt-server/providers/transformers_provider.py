import time
from pathlib import Path

from core.types import (
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)
from providers.base import STTProvider
from services.audio_loader import load_wav_audio, resample_audio


class TransformersProvider(STTProvider):
    provider_name = 'transformers'

    def supports_streaming(self) -> bool:
        return False

    def _import_runtime(self):
        try:
            import torch  # type: ignore
            from transformers import pipeline  # type: ignore
        except ModuleNotFoundError as error:
            raise RuntimeError(
                'Transformers STT provider dependencies are not installed. '
                'Install torch and transformers in apps/stt-server/.venv before using this provider.'
            ) from error

        return torch, pipeline

    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        model_path = config.model_path.strip()

        if not model_path:
            return ValidationResult(valid=False, reason='Model path is empty')

        path_candidate = Path(model_path)

        if path_candidate.exists():
            required_files = [
                path_candidate / 'config.json',
            ]

            if not any(file.exists() for file in required_files):
                return ValidationResult(
                    valid=False,
                    reason='Transformers model folder is missing config.json',
                )

        return ValidationResult(valid=True, normalized_model_path=model_path)

    def load_model(self, config: ProviderModelConfig):
        torch, pipeline = self._import_runtime()
        device = 0 if config.device == 'cuda' and torch.cuda.is_available() else -1

        return pipeline(
            task='automatic-speech-recognition',
            model=config.model_path,
            tokenizer=config.model_path,
            feature_extractor=config.model_path,
            device=device,
        )

    def transcribe(self, loaded_model, request: TranscriptionRequest) -> TranscriptionResult:
        started_at = time.perf_counter()
        audio, sample_rate = load_wav_audio(request.audio_path)
        target_sample_rate = int(
            getattr(loaded_model.feature_extractor, 'sampling_rate', sample_rate)
        )

        if sample_rate != target_sample_rate:
            audio = resample_audio(audio, sample_rate, target_sample_rate)
            sample_rate = target_sample_rate

        result = loaded_model(
            {
                'array': audio,
                'sampling_rate': sample_rate,
            }
        )
        duration_ms = round((time.perf_counter() - started_at) * 1000)

        return TranscriptionResult(
            text=str(result.get('text', '')).strip(),
            language=request.config.language,
            language_probability=None,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )
