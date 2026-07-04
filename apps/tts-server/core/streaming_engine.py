import base64


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
