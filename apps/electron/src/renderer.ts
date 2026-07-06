import { createApp } from "vue";
import App from "./App.vue";
import OverlayView from "./views/overlay/OverlayView.vue";

import "./assets/styles/main.scss";

const RootComponent = window.location.hash === "#overlay" ? OverlayView : App;

if (window.location.hash === "#overlay") {
  document.documentElement.classList.add("overlay-window");
  document.body.classList.add("overlay-window");
}

createApp(RootComponent).mount("#app");
