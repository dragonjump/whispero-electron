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

// Basic GPU settings - minimal required configuration
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-dawn-features', 'allow_unsafe_apis');
app.commandLine.appendSwitch('enable-features', 'WebGPU');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');

// Set memory limits for WebGPU
app.commandLine.appendSwitch('gpu-memory-buffer-pool-size', '1024');
app.commandLine.appendSwitch('shared-memory-size', '1024');

// Enhanced diagnostics
async function checkGPUCapabilities() {
  try {
    // First check if GPU process is running
    const gpuProcess = app.getGPUFeatureStatus();
    if (gpuProcess.gpu_compositing === 'disabled') {
      throw new Error('GPU compositing is disabled. This may indicate driver issues.');
    }

    const gpuInfo = await app.getGPUInfo('complete');
    console.log('GPU Information:', {
      vendor: gpuInfo.auxAttributes?.glVendor,
      renderer: gpuInfo.auxAttributes?.glRenderer,
      version: gpuInfo.auxAttributes?.glVersion,
      deviceId: gpuInfo.deviceId,
      driverVendor: gpuInfo.driverVendor,
      driverVersion: gpuInfo.driverVersion
    });

    // Check if hardware acceleration is working
    const features = await app.getGPUFeatureStatus();
    const isHardwareAccelerated = !features.gpu_compositing?.includes('disabled') && 
                                 !features.gpu_compositing?.includes('blocked');

    if (!isHardwareAccelerated) {
      throw new Error('Hardware acceleration is not available. Please update your graphics drivers.');
    }

    // Verify WebGPU availability
    const webgpuSupported = features.webgpu?.includes('enabled') || 
                           features.webgpu?.includes('enabled_on_supported_gpu');

    if (!webgpuSupported) {
      throw new Error('WebGPU is not supported. Please ensure you have compatible graphics hardware and up-to-date drivers.');
    }

    return {
      gpuInfo,
      features,
      isHardwareAccelerated,
      webgpuSupported,
      diagnostics: {
        gpuVendor: gpuInfo.auxAttributes?.glVendor,
        gpuRenderer: gpuInfo.auxAttributes?.glRenderer,
        driverVersion: gpuInfo.driverVersion
      }
    };
  } catch (error) {
    console.error('GPU Initialization Error:', error);
    
    // Get more detailed error information
    const gpuInfo = await app.getGPUInfo('basic');
    const errorDetails = {
      message: error.message,
      gpuVendor: gpuInfo.auxAttributes?.glVendor,
      driverVersion: gpuInfo.driverVersion,
      featureStatus: app.getGPUFeatureStatus()
    };
    
    return { 
      webgpuSupported: false, 
      error: errorDetails,
      recoverySteps: [
        'Update your graphics drivers to the latest version',
        'Ensure hardware acceleration is enabled in your system settings',
        'Try running the application with different graphics backends (--use-angle=d3d11)',
        'Check Windows Event Viewer for additional GPU-related errors'
      ]
    };
  }
}

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

  // Create the browser window with WebGPU enabled
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
      experimentalFeatures: true,
      enableWebGPU: true,
      sharedArrayBuffers: true,
      v8CacheOptions: 'none',
      backgroundThrottling: false
    }
  });

  // Load the app immediately
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    
    // Open DevTools in development
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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

  // Save window state on close
  mainWindow.on('close', () => {
    if (!mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      store.set('windowState', bounds);
    }
  });

  // Listen for text recognition events
  ipcMain.on('text-recognized', (event, text) => {
    console.log('Recognized Text:', text);
    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.webContents.send('text-log', text);
    }
  });

  // Listen for WebGPU errors
  ipcMain.on('webgpu-error', (event, error) => {
    console.error('WebGPU Error:', error);
    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.webContents.send('error-log', { type: 'webgpu', error });
    }
  });

  // Listen for audio errors
  ipcMain.on('audio-error', (event, error) => {
    console.error('Audio Error:', error);
    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.webContents.send('error-log', { type: 'audio', error });
    }
  });
}

// Start the app when ready
app.whenReady().then(createWindow);

// Quit when all windows are closed
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