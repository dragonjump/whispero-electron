// import { pipeline } from "@huggingface/transformers";

// // Create a text generation pipeline
// const generator = await pipeline(
//   "text-generation",
//   "onnx-community/gemma-3-1b-it-ONNX",
//   { dtype: "q4" },
// );

// // Define the list of messages
// const messages = [
//   { role: "system", content: "You are a helpful assistant." },
//   { role: "user", content: "Write me a poem about Machine Learning." },
// ];

// // Generate a response
// const output = await generator(messages, { max_new_tokens: 512, do_sample: false });
// console.log(output[0].generated_text.at(-1).content);

import { pipeline, TextStreamer, InterruptableStoppingCriteria } from "@huggingface/transformers";

let tokenizer = null;
let model = null;
let isReady = false;
let queue = [];
let state = "answering"; // 'thinking' or 'answering'
let startTime;
let numTokens = 0;
let tps;
let answerTokens = [];

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
    log('Loading Gemma3 pipeline...');
    const pipe = await pipeline(
      "text-generation",
      "onnx-community/gemma-3-1b-it-ONNX",
      { dtype: "q4" }
    );
    tokenizer = pipe.tokenizer;
    model = pipe.model;
    isReady = true;
    postMessage({ status: 'ready' });
    log('Gemma3 pipeline ready.');
    processQueue();
  } catch (error) {
    console.error('[Worker Debug] Gemma3 pipeline load error:', error.message);
    postMessage({ status: 'error', error: error.message });
    log('Gemma3 pipeline load error:', error.message);
  }
};

const stopping_criteria = new InterruptableStoppingCriteria();
let past_key_values_cache = null;
const handleMessage = async (event) => {
  const { input } = event.data;
  if (!input) {
    postMessage({ error: 'No input provided.' });
    log('No input provided.');
    return;
  }
  try {
    log('Gemma3 generating for input:', input);
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: input },
    ];
    const inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    });
    const callback_function = (output) => {
      self.postMessage({
        status: "update",
        output,
        tps,
        numTokens,
        state,
      });
    };
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function,
    });
    // Tell the main thread we are starting
    self.postMessage({ status: "start" });
    const start = performance.now();
    const { past_key_values, sequences } = await model.generate({
      ...inputs,
      past_key_values: past_key_values_cache,
      do_sample: false,
      top_k: 50,
      temperature: 0.1,
      max_new_tokens: 50,
      streamer,
      stopping_criteria,
      return_dict_in_generate: true,
    });
    past_key_values_cache = past_key_values;
    console.log("Generation time:", performance.now() - start);
    // Decode only the answer tokens
    const answerText = tokenizer.decode(sequences[0], { skip_special_tokens: true });
    // Send the output back to the main thread
    self.postMessage({
      status: "complete",
      output: answerText,
    });
    log('Gemma3 generation complete.');
  } catch (error) {
    postMessage({ error: error.message });
    log('Gemma3 generation error:', error.message);
  }
};

self.onmessage = (event) => {
  if (event.data && event.data.type === 'load') {
    if (!isReady) loadPipeline();
    return;
  }
  if (!isReady) {
    queue.push(event);
    if (!tokenizer || !model) loadPipeline();
    return;
  }
  handleMessage(event);
};

// Auto-load on worker start
loadPipeline();
