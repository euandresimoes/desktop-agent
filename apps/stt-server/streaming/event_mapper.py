import time

from streaming.types import StreamingEvent


def create_stream_event(session_id: str, event: StreamingEvent) -> dict:
    return {
        'version': 'v1',
        'type': event.type,
        'sessionId': session_id,
        'timestamp': round(time.time() * 1000),
        'payload': event.payload,
    }
