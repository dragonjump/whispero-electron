# Whispero

**Version: v0.9.8**

Whispero is a modern, privacy-first, open source voice-to-text desktop application powered by Electron, React, and WebGPU. All processing is done locally on your device—no data ever leaves your computer.

## 🚀 Demo
`whispero-demo-video.mp4`

---

## 🚀 Features
- **Voice to Text Dictation**: Fast, accurate transcription using Whisper models and WebGPU acceleration.
- **Offline & Private**: No cloud, no analytics, no tracking. Everything stays on your PC.
- **Modern UI**: Rounded window corners, custom controls, dark mode, and responsive design.
- **Clipboard & Auto-Paste**: Automatic copying and optional pasting of transcribed text.
- **Audio Visualizer**: Real-time waveform for microphone input.
- **Language Selection**: Easily switch transcription language.
- **Debug Panel**: For development and troubleshooting (dev mode only).

---

## 🖥️ Installation

1. **Download** the latest release from the [Releases page](./release.md).
2. **Run the installer** for your platform (Windows, macOS, Linux).
3. **Launch Whispero**. The app will start in a compact, centered window.

> **Note:** No internet connection is required after installation. All AI models run locally.

---

## 📝 Usage
- Click the microphone button to start/stop listening.
- View real-time transcription and audio visualization.
- Transcribed text is automatically copied to your clipboard.
- Enable auto-paste to send text to the active window.
- Use the language selector to change transcription language.

---

## 🔒 Privacy & Terms
- **No data collection, no analytics, no cookies.**
- All processing is local and offline.
- See [privacy.md](./privacy.md), [terms.md](./terms.md), and [cookies.md](./cookies.md) for details.

---

## 🛠 Development
- Built with Electron, React, and Tailwind CSS.
- AI runs via WebGPU for fast, private inference.
- Open source: contributions and issues are welcome!

### Run from Source
```bash
# Clone the repo
$ git clone https://github.com/dragonjump/whispero-electron.git
$ cd whispero

# Install dependencies
$ npm install
# Start the app (dev mode)
$ npm run dev
 npm install electron-builder --save-dev
# Build and bundle the app  
$ npm run pacakge-win
```

---

## 📄 License
Whispero is open source, distributed under the [LICENSE](./LICENSE). Provided as-is, without warranty. See [terms.md](./terms.md).

---

## 🙏 Acknowledgements 
- [Electron](https://www.electronjs.org/)
- [Moonshine whisper](http://moonshine.web)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📣 Feedback & Support
For questions, issues, or contributions, please open an issue or pull request on the project repository. 