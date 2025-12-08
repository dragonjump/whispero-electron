import { useEffect, useState, useRef, useCallback } from "react";
import { ipcRenderer, shell } from 'electron';
import copy from 'clipboard-copy';
import copyToClipboard from './utils/copyToClipboard';
import { downloadFile } from './utils/copyToClipboard';

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

// Model Selection Screen Component
function ModelSelectionScreen({ onSelectModel }) {
  return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'rgba(24,24,27,0.97)' }}>
      <div className="text-center px-4 max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-white/90">Whispero</h1>
        <p className="text-lg text-gray-400 mb-8">
          Choose your transcription model
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Moonshine Option */}
          <button
            onClick={() => onSelectModel('moonshine')}
            className="group relative bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-700 hover:border-indigo-500 rounded-xl p-6 transition-all duration-200 text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🌙</span>
              <h2 className="text-xl font-semibold text-white">Moonshine</h2>
            </div>
            <p className="text-sm text-gray-400 mb-2">
              Fast, real-time transcription with Voice Activity Detection (VAD)
            </p>
            <ul className="text-xs text-gray-500 space-y-1 mt-3">
              <li>• Real-time streaming</li>
              <li>• Built-in VAD</li>
              <li>• Lower latency</li>
              <li>• English optimized</li>
            </ul>
            <div className="mt-4 text-indigo-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Click to select →
            </div>
          </button>

          {/* Whisper Option */}
          <button
            onClick={() => onSelectModel('whisper')}
            className="group relative bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-700 hover:border-indigo-500 rounded-xl p-6 transition-all duration-200 text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🎤</span>
              <h2 className="text-xl font-semibold text-white">Whisper</h2>
            </div>
            <p className="text-sm text-gray-400 mb-2">
              Multilingual transcription with high accuracy
            </p>
            <ul className="text-xs text-gray-500 space-y-1 mt-3">
              <li>• Multilingual support</li>
              <li>• High accuracy</li>
              <li>• Language selection</li>
              <li>• Batch processing</li>
            </ul>
            <div className="mt-4 text-indigo-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Click to select →
            </div>
          </button>
        </div>
        
        <p className="text-xs text-gray-500 mt-8">
          You can change this later in settings
        </p>
      </div>
    </div>
  );
}

