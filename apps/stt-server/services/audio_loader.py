import os
import tempfile
import wave
from pathlib import Path

import numpy as np


class UploadedAudioFileStore:
    def create_temp_path(self, file_name: str | None) -> str:
        suffix = Path(file_name or 'audio.wav').suffix or '.wav'

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            return temp_file.name

    def remove(self, file_path: str) -> None:
        if os.path.exists(file_path):
            os.remove(file_path)


def load_wav_audio(file_path: str) -> tuple[np.ndarray, int]:
    with wave.open(file_path, 'rb') as wav_file:
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        channels = wav_file.getnchannels()
        frame_count = wav_file.getnframes()
        audio_bytes = wav_file.readframes(frame_count)

    if sample_width != 2:
        raise RuntimeError(
            f'Unsupported WAV sample width: {sample_width * 8} bits. Expected 16-bit PCM.'
        )

    audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)

    return audio, sample_rate


def resample_audio(
    audio: np.ndarray,
    source_sample_rate: int,
    target_sample_rate: int,
) -> np.ndarray:
    if source_sample_rate <= 0 or target_sample_rate <= 0:
        raise RuntimeError('Invalid sample rate for audio resampling')

    if source_sample_rate == target_sample_rate or audio.size == 0:
        return audio

    duration_seconds = audio.shape[0] / source_sample_rate
    target_length = max(1, int(round(duration_seconds * target_sample_rate)))

    source_positions = np.linspace(0.0, 1.0, num=audio.shape[0], endpoint=False)
    target_positions = np.linspace(0.0, 1.0, num=target_length, endpoint=False)

    return np.interp(target_positions, source_positions, audio).astype(np.float32)
