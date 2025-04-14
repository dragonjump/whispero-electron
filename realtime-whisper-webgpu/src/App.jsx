import { useEffect, useState, useRef } from "react";
import { ipcRenderer } from 'electron';

import { AudioVisualizer } from "./components/AudioVisualizer";
import Progress from "./components/Progress";
import { LanguageSelector } from "./components/LanguageSelector";
import { WindowControls } from "./components/WindowControls";

// Import icons
import { FaMicrophone, FaMicrophoneSlash, FaPlay, FaStop } from 'react-icons/fa';

const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

function App() {
  // Create a reference to the worker object.
  const worker = useRef(null);
  const recorderRef = useRef(null);

  // Model loading and progress
  const [status, setStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progressItems, setProgressItems] = useState([]);
  const [error, setError] = useState(null);

  // Inputs and outputs
  const [text, setText] = useState("");
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState("en");

  // Processing
  const [recording, setRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const [isListening, setIsListening] = useState(true);
  const audioContextRef = useRef(null);

  // Function to toggle listening state
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
      worker.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      setupWorkerHandlers();
      
      // Start loading the model
      worker.current.postMessage({ type: 'load' });
    }
  }, []);

  // Setup worker message handlers
  const setupWorkerHandlers = () => {
    worker.current.addEventListener("message", (e) => {
      switch (e.data.status) {
        case "loading":
          setStatus("loading");
          setLoadingMessage(e.data.message || "Loading models...");
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
          setStatus("ready");
          recorderRef.current?.start();
          break;
        case "start":
          setIsProcessing(true);
          recorderRef.current?.requestData();
          break;
        case "update":
          const { tps } = e.data;
          setTps(tps);
          break;
        case "complete":
          setIsProcessing(false);
          setText(e.data.output);
          if (window.electron) {
            ipcRenderer.send('text-recognized', e.data.output);
          }
          break;
        case "error":
          console.error('Worker error:', e.data.error);
          setError(e.data.error);
          setIsProcessing(false);
          break;
      }
    });
  };

  useEffect(() => {
    if (recorderRef.current) return; // Already set

    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setStream(stream);

          recorderRef.current = new MediaRecorder(stream);
          audioContextRef.current = new AudioContext({
            sampleRate: WHISPER_SAMPLING_RATE,
          });

          recorderRef.current.onstart = () => {
            setRecording(true);
            setChunks([]);
          };
          recorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) {
              setChunks((prev) => [...prev, e.data]);
            } else {
              // Empty chunk received, so we request new data after a short timeout
              setTimeout(() => {
                recorderRef.current.requestData();
              }, 25);
            }
          };

          recorderRef.current.onstop = () => {
            setRecording(false);
          };

          recorderRef.current.onerror = (error) => {
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
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!recorderRef.current) return;
    if (!recording) return;
    if (isProcessing) return;
    if (status !== "ready") return;

    if (chunks.length > 0) {
      // Generate from data
      const blob = new Blob(chunks, { type: recorderRef.current.mimeType });

      const fileReader = new FileReader();

      fileReader.onloadend = async () => {
        const arrayBuffer = fileReader.result;
        const decoded =
          await audioContextRef.current.decodeAudioData(arrayBuffer);
        let audio = decoded.getChannelData(0);
        if (audio.length > MAX_SAMPLES) {
          // Get last MAX_SAMPLES
          audio = audio.slice(-MAX_SAMPLES);
        }

        worker.current.postMessage({
          type: "generate",
          data: { audio, language },
        });
      };
      fileReader.readAsArrayBuffer(blob);
    } else {
      recorderRef.current?.requestData();
    }
  }, [status, recording, isProcessing, chunks, language]);

  return (
    <div className="h-screen bg-transparent">
      {status === "loading" ? (
        <div className="flex flex-col items-center justify-center h-full bg-transparent backdrop-blur-sm bg-opacity-50">
          <Progress items={progressItems} message={loadingMessage} />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full bg-transparent backdrop-blur-sm bg-opacity-50">
          <p className="text-red-500">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col h-screen mx-auto text-gray-800 dark:text-gray-200 bg-transparent backdrop-blur-sm bg-opacity-50">
          <div className="flex-none p-4">
            <WindowControls />
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleListening}
                className={`p-4 rounded-full transition-all duration-200 ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isListening ? (
                  <FaStop className="w-6 h-6 text-white" />
                ) : (
                  <FaPlay className="w-6 h-6 text-white" />
                )}
              </button>
              <div className="relative">
                {isListening ? (
                  <FaMicrophone className="w-8 h-8 text-green-500 animate-pulse" />
                ) : (
                  <FaMicrophoneSlash className="w-8 h-8 text-red-500" />
                )}
              </div>
            </div>
            
            <AudioVisualizer 
              stream={stream} 
              isProcessing={isProcessing} 
              isListening={isListening}
            />
            
            <div className="w-full max-w-2xl">
              <LanguageSelector value={language} onChange={setLanguage} />
            </div>
            
            {text && (
              <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
                <p className="text-lg">{text}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
