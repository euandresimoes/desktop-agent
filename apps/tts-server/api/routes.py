from fastapi import APIRouter, Response

from core.config import build_config
from core.types import SynthesisRequest
from api.schemas import SpeakRequest


def create_router(engine, cache, default_config):
    router = APIRouter()

    @router.get("/health")
    def health():
        return {
            "ok": True,
            "defaultVoiceId": default_config.voice_id,
            "defaultProvider": default_config.provider,
            "defaultModelPath": default_config.model_path,
            "defaultConfigPath": default_config.config_path,
            "cachedVoices": cache.snapshot(),
        }

    @router.post("/speak")
    def speak(body: SpeakRequest):
        config = build_config(
            provider=getattr(body, "provider", None),
            voice_id=body.voiceId,
            model_path=body.modelPath,
            config_path=body.configPath,
            length_scale=body.lengthScale,
            noise_scale=body.noiseScale,
            noise_w=body.noiseW,
        )
        result = engine.synthesize(
            SynthesisRequest(
                text=body.text,
                config=config,
            )
        )
        return Response(
            content=result.audio_bytes,
            media_type=result.audio_content_type,
        )

    return router
