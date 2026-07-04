import threading

from core.types import LoadedProviderVoice, ProviderVoiceKey


class VoiceCache:
    def __init__(self) -> None:
        self._voices: dict[ProviderVoiceKey, LoadedProviderVoice] = {}
        self._lock = threading.Lock()

    def get(self, key: ProviderVoiceKey) -> LoadedProviderVoice | None:
        return self._voices.get(key)

    def set(self, key: ProviderVoiceKey, voice: LoadedProviderVoice) -> None:
        with self._lock:
            self._voices[key] = voice

    def snapshot(self) -> list[dict[str, str]]:
        return [
            {
                "provider": key.provider,
                "voiceId": key.voice_id,
                "modelPath": key.model_path,
                "configPath": key.config_path,
            }
            for key in self._voices.keys()
        ]
