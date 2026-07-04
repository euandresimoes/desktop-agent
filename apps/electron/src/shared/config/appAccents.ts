export interface AppAccentDefinition {
  id: string;
  label: string;
  hex: string;
}

export const APP_ACCENT_PRESETS: AppAccentDefinition[] = [
  { id: "white", label: "White", hex: "#f5f5f5" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "amber", label: "Amber", hex: "#f59e0b" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "cyan", label: "Cyan", hex: "#06b6d4" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
];
