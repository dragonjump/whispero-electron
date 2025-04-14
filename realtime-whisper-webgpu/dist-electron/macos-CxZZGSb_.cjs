"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("node:path");
const node_util = require("node:util");
const childProcess = require("node:child_process");
const node_url = require("node:url");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const __dirname$1 = path.dirname(node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("macos-CxZZGSb_.cjs", document.baseURI).href));
const execFile = node_util.promisify(childProcess.execFile);
const binary = path.join(__dirname$1, "../main");
const parseMac = (stdout) => {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    console.error(error);
    throw new Error("Error parsing window data");
  }
};
const getArguments = (options) => {
  if (!options) {
    return [];
  }
  const arguments_ = [];
  if (options.accessibilityPermission === false) {
    arguments_.push("--no-accessibility-permission");
  }
  if (options.screenRecordingPermission === false) {
    arguments_.push("--no-screen-recording-permission");
  }
  return arguments_;
};
async function activeWindow(options) {
  const { stdout } = await execFile(binary, getArguments(options));
  return parseMac(stdout);
}
async function openWindows(options) {
  const { stdout } = await execFile(binary, [...getArguments(options), "--open-windows-list"]);
  return parseMac(stdout);
}
exports.activeWindow = activeWindow;
exports.openWindows = openWindows;
