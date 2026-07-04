import os
from typing import Any, Optional

from core.types import ProviderModelConfig


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() in ['1', 'true', 'yes', 'y', 'on']


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)

    if value is None:
        return default

    try:
        return int(value)
    except ValueError:
        return default


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    value = value.strip()

    if value == '':
        return None

    return value


def normalize_language(value: Optional[str]) -> Optional[str]:
    value = clean_optional(value)

    if value is None:
        return None

    if value.lower() in ['auto', 'none', 'null']:
        return None

    return value


def parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ['1', 'true', 'yes', 'y', 'on']

    return bool(value)


STT_PROVIDER = os.environ.get('STT_PROVIDER', 'faster-whisper')
STT_MODEL_ID = os.environ.get('STT_MODEL_ID')
STT_MODEL_PATH = os.environ.get('STT_MODEL_PATH', 'small')
STT_DEVICE = os.environ.get('STT_DEVICE', 'cpu')
STT_COMPUTE_TYPE = os.environ.get('STT_COMPUTE_TYPE', 'int8')
STT_LANGUAGE = os.environ.get('STT_LANGUAGE', 'pt')
STT_BEAM_SIZE = env_int('STT_BEAM_SIZE', 1)
STT_VAD_FILTER = env_bool('STT_VAD_FILTER', True)
STT_CPU_THREADS = env_int('STT_CPU_THREADS', 4)


def build_config(
    provider: Optional[str] = None,
    model_id: Optional[str] = None,
    model_path: Optional[str] = None,
    device: Optional[str] = None,
    compute_type: Optional[str] = None,
    language: Optional[str] = None,
    beam_size: Optional[int] = None,
    vad_filter: Optional[bool] = None,
    cpu_threads: Optional[int] = None,
) -> ProviderModelConfig:
    resolved_model_path = clean_optional(model_path) or STT_MODEL_PATH
    resolved_model_id = (
        clean_optional(model_id)
        or clean_optional(STT_MODEL_ID)
        or resolved_model_path
    )
    resolved_provider = clean_optional(provider) or STT_PROVIDER
    resolved_device = clean_optional(device) or STT_DEVICE
    resolved_compute_type = clean_optional(compute_type) or STT_COMPUTE_TYPE
    resolved_language = normalize_language(
        language if language is not None else STT_LANGUAGE
    )
    resolved_beam_size = beam_size if beam_size is not None else STT_BEAM_SIZE
    resolved_cpu_threads = cpu_threads if cpu_threads is not None else STT_CPU_THREADS

    if resolved_beam_size < 1:
        resolved_beam_size = 1

    if resolved_cpu_threads < 1:
        resolved_cpu_threads = 1

    resolved_vad_filter = parse_bool(vad_filter, STT_VAD_FILTER)

    return ProviderModelConfig(
        model_id=resolved_model_id,
        provider=resolved_provider,
        model_path=resolved_model_path,
        device=resolved_device,
        compute_type=resolved_compute_type,
        language=resolved_language,
        beam_size=resolved_beam_size,
        vad_filter=resolved_vad_filter,
        cpu_threads=resolved_cpu_threads,
    )
