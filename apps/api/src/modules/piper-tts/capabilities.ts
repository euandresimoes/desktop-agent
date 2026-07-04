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

export function getTTSCapabilities(input: {
  provider: string;
  supportsChunkedPostSynthesis: boolean;
}): TTSCapabilitiesResponse {
  return {
    provider: input.provider,
    playbackModes: {
      standard: {
        supported: true,
        recommended: true,
      },
      stream: {
        supported: input.supportsChunkedPostSynthesis,
        recommended: false,
        experimental: input.supportsChunkedPostSynthesis,
        kind: input.supportsChunkedPostSynthesis
          ? "post_synthesis_chunked"
          : "unsupported",
      },
    },
  };
}
