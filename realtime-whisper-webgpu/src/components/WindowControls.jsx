import { ipcRenderer } from 'electron';

export function WindowControls() {
  return (
    <div className="fixed left-0 right-0 flex gap-1 p-2 z-50 -app-region-no-drag">
      <button
        onClick={() => ipcRenderer.send('minimize-window')}
        className="w-6 h-6 rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center text-black"
        title="Minimize"
      >
        <span className="text-xs"> </span>
      </button>
      <button
        onClick={() => ipcRenderer.send('close-window')}
        className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white"
        title="Close"
      >
        <span className="text-xs"> </span>
      </button>
    </div>
  );
} 