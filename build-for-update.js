/**
 * Build script for LetterForge Pro
 * Creates portable executable with electron-builder (supports auto-update)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = '4.0.2';

console.log('🔨 Building LetterForge Pro v' + VERSION + ' with electron-builder...\n');

// Update version in package.json
console.log('📝 Updating version in package.json...');
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
packageJson.version = VERSION;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// Clean dist folder (keep assets)
console.log('\n📁 Cleaning dist folder...');
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

// Build with electron-builder portable
console.log('\n📦 Building portable executable...');
try {
  execSync('npx electron-builder --win portable --publish never', { 
    stdio: 'inherit', 
    cwd: __dirname,
    env: { ...process.env }
  });
} catch (error) {
  console.error('\n❌ Build failed!');
  console.error('\n--- SOLUZIONE ---');
  console.error('Il build richiede privilegi di amministratore.');
  console.error('Esegui questo comando da un terminale come Amministratore:');
  console.error('  npx electron-builder --win portable --publish never');
  process.exit(1);
}

console.log('\n✅ Build completed successfully!\n');
console.log('📁 Output files:');
console.log('   - dist/LetterForge Pro 4.0.2.exe (portable executable)');
console.log('   - dist/latest.yml (auto-update metadata)');
console.log('   - dist/latest.json (auto-update metadata)\n');
console.log('🚀 Run "node publish-github.js" to publish to GitHub Releases\n');
