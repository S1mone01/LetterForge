# LetterForge Pro - Auto-Update Guide

This guide explains how to configure, build, and publish updates for LetterForge Pro.

## Quick Start

### Build and Publish (Recommended)

```powershell
# Windows (PowerShell)
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
npm run release

# Windows (CMD)
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npm run release

# macOS/Linux
export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
npm run release
```

This single command will:
1. Build the NSIS installer for Windows
2. Generate auto-update metadata (`latest.yml`, `blockmap`)
3. Publish everything to GitHub Releases automatically

---

## Configuration

### 1. GitHub Repository Setup

The auto-update is configured to use GitHub Releases. Ensure:

1. **Repository exists**: `https://github.com/S1mone01/LetterForge`
2. **GitHub Token**: Create a personal access token with `repo` scope
   - Go to: GitHub → Settings → Developer settings → Personal access tokens
   - Create token with `repo` scope (full control of private repositories)

### 2. Package.json Configuration

The build configuration is in `package.json`:

```json
{
  "version": "4.0.2",
  "build": {
    "appId": "com.letterforge.pro",
    "publish": {
      "provider": "github",
      "owner": "S1mone01",
      "repo": "LetterForge",
      "releaseType": "release"
    }
  }
}
```

**Important**: Update the `version` field in `package.json` before each release!

---

## Build Process

### What Gets Built

When you run `npm run release` or `npm run build:win`, electron-builder creates:

| File | Description |
|------|-------------|
| `LetterForge Pro Setup 4.0.2.exe` | NSIS installer for Windows |
| `latest.yml` | Auto-update metadata (YAML format) |
| `blockmap` | Differential update data (for faster updates) |

### Build Commands

```bash
# Build only (no publish)
npm run build:win

# Build and publish to GitHub (recommended)
npm run release
```

---

## Publishing to GitHub

### Option 1: Automatic Publish (Recommended)

Using `npm run release` with `GITHUB_TOKEN` environment variable:

```powershell
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
npm run release
```

This automatically:
- Creates a new release on GitHub (tagged as `v4.0.2`)
- Uploads the installer executable
- Uploads `latest.yml` and `blockmap` files
- Marks the release as the latest

### Option 2: Manual Upload

If you prefer manual control:

1. **Build the app**:
   ```bash
   npm run build:win
   ```

2. **Upload to GitHub Releases**:
   - Go to: `https://github.com/S1mone01/LetterForge/releases/new`
   - Create a new tag: `v4.0.2`
   - Upload these files from `dist/`:
     - `LetterForge Pro Setup 4.0.2.exe`
     - `latest.yml`
     - `blockmap`
   - Check "Set as the latest release"
   - Click "Publish release"

### Option 3: Using publish-github.js Script

```powershell
# Build first
npm run build:win

# Then publish
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
node publish-github.js
```

---

## How Auto-Update Works

### In the Application

1. **Automatic Check**: The app checks for updates 3 seconds after launch (production mode only)

2. **Manual Check**: Users can click the "Aggiornamenti" button in the header

3. **Update Notification**: When an update is available, a panel appears in the top-left corner showing:
   - New version number
   - Download progress
   - Install button

4. **Download & Install**:
   - User clicks "Scarica e installa"
   - Download progress is shown
   - After download, user is prompted to open the release page
   - User downloads and runs the new installer

### Update Flow

```
┌──────────────────────┐
│ App starts (3s delay)│
└──────────┬───────────┘
           │
    ┌──────▼──────┐
    │ Check GitHub│
    └──────┬──────┘
           │
    ┌──────▼──────────┐
    │ Update Available?│
    └──────┬──────────┘
           │ Yes
    ┌──────▼────────┐
    │ Show Notify   │
    │ (top-left)    │
    └──────┬────────┘
           │
    ┌──────▼────────┐
    │ User clicks   │
    │ "Scarica"     │
    └──────┬────────┘
           │
    ┌──────▼────────┐
    │ Download      │
    │ (shows %)     │
    └──────┬────────┘
           │
    ┌──────▼─────────┐
    │ Show "Apri    │
    │ release" btn   │
    └──────┬─────────┘
           │
    ┌──────▼──────────┐
    │ User downloads  │
    │ and runs new    │
    │ installer       │
    └─────────────────┘
```

---

## Status Events

The app receives these update statuses via IPC:

