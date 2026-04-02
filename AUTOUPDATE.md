# Auto-Update Setup Guide

This guide explains how to configure and use the automatic update system in LetterForge Pro.

## Configuration

### 1. GitHub Repository Setup

Before the auto-update can work, you need to:

1. **Create a GitHub repository** (if you haven't already):
   ```bash
   git init
   git remote add origin https://github.com/YOUR_USERNAME/LetterForge-Desktop.git
   ```

2. **Update `package.json`** with your GitHub username:
   
   Find this section in `package.json`:
   ```json
   "publish": {
     "provider": "github",
     "owner": "YOUR_GITHUB_USERNAME",
     "repo": "LetterForge-Desktop",
     "private": false,
     "releaseType": "release"
   }
   ```
   
   Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

3. **Set GitHub Token (for publishing)**:
   
   To publish releases, you need a GitHub personal access token:
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Create a token with `repo` scope
   - Set environment variable before building:
     ```bash
     # Windows (PowerShell)
     $env:GH_TOKEN="your_token_here"
     
     # Windows (CMD)
     set GH_TOKEN=your_token_here
     
     # macOS/Linux
     export GH_TOKEN=your_token_here
     ```

### 2. Building for Auto-Update

Build your application with the appropriate command:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

The build process will:
- Create the installer/executable in `dist/`
- Generate `latest.yml` (or `latest-mac.yml` / `latest-linux.yml`) - **this is required for auto-update!**
- Both files need to be uploaded to GitHub

### 3. Publishing to GitHub

#### Option A: Manual Upload

1. Create a new release on GitHub
2. Upload the build artifacts from `dist/`:
   - The installer (`.exe`, `.dmg`, or `.AppImage`)
   - The `latest*.yml` file (metadata for auto-update)
   - `blockmap` file (for differential updates)
3. Mark the release as "Latest release" (important!)

#### Option B: Automatic Publish

If you configured the `GH_TOKEN` environment variable, electron-builder can publish automatically:

```bash
# Set token first
$env:GH_TOKEN="your_token_here"  # PowerShell

# Build and publish
npm run build:win
```

The files will be automatically uploaded to GitHub as a draft release.

## How Auto-Update Works

### In the Application

1. **Automatic Check**: The app checks for updates 5 seconds after launch (production mode only)

2. **Manual Check**: You can add a "Check for Updates" button in your UI that calls:
   ```javascript
   window.electronAPI.checkForUpdates()
   ```

3. **Status Updates**: The app receives update status via:
   ```javascript
   window.electronAPI.onUpdateStatus((status) => {
     // status: { status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' }
   })
   ```

4. **Download & Install**:
   ```javascript
   // Download update
   await window.electronAPI.downloadUpdate()
   
   // Install and restart
   await window.electronAPI.quitAndInstall()
   ```

### Update Flow

```
┌─────────────────┐
| Check for Update|
└────────┬────────┘
         │
    ┌────▼────┐
    │Available?│
    └────┬────┘
         │ Yes
    ┌────▼────────┐
    │ Download    │
    │ (shows % )  │
    └────┬────────┘
         │
    ┌────▼────────┐
    │ Downloaded  │
    │ Prompt user │
    └────┬────────┘
         │
    ┌────▼────────┐
    │ Quit &      │
    │ Install     │
    └─────────────┘
```

## Status Events

The `update-status` event sends these statuses:

| Status | Description | Data |
|--------|-------------|------|
| `checking` | Checking GitHub for new releases | - |
| `available` | New version found | `version`, `releaseNotes` |
| `not-available` | Already on latest version | `version` |
| `downloading` | Downloading update | `percent`, `bytesPerSecond`, `transferred`, `total` |
| `downloaded` | Update ready to install | `version` |
| `error` | Update failed | `error` message |

## Testing Auto-Update

### In Development Mode

Auto-update is **disabled** in development mode. The IPC handlers return:
```javascript
{ available: false, reason: 'dev-mode' }
```

### In Production Mode

To test without publishing to GitHub:

1. Build the app: `npm run build:win`
2. Install the built application
3. Create a new GitHub release with a higher version number
4. Run the installed app and wait 5 seconds (or trigger manual check)

## Troubleshooting

### Update not detected

- Ensure `latest.yml` is uploaded to GitHub release
- Check that the release is marked as "Latest release"
- Verify `package.json` has correct `owner` and `repo`
- Check console logs for errors

### Download fails

- Ensure GitHub token has proper permissions (if publishing automatically)
- Check network connectivity
- Verify release files are publicly accessible

### Common Errors

```
Error: Cannot find channel "latest.yml"
→ Upload the latest.yml file to GitHub release

Error: 404 Not Found
→ Check repo owner/name in package.json
→ Ensure release is public or token has access
```

## Security Notes

- Never commit `GH_TOKEN` to version control
- Use environment variables or secure vaults for tokens
- The token is only needed for publishing, not for end-users
- Auto-update uses HTTPS and verifies file integrity via blockmap

## Example UI Integration

Here's a simple example for adding update UI to your renderer:

```javascript
// Check for updates button
document.getElementById('check-update-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.checkForUpdates();
  console.log('Update check result:', result);
});

// Listen for update status
window.electronAPI.onUpdateStatus((status) => {
  console.log('Update status:', status);
  
  switch(status.status) {
    case 'available':
      if (confirm(`Update ${status.version} available! Download now?`)) {
        window.electronAPI.downloadUpdate();
      }
      break;
    case 'downloaded':
      if (confirm('Update downloaded! Restart to install?')) {
        window.electronAPI.quitAndInstall();
      }
      break;
    case 'error':
      alert('Update error: ' + status.error);
      break;
  }
});
```

## Next Steps

1. ✅ Update `package.json` with your GitHub username
2. ✅ Create GitHub repository
3. ✅ Build and test the application
4. ✅ Create first release on GitHub
5. ✅ Test auto-update by creating a second release with higher version
