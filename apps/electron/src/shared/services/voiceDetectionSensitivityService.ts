const MIN_SILENCE_THRESHOLD = 0.004;
const MAX_SILENCE_THRESHOLD = 0.02;

export function normalizeVoiceDetectionSensitivity(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  if (value > 1) {
    return Math.min(1, Math.max(0, value / 100));
  }

  return Math.min(1, Math.max(0, value));
}

export function voiceDetectionSensitivityToThreshold(value: number) {
  const normalized = normalizeVoiceDetectionSensitivity(value);

  return (
    MAX_SILENCE_THRESHOLD -
    normalized * (MAX_SILENCE_THRESHOLD - MIN_SILENCE_THRESHOLD)
  );
}

export function formatVoiceDetectionSensitivity(value: number) {
  const normalized = normalizeVoiceDetectionSensitivity(value);

  if (normalized <= 0.33) {
    return "Less sensitive";
  }

  if (normalized >= 0.67) {
    return "More sensitive";
  }

  return "Balanced";
}
