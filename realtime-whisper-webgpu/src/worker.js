import {
  AutoTokenizer,
  AutoProcessor,
  WhisperForConditionalGeneration,
  TextStreamer,
  full,
} from "@huggingface/transformers";

// const MAX_NEW_TOKENS = 77; 
const MAX_NEW_TOKENS =128;  
// const MAX_NEW_TOKENS = 64;

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class AutomaticSpeechRecognitionPipeline {
  static model_id = "onnx-community/whisper-base";
  // static model_id = "onnx-community/whisper-large-v3-ONNX
  static tokenizer = null;
  static processor = null;
  static model = null;

  static async getInstance(progress_callback = null) {
    try {
      // Start loading message
      if (progress_callback) {
        progress_callback({ status: "loading", message: "Initializing models..." });
      }

      // Initialize tokenizer and processor first
      this.tokenizer ??= await AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback,
        quantized: false
      });

      this.processor ??= await AutoProcessor.from_pretrained(this.model_id, {
        progress_callback,
        quantized: false
      });

      // Initialize model with specific configuration
      if (!this.model) {
        this.model = await WhisperForConditionalGeneration.from_pretrained(
          this.model_id,
          {
            dtype: {
              encoder_model: "fp32",
              decoder_model_merged: "fp32"  // Using fp32 instead of q4 for better compatibility
            },
            device: "webgpu",
            backend: "auto",
            revision: "main",
            progress_callback,
            quantized: false,
            shardSize: "100MB",  // Smaller shard size for better memory management
            modelConfig: {
              use_cache: true,
              return_dict: true,
              output_attentions: false,
              output_hidden_states: false,
            }
          },
        );
      }

      const [tokenizer, processor, model] = await Promise.all([
        this.tokenizer,
        this.processor,
        this.model
      ]);

      // Signal completion
      if (progress_callback) {
        progress_callback({ status: "ready" });
      }

      return [tokenizer, processor, model];
    } catch (error) {
      console.error("Failed to initialize pipeline:", error);
      if (progress_callback) {
        progress_callback({ 
          status: "error", 
          error: "Failed to initialize models: " + error.message 
        });
      }
      throw error;
    }
  }
}

let processing = false;
let lastCompleteSent = 0; // Timestamp of last 'complete' sent
const COMPLETE_DEBOUNCE_MS =50; // 3 seconds

// Handle messages from the main thread
self.onmessage = async (e) => {
  const { type, data } = e.data;

  try {
    switch (type) {
      case 'load':
        // Initialize the pipeShe sells them for about five dollars. They're popular in foreign snacks, we thought they were gifts, and they're simple treats. (speaking in foreign language) - It's a long story. (speaking in foreign language) - It turns a simple idea to be steady in food meets. - So I don't? - Using just a set of dough. - I think they're expensive. - I think so. - It's the best. - It's the best. - It's the best.line
        await AutomaticSpeechRecognitionPipeline.getInstance((progress) => {
          self.postMessage(progress);
        });
        break;

      case 'generate':
        if (data?.audio) {
          await generate(data);
        }
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ 
      status: 'error', 
      error: error.message 
    });
  }
};

async function generate({ audio, language }) {
  if (processing) return;
  processing = true;

  try {
    // Tell the main thread we are starting
    self.postMessage({ status: "start" });

    // Retrieve the text-generation pipeline
    const [tokenizer, processor, model] = 
      await AutomaticSpeechRecognitionPipeline.getInstance();

    let startTime;
    let numTokens = 0;
    let tps;
    const token_callback_function = () => {
      startTime ??= performance.now();
      if (numTokens++ > 0) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
    };

    const callback_function = (output) => {
      self.postMessage({
        status: "update",
        output,
        tps,
        numTokens,
      });
    };

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function,
      token_callback_function,
    });

    const inputs = await processor(audio);
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      language,
      num_beams: 1,  // Reduce beam search complexity
      do_sample: false,
      temperature: .3,
      top_k: 20,
      // temperature: 1.0,
      // top_k: 50,
      use_cache: true,
      pad_token_id: tokenizer.pad_token_id,
      eos_token_id: tokenizer.eos_token_id,
      attention_mask: null  // Let the model handle attention mask
    });

    const decoded = await tokenizer.batch_decode(outputs, {
      skip_special_tokens: true,
      clean_up_tokenization_spaces: true
    });

    // Debounce: only send if 3s have passed since last sent
    const now = Date.now();
    if (now - lastCompleteSent >= COMPLETE_DEBOUNCE_MS) {
      self.postMessage({
        status: "complete",
        output: decoded,
      });
      lastCompleteSent = now;
    } else {
      // Optionally, you can log or ignore
      // console.log('Debounced complete event');
    }
  } catch (error) {
    console.error("Processing error:", error);
    self.postMessage({
      status: "error",
      error: "Failed to process audio: " + error.message
    });
  } finally {
    processing = false;
  }
}

async function initializeWebGPU() {
  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      throw new Error('No GPU adapter found');
    }

    // Configure device with appropriate limits and features
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: Math.min(512 * 1024 * 1024, adapter.limits.maxStorageBufferBindingSize),
        maxBufferSize: Math.min(512 * 1024 * 1024, adapter.limits.maxBufferSize),
        maxComputeWorkgroupStorageSize: 32768,
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupsPerDimension: 65535,
      },
      defaultQueue: {
        label: "Default"
      }
    });

    // Set up pipeline cache
    device.pushErrorScope('validation');
    device.pushErrorScope('internal');
    device.pushErrorScope('out-of-memory');

    return device;
  } catch (error) {
    console.error('GPU initialization failed:', error);
    throw error;
  }
}

async function load() {
  try {
    const device = await initializeWebGPU();
    
    // Initialize pipeline and load model
    const pipeline = new Pipeline(device);
    await pipeline.init();
    
    postMessage({ type: 'ready' });
    
    return pipeline;
  } catch (error) {
    console.error('Failed to initialize whisper pipeline:', error);
    postMessage({ 
      type: 'error', 
      error: 'Failed to initialize the speech recognition system: ' + error.message
    });
    throw error;
  }
}

let pipeline = null;
