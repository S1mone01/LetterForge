# LetterForge Pro - Gemini Project Context

## Project Overview
**LetterForge Pro** is a high-performance, desktop-based typography and SVG editor built with **Electron**. It enables users to create, manipulate, and export 2D vector typography and 3D printable models (STL/3MF).

### Key Features
- **2D Canvas Editor:** Advanced typography manipulation with support for `.ttf`, `.otf`, `.woff`, and `.woff2` fonts.
- **SVG Library:** Import and manage custom SVG assets.
- **3D Preview Engine:** Real-time 3D rendering with Boolean operations (Union, Subtract) for creating watertight meshes.
- **Model Context Protocol (MCP) Integration:** Built-in MCP server that exposes canvas manipulation tools to external AI clients.
- **Exports:** High-quality SVG for 2D and STL/3MF for 3D printing (optimized for Bambu Studio).

### Core Technologies
- **Runtime:** Electron 29.x
- **3D Rendering:** Three.js
- **3D/CSG Engine:** OpenJSCAD (@jscad/modeling)
- **Font Parsing:** opentype.js
- **MCP Server:** Custom Node.js implementation on port 3100.
- **State Management:** Centralized global state object `S` in the renderer process.

---

## Project Structure
- `main.js`: Electron main process. Handles application lifecycle, IPC communication, auto-updates, and user data migration.
- `preload.js`: Security layer bridging the main and renderer processes using `contextBridge`.
- `mcp-server.js`: Implements the MCP server, exposing tools like `add_text`, `modify_element`, and `get_canvas_state`.
- `src/`:
  - `index.html`: Main UI layout and entry point for the renderer.
  - `script/script.js`: Core application logic, canvas management, and state handling (8,000+ lines).
  - `script/OpenJSCAD.js`: Integration logic for the 3D CSG engine.
  - `librerie/`: Local copies of critical dependencies (Three.js, OrbitControls, etc.).
- `assets/`: App icons and static resources.

---

## Building and Running

### Development
```bash
# Install dependencies
npm install

# Start the application in development mode
npm start
```

### Production Builds
```bash
# Build for Windows (.exe)
npm run build:win

# Build for macOS (.dmg)
npm run build:mac

# Build for Linux (.AppImage)
npm run build:linux
```

### Build & Publish (GitHub Release)
To create a release and publish it to GitHub (triggering auto-updates for users), use the following script. **A `GITHUB_TOKEN` is required.**

```bash
# Windows (PowerShell)
$env:GITHUB_TOKEN="your_ghp_token"
npm run release

# Windows (CMD)
set GITHUB_TOKEN=your_ghp_token
npm run release

# macOS / Linux
export GITHUB_TOKEN=your_ghp_token
npm run release
```
The `release` script (runs `build-and-publish.js`) performs:
1. Cleans the `dist/` directory.
2. Uses `electron-builder` to build the Windows installer (`--win`).
3. Publishes the assets and metadata (`latest.yml`) to the configured GitHub repository.

---

## Development Conventions

### State Management
The renderer process uses a global object `S` (defined in `src/script/script.js`) to track the application state, including:
- `letters`: Array of elements currently on the canvas.
- `sel`: A `Set` of selected element IDs.
- `zoom`, `canvasW`, `canvasH`: Viewport and canvas dimensions.
- `history`: Undo/Redo stack.

### Communication (IPC)
Communication between the main and renderer processes is strictly handled via `ipcMain` and `ipcRenderer`, exposed through `window.electronAPI` in the preload script.

### Data Storage
User fonts and SVGs are stored in the application's `userData` directory to persist across updates:
- Windows: `%APPDATA%/LetterForge Pro/`
- macOS: `~/Library/Application Support/LetterForge Pro/`

### MCP Integration
The MCP server allows for "AI-driven design." It receives JSON-RPC commands and emits events that the main process forwards to the renderer via IPC to perform actions on the canvas.

---

## Roadmap & TODOs
- [ ] Refactor `src/script/script.js` into smaller, modular components.
- [ ] Implement advanced 3D textures and materials.
- [ ] Expand the MCP toolset for complex multi-step design tasks.
