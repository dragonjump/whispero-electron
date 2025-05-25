import { useEffect, useState, useRef, useCallback } from "react";
import { ipcRenderer } from 'electron';
import copy from 'clipboard-copy';

import { AudioVisualizer } from "./components/AudioVisualizer";
import Progress from "./components/Progress";
import { LanguageSelector } from "./components/LanguageSelector";
import { WindowControls } from "./components/WindowControls";

// Import icons
import { FaMicrophone, FaMicrophoneSlash, FaPlay, FaStop, FaChartBar, FaPaste, FaBug } from 'react-icons/fa';


const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

// Add DebugPanel component
function DebugPanel({ targetWindow, isAutoPasteEnabled, pasteStatus, toggleAutoPaste }) {
  const [showDebug, setShowDebug] = useState(false);

  const refreshWindowInfo = () => {
    if (window.electron) {
      ipcRenderer.send('get-active-window');
    }
  };

  useEffect(() => {
    if (!window.electron || !showDebug) return;

    // Initial check
    refreshWindowInfo();

    // Set up periodic refresh
    const interval = setInterval(refreshWindowInfo, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [showDebug]);

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        className="fixed bottom-2 left-2 bg-gray-800/50 p-2 rounded-full hover:bg-gray-700/50"
        title="Show Debug Panel"
      >
        <FaBug className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-2 right-2 bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg text-xs max-w-md">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Debug Info</h3>
        <div className="flex gap-2">
          <button
            onClick={refreshWindowInfo}
            className="text-gray-400 hover:text-white"
            title="Refresh window info"
          >
            ↻
          </button>
          <button
            onClick={() => setShowDebug(false)}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <strong>Auto-Paste:</strong>
          <button
            onClick={toggleAutoPaste}
            className={`px-2 py-1 rounded ${isAutoPasteEnabled ? 'bg-green-500/50' : 'bg-red-500/50'
              }`}
          >
            {isAutoPasteEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* {pasteStatus && (
          <div className="hidden">
            <strong>Last Paste:</strong>
            <div className={`mt-1 ${
              pasteStatus.success ? 'text-green-400' : 'text-red-400'
            }`}>
              {pasteStatus.success ? (
                <>✓ Pasted to: {pasteStatus.target}</>
              ) : (
                <>✗ Error: {pasteStatus.error}</>
              )}
              <div className="text-gray-400 text-xs">
                {new Date(pasteStatus.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )} */}

        <div>
          <strong>Target Window:</strong>
          {targetWindow ? (
            <pre className="mt-1 bg-black/30 p-2 rounded">
              {JSON.stringify({
                title: targetWindow.title,
                id: targetWindow.id,
                processId: targetWindow.processId,
                lastUpdate: new Date(targetWindow.timestamp).toLocaleTimeString()
              }, null, 2)}
            </pre>
          ) : (
            <div className="mt-1 text-yellow-500">
              No target window selected. Try switching to another window.
            </div>
          )}
        </div>

        <div className="text-gray-400 text-xs mt-2">
          Switch to another window to update target window info
        </div>
      </div>
    </div>
  );
}

function App() {
  // Create a reference to the worker object.
  const worker = useRef(null);
  const workerSmol = useRef(null);
  const recorderRef = useRef(null);
  const smolReadyRef = useRef(false);

  // Model loading and progress
  const [status, setStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progressItems, setProgressItems] = useState([]);
  const [error, setError] = useState(null);

  // Inputs and outputs
  const [text, setText] = useState("");
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState("en");
  const [lastCopyTime, setLastCopyTime] = useState(0);
  const COPY_COOLDOWN = 350; // 300ms cooldown

  // Processing
  const [recording, setRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const [isListening, setIsListening] = useState(true);
  const audioContextRef = useRef(null);
  const [showVisualizer, setShowVisualizer] = useState(false);

  // Auto-paste
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(true);
  const [targetWindow, setTargetWindow] = useState(null);
  const [pasteStatus, setPasteStatus] = useState(null);

  const transcribedRef = useRef(null);
  const textRef = useRef(text);

  // Auto-scroll transcribed text area to bottom on text update
  useEffect(() => {
    if (transcribedRef.current) {
      transcribedRef.current.scrollTop = transcribedRef.current.scrollHeight;
    }
  }, [text]);

  // Keep textRef updated with the latest text
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Update copyToClipboard function
  const copyToClipboard = async (textToCopy) => {
    if (!textToCopy) return;

    const now = Date.now();
    if (now - lastCopyTime < COPY_COOLDOWN) {
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
            setPasteStatus({
              success: false,
              error: 'Clipboard operation timed out',
              timestamp: Date.now()
            });
          }, 2000);

          const handleStatus = (_, status) => {
            clearTimeout(timeoutId);
            ipcRenderer.removeListener('clipboard-operation-status', handleStatus);

            if (status.success) {
              setLastCopyTime(now);
              setPasteStatus({
                success: true,
                timestamp: Date.now()
              });
            } else {
              setPasteStatus({
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
        setLastCopyTime(now);
        setPasteStatus({
          success: true,
          timestamp: Date.now()
        });
        return true;
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
      setPasteStatus({
        success: false,
        error: err.message || 'Failed to copy text',
        timestamp: Date.now()
      });
      return false;
    }
  };

  // Function to toggle listening state
  const toggleListeningSwitchOff = (isOff) => {
    if (isOff) {
      // Stop listening
      recorderRef.current?.stop();
      stream?.getTracks().forEach(track => track.enabled = false);
      setIsListening(false);
    } else {
      // Start listening
      stream?.getTracks().forEach(track => track.enabled = true);
      recorderRef.current?.start();
      setIsListening(true);
    }
  };
  const toggleListening = () => {
    if (isListening) {
      // Stop listening
      recorderRef.current?.stop();
      stream?.getTracks().forEach(track => track.enabled = false);
    } else {
      // Start listening
      stream?.getTracks().forEach(track => track.enabled = true);
      recorderRef.current?.start();
    }
    setIsListening(!isListening);
  };

  // Initialize worker immediately
  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("./moonshine-worker.js", import.meta.url), {
        type: "module",
      });
      worker.current.onmessage = async (e) => {
        const { data } = e;
        if (data.error) {
          console.error('[Worker Event] Received onmessage error:', data);
          setProgressItems([]); // Clear progress on error
          return onError(data.error);
        }
        if (data.type === "info") {
          console.warn('[Worker Event] Received onmessage info:', data);
          return;
        }
        if (data.type === "progress") {
          setProgressItems((prev) => {
            // Update or add the progress item by file
            const idx = prev.findIndex(item => item.file === data.file);
            let updated;
            if (idx !== -1) {
              updated = [...prev];
              updated[idx] = { ...updated[idx], ...data };
            } else {
              updated = [...prev, data];
            }
            return updated;
          });
          return;
        }
        if (data.type === "log") {
          return;
        }
        if (data.type === "status") {
          console.log('[Worker Event] Received onmessage status:', data);
          if (data.status === "loading") {
            setStatus("loading");
            setLoadingMessage(data.message || "Loading AI models...");
            console.log('[Worker Event] Loading:', data.message);
          }
          if (data.status === "ready") {
            setStatus("ready");
            setLoadingMessage('');
            console.log('[Worker Event] ready:', data.message);
          }
          if (data.status === "ready") {
            setProgressItems([]); // Clear progress on ready
          }
          return;
        }

        if (data.type !== "status" && isListening) {
          console.log('[Worker Event] Received onmessage text:', data);

          const currentText = textRef.current || '';
          const combinedText = currentText + "\n\n\n " + data.message + '';
          await setText(combinedText);
          setIsProcessing(false);
          const copySuccess = await copyToClipboard(combinedText);
          if (copySuccess && window.electron) { }
          if (combinedText) {
            ipcRenderer.send('text-recognized', combinedText);
          }
        }
      };

      worker.current.onError = (err) => {
        console.error('[Worker Event] Worker error event:', err);
        setError(err.message || 'Worker error');
      };


      console.log('[Worker Event] Event listeners attached');
      worker.current.postMessage({ type: 'load' });

      // Cleanup
      return () => {
        worker.current = null;
        // worker.current.removeEventListener("message", onMessage);
        // worker.current.removeEventListener("error", onError);
        console.log('[Worker Event] Event listeners removed');
      };
    }
  }, []);

  useEffect(() => {
    if (!workerSmol.current) {
      workerSmol.current = new Worker(new URL("./smol-worker.js", import.meta.url), {
        type: "module",
      });
      smolReadyRef.current = false;
      // Listen for status/log messages
      workerSmol.current.onmessage = (event) => {
        const { status, log, output, error } = event.data;
        if (status === 'ready') {
          smolReadyRef.current = true;
          console.log('[smol-worker] Ready');
          // Now safe to send input
          // workerSmol.current.postMessage({ input: 'Once upon a time...' });
        } else if (status === 'loading') {
          console.log('[smol-worker] Loading...');
        } else if (status === 'error') {
          console.error('[smol-worker] Error:', event.data.error);
        } else if (status === 'log') {
          console.log('[smol-worker]', log);
        } else if (output) {
          setText(output);
          console.log('Generated Text:', output);
        } else if (error) {
          console.error('[smol-worker] Error:', error);
        }
      };
      // Start loading the model
      workerSmol.current.postMessage({ type: 'load' });
    }
  }, []);

  // Setup worker message handlers
  // const setupWorkerHandlers0 = () => {
  //   worker.current.addEventListener("message", async (e) => {
  //     switch (e.data.status) {
  //       case "loading":
  //         setStatus("loading");
  //         setLoadingMessage(e.data.message || "Loading models...");
  //         console.log('[Worker Debug] Loading:', e.data.message);
  //         break;
  //       case "initiate":
  //         setProgressItems((prev) => [...prev, e.data]);
  //         break;
  //       case "progress":
  //         setProgressItems((prev) =>
  //           prev.map((item) => {
  //             if (item.file === e.data.file) {
  //               return { ...item, ...e.data };
  //             }
  //             return item;
  //           }),
  //         );
  //         // console.log('[Worker Debug] Progress:', e.data);
  //         break;
  //       case "done":
  //         setProgressItems((prev) =>
  //           prev.filter((item) => item.file !== e.data.file),
  //         );
  //         break;
  //       case "ready":
  //         setStatus("ready");
  //         recorderRef.current?.start();
  //         // console.log('[Worker Debug] Ready');
  //         break;
  //       case "start":
  //         setIsProcessing(true);
  //         recorderRef.current?.requestData();
  //         console.log('[Worker Debug] start');
  //         break;
  //       case "update":
  //         const { tps } = e.data;
  //         setTps(tps);
  //         console.log('[Worker Debug] update tps', tps);
  //         break;
  //       case "complete":
  //         // Always treat output as array and join to string
  //         const newTextArr = e.data.output;
  //         const newText = Array.isArray(newTextArr) ? newTextArr.join(' ').trim() : (newTextArr || '').trim();

  //         // Don't update if text hasn't changed
  //         const currentText = textRef.current;
  //         console.log('[Text Debug] newText:', newText);
  //         console.log('[Text Debug] text:', currentText);
  //         if (newText === currentText) {
  //           console.log('[Text Debug] Text unchanged, skipping update');
  //           setIsProcessing(false);
  //           return;
  //         }

  //         if (typeof currentText === 'string' && currentText.includes(newText)) {
  //           console.log('[Text Debug] Text unchanged, skipping update');
  //           setIsProcessing(false);
  //           return;
  //         }
  //         const safeNewText = newText.toLowerCase().trim();
  //         const safeOldText = (typeof currentText === 'string' ? currentText : '').toLowerCase().trim();
  //         if (safeOldText.indexOf(safeNewText) > -1) {
  //           console.log('[Text Debug] Same match found, skipping update');
  //           setIsProcessing(false);
  //           return;
  //         }
  //         const combinedText = currentText + "\n\n\n--------------\n\n\n" + newText;
  //         // Append new transcription to the existing text
  //         await setText(combinedText);
  //         // setText( newText);

  //         setIsProcessing(false);

  //         // Copy text and handle result
  //         const copySuccess = await copyToClipboard(combinedText);
  //         if (copySuccess && window.electron) {
  //         }
  //         if (combinedText) {
  //           ipcRenderer.send('text-recognized', combinedText);
  //         }
  //         break;
  //       case "error":
  //         console.error('Worker error:', e.data.error);
  //         setError(e.data.error);
  //         setIsProcessing(false);
  //         break;
  //     }
  //   });
  // };

  // --- New AudioWorklet-based real-time audio streaming ---
  useEffect(() => {
    let audioContext, source, worklet;
    let ignore = false;
    let localStream;

    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1, sampleRate: WHISPER_SAMPLING_RATE } })
        .then(async (stream) => {
          if (ignore) return;

          audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: WHISPER_SAMPLING_RATE,
            latencyHint: "interactive",
          });

          source = audioContext.createMediaStreamSource(stream);

          // Load your AudioWorklet processor
          await audioContext.audioWorklet.addModule(
            new URL("./moonshine-processor.js", import.meta.url)
          );

          worklet = new AudioWorkletNode(audioContext, "vad-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            channelCount: 1,
            channelCountMode: "explicit",
            channelInterpretation: "discrete",
          });

          source.connect(worklet);

          worklet.port.onmessage = (event) => {
            const { buffer } = event.data;
            // Send buffer to the worker for VAD/transcription
            worker.current?.postMessage({ buffer });
          };

          setStream(stream); // If you need to keep the stream for toggling
          localStream = stream;
        })
        .catch((err) => {
          setError(err.message);
          console.error(err);
        });
    } else {
      const error = "getUserMedia not supported on your browser!";
      setError(error);
      console.error(error);
    }

    return () => {
      ignore = true;
      if (audioContext) audioContext.close();
      if (source) source.disconnect();
      if (worklet) worklet.disconnect();
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Add toggle function to handle both icon and visualizer clicks
  const toggleVisualizer = () => {
    setShowVisualizer(!showVisualizer);
  };

  // Initialize auto-paste state
  useEffect(() => {
    if (!window.electron) return;

    // Load auto-paste setting with true as default
    const stored = window.electron.store.get('autoPasteEnabled', true);
    setAutoPasteEnabled(stored);

    // Listen for paste status
    ipcRenderer.on('paste-status', (_, status) => {
      console.log('[Auto-Paste] Status received:', status);
      setPasteStatus(status);
    });

    return () => {
      ipcRenderer.removeListener('paste-status', setPasteStatus);
    };
  }, []);

  // Setup IPC listeners with additional logging
  useEffect(() => {
    if (!window.electron) return;

    const handleWindowChange = (_, windowInfo) => {
      console.log('[Window Tracking] Window changed:', windowInfo);
      setTargetWindow(windowInfo);
    };

    const handlePasteStatus = (_, status) => {
      console.log('[Auto-Paste] Status update:', status);
      setPasteStatus(status);
      // Clear status after 2 seconds
      setTimeout(() => setPasteStatus(null), 2000);
    };

    ipcRenderer.on('active-window-changed', handleWindowChange);
    ipcRenderer.on('active-window-info', handleWindowChange);
    ipcRenderer.on('paste-status', handlePasteStatus);

    // Initial window check
    console.log('[Window Tracking] Requesting initial window info');
    ipcRenderer.send('get-active-window');

    return () => {
      ipcRenderer.removeListener('active-window-changed', handleWindowChange);
      ipcRenderer.removeListener('active-window-info', handleWindowChange);
      ipcRenderer.removeListener('paste-status', handlePasteStatus);
    };
  }, []);

  // Toggle auto-paste
  const toggleAutoPaste = () => {
    const newValue = !autoPasteEnabled;
    setAutoPasteEnabled(newValue);
    if (window.electron) {
      window.electron.store.set('autoPasteEnabled', newValue);
    }
  };

  // Add fullscreen toggle handler
  const toggleFullScreen = () => {
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send('toggle-fullscreen');
    } else if (typeof ipcRenderer !== 'undefined') {
      ipcRenderer.send('toggle-fullscreen');
    }
  };


  // Qwen3 worker state
  // const workerQwen3 = useRef(null);
  // const qwen3ReadyRef = useRef(false);
  // const [isQwen3Loading, setIsQwen3Loading] = useState(false);
  // const [isQwen3Initialized, setIsQwen3Initialized] = useState(false);
  // const [qwen3ProgressItems, setQwen3ProgressItems] = useState([]);
  // const [qwen3OutputStream, setQwen3OutputStream] = useState('');

  // Gemma3 worker state
  // const workerGemma3 = useRef(null);
  // const gemma3ReadyRef = useRef(false);
  // const [isGemma3Loading, setIsGemma3Loading] = useState(false);
  // const [isGemma3Initialized, setIsGemma3Initialized] = useState(false);

  // useEffect(() => {
  //   if (!workerQwen3.current) {
  //     workerQwen3.current = new Worker(new URL("./qwen3-worker.js", import.meta.url), {
  //       type: "module",
  //     });
  //     qwen3ReadyRef.current = false;
  //     workerQwen3.current.onmessage = async (event) => {
  //       const { status, log, output, error } = event.data;
  //       if (status === 'ready') {
  //         qwen3ReadyRef.current = true;
  //         setIsQwen3Initialized(true);
  //         setQwen3ProgressItems([]);
  //         setIsQwen3Loading(false);
  //         console.log('[qwen3-worker] Ready');
  //       } else if (status === 'loading') {
  //         setIsQwen3Loading(true);
  //         setQwen3ProgressItems([]);
  //         console.log('[qwen3-worker] Loading...');
  //       } else if (status === 'progress') {
  //         setQwen3ProgressItems(prev => {
  //           // Update or add the progress item by file
  //           const idx = prev.findIndex(item => item.file === event.data.file);
  //           let updated;
  //           if (idx !== -1) {
  //             updated = [...prev];
  //             updated[idx] = { ...updated[idx], ...event.data };
  //           } else {
  //             updated = [...prev, event.data];
  //           }
  //           console.log('[Qwen3 Progress Debug] prev:', prev, 'new:', updated);
  //           return updated;
  //         });
  //       } else if (status === 'error') {
  //         setIsQwen3Loading(false);
  //         setQwen3ProgressItems([]);
  //         console.error('[qwen3-worker] Error:', event.data.error);
  //       } else if (status === 'log') {
  //         console.log('[qwen3-worker]', log);
  //       } else if (status === 'update') {
  //         console.log('Qwen3 buffering Output:', output);
  //         setQwen3OutputStream(prev => prev + " " + output);
  //       } else if (status === 'complete') {
  //         setQwen3OutputStream('');
  //         setIsQwen3Loading(false);
  //         setQwen3ProgressItems([]);
  //         console.log('Qwen3 Output:', output);
  //         setText(output);
  //         const copySuccess = await copyToClipboard(output);
  //         if (copySuccess && window.electron) { }
  //         if (output) {
  //           ipcRenderer.send('text-recognized', output);
  //         }
  //       } else if (error) {
  //         setIsQwen3Loading(false);
  //         setQwen3ProgressItems([]);
  //         console.error('[qwen3-worker] Error:', error);
  //       }
  //     };
  //     workerQwen3.current.postMessage({ type: 'load' });
  //   }
  //   // Gemma3 worker init
  //   // if (!workerGemma3.current) {
  //     // workerGemma3.current = new Worker(new URL("./gemma3-worker.js", import.meta.url), {
  //     //   type: "module",
  //     // });
  //     //   gemma3ReadyRef.current = false;
  //     //   workerGemma3.current.onmessage = async (event) => {
  //     //     const { status, log, output, error } = event.data;
  //     //     if (status === 'ready') {
  //     //       gemma3ReadyRef.current = true;
  //     //       setIsGemma3Initialized(true);
  //     //       console.log('[gemma3-worker] Ready');
  //     //     } else if (status === 'loading') {
  //     //       console.log('[gemma3-worker] Loading...');
  //     //     } else if (status === 'error') {
  //     //       setIsGemma3Loading(false);
  //     //       console.error('[gemma3-worker] Error:', event.data.error);
  //     //     } else if (status === 'log') {
  //     //       console.log('[gemma3-worker]', log);
  //     //     } else if (status === 'complete') {
  //     //       setIsGemma3Loading(false);
  //     //       console.log('Gemma3 Output:', output);
  //     //       setText(output);
  //     //       const copySuccess = await copyToClipboard(output);
  //     //       if (copySuccess && window.electron) {}
  //     //       if (output) {
  //     //         ipcRenderer.send('text-recognized', output);
  //     //       }
  //     //     } else if (error) {
  //     //       setIsGemma3Loading(false);
  //     //       console.error('[gemma3-worker] Error:', error);
  //     //     }
  //     //   };
  //     //   workerGemma3.current.postMessage({ type: 'load' });
  //   // }
  // }, []);

  // Handler for Smol worker (replaces Qwen3)
  const [isSmolLoading, setIsSmolLoading] = useState(false);
  const handleSmol = () => {
    toggleListeningSwitchOff(true);
    if (workerSmol.current && smolReadyRef.current) {
      setIsSmolLoading(true);
      workerSmol.current.postMessage({ input: text });
    } else {
      console.warn('smol-worker not ready');
    }
  };

  // Listen for Smol worker output to reset loading state
  useEffect(() => {
    if (!workerSmol.current) return;
    const handler = (event) => {
      const { status, output } = event.data;
      if (status === 'ready' || status === 'loading') {
        setIsSmolLoading(status === 'loading');
      }
      if (output) {
        setIsSmolLoading(false);
      }
    };
    workerSmol.current.addEventListener('message', handler);
    return () => workerSmol.current.removeEventListener('message', handler);
  }, []);

  return (
    <div
      className="h-screen rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'rgba(24,24,27,0.97)' }}
    >
      {status === "loading" ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4 w-full">
          <h1 className="text-2xl font-bold mb-2 text-white/90">WhisperO</h1>
          <p className="text-sm text-gray-400 mb-4">
            Whisper your thoughts, we'll write them down. <br /> <br />
            <small className="text-white/90"> Offline, private & secure. Precise voice to transcribed text  dictation</small>
          </p>
          {/* Progress indicator for model loading */}
          <div className="w-full max-w-md mx-auto mt-4">
            {progressItems && progressItems.length > 0 && progressItems.map((item, idx) => (
              <div key={item.file + idx} className="mb-2">
                <div className="flex justify-between text-xs text-gray-300 mb-0.5">
                  <span>{item.file}</span>
                  <span>{item.progress ? item.progress.toFixed(1) : 0}%</span>
                </div>
                <Progress
                  text={item.name}
                  percentage={item.progress}
                  total={item.total}
                />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-red-500 text-xs">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col h-screen mx-auto text-gray-800 dark:text-gray-200">
          {/* New Header Bar */}
          <div className="flex-none rounded-t-xl overflow-hidden">
            <div className="bg-gray-900 dark:bg-gray-900 text-white flex items-center justify-between px-2 py-1 -app-region-drag select-none rounded-t-xl">
              <div className="flex items-center gap-2 -app-region-no-drag">
                <WindowControls buttonSize="sm" onMaximizeClick={toggleFullScreen} />
              </div>
              <div className="ml-4 flex-1 flex justify-left">
                <span className="text-base font-semibold tracking-wide" style={{ fontSize: '0.75em' }}>
                  Whispero - Voice to Text
                </span>
              </div>
              {/* Grouped language selector and icon buttons, right-aligned */}
              <div className="flex items-center gap-2 app-region-no-drag">

                <button
                  onClick={toggleVisualizer}
                  className="text-gray-400 hover:text-gray-200 transition-colors text-base"
                  style={{ fontSize: '0.75em' }}
                >
                  <FaChartBar className={`w-4 h-4 ${showVisualizer ? 'text-green-500' : 'text-gray-500'}`} />
                </button>
                <button
                  onClick={toggleAutoPaste}
                  className="text-gray-400 hover:text-gray-200 transition-colors text-base"
                  title={`Auto-paste ${autoPasteEnabled ? 'enabled' : 'disabled'}`}
                  style={{ fontSize: '0.75em' }}
                >
                  <FaPaste className={`w-4 h-4 ${autoPasteEnabled ? 'text-green-500' : 'text-gray-500'}`} />
                </button>
              </div>
            </div>
            {/* Separator */}
            <div className="h-[2px] w-full bg-gray-700 dark:bg-gray-800 shadow" />
          </div>

          {/* Remove the old floating language selector and icon buttons below the header */}
          {/* Target Window Indicator */}
          <div className="hidden flex items-center ml-4 gap-2 app-region-no-drag">
            <LanguageSelector
              language={language}
              setLanguage={setLanguage}
              className="text-xs"
            />
          </div>
          {autoPasteEnabled && targetWindow && (
            <div className="absolute top-12 right-4 bg-gray-800/50 backdrop-blur-sm rounded px-2 py-1 text-xs">
              Target: {targetWindow.title || 'No window selected'}
            </div>
          )}

          {/* Paste Status - Hidden */}
          {pasteStatus && (
            <div className={`absolute top-12 left-4 rounded px-2 py-1 text-xs ${pasteStatus.success ? 'bg-green-500/50' : 'bg-red-500/50'
              } backdrop-blur-sm hidden`}>
              {pasteStatus.success ? 'Pasted' : 'Paste failed'}
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4 select-none">
            {/* Listening header row */}
            <div className="flex items-center mb-6 w-full max-w-2xl">
              {/* Microphone button */}
              <button
                onClick={toggleListening}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md focus:outline-none ${isListening
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                title={isListening ? 'Stop Listening' : 'Start Listening'}
              >
                {isListening ? (
                  <FaMicrophone className="w-7 h-7" />
                ) : (
                  <FaMicrophoneSlash className="w-7 h-7" />
                )}
              </button>
              {/* Animated wave when listening */}
              {isListening && (
                <div className="ml-4 flex space-x-1">
                  <div className="w-1 h-4 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1 h-6 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-4 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  <div className="w-1 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              )}
              {/* Listening text */}
              {isListening && (<div className="ml-6">
                <div className="font-medium text-white text-lg">Listening...</div>
                <div className="text-sm text-gray-300">Speak now</div>
              </div>
              )}
              {!isListening && (<div className="ml-6">
                <div className="font-medium text-white text-lg">Not Listening </div>
                <div className="text-sm text-gray-300">Tap to Speak now</div>
              </div>
              )}

            </div>

            {showVisualizer && (
              <div className="transition-opacity hover:opacity-80">
                <AudioVisualizer
                  stream={stream}
                  isProcessing={isProcessing}
                  isListening={isListening}
                />
              </div>
            )}

            {/* Transcribed text area */}
            {text && (
              <div className="w-full max-w-2xl">
                {/* Smol worker button replaces Qwen3 */}
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
                <div
                  className="app-region-no-drag bg-gray-50 dark:bg-dark-600 rounded-lg p-4 h-48 overflow-y-auto transition-colors shadow-inner custom-scrollbar transcribed-scrollbar"
                  style={{ fontFamily: 'inherit', fontSize: '1.08em' }}
                  tabIndex={0}
                  ref={transcribedRef}
                  title="Click to copy"
                >
                  {/* Split text into paragraphs for better styling */}
                  {(typeof text === 'string' ? text : String(text || '')).split(/\n+/).map((para, idx) => (
                    <p
                      key={idx}
                      className={
                        idx === 0
                          ? ' -app-region-no-drag  text-white-800 light:text-light-100 font-mono break-words'
                          : ' -app-region-no-drag  text-white-800 light:text-light-100 mt-2 break-words'
                      }
                    >
                      {para}
                    </p>
                  ))}
                </div>
                {/* Copy, Save, and Clear buttons */}
                <div className="flex justify-end gap-2 mt-2 items-center">
                  <button
                    className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-1 rounded text-xs font-medium mr-auto"
                    onClick={() => setText("")}
                    title="Clear transcript"
                  >

                    Clear
                  </button>



                  <button
                    className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded transition-colors text-sm font-medium"
                    onClick={() => copyToClipboard(text)}
                  >
                    Copy
                  </button>
                  <button
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
                    onClick={() => {
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
                    }}
                  >
                    Save
                  </button>
                  {/* <button
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
                    onClick={handleAIClean}
                  >
                     Summarize
                  </button> */}

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logo in bottom right corner */}
      <img
        src="whispero-logo.png"
        alt="Whispero Logo"
        className="fixed bottom-2 right-2 w-8 h-8 opacity-30 pointer-events-none"
      />

      {process.env.NODE_ENV === 'development' && (
        <DebugPanel
          targetWindow={targetWindow}
          isAutoPasteEnabled={autoPasteEnabled}
          pasteStatus={pasteStatus}
          toggleAutoPaste={toggleAutoPaste}
        />
      )}
    </div>
  );
}

export default App;
