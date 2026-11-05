"""Build the main character "Leo" with MPFB2 (MakeHuman, CC0 assets).

Run: blender -b --python build_character.py -- <out.blend>
Produces a rigged character with ARKit face-unit shape keys (propagated to
brows/lashes/clothes) and an IK control layer added on top of the
game_engine rig.
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/opt/work/blend/character.blend"

# reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

PRESET = argv[1] if len(argv) > 1 else "leo"
human_info = HumanService._create_default_human_info_dict()
if PRESET == "leo":
    human_info["name"] = "Leo"
    human_info["phenotype"] = {
        "gender": 1.0, "age": 0.53, "muscle": 0.58, "weight": 0.52,
        "proportions": 0.75, "height": 0.55, "cupsize": 0.5, "firmness": 0.5,
        "race": {"asian": 0.15, "caucasian": 0.70, "african": 0.15},
    }
    # distinctive facial features (kept for the whole film)
    human_info["targets"] = [
        {"target": "head-oval", "value": 0.35},
        {"target": "l-eye-scale-incr", "value": 0.35},
        {"target": "r-eye-scale-incr", "value": 0.35},
        {"target": "nose-scale-horiz-incr", "value": 0.15},
        {"target": "nose-point-width-incr", "value": 0.25},
        {"target": "chin-prominent-incr", "value": 0.3},
        {"target": "chin-width-incr", "value": 0.2},
        {"target": "l-ear-scale-decr", "value": 0.2},
        {"target": "r-ear-scale-decr", "value": 0.2},
        {"target": "mouth-scale-horiz-incr", "value": 0.15},
        {"target": "eyebrows-trans-up", "value": 0.1},
    ]
    human_info["eyebrows"] = "eyebrow001/eyebrow001.mhclo"
    human_info["hair"] = "short02/short02.mhclo"
    human_info["clothes"] = ["male_worksuit01/male_worksuit01.mhclo", "shoes02/shoes02.mhclo"]
    human_info["skin_mhmat"] = "young_caucasian_male/young_caucasian_male.mhmat"
else:  # rescuer: coworker "Maya"
    human_info["name"] = "Maya"
    human_info["phenotype"] = {
        "gender": 0.0, "age": 0.6, "muscle": 0.55, "weight": 0.5,
        "proportions": 0.7, "height": 0.45, "cupsize": 0.45, "firmness": 0.5,
        "race": {"asian": 0.1, "caucasian": 0.1, "african": 0.8},
    }
    human_info["targets"] = []
    human_info["eyebrows"] = "eyebrow010/eyebrow010.mhclo"
    human_info["hair"] = "ponytail01/ponytail01.mhclo"
    human_info["clothes"] = ["female_casualsuit01/female_casualsuit01.mhclo", "shoes05/shoes05.mhclo"]
    human_info["skin_mhmat"] = "middleage_african_female/middleage_african_female.mhmat"
human_info["rig"] = "game_engine"
human_info["eyes"] = "high-poly/high-poly.mhclo"
human_info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
human_info["teeth"] = "teeth_base/teeth_base.mhclo"
human_info["tongue"] = "tongue01/tongue01.mhclo"
human_info["skin_material_type"] = "ENHANCED_SSS"
human_info["eyes_material_type"] = "PROCEDURAL_EYES"
human_info["eyes_material_settings"] = {}

settings = HumanService.get_default_deserialization_settings()
settings["subdiv_levels"] = 1
basemesh = HumanService.deserialize_from_dict(human_info, settings)
print("BASEMESH", basemesh.name)

# ARKit face units -> shape keys, then propagate to children
FaceService.load_targets(basemesh, load_microsoft_visemes=False, load_arkit_faceunits=True)
FaceService.interpolate_targets(basemesh)

for o in bpy.data.objects:
    print("OBJ", o.name, o.type, o.parent.name if o.parent else None,
          len(o.data.shape_keys.key_blocks) if o.type == 'MESH' and o.data.shape_keys else 0)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SAVED", OUT)
