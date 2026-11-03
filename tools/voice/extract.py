"""Every spoken line in the campaign: (who, text) as the game passes them to voice.speak()."""
import json, re, sys, pathlib
src = pathlib.Path('/home/user/code/src')
S = r"'((?:[^'\\]|\\.)*)'"
lines = []
def unesc(s): return re.sub(r"\\(.)", r"\1", s)
for f in sorted((src / 'story').glob('ch*.ts')):
    t = f.read_text()
    for m in re.finditer(r"\.(say|bark)\(\s*" + S + r"\s*,\s*" + S, t):
        lines.append((unesc(m.group(2)), unesc(m.group(3)), f.name))
    # (lists of [who, line] said in turn)
    for m in re.finditer(r"\[\s*'([A-Z][A-Z .]*)'\s*,\s*" + S + r"\s*\]", t):
        lines.append((m.group(1), unesc(m.group(2)), f.name))
# the chase's barks as each escort goes, and the guards' (runner.ts)
ch5 = (src / 'story/ch5.ts').read_text()
m = re.search(r"bark\('SCARLET', \[(.*?)\]\[", ch5)
for x in re.findall(S, m.group(1)): lines.append(('SCARLET', unesc(x), 'ch5.ts'))
run = (src / 'story/runner.ts').read_text()
m = re.search(r"const lines = \{(.*?)\}\[kind\]", run, re.S)
for x in re.findall(S, m.group(1)): lines.append(('GUARD', unesc(x), 'runner.ts'))
# (only the cast: a controls hint like ['SHIFT', 'SPACE'] isn't anybody talking)
cast = set(re.findall(r"^\s+'?([A-Z][A-Z .]*?)'?: \{ fem:", (src / 'audio/voice.ts').read_text(), re.M))
lines = [l for l in lines if l[0] in cast]
seen, out = set(), []
for who, text, f in lines:
    plain = re.sub(r'<[^>]+>', '', text).replace('“', '"').replace('”', '"')
    spoken = re.sub(r'\([^)]*\)', '', plain).strip()
    if not who or not re.search(r'[A-Za-z]', spoken): continue
    if (who, plain) in seen: continue
    seen.add((who, plain))
    out.append({'who': who, 'text': text, 'plain': plain, 'spoken': spoken, 'src': f})
json.dump(out, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
from collections import Counter
c = Counter(o['who'] for o in out)
print(len(out), 'lines;', sum(len(o['spoken']) for o in out), 'chars')
print(c.most_common())
