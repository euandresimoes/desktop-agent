import tempfile
import unittest
from pathlib import Path

from core.types import ProviderVoiceConfig, SynthesisRequest, SynthesisResult, ValidationResult
from core.registry import ProviderRegistry
from core.voice_resolver import VoiceResolver
from providers.base import TTSProvider
from providers.piper_provider import PiperProvider


class FakeProvider(TTSProvider):
    provider_name = "fake"

    def validate_voice(self, config: ProviderVoiceConfig) -> ValidationResult:
        return ValidationResult(True, normalized_model_path=config.model_path)

    def load_voice(self, config: ProviderVoiceConfig):
        return {"voiceId": config.voice_id}

    def synthesize(self, loaded_voice, request: SynthesisRequest) -> SynthesisResult:
        return SynthesisResult(
            audio_bytes=b"",
            audio_content_type="audio/wav",
            duration_ms=0,
            provider=self.provider_name,
            voice_id=request.config.voice_id,
        )


class ProviderRuntimeTests(unittest.TestCase):
    def test_registry_returns_registered_provider(self) -> None:
        registry = ProviderRegistry()
        provider = FakeProvider()

        registry.register(provider)

        self.assertIs(registry.get("fake"), provider)
        self.assertEqual(registry.list_names(), ["fake"])

    def test_voice_resolver_uses_provider_validation(self) -> None:
        registry = ProviderRegistry()
        registry.register(FakeProvider())
        resolver = VoiceResolver(registry)
        config = ProviderVoiceConfig(
            voice_id="voice",
            provider="fake",
            model_path="model.onnx",
            config_path="config.json",
            length_scale=1.15,
            noise_scale=0.667,
            noise_w=0.8,
        )

        result = resolver.validate(config)

        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_model_path, "model.onnx")

    def test_piper_provider_validates_existing_paths(self) -> None:
        provider = PiperProvider()

        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "voice.onnx"
            config_path = Path(temp_dir) / "voice.json"
            model_path.write_bytes(b"model")
            config_path.write_text("{}", encoding="utf-8")

            config = ProviderVoiceConfig(
                voice_id="voice",
                provider="piper",
                model_path=str(model_path),
                config_path=str(config_path),
                length_scale=1.15,
                noise_scale=0.667,
                noise_w=0.8,
            )

            result = provider.validate_voice(config)

        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_model_path, str(model_path))
        self.assertEqual(result.normalized_config_path, str(config_path))


if __name__ == "__main__":
    unittest.main()
