import { ipcMain, shell } from 'electron';
import fetch from 'node-fetch';

const DISCORD_LOGIN_URL =
  'https://nebula-overlay.online/api/auth/discord/login';

export function registerAuthIpcHandlers() {
  ipcMain.handle('auth:discord:login', async () => {
    await shell.openExternal(DISCORD_LOGIN_URL);
    return { success: true };
  });

  ipcMain.handle('auth:discord:getUser', async () => {
    try {
      const res = await fetch('https://nebula-overlay.online/api/auth/me', {
        credentials: 'include' as any,
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[Electron] getUser failed:', err);
      return { error: String(err) };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      const res = await fetch('https://nebula-overlay.online/api/auth/logout', {
        method: 'POST',
        credentials: 'include' as any,
      });
      return res.json();
    } catch (err) {
      console.error('[Electron] logout failed:', err);
      return { error: String(err) };
    }
  });

  ipcMain.handle('external:open', async (_e, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[External] Failed to open URL:', error);
      return { error: String(error) };
    }
  });
}
