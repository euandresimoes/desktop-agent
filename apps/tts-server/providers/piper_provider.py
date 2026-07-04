import time
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

from core.types import (
    ProviderVoiceConfig,
    SynthesisRequest,
    SynthesisResult,
    ValidationResult,
)
from providers.base import TTSProvider
from services.audio_buffer import AudioBufferStore


class PiperProvider(TTSProvider):
    provider_name = "piper"

    def __init__(self) -> None:
        self._buffer_store = AudioBufferStore()

    def validate_voice(self, config: ProviderVoiceConfig) -> ValidationResult:
        model_path = Path(config.model_path)
        config_path = Path(config.config_path)

        if not model_path.exists():
            return ValidationResult(False, reason="Piper model path does not exist")

        if not config_path.exists():
            return ValidationResult(False, reason="Piper config path does not exist")

        return ValidationResult(
            True,
            normalized_model_path=str(model_path),
            normalized_config_path=str(config_path),
        )

    def load_voice(self, config: ProviderVoiceConfig) -> PiperVoice:
        return PiperVoice.load(
            config.model_path,
            config_path=config.config_path,
        )

    def synthesize(
        self,
        loaded_voice: PiperVoice,
        request: SynthesisRequest,
    ) -> SynthesisResult:
        started_at = time.perf_counter()
        temp_path = self._buffer_store.create_temp_path(".wav")

        try:
            syn_config = SynthesisConfig(
                length_scale=request.config.length_scale,
                noise_scale=request.config.noise_scale,
                noise_w_scale=request.config.noise_w,
                normalize_audio=True,
            )

            with wave.open(temp_path, "wb") as wav_file:
                loaded_voice.synthesize_wav(
                    request.text,
                    wav_file,
                    syn_config=syn_config,
                )

            with open(temp_path, "rb") as audio_file:
                audio_bytes = audio_file.read()

            return SynthesisResult(
                audio_bytes=audio_bytes,
                audio_content_type="audio/wav",
                duration_ms=round((time.perf_counter() - started_at) * 1000),
                provider=self.provider_name,
                voice_id=request.config.voice_id,
            )
        finally:
            self._buffer_store.remove(temp_path)
