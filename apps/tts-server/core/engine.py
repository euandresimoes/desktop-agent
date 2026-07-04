from core.registry import ProviderRegistry
from core.types import ProviderVoiceKey, SynthesisRequest
from core.voice_resolver import VoiceResolver
from services.voice_cache import VoiceCache


class TTSEngine:
    def __init__(
        self,
        registry: ProviderRegistry,
        resolver: VoiceResolver,
        cache: VoiceCache,
    ) -> None:
        self._registry = registry
        self._resolver = resolver
        self._cache = cache

    def preload(self, request: SynthesisRequest) -> None:
        self._get_or_load_voice(request)

    def synthesize(self, request: SynthesisRequest):
        provider = self._registry.get(request.config.provider)
        loaded_voice = self._get_or_load_voice(request)
        return provider.synthesize(loaded_voice, request)

    def _get_or_load_voice(self, request: SynthesisRequest):
        validation = self._resolver.validate(request.config)
        if not validation.valid:
            raise ValueError(validation.reason or "Invalid TTS voice")

        normalized_config = type(request.config)(
            voice_id=request.config.voice_id,
            provider=request.config.provider,
            model_path=validation.normalized_model_path or request.config.model_path,
            config_path=validation.normalized_config_path or request.config.config_path,
            length_scale=request.config.length_scale,
            noise_scale=request.config.noise_scale,
            noise_w=request.config.noise_w,
        )
        provider = self._registry.get(normalized_config.provider)
        key = ProviderVoiceKey(
            provider=normalized_config.provider,
            voice_id=normalized_config.voice_id,
            model_path=normalized_config.model_path,
            config_path=normalized_config.config_path,
        )
        cached_voice = self._cache.get(key)

        if cached_voice is not None:
            return cached_voice

        loaded_voice = provider.load_voice(normalized_config)
        self._cache.set(key, loaded_voice)

        return loaded_voice
