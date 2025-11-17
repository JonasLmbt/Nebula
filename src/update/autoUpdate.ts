import { BrowserWindow, app } from 'electron';
import { autoUpdater } from 'electron-updater';

export function initAutoUpdate(win: BrowserWindow | null) {
  if (!app.isPackaged) return;

  try {
    autoUpdater.logger = console as any;
    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
      win?.webContents.send('update:status', 'checking');
    });

    autoUpdater.on('update-available', (info) => {
      win?.webContents.send('update:available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      win?.webContents.send('update:none', info);
    });

    autoUpdater.on('error', (err) => {
      win?.webContents.send('update:error', err ? err.message || String(err) : 'unknown');
    });

    autoUpdater.on('download-progress', (prog) => {
      win?.webContents.send('update:progress', prog);
    });

    autoUpdater.on('update-downloaded', (info) => {
      win?.webContents.send('update:ready', info);
    });

    autoUpdater.checkForUpdates().catch((e) =>
      console.warn('AutoUpdate check failed:', e),
    );
  } catch (e) {
    console.warn('AutoUpdate init failed:', e);
  }
}