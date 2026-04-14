/**
 * Build and Publish script for LetterForge Pro
 * Creates installer with electron-builder and publishes to GitHub Releases
 * 
 * Usage:
 *   set GITHUB_TOKEN=your_token_here && node build-and-publish.js
 *   or
 *   export GITHUB_TOKEN=your_token_here && node build-and-publish.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

console.log('🚀 LetterForge Pro - Build & Publish');
console.log('═══════════════════════════════════════');
console.log(`📦 Version: ${VERSION}`);
console.log('');

// Check GitHub token
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('❌ Errore: Imposta la variabile d\'ambiente GITHUB_TOKEN');
  console.error('');
  console.error('   Windows (PowerShell):');
  console.error('     $env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXX"');
  console.error('');
  console.error('   Windows (CMD):');
  console.error('     set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX');
  console.error('');
  console.error('   macOS/Linux:');
  console.error('     export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX');
  console.error('');
  process.exit(1);
}

// Clean dist folder (keep assets)
console.log('📁 Pulizia cartella dist...');
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  const files = fs.readdirSync(distPath);
  files.forEach(file => {
    if (file !== 'assets') {
      const filePath = path.join(distPath, file);
      try {
        fs.statSync(filePath).isDirectory()
          ? fs.rmSync(filePath, { recursive: true, force: true })
          : fs.unlinkSync(filePath);
      } catch(e) {}
    }
  });
}

// Build with electron-builder
console.log('');
console.log('📦 Building installer con electron-builder...');
console.log('');

try {
  // Set environment for publishing
  const env = { ...process.env, GH_TOKEN: GITHUB_TOKEN };
  
  execSync('npx electron-builder --win --publish always', {
    stdio: 'inherit',
    cwd: __dirname,
    env: env
  });
} catch (error) {
  console.error('');
  console.error('❌ Build fallito!');
  console.error('');
  console.error('Possibili soluzioni:');
  console.error('  1. Verifica di avere Node.js 18+ installato');
  console.error('  2. Esegui: npm install');
  console.error('  3. Verifica che il token GitHub sia valido');
  console.error('  4. Controlla di avere permessi di scrittura sul repo GitHub');
  process.exit(1);
}

console.log('');
console.log('═══════════════════════════════════════');
console.log('✅ Build e publish completati con successo!');
console.log('');
console.log('📁 File generati:');
console.log(`   - dist/LetterForge Pro ${VERSION}.exe (installer NSIS)`);
console.log('   - dist/latest.yml (auto-update metadata)');
console.log('   - dist/blockmap (differential update)');
console.log('');
console.log('🌐 Verifica il release su:');
console.log(`   https://github.com/S1mone01/LetterForge/releases/tag/v${VERSION}`);
console.log('');
console.log('💡 L\'auto-update è ora attivo per gli utenti!');
console.log('');
