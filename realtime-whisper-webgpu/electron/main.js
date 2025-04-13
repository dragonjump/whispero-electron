import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize electron store
const store = new Store();

let mainWindow = null;
let devToolsWindow = null;

// Set up custom GPU cache path in the app's user data directory
const userDataPath = app.getPath('userData');
const gpuCachePath = path.join(userDataPath, 'GPUCache');

// Configure GPU settings before app is ready
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer,WebGPU');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Don't disable hardware acceleration as it's needed for WebGPU
// app.disableHardwareAcceleration();

function createWindow() {
  if (mainWindow) {
    return;
  }

  // Restore window position and size
  const windowState = store.get('windowState', {
    width: 800,
    height: 600,
    x: undefined,
    y: undefined
  });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      webgl: true,
      experimentalFeatures: true,
    },
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent flash of empty content
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save window state on close
  mainWindow.on('close', () => {
    if (!mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      store.set('windowState', bounds);
    }
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    
    // Create DevTools window only in development
    devToolsWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      show: false,
    });

    mainWindow.webContents.setDevToolsWebContents(devToolsWindow.webContents);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    devToolsWindow.show();

    // Close DevTools window when main window is closed
    mainWindow.on('closed', () => {
      if (devToolsWindow && !devToolsWindow.isDestroyed()) {
        devToolsWindow.close();
      }
      devToolsWindow = null;
      mainWindow = null;
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window control handlers
  ipcMain.on('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  // Listen for text recognition events
  ipcMain.on('text-recognized', (event, text) => {
    console.log('Recognized Text:', text);
    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.webContents.send('text-log', text);
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});