| Status | Description | Data |
|--------|-------------|------|
| `checking` | Checking GitHub for new releases | - |
| `available` | New version found | `version`, `releaseNotes` |
| `not-available` | Already on latest version | `version` |
| `downloading` | Downloading update | `percent`, `bytesPerSecond`, `transferred`, `total` |
| `downloaded` | Update downloaded | `version` |
| `error` | Update failed | `error` message |

---

## Testing Auto-Update

### In Development Mode

Auto-update is **disabled** in development mode. When running `npm start`:
- The "Aggiornamenti" button will show "Funzione disponibile solo in produzione"
- IPC handlers return `{ available: false, reason: 'dev-mode' }`

### In Production Mode

To test the auto-update flow:

1. **Build the app**:
   ```bash
   npm run build:win
   ```

2. **Install the built application**:
   - Run `dist/LetterForge Pro Setup 4.0.2.exe`
   - Install to default location

3. **Create a new release**:
   - Update version in `package.json` (e.g., `4.0.3`)
   - Build and publish: `npm run release`

4. **Test the update**:
   - Run the installed app
   - Wait 3 seconds (automatic check) OR click "Aggiornamenti" button
   - Verify the notification appears

---

## Troubleshooting

### Update not detected

**Problem**: App doesn't detect the new release

**Solutions**:
1. Ensure `latest.yml` is uploaded to the GitHub release
2. Check that the release is marked as "Latest release"
3. Verify `package.json` has correct `owner` and `repo`
4. Check console logs (DevTools → Console) for errors

### Download fails

**Problem**: Update download fails

**Solutions**:
1. Verify GitHub token has `repo` scope
2. Check network connectivity
3. Ensure release files are publicly accessible
4. Check that all required files are uploaded (`.exe`, `latest.yml`, `blockmap`)

### Common Errors

```
Error: Cannot find channel "latest.yml"
→ Upload the latest.yml file to the GitHub release
→ Ensure the release is tagged correctly (e.g., v4.0.2)

Error: 404 Not Found
→ Check repo owner/name in package.json
→ Ensure GitHub token is valid and has repo access
→ Verify the release exists and is public

Error: Cannot resolve latest.yml
→ Make sure latest.yml is uploaded as a release asset
→ Check the file wasn't corrupted during upload
```

### Build fails

**Problem**: `npm run build:win` fails

**Solutions**:
1. Clean node_modules: `rm -rf node_modules && npm install`
2. Check Node.js version: `node --version` (needs 18+)
3. Verify all dependencies: `npm install`
4. Run as administrator if permission errors occur

---

## Security Notes

- **Never commit `GITHUB_TOKEN`** to version control
- Use environment variables or secure vaults for tokens
- The token is only needed for publishing, not for end-users
- Auto-update uses HTTPS and verifies file integrity via `blockmap`
- Users download directly from GitHub Releases (trusted source)

---

## Version Management

### Before Each Release

1. Update version in `package.json`:
   ```json
   {
     "version": "4.0.3"
   }
   ```

2. Update version in `src/index.html` (if displayed in UI):
   ```html
   <span id="app-version">v4.0.3</span>
   ```

3. Commit the changes:
   ```bash
   git add package.json src/index.html
   git commit -m "chore: bump version to 4.0.3"
   git push
   ```

4. Build and publish:
   ```bash
   npm run release
   ```

### Semantic Versioning

LetterForge Pro follows semantic versioning:
- **MAJOR.MINOR.PATCH** (e.g., 4.0.2)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes and minor improvements

---

## File Structure

```
LetterForge-Desktop/
├── package.json           # Version & build config
├── main.js                # Auto-update IPC handlers
├── build-and-publish.js   # Unified build script
├── publish-github.js      # Manual publish script
├── dist/                  # Build output
│   ├── LetterForge Pro Setup 4.0.2.exe
│   ├── latest.yml         # Auto-update metadata
│   └── blockmap           # Differential update data
└── src/
    └── index.html         # UI with update button
```

---

## Example Release Workflow

### Complete Release Process

```bash
# 1. Update version in package.json
# Edit package.json: "version": "4.0.3"

# 2. Commit changes
git add package.json
git commit -m "chore: release v4.0.3"
git push

# 3. Set GitHub token
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"  # PowerShell

# 4. Build and publish
npm run release

# 5. Verify release
# Visit: https://github.com/S1mone01/LetterForge/releases/tag/v4.0.3
```

---

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/S1mone01/LetterForge/issues)
- Review console logs for error messages
- Verify all configuration files are correct
