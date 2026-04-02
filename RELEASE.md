# LetterForge Pro - Build & Release Guide

## Prerequisites

1. **Node.js**: Version 18 or higher (https://nodejs.org)
2. **GitHub Token**: Personal access token with `repo` scope
   - Create at: https://github.com/settings/tokens
   - Select scope: `repo` (full control of private repositories)
   - Copy the token (starts with `ghp_`)

---

## Quick Release (Recommended)

The easiest way to build and publish a release:

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

This single command:
- ✅ Builds the NSIS installer for Windows
- ✅ Generates auto-update metadata
- ✅ Publishes to GitHub Releases
- ✅ Tags the release automatically

---

## Manual Build & Publish

### Step 1: Update Version

Before releasing, update the version in `package.json`:

```json
{
  "name": "letterforge-pro",
  "version": "4.0.3"  // ← Update this
}
```

Also update the version displayed in the UI (`src/index.html`):

```html
<span id="app-version">v4.0.3</span>
```

### Step 2: Build the Application

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

This creates the installer in the `dist/` folder:
- `LetterForge Pro Setup 4.0.3.exe` (Windows NSIS installer)
- `latest.yml` (auto-update metadata)
- `blockmap` (differential update data)

### Step 3: Publish to GitHub

#### Option A: Automatic Publish

```powershell
# Set token
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"

# Publish
node publish-github.js
```

#### Option B: Manual Upload

1. Go to: https://github.com/S1mone01/LetterForge/releases/new
2. Create a new tag: `v4.0.3`
3. Upload files from `dist/`:
   - `LetterForge Pro Setup 4.0.3.exe`
   - `latest.yml`
   - `blockmap`
4. Check ✓ "Set as the latest release"
5. Click "Publish release"

---

## Build Scripts

### build-and-publish.js

Unified script that builds and publishes in one step:

```bash
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
npm run release
```

**What it does**:
1. Reads version from `package.json`
2. Validates GitHub token
3. Cleans the `dist/` folder
4. Runs `electron-builder` with publish
5. Uploads everything to GitHub

### publish-github.js

Manual publish script (use after building):

```bash
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
node publish-github.js
```

**What it does**:
1. Reads version from `package.json`
2. Checks for built files in `dist/`
3. Creates/updates GitHub release
4. Uploads installer and metadata files

---

## Output Files

After a successful build, the `dist/` folder contains:

| File | Description | Required for Auto-Update |
|------|-------------|-------------------------|
| `LetterForge Pro Setup 4.0.3.exe` | NSIS installer for Windows | ✅ Yes |
| `latest.yml` | Update metadata (version, files, hash) | ✅ Yes |
| `blockmap` | Differential update data | ✅ Yes (faster updates) |

---

## GitHub Release Structure

Each release on GitHub should have:

### Release Tag
```
v4.0.3
```

### Release Title
```
LetterForge Pro 4.0.3
```

### Release Description
```markdown
## LetterForge Pro v4.0.3

### Changelog
- Build per Windows x64
- Supporto font .ttf, .otf, .woff, .woff2
- Importazione e manipolazione SVG
- Esportazione progetti come SVG
- Auto-update automatico integrato

### Installazione
1. Scarica `LetterForge Pro Setup 4.0.3.exe`
2. Esegui l'installer
3. L'aggiornamento sarà automatico per le versioni future
```

### Assets (uploaded files)
- `LetterForge Pro Setup 4.0.3.exe`
- `latest.yml`
- `blockmap`

---

## Auto-Update Flow

### For Users

1. User opens LetterForge Pro
2. App automatically checks for updates (3 seconds after launch)
3. If update available, notification appears in top-left corner
4. User clicks "Scarica e installa"
5. Download progress is shown
6. After download, user clicks "Apri release"
7. User downloads and runs the new installer
8. New version is installed

### For Developers

```
Update available on GitHub
        ↓
User opens app → Auto-check (3s delay)
        ↓
Notification panel appears
        ↓
User clicks "Scarica"
        ↓
Download from GitHub Releases
        ↓
User prompted to open release page
        ↓
User downloads and runs installer
        ↓
New version installed ✓
```

---

## Testing

### Development Mode

Auto-update is **disabled** in development mode (`npm start`).

Users will see: "Funzione disponibile solo in produzione"

### Production Mode

To test the complete flow:

1. **Build**: `npm run build:win`
2. **Install**: Run the generated `.exe` installer
3. **Publish**: Create a new release with higher version
4. **Test**: Open installed app and wait for auto-check

---

## Troubleshooting

### Build fails with permission error

**Solution**: Run as administrator or check file permissions

```powershell
# Run PowerShell as Administrator
npm run build:win
```

### Publish fails with 404 error

**Possible causes**:
- Invalid GitHub token
- Wrong repository name in `package.json`
- Token doesn't have `repo` scope

**Solution**:
1. Verify token: https://github.com/settings/tokens
2. Check `package.json` has correct `owner` and `repo`
3. Ensure token has `repo` scope

### Auto-update doesn't detect new version

**Check**:
1. ✓ `latest.yml` is uploaded to GitHub release
2. ✓ Release is marked as "Latest release"
3. ✓ Version in `package.json` is higher than current
4. ✓ Release is public (not draft)

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub personal access token | For publishing |
| `GH_TOKEN` | Alternative name for GITHUB_TOKEN | For publishing |

### Setting Environment Variables

**Windows PowerShell**:
```powershell
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
```

**Windows CMD**:
```cmd
set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
```

**macOS/Linux**:
```bash
export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
```

---

## Best Practices

### Before Release Checklist

- [ ] Update version in `package.json`
- [ ] Update version in `src/index.html` (if displayed)
- [ ] Test all features locally
- [ ] Commit changes to Git
- [ ] Push to GitHub
- [ ] Set `GITHUB_TOKEN` environment variable
- [ ] Run `npm run release`
- [ ] Verify release on GitHub
- [ ] Test auto-update from previous version

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., `4.0.3`)
- Increment **MAJOR** for breaking changes
- Increment **MINOR** for new features
- Increment **PATCH** for bug fixes

### Security

- ❌ Never commit `GITHUB_TOKEN` to version control
- ✅ Use environment variables
- ✅ Store tokens in secure vault (e.g., GitHub Secrets, Azure Key Vault)
- ✅ Rotate tokens periodically

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run build:win` | Build Windows installer |
| `npm run build:mac` | Build macOS DMG |
| `npm run build:linux` | Build Linux AppImage |
| `npm run release` | Build and publish (recommended) |
| `node publish-github.js` | Publish existing build |

---

## Additional Resources

- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)
- [Semantic Versioning](https://semver.org/)
