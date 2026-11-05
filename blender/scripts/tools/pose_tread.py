import char as ch
from char import R, compose
from mathutils import Vector
def tread(c):
    c.add(ch.tread_water(c, 1, 60, speed=1.0, effort=1.0))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', 9)))
