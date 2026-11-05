import char as ch
from char import R, compose, KeyPoses
from mathutils import Vector
def mouthcup(c):
    c.add(KeyPoses([(1, ch.cup_ik(c, 0.0)), (11, ch.cup_ik(c, 0.5)), (21, ch.cup_ik(c, 1.0))]))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', 5)))
