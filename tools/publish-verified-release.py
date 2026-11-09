"""Publish only the exact Windows assets from a successful acceptance run."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()


def api(path):
    return json.loads(gh('api', path))


repository = os.environ['GITHUB_REPOSITORY']
run_id = os.environ['RELEASE_RUN_ID']
if repository != '853493541/ZPS-Plugin' or not run_id.isdigit():
    raise ValueError('Unexpected release repository or run ID')
run = api(f'repos/{repository}/actions/runs/{run_id}')
if run['status'] != 'completed' or run['conclusion'] != 'success' or run['path'] != '.github/workflows/windows.yml':
    raise ValueError('Publication requires a successful Windows acceptance run')
package = json.loads(Path('package.json').read_text())
version = package['version']
tag = f'v{version}'
expected_feed = package['build']['publish'][0]
with tempfile.TemporaryDirectory(prefix='zps-release-') as temporary:
    directory = Path(temporary)
    gh('run', 'download', run_id, '--repo', repository, '--name', 'windows-desktop', '--dir', str(directory))
    expected_names = {f'ZPS-Studio-Setup-{version}.exe', f'ZPS-Studio-Setup-{version}.exe.blockmap', 'latest.yml', 'release-manifest.json', 'SHA256SUMS.txt'}
    if {file.name for file in directory.iterdir()} != expected_names:
        raise ValueError('Expected exactly five verified release files')
    manifest = json.loads((directory / 'release-manifest.json').read_text())
    if manifest['sourceCommit'] != run['head_sha'] or manifest['version'] != version or manifest['updateFeed'] != expected_feed:
        raise ValueError('Release provenance or update host does not match')
    expected = {}
    for file in directory.iterdir():
        expected[file.name] = {'size': file.stat().st_size, 'digest': 'sha256:' + hashlib.sha256(file.read_bytes()).hexdigest()}
    if {asset['name'] for asset in manifest['assets']} != expected_names - {'release-manifest.json', 'SHA256SUMS.txt'}:
        raise ValueError('Unexpected asset manifest')
    for asset in manifest['assets']:
        if expected[asset['name']] != {'size': asset['bytes'], 'digest': 'sha256:' + asset['sha256']}:
            raise ValueError('Release asset does not match its tested hash')
    releases = api(f'repos/{repository}/releases?per_page=100')
    release = next((item for item in releases if item['tag_name'] == tag), None)
    notes = f'docs/RELEASE_NOTES_{version}.md'
    if release is None:
        gh('release', 'create', tag, '--repo', repository, '--draft', '--target', run['head_sha'], '--title', f'ZPS Studio {version} - Windows testing release', '--notes-file', notes)
        release = next(item for item in api(f'repos/{repository}/releases?per_page=100') if item['tag_name'] == tag)
    if release['target_commitish'] != run['head_sha']:
        raise ValueError('Release target does not match the accepted source commit')
    if release['draft']:
        gh('release', 'upload', tag, '--repo', repository, '--clobber', *[str(directory / name) for name in sorted(expected_names)])
    uploaded = api(f'repos/{repository}/releases/{release["id"]}')
    actual = {asset['name']: {'size': asset['size'], 'digest': asset['digest']} for asset in uploaded['assets']}
    if actual != expected:
        raise ValueError('Uploaded assets do not match the exact tested bytes')
    if uploaded['draft']:
        gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest', '--notes-file', notes)
    published = api(f'repos/{repository}/releases/{release["id"]}')
    if published['draft'] or published['prerelease'] or not published['published_at']:
        raise ValueError('Release did not become published')
    metadata = api(f'repos/{repository}')
    if metadata['visibility'] == 'public':
        for asset in published['assets']:
            if asset['name'] not in {'latest.yml', f'ZPS-Studio-Setup-{version}.exe'}:
                continue
            url = expected_feed['url'] + asset['name']
            digest = hashlib.sha256()
            with urllib.request.urlopen(url, timeout=60) as response:
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
            if 'sha256:' + digest.hexdigest() != expected[asset['name']]['digest']:
                raise ValueError('Anonymous public download does not match the release')
    summary = f'Released {tag}: {published["html_url"]}\nRepository visibility: {metadata["visibility"]}\nAccepted Windows run: {run["html_url"]}\nSource commit: {run["head_sha"]}\n'
    if metadata['visibility'] != 'public':
        summary += 'Owner must change repository visibility to Public for anonymous downloads and updater access.\n'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(summary)
