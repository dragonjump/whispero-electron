import { app, BrowserWindow, ipcMain, clipboard, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { activeWindow, openWindows } from 'get-windows';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

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

// Configure key sender
// ks.setOption('globalDelayPressMillisec', 100);
// ks.setOption('globalDelayBetweenMillisec', 50);

// Configure nut.js for better performance
keyboard.config.autoDelayMs = 0;

// Add paste functionality
async function simulatePaste() {
  try {
    console.log('[Paste Debug] Starting paste simulation');
    
    // Use electron's clipboard module
    const text = clipboard.readText();
    console.log('[Paste Debug] Clipboard text length:', text ? text.length : 0);
    
    if (!text) {
      console.error('[Paste Debug] No text in clipboard');
      return false;
    }

    // Small delay to ensure window focus
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('[Paste Debug] After initial delay');

    try {
      // Use nut.js for native keyboard simulation
      console.log('[Paste Debug] Using native keyboard simulation');
      
      // First do Ctrl+A to select all
      console.log('[Paste Debug] Selecting all text (Ctrl+A)');
      await keyboard.pressKey(Key.LeftControl);
      await keyboard.type('a');
      await keyboard.releaseKey(Key.LeftControl);
      
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Then do Ctrl+V to paste
      console.log('[Paste Debug] Pasting text (Ctrl+V)');
      await keyboard.pressKey(Key.LeftControl);
      await keyboard.type('v');
      await keyboard.releaseKey(Key.LeftControl);
      
      console.log('[Paste Debug] Native paste completed successfully');
      return true;
    } catch (error) {
      console.error('[Paste Debug] Native paste failed:', error);
      
      // Fallback to Electron method if native method fails
      console.log('[Paste Debug] Falling back to Electron method');
      const win = BrowserWindow.getFocusedWindow();
      
      if (win && !win.isDestroyed()) {
        const modifiers = process.platform === 'darwin' ? ['cmd'] : ['control'];
        
        // Simulate Ctrl+A
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers });
        await new Promise(resolve => setTimeout(resolve, 50));
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers });
        
        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Simulate Ctrl+V
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers });
        await new Promise(resolve => setTimeout(resolve, 50));
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers });
        
        console.log('[Paste Debug] Fallback paste completed');
        return true;
      }
    }
    
    console.log('[Paste Debug] No valid paste method succeeded');
    return false;
  } catch (error) {
    console.error('[Paste Debug] Error in paste simulation:', error);
    return false;
  }
}

// Add auto-paste queue
const pasteQueue = [];
let isProcessingPaste = false;
const MAX_PASTE_RETRIES = 3;
const PASTE_RETRY_DELAY = 500;

// Add variable to track last pasted text
let lastPastedText = '';

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

