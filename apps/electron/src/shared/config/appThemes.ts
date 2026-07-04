import type { AppThemeId } from "../types/app-settings";

export interface AppThemeDefinition {
  id: AppThemeId;
  label: string;
  supportsCustomAccent: boolean;
  bgColor: string;
  surfaceColor: string;
  componentColor: string;
  borderColor: string;
  accentColor: string;
  mutedColor: string;
}

export const APP_THEMES: AppThemeDefinition[] = [
  {
    id: "dark",
    label: "Dark",
    supportsCustomAccent: true,
    bgColor: "#171717",
    surfaceColor: "#1e1e1e",
    componentColor: "#262628",
    borderColor: "#292929",
    accentColor: "#7c0bcd",
    mutedColor: "#68686d",
  },
];
