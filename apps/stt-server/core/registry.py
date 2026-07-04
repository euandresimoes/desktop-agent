from providers.base import STTProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, STTProvider] = {}

    def register(self, provider: STTProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get(self, provider_name: str) -> STTProvider:
        provider = self._providers.get(provider_name)

        if provider is None:
            raise ValueError(f'Unsupported STT provider: {provider_name}')

        return provider

    def list_names(self) -> list[str]:
        return sorted(self._providers.keys())
