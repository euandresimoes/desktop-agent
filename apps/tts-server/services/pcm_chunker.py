def chunk_pcm_bytes(audio_bytes: bytes, chunk_size: int = 4096) -> list[bytes]:
    return [
        audio_bytes[index:index + chunk_size]
        for index in range(0, len(audio_bytes), chunk_size)
    ]
