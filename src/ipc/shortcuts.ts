import { globalShortcut } from 'electron';
import { ipcMain } from 'electron';
import { getOverlayWindow } from '../windows/overlayWindow';

type ShortcutMap = {
  refreshAll?: string;
  clearAll?: string;
  toggleClickThrough?: string;
};

let clickThrough = false;

function registerShortcuts(map: ShortcutMap) {
  globalShortcut.unregisterAll();

  const safeRegister = (accelerator: string | undefined, handler: () => void) => {
    if (!accelerator) return;
    try {
      globalShortcut.register(accelerator, handler);
    } catch (err) {
      console.warn('[Shortcuts] Failed to register', accelerator, err);
    }
  };

  const winGetter = () => getOverlayWindow();

  safeRegister(map.refreshAll, () => {
    const win = winGetter();
    win?.webContents.send('shortcut:refresh');
  });

  safeRegister(map.clearAll, () => {
    const win = winGetter();
    win?.webContents.send('shortcut:clear');
  });

  safeRegister(map.toggleClickThrough, () => {
    const win = winGetter();
    if (!win) return;
    clickThrough = !clickThrough;
    try {
      win.setIgnoreMouseEvents(clickThrough, { forward: true });
    } catch {}
  });
}

export function registerShortcutIpcHandlers() {
  ipcMain.handle('shortcuts:register', (_e, map: ShortcutMap) => {
    registerShortcuts(map || {});
  });
}