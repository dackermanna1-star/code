import char as ch
from char import R, compose, KeyPoses
from mathutils import Vector
def tread(c):
    c.add(ch.tread_water(c, 1, 60, speed=1.0, effort=1.0))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', 9)))
def floatb(c):
    c.add(ch.float_back(c))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', -78)))
def crawl(c):
    sw = ch.swim_crawl(c, rate=0.85)
    c.add(sw)
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('Y', sw.roll(f) * 0.5 if hasattr(sw, 'roll') else 0), R('X', 82)))
def misc(c):
    c.add(KeyPoses([(1, ch.hug_shiver_pose()), (10, ch.cup_hands_pose(0)), (20, ch.cup_hands_pose(1)), (30, ch.raise_arm_pose('R'))]))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', 5)))
