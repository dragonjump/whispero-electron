// worker.js

import { pipeline } from '@huggingface/transformers';

let pipe = null;
let isReady = false;
let queue = [];
// https://huggingface.co/spaces/onnx-community/model-explorer
const log = (...args) => {
  postMessage({ status: 'log', log: args.map(String).join(' ') });
};

const processQueue = () => {
  while (queue.length > 0 && isReady) {
    const event = queue.shift();
    handleMessage(event);
  }
};

const loadPipeline = async () => {
  try {
    postMessage({ status: 'loading' });
    log('Loading pipeline...');
    //  'HuggingFaceTB/SmolLM2-135M-Instruct'  'q4f16'
    // pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct');
    //   pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct', {
    //     dtype: 'fp32' // Or 'fp32' for full precision
    // });
    pipe = await pipeline('text-generation',
      'HuggingFaceTB/SmolLM2-135M-Instruct', {
      dtype: 'q4f16'
    });
    isReady = true;
    postMessage({ status: 'ready' });
    log('Pipeline ready.');
    processQueue();
  } catch (error) {
    postMessage({ status: 'error', error: error.message });
    log('Pipeline load error:', error.message);
  }
};

const handleMessage = async (event) => {
  const { input } = event.data;
  if (!input) {
    postMessage({ error: 'No input provided.' });
    log('No input provided.');
    return;
  }
  try {
    if (!input) { return }
    log('Generating for input:', input);
    // Add a prompt to instruct the model to only fix grammar and sentence structure
    const prompt = `Rewrite: "${input.trim()}" Corrected:`;
    const result = await pipe(prompt, { max_length: 100 });
    console.warn('smol result', result);
    postMessage({ output: result.length ? result[0].generated_text : input });
    log('Generation complete.');
  } catch (error) {
    postMessage({ error: error.message });
    log('Generation error:', error.message);
  }
};

self.onmessage = (event) => {
  if (event.data && event.data.type === 'load') {
    if (!isReady) loadPipeline();
    return;
  }
  if (!isReady) {
    queue.push(event);
    if (!pipe) loadPipeline();
    return;
  }
  handleMessage(event);
};

// Auto-load on worker start
loadPipeline();