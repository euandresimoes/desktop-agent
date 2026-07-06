from streaming.types import StreamingSessionState


class StreamingSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, StreamingSessionState] = {}

    def create(self, session: StreamingSessionState) -> StreamingSessionState:
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> StreamingSessionState | None:
        return self._sessions.get(session_id)

    def close(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
