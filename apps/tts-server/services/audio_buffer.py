import os
import tempfile


class AudioBufferStore:
    def create_temp_path(self, suffix: str = ".wav") -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            return temp_file.name

    def remove(self, file_path: str) -> None:
        if os.path.exists(file_path):
            os.remove(file_path)
