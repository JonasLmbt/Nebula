// renderer/ui/bindings.js

import { initOverlayPanel } from "./overlayPanel.js";
import { initNicksPanel } from "./nicksPanel.js";
import { initSessionPanel } from "./sessionPanel.js";
import { initColumnsPanel } from "./columnsPanel.js";
import { initSourcesPanel } from "./sourcesPanel.js";
import { initKeyboardPanel } from "./keyboardPanel.js";
import { initAppearancePanel } from "./appearancePanel.js";
import { initClientPanel } from "./clientPanel.js";
import { initProfilePanel } from "./ui/profilePanel.js";

/**
 * Call this from renderer/index.js after DOMContentLoaded.
 */
export function bindGlobalUI() {
  initOverlayPanel();
  initNicksPanel();
  initSessionPanel();
  initColumnsPanel();
  initSourcesPanel();
  initKeyboardPanel();
  initAppearancePanel();
  initClientPanel();
  initProfilePanel();
}
