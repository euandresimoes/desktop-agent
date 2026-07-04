from core.registry import ProviderRegistry
from core.types import ProviderModelConfig, ValidationResult


class ModelResolver:
    def __init__(self, registry: ProviderRegistry) -> None:
        self._registry = registry

    def validate(self, config: ProviderModelConfig) -> ValidationResult:
        provider = self._registry.get(config.provider)
        return provider.validate_model(config)
