# LetterForge Pro – Desktop

## Project Overview

**LetterForge Pro** is a desktop SVG typography editor built with **Electron**. It allows users to create, manipulate, and export custom letter designs and logos using custom fonts and SVG assets.

### Core Features
- **Font Management**: Load `.ttf`, `.otf`, `.woff`, `.woff2` fonts from folder or drag-and-drop
- **SVG Library**: Import and use SVG files as design elements
- **Canvas Editor**: Visual editor with transform controls (position, rotation, scale, skew)
- **Multi-select**: Select and manipulate multiple elements simultaneously
- **Snap-to-Guides**: Visual alignment assistance when positioning elements
- **Export**: Save designs as SVG files
- **Undo/Redo**: Full history support for all operations
- **Save/Load Project**: Save and restore complete workspace state (elements, canvas settings, SVG library)
- **Splash Screen**: Loading screen with progress indicator on app startup

### Architecture

```
LetterForge-Desktop/
├── main.js          # Electron main process (window creation, IPC handlers, file loading, migration)
├── preload.js       # Electron preload script (contextBridge for IPC)
├── package.json     # Project config & electron-builder settings
├── src/
│   ├── index.html   # Renderer process (UI + all frontend logic)
│   └── splash.html  # Splash screen shown during app loading
├── font/            # Development-only fonts directory (NOT bundled)
├── svg/             # Development-only SVG assets directory (NOT bundled)
├── assets/          # App icons for build (icon.ico, icon.icns, icon.png)
└── dist/            # Build output directory
```

**Important**: In production, user fonts and SVGs are stored in the Electron user data directory (`%APPDATA%/LetterForge Pro/` on Windows), which persists across app updates. The `font/` and `svg/` folders in the project root are only used during development.

### Technologies
- **Runtime**: Electron 29.x
- **Font Parsing**: opentype.js (loaded via CDN)
- **Build Tool**: electron-builder 24.x
- **Styling**: Custom CSS with CSS variables (no framework)
- **State Management**: Custom vanilla JS state object (`S`)

## Building and Running

### Prerequisites
- **Node.js** 18+ (https://nodejs.org)
- **npm** (included with Node.js)

### Installation
```bash
npm install
```

### Development
```bash
npm start
```
Launches the app in development mode with hot reload disabled (file-based).

### Production Builds

| Platform | Command | Output |
|----------|---------|--------|
| Windows | `npm run build:win` | `dist/` (NSIS installer .exe) |
| macOS | `npm run build:mac` | `dist/` (.dmg) |
| Linux | `npm run build:linux` | `dist/` (.AppImage) |

### Build Configuration
Builds are configured in `package.json` under the `"build"` key:
- **App ID**: `com.letterforge.pro`
- **No Extra Files**: User fonts and SVGs are NOT bundled (stored in user data directory instead)
- **NSIS Installer**: Supports Italian (1040) and English languages, allows custom install directory

## Development Conventions

### Code Style
- **Vanilla JavaScript** (no TypeScript, no bundler)
- **Inline CSS** within `index.html` (no external stylesheets)
- **Global state object** `S` for all application state
- **Function naming**: Hungarian-style prefixes for DOM manipulation (`apX`, `apRot`, `apScale`)

### Key Patterns

#### IPC Communication
```javascript
// preload.js - Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  onFontsLoaded: (callback) => ipcRenderer.on('fonts-loaded', ...),
  onSVGsLoaded: (callback) => ipcRenderer.on('svgs-loaded', ...),
  saveSVG: (svgString) => ipcRenderer.invoke('save-svg', svgString),
  saveProjectFile: (content) => ipcRenderer.invoke('save-project', content),
  loadProjectFile: () => ipcRenderer.invoke('load-project')
});
```

#### Auto-Load Resources
Fonts and SVGs are automatically loaded from directories on app startup:
- `font/` directory → sends `fonts-loaded` event
- `svg/` directory → sends `svgs-loaded` event

#### State Management
All state is centralized in the `S` object:
```javascript
const S = {
  letters: [],         // Canvas elements (text or SVG)
  sel: new Set(),      // Selected element IDs
  fonts: {},           // Font name → CSS font-family
  openFonts: {},       // Font name → opentype.js parsed font
  svgs: [],            // SVG library
  viewMode: 'fonts',   // 'fonts' or 'svgs'
  zoom: 1,
  canvasW: 800,        // Canvas width
  canvasH: 500,        // Canvas height
  gridOn: true,        // Grid visibility
  snapEnabled: true,   // Snap-to-guide enabled
  // ...
};
```

#### Project Save/Load Format
Projects are saved as JSON with this structure:
```json
{
  "version": "1.0",
  "canvas": {
    "width": 800,
    "height": 500,
    "zoom": 1,
    "gridOn": true
  },
  "letters": [...],    // All canvas elements with transforms
  "svgs": [...],       // SVG library
  "fontNames": [...],  // Names of loaded fonts (files not embedded)
  "savedAt": "ISO timestamp"
}
```

### File Operations
- **Font files**: Read as binary, converted to base64, embedded as `@font-face`
- **SVG files**: Read as UTF-8 text, stored in library for insertion
- **Export**: Uses `dialog.showSaveDialog` for user-selected save location
- **Project Save**: Saves workspace state as JSON (`.json`) with canvas settings, elements, and SVG library
- **Project Load**: Restores complete workspace from saved JSON file
- **User Data Storage**: Fonts and SVGs are stored in Electron's user data directory (`%APPDATA%/LetterForge Pro/` on Windows), which persists across app updates
- **Migration**: On first launch after an update, files from the old location (next to executable) are automatically migrated to the user data directory

### UI Conventions
- **Dark theme** with accent colors (`#c8ff00` lime, `#ff6b35` orange)
- **Fonts**: 'DM Mono' (UI), 'Syne' (headings)
- **No native menus**: Menu bar hidden (`win.setMenuBarVisibility(false)`)
- **Custom scrollbars**: Styled via `::-webkit-scrollbar`

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Space+Drag` | Pan canvas |
| `Shift+Click` | Multi-select |
| `Y` | Toggle snap |
| `Enter` (in text input) | Add text |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate selection |
| `Delete/Backspace` | Delete selected |
| `Ctrl++/-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Arrow keys` | Move selected (1px, 10px with Shift) |

## Testing

No formal test suite exists. Manual testing is performed by:
1. Running `npm start`
2. Testing font/SVG import
3. Testing canvas manipulation
4. Testing export functionality

## Asset Guidelines

### App Icons (optional, in `assets/`)
| Platform | File | Recommended Size |
|----------|------|------------------|
| Windows | `icon.ico` | 256×256 |
| macOS | `icon.icns` | — |
| Linux | `icon.png` | 512×512 |

If icons are missing, remove the `"icon"` field from `package.json` to use Electron's default.

### User Fonts
Place `.ttf`, `.otf`, `.woff`, `.woff2` files in:
- **Development**: `font/` in project root (auto-loaded)
- **Production**: Automatically managed in user data directory (`%APPDATA%/LetterForge Pro/font/` on Windows)
  - Files are migrated from old location on first launch after update
  - Users can manage fonts through the app's font loading features

### User SVGs
Place `.svg` files in:
- **Development**: `svg/` in project root (created automatically, auto-loaded)
- **Production**: Automatically managed in user data directory (`%APPDATA%/LetterForge Pro/svg/` on Windows)
  - Files are migrated from old location on first launch after update
  - Users can manage SVGs through the app's SVG import features
