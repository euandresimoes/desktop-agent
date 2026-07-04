import type { InjectionKey } from "vue";

export interface BaseMenuDropdownContextValue {
  closeAll: () => void;
}

export const baseMenuDropdownContextKey: InjectionKey<BaseMenuDropdownContextValue> =
  Symbol("base-menu-dropdown-context");
