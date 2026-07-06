import asyncio
import json
import time

from fastapi import APIRouter, File, Form, UploadFile, WebSocket
from starlette.websockets import WebSocketDisconnect

from core.config import build_config
from core.types import TranscriptionRequest
from services.audio_loader import UploadedAudioFileStore
from streaming.event_mapper import create_stream_event
from streaming.types import StreamingOpenRequest


def create_router(engine, cache, default_config, streaming_engine):
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

    @router.get('/streaming/capabilities')
    def streaming_capabilities():
        provider = default_config.provider

        return {
            'provider': provider,
            'modelId': default_config.model_id,
            'streaming': {
                'supported': provider == 'faster-whisper',
                'mode': 'realtime_partial_commit'
                if provider == 'faster-whisper'
                else 'unsupported',
            },
        }

    @router.websocket('/ws/stream')
    async def stream_audio(websocket: WebSocket):
        await websocket.accept()
        message_queue: asyncio.Queue[dict | None] = asyncio.Queue()
        socket_closed = False
        partial_tasks: dict[str, asyncio.Task[None]] = {}

        async def send_stream_event(session_id: str, event):
            nonlocal socket_closed
            if socket_closed:
                return

            try:
                await websocket.send_json(create_stream_event(session_id, event))
            except RuntimeError:
                socket_closed = True

        async def run_partial_poll(session_id: str):
            try:
                events = await asyncio.to_thread(streaming_engine.poll_partial, session_id)
                for event in events:
                    await send_stream_event(session_id, event)
            except Exception:
                return
            finally:
                partial_tasks.pop(session_id, None)

        async def process_stream_messages():
            while True:
                queued_message = await message_queue.get()

                if queued_message is None:
                    message_queue.task_done()
                    break

                try:
                    message_type = str(queued_message.get('type') or '')
                    session_id = str(queued_message.get('sessionId') or '')
                    payload = queued_message.get('payload') or {}

                    if message_type == 'audio.chunk':
                        sequence = int(payload.get('sequence') or 0)
                        if sequence <= 4 or sequence % 12 == 0:
                            print(
                                {
                                    'module': 'stt-server',
                                    'event': 'stream-audio-chunk',
                                    'sessionId': session_id,
                                    'sequence': sequence,
                                    'frameCount': int(payload.get('frameCount') or 0),
                                }
                            )
                        await asyncio.to_thread(
                            streaming_engine.push_audio,
                            session_id,
                            str(payload.get('chunkId') or ''),
                            sequence,
                            str(payload.get('audioBase64') or ''),
                            int(payload.get('frameCount') or 0),
                        )

                        existing_task = partial_tasks.get(session_id)
                        if existing_task is None or existing_task.done():
                            partial_tasks[session_id] = asyncio.create_task(
                                run_partial_poll(session_id)
                            )
                        continue

                    if message_type == 'session.commit':
                        partial_task = partial_tasks.pop(session_id, None)
                        if partial_task is not None:
                            try:
                                await partial_task
                            except Exception:
                                pass

                        print(
                            {
                                'module': 'stt-server',
                                'event': 'stream-session-commit',
                                'sessionId': session_id,
                                'reason': str(payload.get('reason') or ''),
                            }
                        )
                        events = await asyncio.to_thread(
                            streaming_engine.commit,
                            session_id,
                        )
                        for event in events:
                            await send_stream_event(session_id, event)
                        continue

                    if message_type == 'session.cancel':
                        partial_task = partial_tasks.pop(session_id, None)
                        if partial_task is not None:
                            partial_task.cancel()
                        events = await asyncio.to_thread(
                            streaming_engine.cancel,
                            session_id,
                            str(payload.get('reason') or 'client_cancelled'),
                        )
                        for event in events:
                            await send_stream_event(session_id, event)
                        continue
                finally:
                    message_queue.task_done()

        worker_task = asyncio.create_task(process_stream_messages())

        try:
            while True:
                message = json.loads(await websocket.receive_text())
                message_type = str(message.get('type') or '')
                session_id = str(message.get('sessionId') or '')
                payload = message.get('payload') or {}

                if message_type == 'session.start':
                    print(
                        {
                            'module': 'stt-server',
                            'event': 'stream-session-start',
                            'sessionId': session_id,
                            'sampleRate': payload.get('sampleRate'),
                            'channels': payload.get('channels'),
                            'provider': payload.get('provider'),
                            'modelId': payload.get('modelId'),
                        }
                    )
                    request = StreamingOpenRequest(
                        session_id=session_id,
                        config=build_config(
                            provider=str(payload.get('provider') or default_config.provider),
                            model_id=str(payload.get('modelId') or default_config.model_id),
                            model_path=str(payload.get('modelPath') or default_config.model_path),
                            device=str(payload.get('device') or default_config.device),
                            compute_type=str(
                                payload.get('computeType') or default_config.compute_type
                            ),
                            language=str(payload.get('language') or default_config.language),
                            beam_size=int(payload.get('beamSize') or default_config.beam_size),
                            vad_filter=bool(payload.get('vadFilter', default_config.vad_filter)),
                            cpu_threads=int(
                                payload.get('cpuThreads') or default_config.cpu_threads
                            ),
                        ),
                        sample_rate=int(payload.get('sampleRate') or 16000),
                        channels=int(payload.get('channels') or 1),
                        encoding=str(payload.get('encoding') or 'pcm_f32le'),
                    )
                    await asyncio.to_thread(streaming_engine.open_session, request)
                    continue

                if message_type in {'audio.chunk', 'session.commit', 'session.cancel'}:
                    await message_queue.put(message)
                    continue

                await websocket.send_json(
                    {
                        'version': 'v1',
                        'type': 'session.error',
                        'sessionId': session_id or 'unknown',
                        'payload': {
                            'error': f'Unsupported STT streaming command: {message_type}',
                        },
                    }
                )
        except WebSocketDisconnect:
            socket_closed = True
            await message_queue.put(None)
            for task in list(partial_tasks.values()):
                task.cancel()
            await worker_task
            return
        except Exception as error:
            socket_closed = True
            await message_queue.put(None)
            for task in list(partial_tasks.values()):
                task.cancel()
            await worker_task
            try:
                await websocket.send_json(
                    {
                        'version': 'v1',
                        'type': 'session.error',
                        'sessionId': 'unknown',
                        'payload': {
                            'error': str(error),
                        },
                    }
                )
            except RuntimeError:
                return

    return router
