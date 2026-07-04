<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  Download,
  Home,
  RefreshCcw,
  Settings,
} from "@lucide/vue";
import BaseMenuDropdown from "../../Base/BaseMenuDropdown.vue";
import BaseMenuDropdownItem from "../../Base/BaseMenuDropdownItem.vue";
import BaseMenuDropdownSection from "../../Base/BaseMenuDropdownSection.vue";
import BaseMenuDropdownSubMenu from "../../Base/BaseMenuDropdownSubMenu.vue";
import BaseMenuDropdownTrigger from "../../Base/BaseMenuDropdownTrigger.vue";

const openSettings = () => {
  window.dispatchEvent(new Event("open-app-settings-modal"));
};

const openDownloads = () => {
  window.dispatchEvent(
    new CustomEvent("open-download-model-modal", {
      detail: { modelType: "llm" },
    })
  );
};

const reloadApp = () => {
  window.location.reload();
};
</script>

<template>
  <div id="main">
    <BaseMenuDropdown align="left">
      <template #trigger="{ isOpen }">
        <BaseMenuDropdownTrigger
          class="menu-button"
          variant="ghost"
          :icon-left="Home"
          :icon-right="isOpen ? ChevronUp : ChevronDown"
        />
      </template>

      <BaseMenuDropdownSection>
        <BaseMenuDropdownItem
          :icon-left="Home"
          label="Home"
          shortcut="ALT + H"
        />
      </BaseMenuDropdownSection>

      <BaseMenuDropdownSection>
        <BaseMenuDropdownItem
          :icon-left="Settings"
          label="Open"
        >
          <BaseMenuDropdownSubMenu>
            <BaseMenuDropdownSection>
              <BaseMenuDropdownItem
                :icon-left="Settings"
                label="Settings"
                shortcut="CTRL + ,"
                @click="openSettings"
              />
              <BaseMenuDropdownItem
                :icon-left="Download"
                label="Downloads"
                shortcut="CTRL + D"
                @click="openDownloads"
              />
            </BaseMenuDropdownSection>
          </BaseMenuDropdownSubMenu>
        </BaseMenuDropdownItem>
      </BaseMenuDropdownSection>

      <BaseMenuDropdownSection>
        <BaseMenuDropdownItem
          :icon-left="RefreshCcw"
          label="Reload App"
          shortcut="SHIFT + R"
          @click="reloadApp"
        />
      </BaseMenuDropdownSection>
    </BaseMenuDropdown>
  </div>
</template>

<style lang="scss" scoped>
#main {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: flex-start;
}

.menu-button {
  width: auto;
  min-width: 42px;
  height: 100%;
  min-height: 100%;

  -webkit-app-region: no-drag;

  border-radius: 0;
}
</style>
