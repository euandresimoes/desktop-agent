export const APP_THEME_STORAGE_KEY = "desktop-agent-theme";
export const APP_ACCENT_STORAGE_KEY = "desktop-agent-accent";
export const APP_ACCENT_MODE_STORAGE_KEY = "desktop-agent-accent-mode";

export const APP_THEME_IDS = ["dark"] as const;
export const APP_ACCENT_MODES = ["theme", "custom"] as const;
export const APP_STT_PLAYBACK_MODES = ["standard", "stream"] as const;
export const APP_TTS_PLAYBACK_MODES = ["standard", "stream"] as const;
export const APP_OVERLAY_ANIMATIONS = ["fade", "slide", "pop"] as const;
export const APP_OVERLAY_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];
export type AppAccentMode = (typeof APP_ACCENT_MODES)[number];
export type AppSttPlaybackMode = (typeof APP_STT_PLAYBACK_MODES)[number];
export type AppTtsPlaybackMode = (typeof APP_TTS_PLAYBACK_MODES)[number];
export type AppOverlayAnimation = (typeof APP_OVERLAY_ANIMATIONS)[number];
export type AppOverlayPosition = (typeof APP_OVERLAY_POSITIONS)[number];

export interface AppSettings {
  launchMaximized: boolean;
  openOnStartup: boolean;
  closeToTray: boolean;
  autoWarmupLlm: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  microphoneGain: number;
  voiceDetectionSensitivity: number;
  outputVolume: number;
  agentName: string;
  responseLanguage: string;
  customSystemPrompt: string;
  themeId: AppThemeId;
  accentMode: AppAccentMode;
  accentColor: string;
  sttPlaybackMode: AppSttPlaybackMode;
  ttsPlaybackMode: AppTtsPlaybackMode;
  overlayOpacity: number;
  overlayAnimation: AppOverlayAnimation;
  overlayPosition: AppOverlayPosition;
}

export type AppSettingsPatch = Partial<AppSettings>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  launchMaximized: false,
  openOnStartup: false,
  closeToTray: true,
  autoWarmupLlm: true,
  audioInputDeviceId: "",
  audioOutputDeviceId: "",
  microphoneGain: 2,
  voiceDetectionSensitivity: 0.5,
  outputVolume: 1,
  agentName: "Desktop Agent",
  responseLanguage: "Portuguese (Brazil)",
  customSystemPrompt: "",
  themeId: "dark",
  accentMode: "theme",
  accentColor: "#7c0bcd",
  sttPlaybackMode: "standard",
  ttsPlaybackMode: "standard",
  overlayOpacity: 0.94,
  overlayAnimation: "fade",
  overlayPosition: "bottom-center",
};

export const isAppThemeId = (value: unknown): value is AppThemeId =>
  typeof value === "string" && APP_THEME_IDS.includes(value as AppThemeId);

export const isAppAccentMode = (value: unknown): value is AppAccentMode =>
  typeof value === "string" &&
  APP_ACCENT_MODES.includes(value as AppAccentMode);

export const isAppSttPlaybackMode = (
  value: unknown,
): value is AppSttPlaybackMode =>
  typeof value === "string" &&
  APP_STT_PLAYBACK_MODES.includes(value as AppSttPlaybackMode);

export const isAppTtsPlaybackMode = (
  value: unknown,
): value is AppTtsPlaybackMode =>
  typeof value === "string" &&
  APP_TTS_PLAYBACK_MODES.includes(value as AppTtsPlaybackMode);

export const isAppOverlayPosition = (
  value: unknown,
): value is AppOverlayPosition =>
  typeof value === "string" &&
  APP_OVERLAY_POSITIONS.includes(value as AppOverlayPosition);

export const isAppOverlayAnimation = (
  value: unknown,
): value is AppOverlayAnimation =>
  typeof value === "string" &&
  APP_OVERLAY_ANIMATIONS.includes(value as AppOverlayAnimation);
