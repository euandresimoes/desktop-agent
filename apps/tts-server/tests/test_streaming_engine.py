import unittest

from core.streaming_engine import build_audio_chunk_message


class StreamingEngineTests(unittest.TestCase):
    def test_build_audio_chunk_message_uses_pcm_payload(self) -> None:
        message = build_audio_chunk_message(
            session_id="tts_1",
            sequence=1,
            sample_rate=22050,
            channels=1,
            frame_count=4,
            audio_bytes=b"\x01\x02\x03\x04",
        )

        self.assertEqual(message["type"], "audio.chunk")
        self.assertEqual(message["sessionId"], "tts_1")
        self.assertEqual(message["payload"]["encoding"], "pcm_s16le")


if __name__ == "__main__":
    unittest.main()
