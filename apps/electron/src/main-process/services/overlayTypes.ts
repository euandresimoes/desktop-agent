import type {
  AppOverlayAnimation,
  AppOverlayPosition,
} from "../../shared/types/app-settings";

export type OverlayVoiceState =
  | "hidden"
  | "idle"
  | "recording"
  | "processing"
  | "speaking";

export type OverlayRendererCommand =
  | "start-recording"
  | "stop-recording"
  | "cancel-and-hide";

export type OverlayRendererConfig = {
  position: AppOverlayPosition;
  opacity: number;
  animation: AppOverlayAnimation;
};

export type OverlayWindowContext = {
  position: AppOverlayPosition;
  visible: boolean;
  voiceState: OverlayVoiceState;
};
