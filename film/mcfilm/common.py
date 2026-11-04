"""Shared sequence helpers."""
import math
from . import characters as ch

EAST = math.pi / 2
WEST = -math.pi / 2


def make_steve(d, worn=0.0, worn_sword=False):
    steve = d.add_rig(ch.humanoid("steve", ch.steve_skin(worn=worn)))
    sword = ch.sword("steve_sword", worn=worn_sword)
    steve.attach(sword, "arm_r", (-1 * ch.PX, 0, -9.5 * ch.PX), (0, 0, 0))
    steve.sword = sword
    return steve


def idle(t, k=1.0):
    return {"arm_r_out": 2.5 + 1.5 * math.sin(t * 1.7) * k, "arm_l_out": 2.5 + 1.5 * math.sin(t * 1.7 + 1) * k,
            "head_pitch": 2 * math.sin(t * 0.7) * k, "bob": 0.004 * math.sin(t * 1.7), "arm_r": 12}


def breathe(t, rate=2.4, amt=1.0):
    """Heavy, tired breathing idle."""
    return {"lean": 8 * amt + 3 * amt * math.sin(t * rate), "head_pitch": -12 * amt + 4 * amt * math.sin(t * rate),
            "arm_r_out": 4, "arm_l_out": 4, "arm_r": 8, "bob": -0.01 * amt * (1 + math.sin(t * rate))}
