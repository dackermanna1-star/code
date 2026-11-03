"""Inline the single-chunk build + all audio into one self-contained HTML file."""
import base64, json, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
dist = root / 'dist-single'
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'last-stance.html'
js = next((dist / 'assets').glob('*.js')).read_text()
css = ''.join(p.read_text() for p in (dist / 'assets').glob('*.css'))
assets = {}
for f in (root / 'public' / 'audio').rglob('*'):
    if f.is_file():
        rel = f.relative_to(root / 'public').as_posix()
        mime = {'.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'}.get(f.suffix, 'audio/wav')
        assets[rel] = f'data:{mime};base64,' + base64.b64encode(f.read_bytes()).decode()
# (no recorded voices in this build: an empty cast list, so the game doesn't try to fetch one off the disk)
assets.setdefault('audio/voice/manifest.json', 'data:application/json;base64,' + base64.b64encode(b'{}').decode())
shim = """<script>(function(){var A=%s;var of=window.fetch.bind(window);window.fetch=function(u,o){var k=String(u).replace(/^\\.\\//,'');if(A[k])return of(A[k]);return of(u,o);};})();</script>""" % json.dumps(assets)
js = js.replace('</script', '<\\/script')
html = f"""<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Last Stance</title>
<style>html,body{{margin:0;height:100%;background:#050505;overflow:hidden}}#app{{position:fixed;inset:0}}canvas{{display:block}}{css}</style>
{shim}</head><body><div id="app"></div><script type="module">{js}</script></body></html>"""
out.write_text(html)
print(out, round(out.stat().st_size / 1e6, 1), 'MB')
