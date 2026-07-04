from abc import ABC, abstractmethod

from core.types import (
    LoadedProviderModel,
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)


class STTProvider(ABC):
    provider_name: str

    @abstractmethod
    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        raise NotImplementedError

    @abstractmethod
    def load_model(self, config: ProviderModelConfig) -> LoadedProviderModel:
        raise NotImplementedError

    @abstractmethod
    def transcribe(
        self,
        loaded_model: LoadedProviderModel,
        request: TranscriptionRequest,
    ) -> TranscriptionResult:
        raise NotImplementedError
