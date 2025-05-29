import copy from 'clipboard-copy';
import { ipcRenderer } from 'electron';

export async function downloadFile(text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  a.download = `whispero-transcript-${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);

}
/**
 * Copies text to clipboard, supporting both Electron and browser environments.
 * @param {string} textToCopy - The text to copy.
 * @param {object} [options] - Optional. { setPasteStatus, setLastCopyTime, lastCopyTime, COPY_COOLDOWN }
 * @returns {Promise<boolean>} - Resolves to true if copy succeeded, false otherwise.
 */
export default async function copyToClipboard(textToCopy, options = {}) {
  if (!textToCopy) return false;

  const {
    setPasteStatus,
    setLastCopyTime,
    lastCopyTime = 0,
    COPY_COOLDOWN = 350,
  } = options;

  const now = Date.now();
  if (lastCopyTime && now - lastCopyTime < COPY_COOLDOWN) {
    console.log('Copy cooldown in effect');
    return false;
  }

  try {
    if (window.electron) {
      // Use Electron IPC for desktop app
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          ipcRenderer.removeListener('clipboard-operation-status', handleStatus);
          resolve(false);
          setPasteStatus && setPasteStatus({
            success: false,
            error: 'Clipboard operation timed out',
            timestamp: Date.now()
          });
        }, 2000);

        const handleStatus = (_, status) => {
          clearTimeout(timeoutId);
          ipcRenderer.removeListener('clipboard-operation-status', handleStatus);

          if (status.success) {
            setLastCopyTime && setLastCopyTime(now);
            setPasteStatus && setPasteStatus({
              success: true,
              timestamp: Date.now()
            });
          } else {
            setPasteStatus && setPasteStatus({
              success: false,
              error: status.error || 'Failed to copy text',
              timestamp: Date.now()
            });
          }
          resolve(status.success);
        };

        ipcRenderer.on('clipboard-operation-status', handleStatus);
        ipcRenderer.send('copy-to-clipboard', textToCopy);
      });
    } else {
      // Use clipboard-copy for browser environments
      await copy(textToCopy);
      setLastCopyTime && setLastCopyTime(now);
      setPasteStatus && setPasteStatus({
        success: true,
        timestamp: Date.now()
      });
      return true;
    }
  } catch (err) {
    console.error('Failed to copy text:', err);
    setPasteStatus && setPasteStatus({
      success: false,
      error: err.message || 'Failed to copy text',
      timestamp: Date.now()
    });
    return false;
  }
} 