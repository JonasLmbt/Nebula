import { ipcMain } from 'electron';
import { apiRouter, getHypixelFallback } from '../services/hypixel';

const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';

export function registerStatsIpcHandlers() {
  ipcMain.handle('api:getStatus', async () => {
    return apiRouter.getStatus();
  });

  ipcMain.handle('api:setUserKey', async (_e, apiKey: string) => {
    const result = await apiRouter.verifyUserApiKey(apiKey);
    if (result.valid) {
      apiRouter.updateConfig({ userApiKey: apiKey });
      return { success: true };
    }
    return { success: false, error: result.error || 'Invalid API key' };
  });

  ipcMain.handle('api:clearCache', async () => {
    apiRouter.clearCache();
    getHypixelFallback().clearCache();
    return { success: true };
  });

  ipcMain.handle('api:toggleFallback', async (_e, enabled: boolean) => {
    apiRouter.updateConfig({ useFallbackKey: enabled });
    return { success: true, enabled };
  });

  ipcMain.handle('bedwars:stats', async (_e, name: string) => {
    try {
      return await apiRouter.getStats(name);
    } catch (error) {
      console.log('[API] Enhanced system failed, using original:', error);
      if (!HYPIXEL_KEY) {
        return { error: 'HYPIXEL_KEY missing in environment. Please check .env.' };
      }
      return getHypixelFallback().getStats(name);
    }
  });
}
