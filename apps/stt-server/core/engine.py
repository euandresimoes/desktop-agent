from core.model_resolver import ModelResolver
from core.registry import ProviderRegistry
from core.types import ProviderModelKey, TranscriptionRequest
from services.model_cache import ModelCache


class STTEngine:
    def __init__(
        self,
        registry: ProviderRegistry,
        resolver: ModelResolver,
        cache: ModelCache,
    ) -> None:
        self._registry = registry
        self._resolver = resolver
        self._cache = cache

    def preload(self, request: TranscriptionRequest) -> None:
        self._get_or_load_model(request)

    def transcribe(self, request: TranscriptionRequest):
        provider = self._registry.get(request.config.provider)
        loaded_model = self._get_or_load_model(request)

        return provider.transcribe(loaded_model, request)

    def _get_or_load_model(self, request: TranscriptionRequest):
        validation = self._resolver.validate(request.config)

        if not validation.valid:
          raise ValueError(validation.reason or 'Invalid STT model')

        normalized_model_path = (
            validation.normalized_model_path or request.config.model_path
        )
        provider = self._registry.get(request.config.provider)
        normalized_config = type(request.config)(
            model_id=request.config.model_id,
            provider=request.config.provider,
            model_path=normalized_model_path,
            device=request.config.device,
            compute_type=request.config.compute_type,
            language=request.config.language,
            beam_size=request.config.beam_size,
            vad_filter=request.config.vad_filter,
            cpu_threads=request.config.cpu_threads,
        )
        key = ProviderModelKey(
            provider=normalized_config.provider,
            model_id=normalized_config.model_id,
            model_path=normalized_config.model_path,
            device=normalized_config.device,
            compute_type=normalized_config.compute_type,
            cpu_threads=normalized_config.cpu_threads,
        )
        cached_model = self._cache.get(key)

        if cached_model is not None:
            return cached_model

        loaded_model = provider.load_model(normalized_config)
        self._cache.set(key, loaded_model)

        return loaded_model
