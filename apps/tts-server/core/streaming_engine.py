import base64
import io
import wave

from services.pcm_chunker import chunk_pcm_bytes
from services.session_metrics import StreamingSessionMetrics
from services.text_chunker import chunk_text


def build_audio_chunk_message(
    session_id: str,
    sequence: int,
    sample_rate: int,
    channels: int,
    frame_count: int,
    audio_bytes: bytes,
):
    return {
        "type": "audio.chunk",
        "sessionId": session_id,
        "payload": {
            "sequence": sequence,
            "chunkId": f"{session_id}_{sequence}",
            "encoding": "pcm_s16le",
            "sampleRate": sample_rate,
            "channels": channels,
            "frameCount": frame_count,
            "durationMs": 0,
            "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
        },
    }


def build_text_chunk_message(
    session_id: str,
    sequence: int,
    text: str,
    is_final: bool,
):
    return {
        "type": "text.chunk",
        "sessionId": session_id,
        "payload": {
            "sequence": sequence,
            "text": text,
            "isFinal": is_final,
        },
    }


def build_metrics_message(
    session_id: str,
    *,
    time_to_first_chunk_ms: int,
    generated_audio_duration_ms: int,
    elapsed_ms: int,
    metrics: StreamingSessionMetrics,
):
    return {
        "type": "metrics",
        "sessionId": session_id,
        "payload": {
            "timeToFirstChunkMs": time_to_first_chunk_ms,
            "audioChunksSent": metrics.audio_chunks_sent,
            "textChunksSent": metrics.text_chunks_sent,
            "generatedAudioDurationMs": generated_audio_duration_ms,
            "elapsedMs": elapsed_ms,
        },
    }


def build_terminal_message(
    session_id: str,
    message_type: str,
    payload: dict,
):
    return {
        "type": message_type,
        "sessionId": session_id,
        "payload": payload,
    }


def build_stream_messages(
    session_id: str,
    text: str,
    audio_bytes: bytes,
    *,
    chunk_size: int = 8192,
):
    with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        pcm_bytes = wav_file.readframes(wav_file.getnframes())

    bytes_per_frame = max(1, sample_width * channels)
    metrics = StreamingSessionMetrics()
    messages = []
    sequence = 1
    text_chunks = chunk_text(text)

    for index, text_value in enumerate(text_chunks, start=1):
        metrics.text_chunks_sent += 1
        messages.append(
            build_text_chunk_message(
                session_id=session_id,
                sequence=sequence,
                text=text_value,
                is_final=index == len(text_chunks),
            )
        )
        sequence += 1

    for chunk in chunk_pcm_bytes(pcm_bytes, chunk_size=chunk_size):
        frame_count = len(chunk) // bytes_per_frame
        metrics.audio_chunks_sent += 1
        messages.append(
            build_audio_chunk_message(
                session_id=session_id,
                sequence=sequence,
                sample_rate=sample_rate,
                channels=channels,
                frame_count=frame_count,
                audio_bytes=chunk,
            )
        )
        messages[-1]["payload"]["durationMs"] = round(
            (frame_count / sample_rate) * 1000
        )
        sequence += 1

    generated_audio_duration_ms = round(
        ((len(pcm_bytes) // bytes_per_frame) / sample_rate) * 1000
    )

    return {
        "messages": messages,
        "sampleRate": sample_rate,
        "channels": channels,
        "metrics": metrics,
        "generatedAudioDurationMs": generated_audio_duration_ms,
    }
