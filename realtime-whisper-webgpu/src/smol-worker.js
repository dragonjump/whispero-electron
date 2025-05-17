// worker.js

import { pipeline } from '@huggingface/transformers';

let pipe = null;
let isReady = false;
let queue = [];

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
     
    // pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct');
    //   pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct', {
    //     dtype: 'fp32' // Or 'fp32' for full precision
    // });
    pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-135M-Instruct');
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
    log('Generating for input:', input);
    const result = await pipe(input, { max_length: 100 });
    postMessage({ output: result.length?result[0].generated_text:input });
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