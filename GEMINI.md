# LetterForge Pro - Context & Guidelines

LetterForge Pro is a specialized desktop application for SVG and 3D typography editing, built with Electron. It enables users to create, manipulate, and export letters and SVG assets for graphic design and 3D printing.

## 🏗 Architecture Overview

The project follows a standard Electron architecture with a clear separation between processes:

- **Main Process (`main.js`):** Handles application lifecycle, native window management, file system operations (loading fonts/SVGs, saving projects), auto-updates, and hosts the MCP server.
- **Preload Script (`preload.js`):** Exposes safe IPC channels to the renderer via `contextBridge`.
- **Renderer Process (`src/index.html` + `src/script/`):** A vanilla JavaScript application that manages the UI, 2D canvas editor, and 3D preview.
- **MCP Server (`mcp-server.js`):** A Model Context Protocol server that allows external AI clients to inspect and manipulate the canvas state programmatically.

### State Management
The application uses a central global state object `S` defined in `src/script/state.js`. 
- `S.letters`: Array of elements (text or SVG) currently on the canvas.
- `S.sel`: A `Set` of currently selected element IDs.
- `S.history`: Stores snapshots for Undo/Redo functionality.
- `saveState()`: Call this before any mutation to enable undo.
- `render()` and `upd()`: Trigger UI and canvas refreshes after state changes.

## 🛠 Technology Stack

- **Runtime:** Electron 29.x
- **2D Rendering:** HTML5 Canvas (Vanilla JS)
- **3D Rendering:** Three.js + `three-bvh-csg` for real-time preview.
- **3D Operations (CSG):** `@jscad/modeling` (OpenJSCAD) for generating watertight meshes.
- **Typography:** `opentype.js` for font parsing and path extraction.
- **AI Integration:** custom MCP implementation (Port 3100 by default).

## 📂 Directory Structure

- `src/script/2d/`: Canvas rendering, interaction, and geometry logic.
- `src/script/3d/`: 3D viewport, CSG operations (Union/Subtract), and export logic (STL/3MF).
- `src/script/mcp.js`: Handles incoming operations from the AI via the MCP server.
- `src/librerie/`: Local copies of major dependencies (Three.js, OpenJSCAD, etc.).
- `assets/`: App icons and static resources.

## 🚀 Key Commands

- `npm start`: Runs the app in development mode.
- `npm run build:win`: Packages the app for Windows.
- `npm run release`: Builds and publishes to GitHub (requires `GITHUB_TOKEN`).

## 🤖 AI Integration (MCP)

LetterForge Pro exposes tools to AI clients via MCP. The renderer syncs state to the MCP server every 500ms. AI agents can use tools like:
- `add_text`, `add_svg`: Create new elements.
- `modify_element`, `move_element`: Change properties or position.
- `get_canvas_state`: Inspect all elements and their bounding boxes.

## 📝 Development Conventions

1. **Global State Mutation:** Always wrap significant state changes with `saveState()` to preserve undo history.
2. **Vanilla JS:** The renderer is intentionally built without heavy frameworks (React/Vue). Keep logic modular in the `src/script/` directory.
3. **IPC Communication:** Use `window.electronAPI` for any operation requiring file system or native OS access.
4. **Coordinate System:** The canvas uses a standard 2D coordinate system where (0,0) is the top-left, but many operations center elements based on their bounding box (`bbox`).
5. **3D Export:** Ensure models are watertight (using OpenJSCAD logic) before exporting to STL or 3MF.
