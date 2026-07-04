import threading

from core.types import LoadedProviderModel, ProviderModelKey


class ModelCache:
    def __init__(self) -> None:
        self._models: dict[ProviderModelKey, LoadedProviderModel] = {}
        self._lock = threading.Lock()

    def get(self, key: ProviderModelKey) -> LoadedProviderModel | None:
        return self._models.get(key)

    def set(self, key: ProviderModelKey, model: LoadedProviderModel) -> None:
        with self._lock:
            self._models[key] = model

    def snapshot(self) -> list[dict[str, str]]:
        return [
          {
            'provider': key.provider,
            'modelId': key.model_id,
            'modelPath': key.model_path,
            'device': key.device,
            'computeType': key.compute_type,
            'cpuThreads': str(key.cpu_threads),
          }
          for key in self._models.keys()
        ]
