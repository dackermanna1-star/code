"""Fetch Wikimedia Commons reference photos (thumbnails) for vehicle authoring.
usage: python3 refs.py search "<query>" [n]      -> list file titles
       python3 refs.py get "<File:title>" <out.jpg> [width]
Photos are only used as visual references; they are never stored in the repo."""
import json, sys, urllib.parse, urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'bg-asset-refs/1.0 (private research)'}


def fetch(url):
    import time, urllib.error
    for k in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == 7:
                raise
            time.sleep(5 * (k + 1))


def q(params):
    url = API + '?' + urllib.parse.urlencode(dict(params, format='json'))
    return json.loads(fetch(url))


if sys.argv[1] == 'search':
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    d = q(dict(action='query', list='search', srsearch=sys.argv[2], srnamespace=6, srlimit=n))
    for x in d['query']['search']:
        print(x['title'])
elif sys.argv[1] == 'get':
    w = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
    d = q(dict(action='query', titles=sys.argv[2], prop='imageinfo', iiprop='url|size', iiurlwidth=w))
    page = next(iter(d['query']['pages'].values()))
    ii = page['imageinfo'][0]
    url = ii.get('thumburl') or ii['url']
    with open(sys.argv[3], 'wb') as f:
        f.write(fetch(url))
    print(sys.argv[3], ii['width'], ii['height'], ii['descriptionurl'])
