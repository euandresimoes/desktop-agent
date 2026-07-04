def chunk_text(text: str) -> list[str]:
    words = text.split()

    if not words:
        return []

    return [' '.join(words[:index]) for index in range(1, len(words) + 1)]
