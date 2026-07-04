from providers.base import TTSProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, TTSProvider] = {}

    def register(self, provider: TTSProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get(self, provider_name: str) -> TTSProvider:
        provider = self._providers.get(provider_name)
        if provider is None:
            raise ValueError(f"Unsupported TTS provider: {provider_name}")
        return provider

    def list_names(self) -> list[str]:
        return sorted(self._providers.keys())
