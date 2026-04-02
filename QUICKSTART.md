# LetterForge Pro - Auto-Update Quick Reference

## 🚀 Quick Start (3 Steps)

### 1. Update Version
Edit `package.json`:
```json
{ "version": "4.0.3" }
```

### 2. Set GitHub Token
```powershell
$env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"
```

### 3. Build & Publish
```powershell
npm run release
```

**Done!** ✅ The app will auto-update for all users.

---

## 📦 What Gets Published

| File | Purpose |
|------|---------|
| `LetterForge Pro Setup 4.0.3.exe` | Installer for users |
| `latest.yml` | Auto-update metadata |
| `blockmap` | Faster differential updates |

---

## 🔧 Common Commands

```bash
# Test build (no publish)
npm run build:win

# Build and publish (recommended)
npm run release

# Manual publish
node publish-github.js
```

---

## 👤 User Experience

1. User opens app
2. Auto-check after 3 seconds
3. Notification appears if update available
4. User clicks "Scarica e installa"
5. Download progress shown
6. User downloads new installer
7. Installs new version

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails | Run as Administrator |
| 404 Error | Check GITHUB_TOKEN and repo name |
| No update detected | Verify `latest.yml` is uploaded |
| Download fails | Check release is public |

---

## 🔐 Security

- ❌ Never commit `GITHUB_TOKEN`
- ✅ Use environment variables
- ✅ Token only needed for publishing
- ✅ Users download from GitHub (trusted)

---

## 📝 Checklist Before Release

- [ ] Version updated in `package.json`
- [ ] Version updated in `src/index.html`
- [ ] Features tested locally
- [ ] Changes committed to Git
- [ ] `GITHUB_TOKEN` set
- [ ] Run `npm run release`
- [ ] Verify release on GitHub

---

## 📚 Full Documentation

- `AUTOUPDATE.md` - Auto-update configuration
- `RELEASE.md` - Complete release guide
- `README.md` - General project info

---

## 💡 Pro Tips

1. **Test in production**: Always test the installed app, not just `npm start`
2. **Increment versions**: Use semantic versioning (MAJOR.MINOR.PATCH)
3. **Check logs**: Use DevTools Console for debugging
4. **Keep token safe**: Store in secure vault, never in code

---

**Need help?** Check the full documentation or open an issue on GitHub.
