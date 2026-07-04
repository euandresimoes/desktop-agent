import threading
import wave
from typing import Optional

from fastapi import FastAPI, Response
from pydantic import BaseModel
from piper import PiperVoice, SynthesisConfig
from core.config import build_config
from core.types import ProviderVoiceConfig, ProviderVoiceKey
from errors import register_exception_handlers
from services.audio_buffer import AudioBufferStore
from services.voice_cache import VoiceCache

app = FastAPI()
register_exception_handlers(app)

default_config = build_config()
voice_cache = VoiceCache()
voice_load_lock = threading.Lock()
audio_buffer_store = AudioBufferStore()


class SpeakRequest(BaseModel):
    text: str
    voiceId: Optional[str] = None
    modelPath: Optional[str] = None
    configPath: Optional[str] = None
    lengthScale: float = 1.15
    noiseScale: float = 0.667
    noiseW: float = 0.8


def build_voice_config(body: SpeakRequest) -> ProviderVoiceConfig:
    return build_config(
        voice_id=body.voiceId,
        model_path=body.modelPath,
        config_path=body.configPath,
        length_scale=body.lengthScale,
        noise_scale=body.noiseScale,
        noise_w=body.noiseW,
    )


def build_voice_key(config: ProviderVoiceConfig) -> ProviderVoiceKey:
    return ProviderVoiceKey(
        provider=config.provider,
        voice_id=config.voice_id,
        model_path=config.model_path,
        config_path=config.config_path,
    )


def get_voice(key: ProviderVoiceKey) -> PiperVoice:
    cached_voice = voice_cache.get(key)

    if cached_voice is not None:
        return cached_voice

    with voice_load_lock:
        cached_voice = voice_cache.get(key)

        if cached_voice is not None:
            return cached_voice

        print({
            "module": "tts-server",
            "event": "loading-voice",
            "provider": key.provider,
            "voiceId": key.voice_id,
            "modelPath": key.model_path,
            "configPath": key.config_path,
        })

        voice = PiperVoice.load(
            key.model_path,
            config_path=key.config_path,
        )
        voice_cache.set(key, voice)

        print({
            "module": "tts-server",
            "event": "voice-loaded",
            "provider": key.provider,
            "voiceId": key.voice_id,
            "modelPath": key.model_path,
            "configPath": key.config_path,
        })

        return voice


default_voice_key = build_voice_key(default_config)
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
                "voiceId": key["voiceId"],
                "modelPath": key["modelPath"],
                "configPath": key["configPath"],
            }
            for key in voice_cache.snapshot()
        ],
    }


@app.post("/speak")
def speak(body: SpeakRequest):
    voice_config = build_voice_config(body)
    voice_key = build_voice_key(voice_config)

    try:
        voice = get_voice(voice_key)
    except Exception:
        raise

    syn_config = SynthesisConfig(
        length_scale=body.lengthScale,
        noise_scale=body.noiseScale,
        noise_w_scale=body.noiseW,
        normalize_audio=True,
    )

    output_path = audio_buffer_store.create_temp_path(".wav")

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
        audio_buffer_store.remove(output_path)
