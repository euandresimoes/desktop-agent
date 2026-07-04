import { ref } from "vue";

// Toast types and interface
export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

// Global reactive list of active toasts
const toasts = ref<Toast[]>([]);
let nextId = 0;

function push(type: ToastType, message: string, duration = 4500) {
  const id = ++nextId;
  toasts.value.push({ id, type, message, duration });
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
}

function dismiss(id: number) {
  const idx = toasts.value.findIndex((t) => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

// Composable — import and use anywhere in the Vue tree
export function useToast() {
  return {
    toasts,
    success: (message: string, duration?: number) => push("success", message, duration),
    error: (message: string, duration?: number) => push("error", message, duration),
    warning: (message: string, duration?: number) => push("warning", message, duration),
    info: (message: string, duration?: number) => push("info", message, duration),
    dismiss,
  };
}
