"""Owner release upload using the existing Python HTTPS transport; no secrets on disk."""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
release = json.loads((root / 'data/local-download-release.json').read_text())
origin = sys.argv[1].rstrip('/')
parsed = urllib.parse.urlsplit(origin)
if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
    raise SystemExit('Provide the HTTPS Site origin without credentials or a path.')
token = json.loads(sys.stdin.readline())['token']
if not re.fullmatch('[a-f0-9]{64}', token):
    raise SystemExit('Invalid release upload key.')
headers = {'Authorization': 'Bearer ' + token, 'User-Agent': 'Mozilla/5.0', 'Origin': origin}

def send(request):
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            if not 200 <= response.status < 300:
                raise SystemExit('Release upload returned HTTP ' + str(response.status))
    except urllib.error.HTTPError as error:
        raise SystemExit('Release upload rejected: HTTP ' + str(error.code) + '. Existing assets are retained.') from None
    except urllib.error.URLError:
        raise SystemExit('Release upload transport failed. Existing assets are retained.') from None

def upload_part(item):
    index, part = item
    name = pathlib.PurePosixPath(part['path']).name
    file = root / 'work/local-download-assets' / part['path'].lstrip('/')
    if not file.is_file() or file.stat().st_size != part['bytes']:
        raise SystemExit('Missing or invalid upload piece: ' + name)
    with file.open('rb') as body:
        request = urllib.request.Request(origin + '/internal/local-release-assets/' + name,
            data=body, method='PUT', headers={**headers, 'Content-Type': 'application/octet-stream', 'Content-Length': str(part['bytes'])})
        send(request)
    return f'Verified upload {index + 1}/{len(release["parts"])}: {name}'
# Four bounded network streams keep memory small and avoid serial upload latency.
# The completion call still verifies every manifest piece, including skipped ones.
start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
if not 0 <= start < len(release['parts']):
    raise SystemExit('Invalid resume index.')
with ThreadPoolExecutor(max_workers=4) as pool:
    pending = [pool.submit(upload_part, item) for item in list(enumerate(release['parts']))[start:]]
    for result in as_completed(pending):
        print(result.result(), flush=True)
send(urllib.request.Request(origin + '/internal/local-release-assets/complete', data=b'', method='POST', headers=headers))
print(f'Stored complete immutable release: {release["bytes"]} bytes, SHA256 {release["sha256"]}', flush=True)
