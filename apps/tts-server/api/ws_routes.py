import asyncio
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.config import build_config
from core.streaming_engine import (
    build_metrics_message,
    build_stream_messages,
    build_terminal_message,
)
from core.types import SynthesisRequest


def create_ws_router(engine):
    router = APIRouter()

    @router.websocket("/ws/stream")
    async def stream_tts(websocket: WebSocket):
        await websocket.accept()
        session_tasks = {}
        cancelled_sessions = set()

        async def run_streaming_session(session_id: str, payload: dict):
            try:
                started_at = time.perf_counter()
                text = (payload.get("text") or "").strip()

                if not text:
                    await websocket.send_json(
                        build_terminal_message(
                            session_id,
                            "session.error",
                            {
                                "error": "Streaming text cannot be empty",
                                "details": None,
                            },
                        )
                    )
                    return

                config = build_config(
                    provider=payload.get("provider"),
                    voice_id=payload.get("voiceId"),
                    model_path=payload.get("modelPath"),
                    config_path=payload.get("configPath"),
                    length_scale=payload.get("lengthScale"),
                    noise_scale=payload.get("noiseScale"),
                    noise_w=payload.get("noiseW"),
                )

                synthesis_result = await asyncio.to_thread(
                    engine.synthesize,
                    SynthesisRequest(
                        text=text,
                        config=config,
                        request_id=payload.get("requestId"),
                    ),
                )

                if session_id in cancelled_sessions:
                    return

                built_stream = build_stream_messages(
                    session_id=session_id,
                    text=text,
                    audio_bytes=synthesis_result.audio_bytes,
                )

                for item in built_stream["messages"]:
                    if session_id in cancelled_sessions:
                        return

                    await websocket.send_json(item)
                    await asyncio.sleep(0)

                elapsed_ms = round((time.perf_counter() - started_at) * 1000)

                if session_id in cancelled_sessions:
                    return

                await websocket.send_json(
                    build_metrics_message(
                        session_id,
                        time_to_first_chunk_ms=synthesis_result.duration_ms,
                        generated_audio_duration_ms=built_stream[
                            "generatedAudioDurationMs"
                        ],
                        elapsed_ms=elapsed_ms,
                        metrics=built_stream["metrics"],
                    )
                )

                await websocket.send_json(
                    build_terminal_message(
                        session_id,
                        "session.complete",
                        {
                            "audioChunksSent": built_stream["metrics"].audio_chunks_sent,
                            "textChunksSent": built_stream["metrics"].text_chunks_sent,
                            "generatedAudioDurationMs": built_stream[
                                "generatedAudioDurationMs"
                            ],
                            "elapsedMs": elapsed_ms,
                        },
                    )
                )
            except Exception as error:
                await websocket.send_json(
                    build_terminal_message(
                        session_id,
                        "session.error",
                        {
                            "error": str(error),
                            "details": None,
                        },
                    )
                )
            finally:
                session_tasks.pop(session_id, None)

        try:
            while True:
                message = await websocket.receive_json()
                message_type = message.get("type")
                session_id = message.get("sessionId", "unknown")
                payload = message.get("payload", {})

                if message_type == "session.cancel":
                    cancelled_sessions.add(session_id)
                    await websocket.send_json(
                        build_terminal_message(
                            session_id,
                            "session.cancelled",
                            {
                                "reason": payload.get("reason", "client_cancelled"),
                            },
                        )
                    )
                    continue

                if message_type != "session.start":
                    await websocket.send_json(
                        build_terminal_message(
                            session_id,
                            "session.error",
                            {
                                "error": "Unsupported TTS streaming command",
                                "details": None,
                            },
                        )
                    )
                    continue

                cancelled_sessions.discard(session_id)
                session_tasks[session_id] = asyncio.create_task(
                    run_streaming_session(session_id, payload)
                )
        except WebSocketDisconnect:
            for task in session_tasks.values():
                task.cancel()
            return
        except Exception as error:
            await websocket.send_json(
                build_terminal_message(
                    "unknown",
                    "session.error",
                    {
                        "error": str(error),
                        "details": None,
                    },
                )
            )

    return router
