from fastapi import FastAPI

from api.errors import register_exception_handlers
from api.routes import create_router
from core.config import build_config
from core.engine import TTSEngine
from core.registry import ProviderRegistry
from core.types import SynthesisRequest
from core.voice_resolver import VoiceResolver
from providers.piper_provider import PiperProvider
from services.voice_cache import VoiceCache

app = FastAPI()
register_exception_handlers(app)

registry = ProviderRegistry()
registry.register(PiperProvider())

cache = VoiceCache()
resolver = VoiceResolver(registry)
engine = TTSEngine(registry, resolver, cache)
default_config = build_config()

try:
    engine.preload(
        SynthesisRequest(
            text="preload",
            config=default_config,
        )
    )
except Exception as error:
    print(
        {
            "module": "tts-server",
            "event": "voice-preload-failed",
            "provider": default_config.provider,
            "voiceId": default_config.voice_id,
            "modelPath": default_config.model_path,
            "configPath": default_config.config_path,
            "error": str(error),
        }
    )

app.include_router(create_router(engine, cache, default_config))
