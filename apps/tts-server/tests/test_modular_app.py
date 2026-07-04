import unittest

from core.config import build_config
from core.types import SynthesisResult


class FakeCache:
    def snapshot(self):
        return [
            {
                "provider": "piper",
                "voiceId": "voice-a",
                "modelPath": "voice.onnx",
                "configPath": "voice.json",
            }
        ]


class FakeEngine:
    def __init__(self) -> None:
        self.last_request = None

    def synthesize(self, request):
        self.last_request = request
        return SynthesisResult(
            audio_bytes=b"wave-data",
            audio_content_type="audio/wav",
            duration_ms=10,
            provider=request.config.provider,
            voice_id=request.config.voice_id,
        )


class ModularAppTests(unittest.TestCase):
    def test_router_health_includes_default_provider(self) -> None:
        from api.routes import create_router
        from api.schemas import SpeakRequest

        engine = FakeEngine()
        cache = FakeCache()
        default_config = build_config(
            provider="piper",
            voice_id="voice-a",
            model_path="voice.onnx",
            config_path="voice.json",
        )

        router = create_router(engine, cache, default_config)
        health_endpoint = next(route.endpoint for route in router.routes if route.path == "/health")
        speak_endpoint = next(route.endpoint for route in router.routes if route.path == "/speak")

        health_response = health_endpoint()
        speak_response = speak_endpoint(
            SpeakRequest(
                text="hello",
                voiceId="voice-b",
                provider="piper",
                modelPath="custom.onnx",
                configPath="custom.json",
            )
        )

        self.assertEqual(health_response["defaultProvider"], "piper")
        self.assertEqual(speak_response.body, b"wave-data")
        self.assertEqual(engine.last_request.config.voice_id, "voice-b")

    def test_server_reexports_main_app(self) -> None:
        import main
        import server

        self.assertIs(server.app, main.app)


if __name__ == "__main__":
    unittest.main()
