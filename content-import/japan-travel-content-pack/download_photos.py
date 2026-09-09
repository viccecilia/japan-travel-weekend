#!/usr/bin/env python3
"""Download selected Commons originals with resolution/license/hash checks.
Python 3.9+, standard library only. No external dependencies or credentials.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'JapanTravelContentPack/1.0 (local user initiated Commons original downloader)'

def clean(s):
    return html.unescape(re.sub(r'<[^>]*>', '', str(s or ''))).strip()

def write_json(name, value):
    target = ROOT / name
    temporary = target.with_suffix(target.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(target)

def open_url(url):
    host = urlparse(url).hostname
    if urlparse(url).scheme != 'https' or host not in ('commons.wikimedia.org', 'upload.wikimedia.org'):
        raise ValueError('Unexpected download host or non-HTTPS URL: ' + str(host))
    return urlopen(Request(url, headers={'User-Agent': UA}), timeout=45)

def get_info(title):
    params = dict(action='query', format='json', prop='imageinfo',
                  titles=title, redirects=1, iiprop='url|size|sha1|mime|extmetadata')
    with open_url(API + '?' + urlencode(params)) as response:
        result = json.load(response)
    if 'error' in result:
        raise ValueError('Commons API: ' + str(result['error']))
    for page in result.get('query', {}).get('pages', {}).values():
        if page.get('imageinfo'):
            return page['imageinfo'][0]
    raise ValueError('Original file not found: ' + title)

def choose_license(meta):
    name = clean(meta.get('LicenseShortName', {}).get('value', ''))
    url = clean(meta.get('LicenseUrl', {}).get('value', ''))
    tag = clean(meta.get('License', {}).get('value', ''))
    normalized = name.lower()
    # Never infer that Commons hosting alone establishes a reusable license.
    if re.fullmatch(r'CC BY(?:-SA)? \d\.\d(?: [A-Z]{2})?', name, re.I):
        if not url.startswith(('https://creativecommons.org/licenses/by/',
                               'http://creativecommons.org/licenses/by/',
                               'https://creativecommons.org/licenses/by-sa/',
                               'http://creativecommons.org/licenses/by-sa/')):
            raise ValueError('Missing/unrecognized CC license URL: ' + name)
        return name, url
    if normalized in ('cc0', 'cc0 1.0') or tag.lower() == 'cc-zero':
        return name or 'CC0 1.0', url or 'https://creativecommons.org/publicdomain/zero/1.0/'
    if normalized == 'public domain':
        return name, url or 'https://creativecommons.org/publicdomain/mark/1.0/'
    raise ValueError('License needs manual review; not downloaded: ' + (name or tag or 'unknown'))

def sha1(path):
    digest = hashlib.sha1()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def download_one(asset):
    info = get_info(asset['commonsTitle'])
    meta = info.get('extmetadata', {})
    license_name, license_url = choose_license(meta)
    author = clean(meta.get('Artist', {}).get('value', ''))
    if not author and license_name.lower().startswith('cc by'):
        raise ValueError('Author missing for attribution license')
    w, h = int(info.get('width', 0)), int(info.get('height', 0))
    if max(w, h) < asset['minLongEdge'] or min(w, h) < asset['minShortEdge']:
        raise ValueError('Insufficient resolution: %sx%s; no upscaling performed' % (w, h))
    if info.get('mime') != 'image/jpeg':
        raise ValueError('Expected JPEG original; got ' + str(info.get('mime')))
    expected = info.get('sha1', '')
    if not re.fullmatch(r'[0-9a-fA-F]{40}', expected):
        raise ValueError('Missing or invalid source SHA-1')
    destination = (ROOT / asset['localPath']).resolve()
    if ROOT not in destination.parents:
        raise ValueError('Unsafe destination outside package')
    destination.parent.mkdir(parents=True, exist_ok=True)
    cached = destination.is_file() and sha1(destination) == expected.lower()
    if not cached:
        partial = destination.with_suffix('.jpg.part')
        try:
            with open_url(info['url']) as response, partial.open('wb') as f:
                if urlparse(response.geturl()).hostname != 'upload.wikimedia.org':
                    raise ValueError('Unexpected original image response host')
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    f.write(block)
            if partial.stat().st_size != int(info['size']):
                raise ValueError('Incomplete image bytes')
            with partial.open('rb') as f:
                if f.read(3) != b'\xff\xd8\xff':
                    raise ValueError('Response is not JPEG data')
            if sha1(partial) != expected.lower():
                raise ValueError('Source SHA-1 mismatch')
            partial.replace(destination)
        except Exception:
            partial.unlink(missing_ok=True)
            raise
    return {'id': asset['id'], 'attractionId': asset['attractionId'],
            'status': 'downloaded', 'cached': cached, 'localPath': asset['localPath'],
            'width': w, 'height': h, 'sizeBytes': destination.stat().st_size,
            'sha1': expected.lower(), 'sourcePage': info.get('descriptionurl', asset['sourcePage']),
            'originalUrl': info['url'], 'title': asset['commonsTitle'],
            'author': author, 'credit': clean(meta.get('Credit', {}).get('value', '')),
            'attribution': clean(meta.get('Attribution', {}).get('value', '')),
            'license': license_name, 'licenseUrl': license_url,
            'usageTerms': clean(meta.get('UsageTerms', {}).get('value', '')),
            'restrictions': clean(meta.get('Restrictions', {}).get('value', '')),
            'modifications': 'Original file, unmodified', 'visualReviewStatus': 'pending'}

def record_results(results, assets):
    successes = [r for r in results if r['status'] == 'downloaded']
    write_json('photo-download-report.json', {
        'candidateCount': len(assets), 'processedCount': len(results),
        'downloadedCount': len(successes),
        'failedCount': sum(r['status'] == 'failed' for r in results), 'results': results})
    write_json('photo-credits.json', successes)
    text = ['# Downloaded image credits', '',
            'Original files are unmodified. Preserve per-image attribution and license links when publishing.',
            'Visual/location/season review is still required.', '']
    for r in successes:
        text += ['## ' + r['id'], r['title'],
                 'Author: ' + r['author'], 'Credit: ' + r['credit'],
                 'Attribution: ' + r['attribution'],
                 'Source: ' + r['sourcePage'], 'License: ' + r['license'] + ' — ' + r['licenseUrl'],
                 'Dimensions: %s × %s' % (r['width'], r['height']),
                 'Modifications: ' + r['modifications'], 'Restrictions: ' + r['restrictions'], '']
    (ROOT / 'PHOTO_CREDITS.md').write_text('\n\n'.join(text), encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--validate-only', action='store_true', help='Check manifest locally without network')
    args = parser.parse_args()
    manifest = json.loads((ROOT/'photo-manifest.json').read_text(encoding='utf-8'))
    assets = manifest['assets']
    ids = set()
    for asset in assets:
        if asset['id'] in ids:
            raise ValueError('Duplicate asset ID: '+asset['id'])
        ids.add(asset['id'])
        if not asset['commonsTitle'].startswith('File:'):
            raise ValueError('Missing File namespace')
        if ROOT not in (ROOT/asset['localPath']).resolve().parents:
            raise ValueError('Invalid local path')
    if args.validate_only:
        print('Manifest valid: %s candidates. No downloads attempted.' % len(assets))
        return 0
    results = []
    print('Downloading %s selected original photos. Online access is required.' % len(assets), flush=True)
    for i, asset in enumerate(assets, 1):
        print('[%s/%s] %s' % (i, len(assets), asset['id']), flush=True)
        result = None
        for attempt in range(3):
            try:
                result = download_one(asset)
                break
            except ValueError as exc:
                result = {'id': asset['id'], 'status': 'failed', 'reason': str(exc), 'sourcePage': asset['sourcePage']}
                break
            except Exception as exc:
                if attempt < 2:
                    print('  Retry: '+str(exc), flush=True)
                    time.sleep(2 ** (attempt+1))
                else:
                    result = {'id': asset['id'], 'status': 'failed', 'reason': str(exc), 'sourcePage': asset['sourcePage']}
        results.append(result)
        print('  '+result['status']+(': '+result['reason'] if 'reason' in result else ''), flush=True)
        record_results(results, assets)
        time.sleep(0.7)
    failed = [r for r in results if r['status'] != 'downloaded']
    print('\nDownloaded: %s / %s. Failed: %s.' % (len(results)-len(failed), len(assets), len(failed)))
    print('Open preview.html to inspect photos. See photo-download-report.json for failures.')
    print('Some attractions have no selected image; see 03-待补照片与确认事项.md.')
    return 1 if failed else 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\nInterrupted. Run again to resume using verified local originals.')
        sys.exit(130)
