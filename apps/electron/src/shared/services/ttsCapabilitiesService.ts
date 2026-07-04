import { fetchJsonOrThrow } from "../utils/http";

const API_BASE = "http://localhost:35421/api/v1";

export type TTSPlaybackMode = "standard" | "stream";

export type TTSCapabilitiesResponse = {
  provider: string;
  playbackModes: {
    standard: {
      supported: boolean;
      recommended: boolean;
    };
    stream: {
      supported: boolean;
      recommended: boolean;
      experimental: boolean;
      kind: "realtime" | "post_synthesis_chunked" | "unsupported";
    };
  };
};

export function mapTTSCapabilitiesToModeOptions(
  capabilities: TTSCapabilitiesResponse,
) {
  const options: { value: TTSPlaybackMode; label: string }[] = [];

  if (capabilities.playbackModes.standard.supported) {
    options.push({ value: "standard", label: "Standard" });
  }

  if (capabilities.playbackModes.stream.supported) {
    options.push({
      value: "stream",
      label: capabilities.playbackModes.stream.experimental
        ? "Streaming (Experimental)"
        : "Streaming",
    });
  }

  return options;
}

export async function fetchTTSCapabilities() {
  return await fetchJsonOrThrow<TTSCapabilitiesResponse>(
    `${API_BASE}/tts/capabilities`,
    undefined,
    "Failed to load TTS capabilities",
  );
}
