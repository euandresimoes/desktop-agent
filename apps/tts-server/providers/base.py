from abc import ABC, abstractmethod

from core.types import (
    LoadedProviderVoice,
    ProviderVoiceConfig,
    SynthesisRequest,
    SynthesisResult,
    ValidationResult,
)


class TTSProvider(ABC):
    provider_name: str

    @abstractmethod
    def validate_voice(self, config: ProviderVoiceConfig) -> ValidationResult:
        raise NotImplementedError

    @abstractmethod
    def load_voice(self, config: ProviderVoiceConfig) -> LoadedProviderVoice:
        raise NotImplementedError

    @abstractmethod
    def synthesize(
        self,
        loaded_voice: LoadedProviderVoice,
        request: SynthesisRequest,
    ) -> SynthesisResult:
        raise NotImplementedError
