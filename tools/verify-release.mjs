import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const { updateFeed } = require('../app/services/release.cjs');
const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (JSON.stringify(packageJson.build.publish[0]) !== JSON.stringify(updateFeed)) throw new Error('Packaged and runtime update feeds differ');
const directory = process.argv[2] || 'dist';
const metadata = load(await fs.readFile(path.join(directory, 'latest.yml'), 'utf8'));
if (metadata.version !== packageJson.version || metadata.files?.length !== 1) throw new Error('Unexpected release version or asset count');
const file = metadata.files[0];
if (typeof file.url !== 'string' || path.basename(file.url) !== file.url || !/^ZPS-Studio-Setup-[\d.]+\.exe$/.test(file.url)) throw new Error('Unexpected installer filename');
const installer = await fs.readFile(path.join(directory, file.url));
const sha512 = createHash('sha512').update(installer).digest('base64');
if (installer.subarray(0, 2).toString() !== 'MZ' || file.size !== installer.length || file.sha512 !== sha512 || metadata.path !== file.url || metadata.sha512 !== sha512) throw new Error('Installer does not match update metadata');
const blockmap = await fs.readFile(path.join(directory, `${file.url}.blockmap`));
if (!blockmap.length) throw new Error('Missing installer blockmap');
const packagedRoot = path.join(directory, 'win-unpacked', 'resources');
try {
  await fs.access(packagedRoot);
  const asar = require('@electron/asar');
  const archive = path.join(packagedRoot, 'app.asar');
  const entries = asar.listPackage(archive).map(entry => entry.replaceAll('\\', '/'));
  if (entries.some(entry => /^\/(?:vendor|\.git)(?:\/|$)|^\/app\/tests(?:\/|$)/.test(entry))) throw new Error('Development or reference files entered the app archive');
  const releaseConfig = asar.extractFile(archive, path.join('app', 'services', 'release.cjs')).toString();
  if (!releaseConfig.includes(updateFeed.url)) throw new Error('Packaged updater points to a different host');
  const walk = async directory => {
    const files = [];
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      files.push(...(item.isDirectory() ? await walk(file) : [file]));
    }
    return files;
  };
  const sampleFiles = await walk(path.join(packagedRoot, 'samples'));
  if (sampleFiles.length !== 7 || sampleFiles.some(file => !/\.jx3dat$|\.txt$|SAMPLES\.json$/.test(file))) throw new Error('Packaged samples must contain exactly six presets and their manifest');
} catch (error) { if (error.code !== 'ENOENT') throw error; else if (process.env.GITHUB_ACTIONS) throw error; }
const assets = [file.url, `${file.url}.blockmap`, 'latest.yml'];
const records = [];
for (const name of assets) {
  const bytes = await fs.readFile(path.join(directory, name));
  records.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const digest = { version: packageJson.version, sourceCommit: process.env.GITHUB_SHA || process.env.RELEASE_COMMIT || null, updateFeed, assets: records, signed: false };
await fs.writeFile(path.join(directory, 'release-manifest.json'), JSON.stringify(digest, null, 2) + '\n');
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), records.map(record => `${record.sha256}  ${record.name}`).join('\n') + '\n');
console.log(`PASS: ${packageJson.version}; installer, blockmap, latest.yml hashes and public feed agree`);
