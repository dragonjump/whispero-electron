import { pipeline, TextStreamer, InterruptableStoppingCriteria } from "@huggingface/transformers";
import { env } from "@huggingface/transformers";

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
    log('Loading Qwen3 pipeline...');
    // Try to set ONNX backend to webgpu if possible
    if (env && env.backends && env.backends.onnx) {
      env.backends.onnx = 'webgpu';
      postMessage({ status: 'log', log: 'Set ONNX backend to webgpu via env.backends.onnx' });
    } else {
      postMessage({ status: 'log', log: 'env.backends.onnx not available, could not set backend explicitly.' });
    }
    const pipe = await pipeline(
      "text-generation",
      "onnx-community/Qwen3-0.6B-ONNX",
      { dtype: "q4f16" }
    );
    tokenizer = pipe.tokenizer;
    model = pipe.model;
    // Log ONNX backend info if available
    let backend = null;
    if (model && model.session && model.session.backend) {
      backend = model.session.backend;
    } else if (model && model.model && model.model.session && model.model.session.backend) {
      backend = model.model.session.backend;
    }
    if (backend) {
      log('ONNX backend in use:', backend);
      postMessage({ status: 'log', log: `ONNX backend in use: ${backend}` });
    } else {
      log('ONNX backend info not found');
      postMessage({ status: 'log', log: 'ONNX backend info not found' });
    }
    isReady = true;
    postMessage({ status: 'ready' });
    log('Qwen3 pipeline ready.');
    processQueue();
  } catch (error) {
    postMessage({ status: 'error', error: error.message });
    log('Qwen3 pipeline load error:', error.message);
  }
};

const stopping_criteria = new InterruptableStoppingCriteria();
let past_key_values_cache = null;
let reasonEnabled = false;
const handleMessage = async (event) => {
  const { input } = event.data;
  if (!input) {
    postMessage({ error: 'No input provided.' });
    log('No input provided.');
    return;
  }
  try {
    log('Qwen3 generating for input:', input);
    const PROMPT_DEFAULT = `Be concise.No yapping. You will get a transcript.
          Return the summary of the transcript. If there is repeat statement use only most bottom as its the latest one.`
    const messages = [
      {
        role: "system", content:
          PROMPT_DEFAULT
      },
      { role: "user", content: `${PROMPT_DEFAULT}[transcript] ${input} [/transcript]` },
    ];
    const [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = tokenizer.encode(
      "<think></think>",
      { add_special_tokens: false },
    );
    const inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
      enable_thinking: reasonEnabled,
    });
    const token_callback_function = (tokens) => {
      startTime ??= performance.now();

      if (numTokens++ > 0) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
      switch (Number(tokens[0])) {
        case START_THINKING_TOKEN_ID:
          state = "thinking";
          break;
        case END_THINKING_TOKEN_ID:
          state = "answering";
          break;
      }
      // Collect tokens only when answering
      if (state === "answering") {
        answerTokens.push(tokens[0]);
      }
      // Optionally log
      // console.log(state, tokens, tokenizer.decode(tokens));
    };

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
      token_callback_function,
    });

    // Tell the main thread we are starting
    self.postMessage({ status: "start" });
    const start = performance.now();

    const { past_key_values, sequences } = await model.generate({
      ...inputs,
      past_key_values: past_key_values_cache,
      do_sample: true,
      top_k: 50,
      temperature: reasonEnabled ? 0.3 : 0.1,
      // max_new_tokens: 16384,
      max_new_tokens: 50,
      streamer,
      stopping_criteria,
      return_dict_in_generate: true,
    });
    past_key_values_cache = past_key_values;
    console.log("Generation time:", performance.now() - start);

    // Decode only the answer tokens
    const answerText = tokenizer.decode(answerTokens, { skip_special_tokens: true });

    // Send the output back to the main thread
    self.postMessage({
      status: "complete",
      output: answerText,
    });
    log('Qwen3 generation complete.');
  } catch (error) {
    postMessage({ error: error.message });
    log('Qwen3 generation error:', error.message);
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
