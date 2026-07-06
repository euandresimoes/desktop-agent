import { fetchJsonOrThrow } from "../utils/http.ts";

const API_BASE = "http://localhost:35421/api/v1";

export type STTStreamingCapabilitiesResponse = {
  provider: string;
  modelId: string | null;
  streaming: {
    supported: boolean;
    mode: "realtime_partial_commit" | "unsupported";
  };
};

export async function fetchSTTStreamingCapabilities() {
  return await fetchJsonOrThrow<STTStreamingCapabilitiesResponse>(
    `${API_BASE}/stt-streaming/capabilities`,
    undefined,
    "Failed to load STT streaming capabilities",
  );
}
