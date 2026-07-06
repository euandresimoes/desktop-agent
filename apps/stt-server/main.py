from fastapi import FastAPI
from fastapi.routing import APIWebSocketRoute

from api.errors import register_exception_handlers
from api.routes import create_router
from core.config import build_config
from core.engine import STTEngine
from core.model_resolver import ModelResolver
from core.registry import ProviderRegistry
from core.types import TranscriptionRequest
from providers.faster_whisper_provider import FasterWhisperProvider
from providers.parakeet_provider import ParakeetProvider
from providers.transformers_provider import TransformersProvider
from services.model_cache import ModelCache
from streaming.engine import STTStreamingEngine
from streaming.session_manager import StreamingSessionManager

app = FastAPI()
register_exception_handlers(app)

registry = ProviderRegistry()
registry.register(FasterWhisperProvider())
registry.register(TransformersProvider())
registry.register(ParakeetProvider())

cache = ModelCache()
resolver = ModelResolver(registry)
engine = STTEngine(registry, resolver, cache)
streaming_sessions = StreamingSessionManager()
streaming_engine = STTStreamingEngine(registry, resolver, cache, streaming_sessions)
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

router = create_router(engine, cache, default_config, streaming_engine)
app.include_router(router)

has_stream_websocket = any(
    isinstance(route, APIWebSocketRoute) and route.path == '/ws/stream'
    for route in app.routes
)

if not has_stream_websocket:
    for route in router.routes:
        if isinstance(route, APIWebSocketRoute) and route.path == '/ws/stream':
            app.add_api_websocket_route('/ws/stream', route.endpoint)
            break
