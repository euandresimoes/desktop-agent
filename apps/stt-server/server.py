import os
import time
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from faster_whisper import WhisperModel


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() in ["1", "true", "yes", "y", "on"]


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

    if value == "":
        return None

    return value


def normalize_language(value: Optional[str]) -> Optional[str]:
    value = clean_optional(value)

    if value is None:
        return None

    if value.lower() in ["auto", "none", "null"]:
        return None

    return value


def parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ["1", "true", "yes", "y", "on"]

    return bool(value)


STT_MODEL_ID = os.environ.get("STT_MODEL_ID")
STT_MODEL_PATH = os.environ.get("STT_MODEL_PATH", "small")
STT_DEVICE = os.environ.get("STT_DEVICE", "cpu")
STT_COMPUTE_TYPE = os.environ.get("STT_COMPUTE_TYPE", "int8")
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "pt")
STT_BEAM_SIZE = env_int("STT_BEAM_SIZE", 1)
STT_VAD_FILTER = env_bool("STT_VAD_FILTER", True)
STT_CPU_THREADS = env_int("STT_CPU_THREADS", 4)

app = FastAPI()


@dataclass(frozen=True)
class ModelKey:
    model_id: str
    model_path: str
    device: str
    compute_type: str
    cpu_threads: int


@dataclass(frozen=True)
class TranscriptionConfig:
    model_id: str
    model_path: str
    device: str
    compute_type: str
    language: Optional[str]
    beam_size: int
    vad_filter: bool
    cpu_threads: int


model_cache: dict[ModelKey, WhisperModel] = {}
model_cache_lock = threading.Lock()


def build_config(
    model_id: Optional[str] = None,
    model_path: Optional[str] = None,
    device: Optional[str] = None,
    compute_type: Optional[str] = None,
    language: Optional[str] = None,
    beam_size: Optional[int] = None,
    vad_filter: Optional[bool] = None,
    cpu_threads: Optional[int] = None,
) -> TranscriptionConfig:
    resolved_model_path = clean_optional(model_path) or STT_MODEL_PATH

    resolved_model_id = (
        clean_optional(model_id)
        or clean_optional(STT_MODEL_ID)
        or resolved_model_path
    )

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

    resolved_vad_filter = parse_bool(
        vad_filter,
        STT_VAD_FILTER,
    )

    return TranscriptionConfig(
        model_id=resolved_model_id,
        model_path=resolved_model_path,
        device=resolved_device,
        compute_type=resolved_compute_type,
        language=resolved_language,
        beam_size=resolved_beam_size,
        vad_filter=resolved_vad_filter,
        cpu_threads=resolved_cpu_threads,
    )


def get_model(config: TranscriptionConfig) -> WhisperModel:
    key = ModelKey(
        model_id=config.model_id,
        model_path=config.model_path,
        device=config.device,
        compute_type=config.compute_type,
        cpu_threads=config.cpu_threads,
    )

    cached_model = model_cache.get(key)

    if cached_model is not None:
        return cached_model

    with model_cache_lock:
        cached_model = model_cache.get(key)

        if cached_model is not None:
            return cached_model

        print({
            "module": "stt-server",
            "event": "loading-model",
            "modelId": config.model_id,
            "modelPath": config.model_path,
            "device": config.device,
            "computeType": config.compute_type,
            "cpuThreads": config.cpu_threads,
        })

        model_started_at = time.perf_counter()

        model = WhisperModel(
            config.model_path,
            device=config.device,
            compute_type=config.compute_type,
            cpu_threads=config.cpu_threads,
        )

        model_cache[key] = model

        print({
            "module": "stt-server",
            "event": "model-loaded",
            "modelId": config.model_id,
            "modelPath": config.model_path,
            "durationMs": round((time.perf_counter() - model_started_at) * 1000),
        })

        return model


default_config = build_config()

try:
    get_model(default_config)
except Exception as error:
    print({
        "module": "stt-server",
        "event": "model-preload-failed",
        "modelId": default_config.model_id,
        "modelPath": default_config.model_path,
        "error": str(error),
    })


@app.get("/health")
def health():
    return {
        "ok": True,
        "defaultModelId": default_config.model_id,
        "defaultModelPath": default_config.model_path,
        "device": default_config.device,
        "computeType": default_config.compute_type,
        "language": default_config.language,
        "beamSize": default_config.beam_size,
        "vadFilter": default_config.vad_filter,
        "cpuThreads": default_config.cpu_threads,
        "cachedModels": [
            {
                "modelId": key.model_id,
                "modelPath": key.model_path,
                "device": key.device,
                "computeType": key.compute_type,
                "cpuThreads": key.cpu_threads,
            }
            for key in model_cache.keys()
        ],
    }


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),

    modelId: Optional[str] = Form(None),
    modelPath: Optional[str] = Form(None),
    device: Optional[str] = Form(None),
    computeType: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    beamSize: Optional[int] = Form(None),
    vadFilter: Optional[bool] = Form(None),
    cpuThreads: Optional[int] = Form(None),
):
    started_at = time.perf_counter()

    config = build_config(
        model_id=modelId,
        model_path=modelPath,
        device=device,
        compute_type=computeType,
        language=language,
        beam_size=beamSize,
        vad_filter=vadFilter,
        cpu_threads=cpuThreads,
    )

    model = get_model(config)

    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        input_path = temp_file.name

    try:
        with open(input_path, "wb") as file:
            while True:
                chunk = await audio.read(1024 * 1024)

                if not chunk:
                    break

                file.write(chunk)

        inference_started_at = time.perf_counter()

        segments, info = model.transcribe(
            input_path,
            language=config.language,
            beam_size=config.beam_size,
            vad_filter=config.vad_filter,
        )

        text_parts: list[str] = []

        for segment in segments:
            text = segment.text.strip()

            if text:
                text_parts.append(text)

        text = " ".join(text_parts).strip()

        duration_ms = round((time.perf_counter() - started_at) * 1000)
        inference_duration_ms = round(
            (time.perf_counter() - inference_started_at) * 1000
        )

        return {
            "text": text,
            "language": info.language,
            "languageProbability": info.language_probability,
            "modelId": config.model_id,
            "modelPath": config.model_path,
            "device": config.device,
            "computeType": config.compute_type,
            "beamSize": config.beam_size,
            "vadFilter": config.vad_filter,
            "durationMs": duration_ms,
            "inferenceDurationMs": inference_duration_ms,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )

    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
