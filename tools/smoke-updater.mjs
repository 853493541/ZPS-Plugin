import {_electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

assert.equal(process.platform, 'win32', 'Updater smoke requires disposable Windows CI');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Updater smoke requires a disposable GitHub Actions runner');
const phase = process.env.ZPS_UPDATER_PHASE;
assert.ok(['upgrade', 'verify'].includes(phase), 'ZPS_UPDATER_PHASE must be upgrade or verify');
const root = await fs.realpath(process.env.ZPS_UPDATER_ROOT);
const runnerTemp = await fs.realpath(process.env.RUNNER_TEMP);
const within = (file, directory) => {
  const relative = path.relative(directory, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
assert.ok(within(root, runnerTemp), 'Test root must be beneath RUNNER_TEMP');
const executable = await fs.realpath(process.env.ZPS_EXECUTABLE_PATH);
assert.ok(within(executable, root), 'Installed executable must be beneath the test root');
const feedDirectory = await fs.realpath(process.env.ZPS_UPDATER_FEED);
const previousVersion = process.env.ZPS_UPDATER_PREVIOUS_VERSION;
const currentVersion = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url))).version;
assert.notEqual(previousVersion, currentVersion);
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve('electron-updater'));
const metadata = updaterRequire('js-yaml').load(await fs.readFile(path.join(feedDirectory, 'latest.yml'), 'utf8'));
assert.equal(metadata.version, currentVersion, 'Feed must describe the current package');
assert.equal(metadata.files.length, 1, 'Expected one full NSIS installer');
const artifact = metadata.files[0];
assert.equal(artifact.url, `ZPS-Studio-Setup-${currentVersion}.exe`);
const installer = await fs.readFile(path.join(feedDirectory, artifact.url));
assert.equal(createHash('sha512').update(installer).digest('base64'), artifact.sha512, 'Feed SHA512 must match installer');
assert.equal(installer.length, artifact.size, 'Feed size must match installer');
await fs.access(path.join(feedDirectory, `${artifact.url}.blockmap`));
const allowed = new Set(['latest.yml', artifact.url, `${artifact.url}.blockmap`]);
const requests = [];
const server = createServer(async (request, response) => {
  try {
    if (!request.url.startsWith('/')) {
      requests.push({blockedStartupProxyRequest: true});
      response.writeHead(403).end();
      return;
    }
    const name = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).slice(1);
    assert.ok(!request.headers.authorization, 'Local test feed must not receive credentials');
    if (!allowed.has(name) || !['GET', 'HEAD'].includes(request.method)) {
      requests.push({name, status: 404});
      response.writeHead(404).end();
      return;
    }
    const file = path.join(feedDirectory, name);
    const {size} = await fs.stat(file);
    requests.push({name, status: 200, method: request.method, size});
    response.writeHead(200, {'Content-Length': size, 'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'});
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
  } catch (error) {
    requests.push({error: error.message});
    response.writeHead(500).end();
  }
});
server.on('connect', (_request, socket) => {
  requests.push({blockedStartupProxyRequest: true});
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const feedURL = `http://127.0.0.1:${server.address().port}/`;
const userData = path.join(root, '用户 数据');
const cache = path.join(root, 'updater-cache');
const eventsFile = path.join(root, `events-${phase}.jsonl`);
const stateFile = path.join(root, 'state.json');
await fs.mkdir(userData, {recursive: true});
await fs.mkdir(cache, {recursive: true});
let app;
const deadline = setTimeout(() => {
  console.error(`FAIL updater ${phase} exceeded 150 seconds`);
  app?.process().kill();
  process.exit(1);
}, 150_000);
const digest = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
try {
  app = await _electron.launch({executablePath: executable, args: [`--user-data-dir=${userData}`, `--proxy-server=${feedURL}`], timeout: 30_000});
  const page = await app.firstWindow({timeout: 30_000});
  page.setDefaultTimeout(30_000);
  await page.waitForSelector('#records-body tr');
  await page.waitForFunction(async () => (await window.studio.updates('status')).status !== 'idle');
  await app.evaluate(async ({app, session}, config) => {
    const installedRequire = process.mainModule.require('node:module').createRequire(`${app.getAppPath()}/package.json`);
    const fs = installedRequire('node:fs');
    const updater = installedRequire('electron-updater').autoUpdater;
    const log = (event, details) => fs.appendFileSync(config.eventsFile, JSON.stringify({event, details}) + '\n');
    session.fromPartition('electron-updater', {cache: false}).webRequest.onBeforeRequest((details, callback) => {
      const permitted = details.url.startsWith(config.feedURL);
      if (!permitted) log('blocked-external-feed', details.url);
      callback({cancel: !permitted});
    });
    await updater.checkForUpdatesPromise?.catch(() => {});
    updater.setFeedURL({provider: 'generic', url: config.feedURL, useMultipleRangeRequest: false});
    Object.defineProperty(updater.app, 'baseCachePath', {get: () => config.cache});
    updater.installDirectory = config.installDirectory;
    updater.disableDifferentialDownload = true;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    const quitAndInstall = updater.quitAndInstall.bind(updater);
    updater.quitAndInstall = () => quitAndInstall(true, false);
    for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'update-downloaded', 'error']) {
      updater.on(event, info => log(event, info instanceof Error ? info.message : info?.version));
    }
    log('configured', {version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData')});
  }, {feedURL, eventsFile, cache, installDirectory: path.dirname(executable)});
  const identity = await app.evaluate(({app}) => ({version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData')}));
  assert.equal(identity.packaged, true, 'Must test an installed packaged application');
  assert.equal(identity.userData, userData, 'Application must use the isolated retained profile');
  assert.equal(identity.version, phase === 'upgrade' ? previousVersion : currentVersion);
  await page.evaluate(() => window.studio.updates('check'));
  const waitForState = async status => {
    await page.waitForFunction(async expected => {
      const state = await window.studio.updates('status');
      if (['error', 'unavailable'].includes(state.status)) throw new Error(JSON.stringify(state));
      return state.status === expected;
    }, status, {timeout: 90_000});
    return page.evaluate(() => window.studio.updates('status'));
  };
  if (phase === 'upgrade') {
    const sample = (await page.evaluate(() => window.studio.samples())).find(file => file.path.endsWith('BuffData.jx3dat'));
    assert.ok(sample, 'Packaged BuffData sample must exist');
    const snapshot = await page.evaluate(file => window.studio.openSample(file), sample.path);
    const row = snapshot.document.records.find(record => record.id);
    assert.ok(row);
    await page.evaluate(key => window.studio.edit({key, fields: {nPower: 11}}), row.key);
    const exported = path.join(root, '保留 导出.jx3dat');
    await app.evaluate(({dialog}, file) => { dialog.showSaveDialog = async () => ({canceled: false, filePath: file}); }, exported);
    await page.evaluate(() => window.studio.save());
    await page.evaluate(key => window.studio.edit({key, fields: {nPower: 12}}), row.key);
    await page.evaluate(() => window.studio.save());
    const backups = (await fs.readdir(root)).filter(file => file.startsWith(path.basename(exported) + '.') && file.endsWith('.bak'));
    assert.equal(backups.length, 1, 'Overwrite must retain an export backup');
    const probe = path.join(userData, 'upgrade-retention.json');
    await fs.writeFile(probe, JSON.stringify({message: '保留用户数据', previousVersion}));
    const retainedFiles = await Promise.all([probe, exported, path.join(root, backups[0])].map(async file => ({path: file, sha256: await digest(file)})));
    await fs.writeFile(stateFile, JSON.stringify({previousVersion, currentVersion, userData, exported, rowKey: row.key, retainedFiles, upgradeVerified: false}, null, 2));
    const available = await waitForState('available');
    assert.equal(available.version, currentVersion);
    await page.evaluate(() => window.studio.updates('download'));
    assert.equal((await waitForState('ready')).version, currentVersion);
    assert.ok(requests.some(request => request.name === artifact.url && request.method === 'GET'), 'Installer must actually be fetched from loopback');
    await app.evaluate(({dialog}) => {
      dialog.showMessageBox = async (_window, options) => {
        if (options.type !== 'question' || !options.message.includes('重启')) throw new Error('Unexpected updater dialog');
        return {response: 1};
      };
    });
    const closed = app.waitForEvent('close', {timeout: 30_000});
    await page.evaluate(() => window.studio.updates('install')).catch(error => {
      if (!/closed|destroyed/i.test(error.message)) throw error;
    });
    await closed;
    app = undefined;
    console.log('PASS previous installed version checked and downloaded current installer; silent update requested. Upgrade proof awaits verify phase.');
  } else {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    assert.equal(state.previousVersion, previousVersion);
    assert.equal(state.currentVersion, currentVersion);
    assert.equal(state.userData, identity.userData);
    for (const file of state.retainedFiles) {
      assert.ok(within(file.path, root));
      assert.equal(await digest(file.path), file.sha256, `Upgrade changed retained file ${file.path}`);
    }
    await app.evaluate(({dialog}, file) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]}); }, state.exported);
    const snapshot = await page.evaluate(() => window.studio.open());
    assert.equal(snapshot.document.records.find(row => row.key === state.rowKey).fields.nPower, 12, 'Upgraded application must reopen the retained edited export');
    await waitForState('current');
    await page.evaluate(() => window.studio.updates('check'));
    await waitForState('current');
    assert.ok(requests.filter(request => request.name === 'latest.yml' && request.status === 200).length >= 2, 'Current app must check the local feed again');
    assert.equal(requests.some(request => request.name.endsWith('.exe')), false, 'No-update check must not download an installer');
    state.upgradeVerified = true;
    state.installedVersion = identity.version;
    state.noUpdateVerified = true;
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log(`PASS installed ${previousVersion} -> ${identity.version}, retained user data/export/backup SHA256, export reopen and repeated no-update checks`);
  }
} finally {
  if (app) {
    await app.evaluate(({app}) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
  clearTimeout(deadline);
  await fs.writeFile(path.join(root, `requests-${phase}.json`), JSON.stringify(requests, null, 2));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
