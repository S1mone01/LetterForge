const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'S1mone01';
const REPO = 'LetterForge';

// Read version from package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

const TAG = `v${VERSION}`;

// electron-builder NSIS creates: "LetterForge Pro Setup 4.0.2.exe"
const EXE_NAME = `LetterForge Pro Setup ${VERSION}.exe`;
const EXE_PATH = path.join(__dirname, 'dist', EXE_NAME);
const LATEST_YML_PATH = path.join(__dirname, 'dist', 'latest.yml');
const BLOCKMAP_PATH = path.join(__dirname, 'dist', 'blockmap');

if (!GITHUB_TOKEN) {
  console.error('❌ Errore: Imposta la variabile d\'ambiente GITHUB_TOKEN');
  console.error('   Usage: set GITHUB_TOKEN=your_token_here && node publish-github.js');
  process.exit(1);
}

if (!fs.existsSync(EXE_PATH)) {
  console.error('❌ Errore: File EXE non trovato:', EXE_PATH);
  console.error('   Esegui prima: npm run build:win oppure node build-and-publish.js');
  console.error('');
  console.error('   File attesi nella cartella dist:');
  console.error('   - LetterForge Pro Setup ' + VERSION + '.exe');
  console.error('   - latest.yml');
  console.error('   - blockmap');
  process.exit(1);
}

function apiRequest(method, endpoint, data, isJson = true) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}${endpoint}`;
    const options = {
      method,
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}${endpoint}`,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LetterForge-Publisher'
      }
    };

    if (isJson && data) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(isJson && body ? JSON.parse(body) : body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(isJson ? JSON.stringify(data) : data);
    req.end();
  });
}

async function publish() {
  console.log('🚀 Pubblicazione su GitHub...\n');

  try {
    // 1. Check if release exists
    console.log('📋 Controllo se il release esiste già...');
    let release;
    try {
      release = await apiRequest('GET', `/releases/tags/${TAG}`);
      console.log(`⚠️  Release ${TAG} già esiste, la aggiorno...`);
      release = await apiRequest('PATCH', `/releases/${release.id}`, {
        tag_name: TAG,
        name: `LetterForge Pro ${VERSION}`,
        body: `## LetterForge Pro v${VERSION}\n\n### changelog\n- Build per Windows x64\n- Supporto font .ttf, .otf, .woff, .woff2\n- Importazione e manipolazione SVG\n- Esportazione progetti come SVG\n- **Auto-update automatico integrato**\n\n### Installazione\n1. Scarica \`LetterForge Pro ${VERSION}.exe\`\n2. Esegui l'app\n3. L'aggiornamento sarà automatico per le versioni future`,
        draft: false,
        prerelease: false
      });
    } catch (e) {
      console.log('✅ Creo nuovo release...');
      release = await apiRequest('POST', '/releases', {
        tag_name: TAG,
        name: `LetterForge Pro ${VERSION}`,
        body: `## LetterForge Pro v${VERSION}\n\n### changelog\n- Build per Windows x64\n- Supporto font .ttf, .otf, .woff, .woff2\n- Importazione e manipolazione SVG\n- Esportazione progetti come SVG\n- **Auto-update automatico integrato**\n\n### Installazione\n1. Scarica \`LetterForge Pro ${VERSION}.exe\`\n2. Esegui l'app\n3. L'aggiornamento sarà automatico per le versioni future`,
        draft: false,
        prerelease: false
      });
    }

    console.log(`✅ Release creato/aggiornato: ${release.html_url}\n`);

    // 2. Delete existing assets
    console.log('🗑️  Rimuovo asset esistenti...');
    if (release.assets && release.assets.length > 0) {
      for (const asset of release.assets) {
        await deleteAsset(asset.id);
      }
    }

    // 3. Upload EXE file (NSIS installer)
    console.log('📦 Carico l\'installer NSIS...');
    await uploadAsset(release.id, EXE_PATH, EXE_NAME);

    // 4. Upload latest.yml for electron-updater
    console.log('📦 Carico latest.yml (auto-updater)...');
    await uploadAsset(release.id, LATEST_YML_PATH, 'latest.yml');

    // 5. Upload blockmap for differential updates
    console.log('📦 Carico blockmap (differential update)...');
    await uploadAsset(release.id, BLOCKMAP_PATH, 'blockmap');

    console.log('\n🎉 Pubblicazione completata!');
    console.log(`📄 Release URL: ${release.html_url}`);
    console.log('');
    console.log('📦 File caricati:');
    console.log(`   - ${EXE_NAME} (installer)`);
    console.log('   - latest.yml (auto-update metadata)');
    console.log('   - blockmap (differential update)');
    console.log('');
    console.log('💡 Gli utenti riceveranno l\'aggiornamento automaticamente!');

  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
}

async function deleteAsset(assetId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${assetId}`;
    const req = https.request(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LetterForge-Publisher'
      }
    }, (res) => {
      if (res.statusCode === 204) {
        resolve();
      } else {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        });
      }
    });
    req.on('error', reject);
    req.end();
  });
}

async function uploadAsset(releaseId, filePath, assetName) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  File non trovato: ${filePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  return new Promise((resolve, reject) => {
    const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
    const req = https.request(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LetterForge-Publisher',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          console.log(`✅ File caricato: ${assetName}`);
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

publish();
