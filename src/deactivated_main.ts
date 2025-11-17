import { app } from 'electron';
import 'dotenv/config';
import { createOverlayWindow, getOverlayWindow } from './windows/overlayWindow';
import { initAutoUpdate } from './update/autoUpdate';
import { registerWindowIpcHandlers } from './ipc/window';
import { registerStatsIpcHandlers } from './ipc/stats';
import { registerAuthIpcHandlers } from './ipc/auth';
import { registerShortcutIpcHandlers } from './ipc/shortcuts';
import { initChatBridge } from './logs/chatBridge';

console.log('[Nebula:boot] main.ts top reached');

process.on('uncaughtException', (err) => {
  console.error('[Nebula:uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Nebula:unhandledRejection]', reason);
});

async function bootstrap() {
  const win = await createOverlayWindow();

  // IPC-Handler
  registerWindowIpcHandlers();
  registerStatsIpcHandlers();
  registerAuthIpcHandlers();
  registerShortcutIpcHandlers();

  // Auto-Updater
  initAutoUpdate(win);

  // Chat-Bridge (MinecraftChatLogger → Renderer)
  initChatBridge(() => getOverlayWindow());
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!getOverlayWindow()) {
    bootstrap().catch((err) =>
      console.error('[Nebula] Failed to re-bootstrap on activate:', err),
    );
  }
});