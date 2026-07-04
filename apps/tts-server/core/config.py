import os
from typing import Optional

from core.types import ProviderVoiceConfig


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    value = value.strip()
    return value or None


TTS_PROVIDER = os.environ.get("TTS_PROVIDER", "piper")
TTS_MODEL_PATH = os.environ["PIPER_MODEL_PATH"]
TTS_CONFIG_PATH = os.environ["PIPER_CONFIG_PATH"]
TTS_VOICE_ID = clean_optional(os.environ.get("PIPER_VOICE_ID"))


def build_config(
    provider: Optional[str] = None,
    voice_id: Optional[str] = None,
    model_path: Optional[str] = None,
    config_path: Optional[str] = None,
    length_scale: Optional[float] = None,
    noise_scale: Optional[float] = None,
    noise_w: Optional[float] = None,
) -> ProviderVoiceConfig:
    resolved_model_path = clean_optional(model_path) or TTS_MODEL_PATH
    resolved_config_path = clean_optional(config_path) or TTS_CONFIG_PATH
    resolved_voice_id = clean_optional(voice_id) or TTS_VOICE_ID or resolved_model_path

    return ProviderVoiceConfig(
        voice_id=resolved_voice_id,
        provider=clean_optional(provider) or TTS_PROVIDER,
        model_path=resolved_model_path,
        config_path=resolved_config_path,
        length_scale=length_scale if length_scale is not None else 1.15,
        noise_scale=noise_scale if noise_scale is not None else 0.667,
        noise_w=noise_w if noise_w is not None else 0.8,
    )
