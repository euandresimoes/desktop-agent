from core.registry import ProviderRegistry
from core.types import ProviderVoiceConfig, ValidationResult


class VoiceResolver:
    def __init__(self, registry: ProviderRegistry) -> None:
        self._registry = registry

    def validate(self, config: ProviderVoiceConfig) -> ValidationResult:
        provider = self._registry.get(config.provider)
        return provider.validate_voice(config)
