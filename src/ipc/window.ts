import { BrowserWindow, ipcMain } from 'electron';
import { getOverlayWindow } from '../windows/overlayWindow';

type ResizeEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export function registerWindowIpcHandlers() {
  // Always-on-top toggle
  ipcMain.handle('window:setAlwaysOnTop', (_e, flag: boolean) => {
    const win = getOverlayWindow();
    if (!win) return false;
    try {
      win.setAlwaysOnTop(!!flag);
      return win.isAlwaysOnTop();
    } catch {
      return false;
    }
  });

  // Bounds (Auto-Resize vom Renderer)
  ipcMain.handle(
    'window:setBounds',
    (_e, bounds: { width?: number; height?: number; x?: number; y?: number }) => {
      const win = getOverlayWindow();
      if (!win) return false;
      try {
        const current = win.getBounds();
        win.setBounds(
          {
            x: bounds.x ?? current.x,
            y: bounds.y ?? current.y,
            width: bounds.width ?? current.width,
            height: bounds.height ?? current.height,
          },
          false,
        );
        return true;
      } catch {
        return false;
      }
    },
  );

  // Custom Frameless Resize
  ipcMain.handle(
    'window:resize',
    (_e, payload: { edge: ResizeEdge; dx: number; dy: number }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;

      const { x, y, width, height } = win.getBounds();
      const { edge, dx, dy } = payload;

      let nx = x,
        ny = y,
        nw = width,
        nh = height;

      switch (edge) {
        case 'right':
          nw = Math.max(320, width + dx);
          break;
        case 'bottom':
          nh = Math.max(220, height + dy);
          break;
        case 'left':
          nx = x + dx;
          nw = Math.max(320, width - dx);
          break;
        case 'top':
          ny = y + dy;
          nh = Math.max(220, height - dy);
          break;
        case 'top-left':
          nx = x + dx;
          ny = y + dy;
          nw = Math.max(320, width - dx);
          nh = Math.max(220, height - dy);
          break;
        case 'top-right':
          ny = y + dy;
          nw = Math.max(320, width + dx);
          nh = Math.max(220, height - dy);
          break;
        case 'bottom-left':
          nx = x + dx;
          nw = Math.max(320, width - dx);
          nh = Math.max(220, height + dy);
          break;
        case 'bottom-right':
          nw = Math.max(320, width + dx);
          nh = Math.max(220, height + dy);
          break;
      }

      win.setBounds({ x: nx, y: ny, width: nw, height: nh }, false);
    },
  );
}