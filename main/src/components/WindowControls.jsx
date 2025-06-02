import { ipcRenderer } from 'electron';

export function WindowControls({ buttonSize = 'md', onMaximizeClick }) {
  // Size classes
  const sizeClass = buttonSize === 'sm' ? 'w-3 h-3' : 'w-5 h-5';
  const iconSize = buttonSize === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex gap-1 -app-region-no-drag">
      <button
        onClick={() => ipcRenderer.send('close-window')}
        className={`${sizeClass} rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white`}
        title="Close"
      > 
        <span className={iconSize}> </span>
      </button>
      <button
        onClick={() => ipcRenderer.send('minimize-window')}
        className={`${sizeClass} rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center text-black`}
        title="Minimize"
      >
        <span className={iconSize}> </span>
      </button>
      <button
        onClick={() => ipcRenderer.send('maximize-window')}
        className={`${sizeClass} rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white`}
        title="Maximize"
      >
        <span className={iconSize}> </span>
      </button>

    </div>
  );
} 