async function processPasteQueue() {
  if (isProcessingPaste || pasteQueue.length === 0) return;
  
  isProcessingPaste = true;
  const { text, event, retryCount = 0 } = pasteQueue[0];

  try {
    console.log('[Queue Debug] Processing paste operation:', {
      textLength: text.length,
      retryCount,
      queueLength: pasteQueue.length,
      hasActiveWindow: !!lastActiveWindow?.id
    });

    // Check if we have a valid target window
    if (!lastActiveWindow?.id) {
      throw new Error('No active window detected');
    }

    // Set clipboard content first
    clipboard.writeText(text);
    console.log('[Queue Debug] Text copied to clipboard');

    // Longer delay to ensure window focus and clipboard update
    await new Promise(resolve => setTimeout(resolve, 150));

    // Attempt paste with timeout
    const pastePromise = simulatePaste();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Paste operation timed out')), 3000);
    });

    const success = await Promise.race([pastePromise, timeoutPromise]);
    
    if (success) {
      console.log('[Queue Debug] Paste operation successful');
      if (event && !event.sender.isDestroyed()) {
        event.reply('paste-status', {
          success: true,
          target: lastActiveWindow.title,
          timestamp: Date.now()
        });
      }
      // Add delay between successful pastes
      await new Promise(resolve => setTimeout(resolve, 200));
      pasteQueue.shift();
    } else {
      throw new Error('Paste simulation failed');
    }
  } catch (error) {
    console.error('[Queue Debug] Paste operation failed:', error);
    
    if (retryCount < MAX_PASTE_RETRIES) {
      console.log('[Queue Debug] Retrying paste operation');
      pasteQueue[0].retryCount = retryCount + 1;
      // Increase retry delay for native keyboard simulation
      setTimeout(processPasteQueue, PASTE_RETRY_DELAY * (retryCount + 1));
    } else {
      console.log('[Queue Debug] Max retries reached, abandoning paste operation');
      if (event && !event.sender.isDestroyed()) {
        event.reply('paste-status', {
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
      pasteQueue.shift();
    }
  } finally {
    isProcessingPaste = false;
    
    if (pasteQueue.length > 0) {
      console.log('[Queue Debug] Processing next item in queue');
      // Add delay between paste attempts
      setTimeout(processPasteQueue, 200);
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
    // console.log('GPU Information:', {
    //   vendor: gpuInfo.auxAttributes?.glVendor,
    //   renderer: gpuInfo.auxAttributes?.glRenderer,
    //   version: gpuInfo.auxAttributes?.glVersion,
    //   deviceId: gpuInfo.deviceId,
    //   driverVendor: gpuInfo.driverVendor,
    //   driverVersion: gpuInfo.driverVersion
    // });

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
      // console.log('Active Window:', {
      //   title: active?.title,
      //   id: active?.id,
      //   owner: active?.owner?.name,
      //   bounds: active?.bounds,
      //   url: active?.url
      // });
      
      // console.log('All Windows:', allWindows.map(win => ({
      //   title: win.title,
      //   id: win.id,
      //   owner: win.owner?.name
      // })));
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
      // console.log('Window info prepared:', windowInfo);
      // console.log('Window bounds:', active.bounds);
      if (active.contentBounds) {
        // console.log('Content bounds:', active.contentBounds);
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
  try {
    console.log('[Window Debug] Checking active window');
    const currentWindow = await activeWindow();
    
    if (!currentWindow) {
      console.log('[Window Debug] No active window found');
      return null;
    }
    
    // Ignore our own window
    if (mainWindow && currentWindow.id === mainWindow.id) {
      console.log('[Window Debug] Active window is our own window, ignoring');
      return null;
    }
    
    // Update last active window info
    const windowInfo = {
      title: currentWindow.title,
      id: currentWindow.id,
      timestamp: Date.now(),
      processId: currentWindow.processId,
      path: currentWindow.path
    };
    
    console.log('[Window Debug] Active window found:', windowInfo);
    
    
// Add test paste function with more logging
// setTimeout(async () => {
// // alert()
//   console.log('[Test] Starting test paste operation');
//   try {
//     // Set clipboard content
//     const testText = 'abc';
//     console.log('[Test] Setting clipboard text:', testText);
//     clipboard.writeText(testText);
    
//     // Get active window
//     const targetWindow = await enhancedWindowCheck();
//     console.log('[Test] Target window:', targetWindow ? {
//       title: targetWindow.title,
//       id: targetWindow.id,
//       processId: targetWindow.processId
//     } : 'None');
    
//     if (!targetWindow) {
//       console.log('[Test] No target window found');
//       return;
//     }

//     // Small delay to ensure window focus
//     console.log('[Test] Waiting for window focus...');
//     await new Promise(resolve => setTimeout(resolve, 500));

//     // Attempt paste operation
//     console.log('[Test] Attempting to paste to window:', targetWindow.title);
//     const success = await simulatePaste();
//     console.log('[Test] Paste result:', success ? 'Success' : 'Failed');
    
//   } catch (error) {
//     console.error('[Test] Error during test paste:', error);
//   }
// }, 5000);
    // Only update if window actually changed
    if (lastActiveWindow?.id !== windowInfo.id) {
      console.log('[Window Debug] Window changed, updating lastActiveWindow');
      lastActiveWindow = windowInfo;
      
      // Notify renderer about window change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('active-window-changed', windowInfo);
      }
    }
    
    return windowInfo;
  } catch (error) {
    console.error('[Window Debug] Error checking active window:', error);
    return null;
  }
}

function createWindow() {
  if (mainWindow) {
    return;
  }



  // Restore window position and size
  const windowState = store.get('windowState', {
    // width: 800,
    // height: 600,
    
    width: 510,
    height: 310,
    x: undefined,
    y: undefined
  });

  // Prepare browser window options
  const browserWindowOptions = {
    width: windowState.width,
    height: windowState.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    opacity: 0.895,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '../public/icons/whispero-logo.ico'),
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
  };

  // Center window only if position is not saved
  if (windowState.x === undefined || windowState.y === undefined) {
    browserWindowOptions.center = true;
  } else {
    browserWindowOptions.x = windowState.x;
    browserWindowOptions.y = windowState.y;
  }

  // Create the browser window with WebGPU enabled
  mainWindow = new BrowserWindow(browserWindowOptions);

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

  ipcMain.on('maximize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  // Add fullscreen toggle handler
  ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
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
  ipcMain.on('text-recognized', async (event, text) => {
    console.log('[Paste Operation] Text recognized, checking if changed');
    try {
      // Ensure text is a string
      const textToWrite = Array.isArray(text) ? text.join(' ') : text;
      
      // Check if text has changed
      if (textToWrite === lastPastedText) {
        console.log('[Paste Operation] Text unchanged, skipping paste');
        event.reply('paste-status', {
          success: true,
          skipped: true,
          reason: 'Text unchanged',
          timestamp: Date.now()
        });
        return;
      }
      
      // Set clipboard content
      clipboard.writeText(textToWrite);
      console.log('[Paste Operation] Text copied to clipboard:>' ,textToWrite);
      
      // Get active window
      const targetWindow = await enhancedWindowCheck();
      console.log('[Paste Operation] Target window:', targetWindow ? {
        title: targetWindow.title,
        id: targetWindow.id,
        processId: targetWindow.processId
      } : 'None');
      
      if (!targetWindow) {
        console.log('[Paste Operation] No target window found');
        event.reply('paste-status', {
          success: false,
          error: 'No target window found',
          timestamp: Date.now()
        });
        return;
      }

      // Small delay to ensure window focus
      console.log('[Paste Operation] Waiting for window focus...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Attempt paste operation
      console.log('[Paste Operation] Attempting to paste to window:', targetWindow.title);
      const success = await simulatePaste();
      console.log('[Paste Operation] Paste result:', success ? 'Success' : 'Failed');
      
      // Update last pasted text only if paste was successful
      if (success) {
        lastPastedText = textToWrite;
      }
      
      event.reply('paste-status', {
        success: success,
        target: targetWindow.title,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[Paste Operation] Error:', error);
      event.reply('paste-status', {
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
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
    
    try {
      clipboard.writeText(text);
      
      const isAutoPasteEnabled = store.get('autoPasteEnabled', false);
      if (isAutoPasteEnabled && lastActiveWindow?.id) {
        // Queue paste operation
        pasteQueue.push({ text, event });
        processPasteQueue();
      }
    } catch (error) {
      console.error('Error in clipboard handler:', error);
      event.reply('paste-status', {
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
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

  // Add paste handler
  ipcMain.on('auto-paste', (event, text) => {
    if (DEBUG_WINDOW_TRACKING) console.log('Received auto-paste request');
    
    // Add to queue
    pasteQueue.push({ text, event });
    processPasteQueue();
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


function resetClipboardState() {
  console.log('[Reset] Resetting clipboard state');
  isProcessingClipboard = false;
  isProcessingPaste = false;
  
  // Clear queues
  while (clipboardQueue.length > 0) clipboardQueue.shift();
  while (pasteQueue.length > 0) pasteQueue.shift();
  
  console.log('[Reset] Clipboard state reset complete');
}

// Add reset handler
ipcMain.on('reset-clipboard-state', (event) => {
  resetClipboardState();
  event.reply('clipboard-reset-complete');
});

// Add periodic check to prevent stuck state
setInterval(() => {
  const now = Date.now();
  if (isProcessingClipboard || isProcessingPaste) {
    console.log('[Monitor] Checking for stuck clipboard state');
    if (now - lastProcessingTime > 5000) { // 5 second timeout
      console.log('[Monitor] Detected stuck clipboard state, resetting');
      resetClipboardState();
    }
  }
}, 5000);

// Track last processing time
let lastProcessingTime = Date.now();

// Update processing time in queue handlers
const originalProcessClipboardQueue = processClipboardQueue;
processClipboardQueue = async function() {
  lastProcessingTime = Date.now();
  return originalProcessClipboardQueue.apply(this, arguments);
};

const originalProcessPasteQueue = processPasteQueue;
processPasteQueue = async function() {
  lastProcessingTime = Date.now();
  return originalProcessPasteQueue.apply(this, arguments);
};