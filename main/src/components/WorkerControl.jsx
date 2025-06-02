


 


 


 


 import { useEffect, useRef, useState } from "react";

export default function WorkerControl({ text, setText, toggleListeningSwitchOff }) {
  const workerSmol = useRef(null);
  const smolReadyRef = useRef(false);
  const [isSmolLoading, setIsSmolLoading] = useState(false);

  useEffect(() => {
    if (!workerSmol.current) {
      workerSmol.current = new Worker(new URL("../workers/smol-worker.js", import.meta.url), {
        type: "module",
      });
      smolReadyRef.current = false;
      workerSmol.current.onmessage = (event) => {
        const { status, log, output, error } = event.data;
        if (status === 'ready') {
          smolReadyRef.current = true;
        } else if (status === 'loading') {
          // Optionally handle loading
        } else if (status === 'error') {
          // Optionally handle error
        } else if (status === 'log') {
          // Optionally handle log
        } else if (output) {
          setText(output);
          setIsSmolLoading(false);
        } else if (error) {
          setIsSmolLoading(false);
        }
      };
      workerSmol.current.postMessage({ type: 'load' });
    }
    // Cleanup: terminate worker on unmount
    return () => {
      if (workerSmol.current) {
        workerSmol.current.terminate();
        workerSmol.current = null;
      }
    };
  }, [setText]);

  const handleSmol = () => {
    toggleListeningSwitchOff(true);
    if (workerSmol.current && smolReadyRef.current) {
      setIsSmolLoading(true);
      workerSmol.current.postMessage({ input: text });
    } else {
      // Optionally show not ready
    }
  };

  return (
    <button
      className="right-2 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
      onClick={handleSmol}
      disabled={isSmolLoading}
    >
      {isSmolLoading ? (
        <span className="animate-spin inline-block align-middle" style={{ opacity: 0.5 }}>
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        </span>
      ) : (
        <>🪶 Smol LLM</>
      )}
    </button>
  );
} 