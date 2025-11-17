import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let overlayWindow: BrowserWindow | null = null;

function resolveAsset(file: string): string {
  return path.resolve(__dirname, '.', 'assets', file);
}

function resolveIcon(): string | undefined {
  const iconCandidates =
    process.platform === 'win32'
      ? ['nebula-logo.ico', 'nebula-logo.png', 'nebula-lettering.svg']
      : ['nebula-logo.png', 'nebula-lettering.svg', 'nebula-logo.ico'];

  for (const f of iconCandidates) {
    const p = resolveAsset(f);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
  app.setName('Nebula');
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId('Nebula');
    }
  } catch {}

  const iconPath = resolveIcon();

  overlayWindow = new BrowserWindow({
    width: 860,
    height: 560,
    transparent: true,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    alwaysOnTop: true,
    title: 'Nebula',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setTitle('Nebula');

  await overlayWindow.webContents.session.clearCache();
  await overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}