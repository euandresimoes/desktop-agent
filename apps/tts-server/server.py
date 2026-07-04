import os
import tempfile
import threading
import wave
from dataclasses import dataclass
from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from piper import PiperVoice, SynthesisConfig


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    value = value.strip()

    if value == "":
        return None

    return value


DEFAULT_MODEL_PATH = os.environ["PIPER_MODEL_PATH"]
DEFAULT_CONFIG_PATH = os.environ["PIPER_CONFIG_PATH"]
DEFAULT_VOICE_ID = clean_optional(os.environ.get("PIPER_VOICE_ID")) or DEFAULT_MODEL_PATH

app = FastAPI()


@dataclass(frozen=True)
class VoiceKey:
    voice_id: str
    model_path: str
    config_path: str


voice_cache: dict[VoiceKey, PiperVoice] = {}
voice_cache_lock = threading.Lock()


class SpeakRequest(BaseModel):
    text: str
    voiceId: Optional[str] = None
    modelPath: Optional[str] = None
    configPath: Optional[str] = None
    lengthScale: float = 1.15
    noiseScale: float = 0.667
    noiseW: float = 0.8


def build_voice_key(body: SpeakRequest) -> VoiceKey:
    model_path = clean_optional(body.modelPath) or DEFAULT_MODEL_PATH
    config_path = clean_optional(body.configPath) or DEFAULT_CONFIG_PATH
    voice_id = clean_optional(body.voiceId) or model_path

    return VoiceKey(
        voice_id=voice_id,
        model_path=model_path,
        config_path=config_path,
    )


def get_voice(key: VoiceKey) -> PiperVoice:
    cached_voice = voice_cache.get(key)

    if cached_voice is not None:
        return cached_voice

    with voice_cache_lock:
        cached_voice = voice_cache.get(key)

        if cached_voice is not None:
            return cached_voice

        print({
            "module": "tts-server",
            "event": "loading-voice",
            "voiceId": key.voice_id,
            "modelPath": key.model_path,
            "configPath": key.config_path,
        })

        voice = PiperVoice.load(
            key.model_path,
            config_path=key.config_path,
        )

        voice_cache[key] = voice

        print({
            "module": "tts-server",
            "event": "voice-loaded",
            "voiceId": key.voice_id,
            "modelPath": key.model_path,
            "configPath": key.config_path,
        })

        return voice


default_voice_key = VoiceKey(
    voice_id=DEFAULT_VOICE_ID,
    model_path=DEFAULT_MODEL_PATH,
    config_path=DEFAULT_CONFIG_PATH,
)
get_voice(default_voice_key)


@app.get("/health")
def health():
    return {
        "ok": True,
        "defaultVoiceId": default_voice_key.voice_id,
        "defaultModelPath": default_voice_key.model_path,
        "defaultConfigPath": default_voice_key.config_path,
        "cachedVoices": [
            {
                "voiceId": key.voice_id,
                "modelPath": key.model_path,
                "configPath": key.config_path,
            }
            for key in voice_cache.keys()
        ],
    }


@app.post("/speak")
def speak(body: SpeakRequest):
    voice_key = build_voice_key(body)

    try:
        voice = get_voice(voice_key)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    syn_config = SynthesisConfig(
        length_scale=body.lengthScale,
        noise_scale=body.noiseScale,
        noise_w_scale=body.noiseW,
        normalize_audio=True,
    )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        output_path = temp_file.name

    try:
        with wave.open(output_path, "wb") as wav_file:
            voice.synthesize_wav(
                body.text,
                wav_file,
                syn_config=syn_config,
            )

        with open(output_path, "rb") as audio_file:
            audio = audio_file.read()

        return Response(
            content=audio,
            media_type="audio/wav"
        )
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)
