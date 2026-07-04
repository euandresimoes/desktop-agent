import time

from fastapi import APIRouter, File, Form, UploadFile

from core.config import build_config
from core.types import TranscriptionRequest
from services.audio_loader import UploadedAudioFileStore


def create_router(engine, cache, default_config):
    router = APIRouter()
    file_store = UploadedAudioFileStore()

    @router.get('/health')
    def health():
        return {
            'ok': True,
            'defaultModelId': default_config.model_id,
            'defaultModelPath': default_config.model_path,
            'provider': default_config.provider,
            'device': default_config.device,
            'computeType': default_config.compute_type,
            'language': default_config.language,
            'beamSize': default_config.beam_size,
            'vadFilter': default_config.vad_filter,
            'cpuThreads': default_config.cpu_threads,
            'cachedModels': cache.snapshot(),
        }

    @router.post('/transcribe')
    async def transcribe(
        audio: UploadFile = File(...),
        provider: str | None = Form(None),
        modelId: str | None = Form(None),
        modelPath: str | None = Form(None),
        device: str | None = Form(None),
        computeType: str | None = Form(None),
        language: str | None = Form(None),
        beamSize: int | None = Form(None),
        vadFilter: bool | None = Form(None),
        cpuThreads: int | None = Form(None),
    ):
        config = build_config(
            provider=provider,
            model_id=modelId,
            model_path=modelPath,
            device=device,
            compute_type=computeType,
            language=language,
            beam_size=beamSize,
            vad_filter=vadFilter,
            cpu_threads=cpuThreads,
        )
        input_path = file_store.create_temp_path(audio.filename)
        started_at = time.perf_counter()

        try:
            with open(input_path, 'wb') as file:
                while True:
                    chunk = await audio.read(1024 * 1024)

                    if not chunk:
                        break

                    file.write(chunk)

            result = engine.transcribe(
                TranscriptionRequest(
                    audio_path=input_path,
                    config=config,
                )
            )

            return {
                'text': result.text,
                'language': result.language,
                'languageProbability': result.language_probability,
                'modelId': config.model_id,
                'modelPath': config.model_path,
                'provider': config.provider,
                'device': config.device,
                'computeType': config.compute_type,
                'beamSize': config.beam_size,
                'vadFilter': config.vad_filter,
                'durationMs': round((time.perf_counter() - started_at) * 1000),
                'inferenceDurationMs': result.inference_duration_ms,
            }
        except Exception:
            raise
        finally:
            file_store.remove(input_path)

    return router
