import { app, BrowserWindow, ipcMain, clipboard, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { activeWindow, openWindows } from 'get-windows';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize electron store
const store = new Store();

let mainWindow = null;
let devToolsWindow = null;
let lastActiveWindow = {
  title: null,
  id: null,
  timestamp: null,
  processId: null,
  path: null
};

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

// Add debug mode
const DEBUG_MODE = process.env.NODE_ENV === 'development';

// Add debug logging constant at the top
const DEBUG_WINDOW_TRACKING = true;

// Add clipboard operation queue and handlers
const clipboardQueue = [];
let isProcessingClipboard = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 100; // ms

async function processClipboardQueue() {
  if (isProcessingClipboard || clipboardQueue.length === 0) return;
  
  isProcessingClipboard = true;
  const { text, event, retryCount = 0 } = clipboardQueue[0];

  try {
    if (DEBUG_WINDOW_TRACKING) console.log('Processing clipboard operation:', { text: text.slice(0, 50) + '...', retryCount });
    
    clipboard.writeText(text);
    
    // Notify success
    if (event && !event.sender.isDestroyed()) {
      event.reply('clipboard-operation-status', { success: true });
    }
    
    // Remove successful operation
    clipboardQueue.shift();
    
    if (DEBUG_WINDOW_TRACKING) console.log('Clipboard operation successful');
  } catch (error) {
    console.error('Clipboard operation failed:', error);
    
    if (retryCount < MAX_RETRIES) {
      // Retry with backoff
      clipboardQueue[0].retryCount = retryCount + 1;
      setTimeout(processClipboardQueue, RETRY_DELAY * Math.pow(2, retryCount));
    } else {
      // Max retries reached, notify failure and remove
      if (event && !event.sender.isDestroyed()) {
        event.reply('clipboard-operation-status', { 
          success: false, 
          error: error.message 
        });
      }
      clipboardQueue.shift();
    }
  } finally {
    isProcessingClipboard = false;
    
    // Process next item if queue not empty
    if (clipboardQueue.length > 0) {
      setTimeout(processClipboardQueue, 50);
    }
  }
}

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

// Enhanced window tracking with get-windows
async function enhancedWindowCheck() {
  try {
    if (DEBUG_WINDOW_TRACKING) console.log('\n--- Enhanced Window Check ---');
    
    const active = await activeWindow();
    const allWindows = await openWindows();
    
    if (DEBUG_WINDOW_TRACKING) {
      console.log('Active Window:', {
        title: active?.title,
        id: active?.id,
        owner: active?.owner?.name,
        bounds: active?.bounds,
        url: active?.url
      });
      
      console.log('All Windows:', allWindows.map(win => ({
        title: win.title,
        id: win.id,
        owner: win.owner?.name
      })));
    }

    if (!active) {
      if (DEBUG_WINDOW_TRACKING) console.log('No active window detected');
      return null;
    }

    // Skip our own window
    if (active.owner?.name?.includes('electron')) {
      if (DEBUG_WINDOW_TRACKING) console.log('Skipping Electron window');
      return null;
    }

    const windowInfo = {
      title: active.title,
      id: active.id,
      processId: active.owner?.processId,
      path: active.owner?.path,
      bounds: active.bounds,
      url: active.url,
      timestamp: Date.now()
    };

    if (DEBUG_WINDOW_TRACKING) {
      console.log('Window info prepared:', windowInfo);
      console.log('Window bounds:', active.bounds);
      if (active.contentBounds) {
        console.log('Content bounds:', active.contentBounds);
      }
    }

    // Check if window changed
    const changed = !lastActiveWindow || 
                   lastActiveWindow.id !== windowInfo.id || 
                   lastActiveWindow.title !== windowInfo.title;

    if (changed) {
      if (DEBUG_WINDOW_TRACKING) console.log('Window changed, updating...');
      lastActiveWindow = windowInfo;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('active-window-changed', windowInfo);
      }
    }

    return windowInfo;
  } catch (error) {
    console.error('Error in enhanced window check:', error);
    return null;
  } finally {
    if (DEBUG_WINDOW_TRACKING) console.log('--- Enhanced Window Check Complete ---\n');
  }
}

// Replace existing checkActiveWindow with enhanced version
async function checkActiveWindow() {
  const windowInfo = await enhancedWindowCheck();
  
  if (!windowInfo) {
    // Reset tracking if no valid window found
    if (lastActiveWindow?.id) {
      lastActiveWindow = {
        title: null,
        id: null,
        timestamp: null,
        processId: null,
        path: null
      };
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('active-window-changed', null);
      }
    }
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
    opacity: 0.88,
    backgroundColor: '#00000000',
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
    clearInterval(windowCheckInterval);
  });

  // Listen for text recognition events
  ipcMain.on('text-recognized', (event, text) => {
    console.log('Recognized Text:', text);
    if (devToolsWindow && !devToolsWindow.isDestroyed()) {
      devToolsWindow.webContents.send('text-log', text);
    }
  });

  // Add window focus/blur event handlers with enhanced logging
  mainWindow.on('blur', async () => {
    if (DEBUG_WINDOW_TRACKING) console.log('Main window lost focus');
    await checkActiveWindow();
  });

  mainWindow.on('focus', async () => {
    if (DEBUG_WINDOW_TRACKING) console.log('Main window gained focus');
    await checkActiveWindow();
  });

  // Check active window frequently with enhanced detection
  const windowCheckInterval = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await checkActiveWindow();
    } else {
      if (DEBUG_WINDOW_TRACKING) console.log('Clearing window check interval - main window destroyed');
      clearInterval(windowCheckInterval);
    }
  }, 500);

  // Add IPC handler with enhanced logging
  ipcMain.on('get-active-window', async (event) => {
    if (DEBUG_WINDOW_TRACKING) console.log('Received get-active-window request');
    await checkActiveWindow();
    event.reply('active-window-info', lastActiveWindow);
  });

  ipcMain.on('auto-paste-toggle', (event, enabled) => {
    store.set('autoPasteEnabled', enabled);
    console.log('Auto-paste feature:', enabled ? 'enabled' : 'disabled');
  });

  // Add clipboard handling
  ipcMain.on('copy-to-clipboard', (event, text) => {
    if (DEBUG_WINDOW_TRACKING) console.log('Received clipboard request');
    
    // Add to queue
    clipboardQueue.push({ text, event });
    processClipboardQueue();
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