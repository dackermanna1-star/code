"""Split-flap departure board animation (frame handler)."""
import bpy, json, random

GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:'- "
FLIP = 14  # frames for a cascade

def set_program(scene, program):
    """program: list of [frame, [8 lines]]"""
    scene['board_program'] = json.dumps(program)

def _state(scene, f):
    prog = json.loads(scene.get('board_program', '[]'))
    if not prog: return None
    cur = None; prev = None
    for fr, lines in prog:
        if fr <= f: prev, cur = cur, (fr, lines)
    if cur is None: return prog[0][1]
    fr, lines = cur
    age = f - fr
    if prev is None or age >= FLIP + 30: return lines
    old = prev[1]
    out = []
    for r, (a, b) in enumerate(zip(old, lines)):
        a = a.ljust(len(b)); s = []
        for i, ch in enumerate(b):
            start = (i * 0.35 + r * 1.2)
            if a[i] == ch or age > start + FLIP: s.append(ch)
            elif age < start: s.append(a[i])
            else:
                rnd = random.Random(f * 131 + i * 7 + r)
                s.append(rnd.choice(GLYPHS))
        out.append(''.join(s))
    return out

def handler(scene, depsgraph=None):
    lines = _state(scene, scene.frame_current)
    if lines is None: return
    for i, l in enumerate(lines):
        o = bpy.data.objects.get('BoardRow%d' % i)
        if o and o.data.body != l: o.data.body = l

def register():
    for h in list(bpy.app.handlers.frame_change_pre):
        if getattr(h, '__name__', '') == 'handler' and h.__module__ == __name__:
            bpy.app.handlers.frame_change_pre.remove(h)
    bpy.app.handlers.frame_change_pre.append(handler)
