from fastapi import FastAPI

from api.errors import register_exception_handlers
from api.routes import create_router
from core.config import build_config
from core.engine import STTEngine
from core.model_resolver import ModelResolver
from core.registry import ProviderRegistry
from core.types import TranscriptionRequest
from providers.faster_whisper_provider import FasterWhisperProvider
from providers.transformers_provider import TransformersProvider
from services.model_cache import ModelCache

app = FastAPI()
register_exception_handlers(app)

registry = ProviderRegistry()
registry.register(FasterWhisperProvider())
registry.register(TransformersProvider())

cache = ModelCache()
resolver = ModelResolver(registry)
engine = STTEngine(registry, resolver, cache)
default_config = build_config()

try:
    engine.preload(
        TranscriptionRequest(
            audio_path='',
            config=default_config,
        )
    )
except Exception as error:
    print(
        {
            'module': 'stt-server',
            'event': 'model-preload-failed',
            'provider': default_config.provider,
            'modelId': default_config.model_id,
            'modelPath': default_config.model_path,
            'error': str(error),
        }
    )

app.include_router(create_router(engine, cache, default_config))
