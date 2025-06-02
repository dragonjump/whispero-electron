import { useEffect, useRef } from "react";

export function AudioVisualizer({ stream, isProcessing, isListening }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    source.connect(analyser);

    return () => {
      audioContext.close();
    };
  }, [stream]);

  useEffect(() => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    function draw() {
      if (!isListening) {
        // Clear canvas when not listening
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / dataArray.length) * 2.5;
      let barHeight;
      let x = 0;

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, isProcessing ? '#fbbf24' : '#10b981');  // Yellow when processing, Green when listening
      gradient.addColorStop(1, isProcessing ? '#f59e0b' : '#059669');

      for (let i = 0; i < dataArray.length; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    }

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stream, isProcessing, isListening]);

  return (
    <div  className="w-full max-w-2xl relative">
      <canvas
        ref={canvasRef}
        width={800}
        height={100}
        className="w-full h-24 rounded-lg bg-gray-900 bg-opacity-20 backdrop-blur-sm"
      />
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
        </div>
      )}
    </div>
  );
}
