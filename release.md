# Whispero v0.9.6 Release Notes

## 🚀 First Public Release

Welcome to the first public release of **Whispero** (v0.9.6)! This version brings a modern, privacy-focused, and efficient voice-to-text experience powered by Electron and WebGPU.

---

## ✨ Features

- **Voice to Text Dictation**
  - Fast, accurate transcription using Whisper models and WebGPU acceleration.
  - Offline, private, and secure—no cloud required.

- **Modern Electron UI**
  - Rounded window corners and shadow for a sleek, floating look.
  - Custom window controls (minimize, maximize/restore, close) with smooth maximize/restore behavior.
  - Always starts at a compact 510x310 size, centered on screen.
  - Responsive design with dark mode support.

- **Clipboard & Auto-Paste**
  - Automatic copying of transcribed text to clipboard.
  - Optional auto-paste to the active window.
  - Robust clipboard queue and retry logic for reliability.

- **Audio Visualizer**
  - Real-time waveform visualizer for microphone input.
  - Visual feedback for listening and processing states.

- **Language Selection**
  - Easily switch transcription language from the UI.

- **Debug Panel (Dev Mode)**
  - Window tracking, paste status, and diagnostics for development and troubleshooting.

- **Installer & Icon**
  - Crisp, multi-resolution app icon for Windows.
  - Custom installer with branding.

---

## 🛠 Technical Highlights

- Built with Electron, React, and Tailwind CSS.
- Uses WebGPU for accelerated inference.
- Transparent, frameless window with custom drag regions.
- Persistent window state (size/position) with safe defaults.
- Cross-platform clipboard and paste support.

---

## 📝 Known Issues & Notes

- Some UI elements may appear slightly different on Windows vs. macOS/Linux due to OS-level window rendering.
- Fullscreen mode is available as a separate action from maximize/restore.
- Please report bugs or feature requests via the project repository.

---

Thank you for trying Whispero! Your feedback is welcome as we continue to improve the app. 