function App() {
  // Model selection - null means show selection screen
  const [currentModel, setCurrentModel] = useState(null); // null, 'moonshine', or 'whisper'
  
  // Create references to worker objects (only one will be used)
  const workerMoonshine = useRef(null);
  const workerWhisper = useRef(null);
  
  // Separate refs for each model to avoid conflicts
  // Moonshine refs
  const audioContextWorkletRef = useRef(null);
  const workletNodeRef = useRef(null);
  const streamMoonshineRef = useRef(null);
  
  // Whisper refs
  const recorderRefWhisper = useRef(null);
  const audioContextRefWhisper = useRef(null);
  const streamWhisperRef = useRef(null);

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
  const [stream, setStream] = useState(null); // Current active stream for visualizer
  const [isListening, setIsListening] = useState(true);
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

  // Auto-paste
  const [showAbout, setShowAbout] = useState(false);

  // Function to toggle listening state
  const toggleListeningSwitchOff = (isOff) => {
    if (isOff) {
      // Stop listening
      if (currentModel === 'whisper') {
        recorderRefWhisper.current?.stop();
        streamWhisperRef.current?.getTracks().forEach(track => track.enabled = false);
      } else {
        streamMoonshineRef.current?.getTracks().forEach(track => track.enabled = false);
      }
      setIsListening(false);
    } else {
      // Start listening
      if (currentModel === 'whisper') {
        streamWhisperRef.current?.getTracks().forEach(track => track.enabled = true);
        if (recorderRefWhisper.current && status === 'ready') {
          recorderRefWhisper.current.start();
        }
      } else {
        streamMoonshineRef.current?.getTracks().forEach(track => track.enabled = true);
      }
      setIsListening(true);
    }
  };
  
  const toggleListening = () => {
    if (isListening) {
      // Stop listening
      if (currentModel === 'whisper') {
        recorderRefWhisper.current?.stop();
        streamWhisperRef.current?.getTracks().forEach(track => track.enabled = false);
      } else {
        streamMoonshineRef.current?.getTracks().forEach(track => track.enabled = false);
      }
    } else {
      // Start listening
      if (currentModel === 'whisper') {
        streamWhisperRef.current?.getTracks().forEach(track => track.enabled = true);
        if (recorderRefWhisper.current && status === 'ready') {
          recorderRefWhisper.current.start();
        }
      } else {
        streamMoonshineRef.current?.getTracks().forEach(track => track.enabled = true);
      }
    }
    setIsListening(!isListening);
  };

  // Handle model selection
  const handleModelSelection = (model) => {
    setCurrentModel(model);
    // Save preference
    if (window.electron) {
      window.electron.store.set('selectedModel', model);
    }
  };

  // Load saved model preference
  useEffect(() => {
    if (window.electron) {
      const savedModel = window.electron.store.get('selectedModel');
      if (savedModel && (savedModel === 'moonshine' || savedModel === 'whisper')) {
        setCurrentModel(savedModel);
      }
    }
  }, []);

  // Initialize Moonshine worker (only if selected)
  useEffect(() => {
    if (!currentModel || currentModel !== 'moonshine') return;
    if (workerMoonshine.current) return;
    
    if (!workerMoonshine.current) {
      workerMoonshine.current = new Worker(new URL("./workers/moonshine-worker.js", import.meta.url), {
        type: "module",
      });
      workerMoonshine.current.onmessage = async (e) => {
        if (currentModel !== 'moonshine') return; // Only process if active
        
        const { data } = e;
        if (data.error) {
          console.error('[Moonshine Worker] Received onmessage error:', data);
          setProgressItems([]);
          setError(data.error?.message || 'Worker error');
          return;
        }
        if (data.type === "info") {
          console.warn('[Moonshine Worker] Received onmessage info:', data);
          return;
        }
        if (data.type === "progress") {
          setProgressItems((prev) => {
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
          console.log('[Moonshine Worker] Received onmessage status:', data);
          if (data.status === "loading") {
            setStatus("loading");
            setLoadingMessage(data.message || "Loading Moonshine model...");
          }
          if (data.status === "ready") {
            if (currentModel === 'moonshine') {
              setStatus("ready");
              setLoadingMessage('');
              setProgressItems([]);
            }
          }
          return;
        }

        if (data.type === "output" && isListening) {
          console.log('[Moonshine Worker] Received onmessage text:', data);
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

      workerMoonshine.current.onError = (err) => {
        console.error('[Moonshine Worker] Worker error event:', err);
        setError(err.message || 'Worker error');
      };

      console.log('[Moonshine Worker] Event listeners attached');
      workerMoonshine.current.postMessage({ type: 'load' });
    }
  }, [currentModel]);

  // Initialize Whisper worker (only if selected)
  useEffect(() => {
    if (!currentModel || currentModel !== 'whisper') return;
    if (workerWhisper.current) return;
    
    if (!workerWhisper.current) {
      workerWhisper.current = new Worker(new URL("./workers/whisper-worker.js", import.meta.url), {
        type: "module",
      });
      
      const setupWhisperHandlers = () => {
        workerWhisper.current.addEventListener("message", async (e) => {
          if (currentModel !== 'whisper') return; // Only process if active
          
          switch (e.data.status) {
            case "loading":
              setStatus("loading");
              setLoadingMessage(e.data.message || "Loading Whisper model...");
              console.log('[Whisper Worker] Loading:', e.data.message);
              break;
            case "initiate":
              setProgressItems((prev) => [...prev, e.data]);
              break;
            case "progress":
              setProgressItems((prev) =>
                prev.map((item) => {
                  if (item.file === e.data.file) {
                    return { ...item, ...e.data };
                  }
                  return item;
                }),
              );
              break;
            case "done":
              setProgressItems((prev) =>
                prev.filter((item) => item.file !== e.data.file),
              );
              break;
            case "ready":
              if (currentModel === 'whisper') {
                setStatus("ready");
                // Start recorder if listening is enabled
                if (isListening && recorderRefWhisper.current && recorderRefWhisper.current.state !== 'recording') {
                  recorderRefWhisper.current.start();
                }
                console.log('[Whisper Worker] Ready');
              }
              break;
            case "start":
              setIsProcessing(true);
              recorderRefWhisper.current?.requestData();
              console.log('[Whisper Worker] start');
              break;
            case "update":
              const { tps } = e.data;
              setTps(tps);
              console.log('[Whisper Worker] update tps', tps);
              break;
            case "complete":
              const newTextArr = e.data.output;
              const newText = Array.isArray(newTextArr) ? newTextArr.join(' ').trim() : (newTextArr || '').trim();
              const currentText = textRef.current;
              console.log('[Whisper Worker] newText:', newText);
              console.log('[Whisper Worker] text:', currentText);
              
              if (newText === currentText) {
                console.log('[Whisper Worker] Text unchanged, skipping update');
                setIsProcessing(false);
                return;
              }

              if (typeof currentText === 'string' && currentText.includes(newText)) {
                console.log('[Whisper Worker] Text unchanged, skipping update');
                setIsProcessing(false);
                return;
              }
              
              const safeNewText = newText.toLowerCase().trim();
              const safeOldText = (typeof currentText === 'string' ? currentText : '').toLowerCase().trim();
              if (safeOldText.indexOf(safeNewText) > -1) {
                console.log('[Whisper Worker] Same match found, skipping update');
                setIsProcessing(false);
                return;
              }
              
              // const combinedText = currentText + "\n\n\n--------------\n\n\n" + newText;

              
              const combinedText = newText;

              
              await setText(combinedText);
              setIsProcessing(false);

              const copySuccess = await copyToClipboard(combinedText);
              if (copySuccess && window.electron) { }
              if (combinedText) {
                ipcRenderer.send('text-recognized', combinedText);
              }
              break;
            case "error":
              console.error('Whisper Worker error:', e.data.error);
              setError(e.data.error);
              setIsProcessing(false);
              break;
          }
        });
      };
      
      setupWhisperHandlers();
      workerWhisper.current.postMessage({ type: 'load' });
    }
  }, [currentModel]);

  // --- AudioWorklet-based real-time audio streaming for Moonshine ---
  useEffect(() => {
    if (!currentModel || currentModel !== 'moonshine') {
      // Clean up if switching away from moonshine
      if (audioContextWorkletRef.current) {
        audioContextWorkletRef.current.close();
        audioContextWorkletRef.current = null;
      }
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }
      if (streamMoonshineRef.current) {
        streamMoonshineRef.current.getTracks().forEach((track) => track.stop());
        streamMoonshineRef.current = null;
      }
      setStream(null);
      return;
    }
    
    let audioContext, source, worklet;
    let ignore = false;

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
            new URL("./workers/moonshine-processor.js", import.meta.url)
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
            // Send buffer to the moonshine worker for VAD/transcription
            workerMoonshine.current?.postMessage({ buffer });
          };

          streamMoonshineRef.current = stream;
          setStream(stream); // For visualizer
          audioContextWorkletRef.current = audioContext;
          workletNodeRef.current = worklet;
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
      if (streamMoonshineRef.current) {
        streamMoonshineRef.current.getTracks().forEach((track) => track.stop());
        streamMoonshineRef.current = null;
      }
    };
  }, [currentModel]);

  // --- MediaRecorder-based audio capture for Whisper ---
  useEffect(() => {
    if (!currentModel || currentModel !== 'whisper') {
      // Clean up if switching away from whisper
      if (recorderRefWhisper.current) {
        recorderRefWhisper.current.stop();
        recorderRefWhisper.current = null;
      }
      if (streamWhisperRef.current) {
        streamWhisperRef.current.getTracks().forEach((track) => track.stop());
        streamWhisperRef.current = null;
      }
      if (audioContextRefWhisper.current) {
        audioContextRefWhisper.current.close();
        audioContextRefWhisper.current = null;
      }
      setStream(null);
      setChunks([]);
      setRecording(false);
      return;
    }

    // Don't recreate if already set up
    if (recorderRefWhisper.current && streamWhisperRef.current) {
      setStream(streamWhisperRef.current);
      return;
    }

    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamWhisperRef.current = stream;
          setStream(stream); // For visualizer

          recorderRefWhisper.current = new MediaRecorder(stream);
          audioContextRefWhisper.current = new AudioContext({
            sampleRate: WHISPER_SAMPLING_RATE,
          });

          recorderRefWhisper.current.onstart = () => {
            setRecording(true);
            setChunks([]);
          };
          recorderRefWhisper.current.ondataavailable = (e) => {
            if (e.data.size > 0) {
              setChunks((prev) => [...prev, e.data]);
            } else {
              // Empty chunk received, so we request new data after a short timeout
              setTimeout(() => {
                recorderRefWhisper.current?.requestData();
              }, 25);
            }
          };

          recorderRefWhisper.current.onstop = () => {
            setRecording(false);
          };

          recorderRefWhisper.current.onerror = (error) => {
            console.error('MediaRecorder error:', error);
            if (window.electron) {
              ipcRenderer.send('audio-error', error.message);
            }
          };
        })
        .catch((err) => {
          console.error("The following error occurred: ", err);
          if (window.electron) {
            ipcRenderer.send('audio-error', err.message);
          }
        });
    } else {
      const error = "getUserMedia not supported on your browser!";
      console.error(error);
      if (window.electron) {
        ipcRenderer.send('audio-error', error);
      }
    }

    return () => {
      if (recorderRefWhisper.current) {
        recorderRefWhisper.current.stop();
        recorderRefWhisper.current = null;
      }
      if (streamWhisperRef.current) {
        streamWhisperRef.current.getTracks().forEach((track) => track.stop());
        streamWhisperRef.current = null;
      }
      if (audioContextRefWhisper.current) {
        audioContextRefWhisper.current.close();
        audioContextRefWhisper.current = null;
      }
    };
  }, [currentModel]);

  // Process audio chunks for Whisper model
  useEffect(() => {
    if (!currentModel || currentModel !== 'whisper') return;
    if (!recorderRefWhisper.current) return;
    if (!recording) return;
    if (isProcessing) return;
    if (status !== "ready") return;

    if (chunks.length > 0) {
      // Generate from data
      const blob = new Blob(chunks, { type: recorderRefWhisper.current.mimeType });

      const fileReader = new FileReader();

      fileReader.onloadend = async () => {
        const arrayBuffer = fileReader.result;
        const decoded =
          await audioContextRefWhisper.current.decodeAudioData(arrayBuffer);
        let audio = decoded.getChannelData(0);
        if (audio.length > MAX_SAMPLES) {
          // Get last MAX_SAMPLES
          audio = audio.slice(-MAX_SAMPLES);
        }

        workerWhisper.current.postMessage({
          type: "generate",
          data: { audio, language },
        });
      };
      fileReader.readAsArrayBuffer(blob);
    } else {
      recorderRefWhisper.current?.requestData();
    }
  }, [status, recording, isProcessing, chunks, language, currentModel]);

  // Start recorder when switching to whisper model if ready and listening
  useEffect(() => {
    if (!currentModel || currentModel !== 'whisper') return;
    if (status === 'ready' && isListening && recorderRefWhisper.current) {
      if (recorderRefWhisper.current.state !== 'recording') {
        recorderRefWhisper.current.start();
      }
    }
  }, [currentModel, status, isListening]);

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

  useEffect(() => {
    if (showAbout) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [showAbout]);

  // Show model selection screen if no model is selected
  if (currentModel === null) {
    return <ModelSelectionScreen onSelectModel={handleModelSelection} />;
  }

  return (
    <div
      className="h-screen rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'rgba(24,24,27,0.97)' }}
    >
      {status === "loading" ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4 w-full">
          <h1 className="text-2xl font-bold mb-2 text-white/90">WhisperO</h1>
          <p className="text-sm text-gray-400 mb-2">
            Loading {currentModel === 'moonshine' ? '🌙 Moonshine' : '🎤 Whisper'} model...
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {loadingMessage || "Initializing models..."}
          </p>
          <p className="text-xs text-gray-500 mb-4">
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

          {/* Language Selector for Whisper */}
          {currentModel === 'whisper' && (
            <div className="flex items-center ml-4 gap-2 app-region-no-drag mt-2">
              <LanguageSelector
                language={language}
                setLanguage={setLanguage}
                className="text-xs"
              />
            </div>
          )}
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
                      downloadFile(text);
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
      <button
        id='about-logo'
        onClick={() => setShowAbout(true)}
        className="fixed bottom-2 right-2 w-10 h-10 opacity-60 bg-gray-800/50 hover:bg-gray-700/50 rounded-full flex items-center justify-center transition select-none z-50"
        style={{ userSelect: 'none' }}
        title="About Whispero"
      >
        <img
          src="whispero-logo.png"
          alt="Whispero Logo"
          className="w-8 h-8 pointer-events-none"
          draggable="false"
        />
      </button>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="bg-gray-900 text-white rounded-lg shadow-lg p-8 max-w-xs w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
              onClick={() => setShowAbout(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="flex flex-col items-center gap-2">
              <img src="whispero-logo.png" alt="Whispero Logo" className="w-12 h-12 mb-2 select-none pointer-events-none" draggable="false" />
              <h2 className="text-lg font-bold mb-1">Whispero</h2>
              <div className="text-sm mb-2">Version <span className="font-mono">1.0.0</span></div>
              <button
                onClick={() => shell.openExternal('https://github.com/dragonjump/whispero-electron')}
                className="text-indigo-400 hover:underline text-sm focus:outline-none"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                GitHub Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* {process.env.NODE_ENV === 'development' && (
        <DebugPanel
          targetWindow={targetWindow}
          isAutoPasteEnabled={autoPasteEnabled}
          pasteStatus={pasteStatus}
          toggleAutoPaste={toggleAutoPaste}
        />
      )} */}
    </div>
  );
}

export default App;
