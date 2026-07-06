import type { AppSttPlaybackMode } from "../types/app-settings";
import type { STTStreamingCapabilitiesResponse } from "./sttStreamingCapabilitiesService";

export function mapSTTCapabilitiesToModeOptions(
  capabilities: STTStreamingCapabilitiesResponse | null,
) {
  const options: Array<{ value: AppSttPlaybackMode; label: string }> = [
    { value: "standard", label: "Standard" },
  ];

  if (capabilities?.streaming.supported) {
    options.push({ value: "stream", label: "Streaming (Experimental)" });
  }

  return options;
}

export function normalizeSTTPlaybackModeAgainstCapabilities(
  preferredMode: AppSttPlaybackMode,
  capabilities: STTStreamingCapabilitiesResponse | null,
) {
  if (!capabilities) {
    return "standard" as const;
  }

  if (preferredMode === "stream" && !capabilities.streaming.supported) {
    return "standard" as const;
  }

  return preferredMode;
}
