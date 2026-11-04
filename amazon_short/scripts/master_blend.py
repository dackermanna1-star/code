"""Master project file: links every shot scene (library override-free links to blend/shots/Sxx.blend) and builds an
EDIT scene whose Video Sequencer holds the rendered shots in order, the VO lines, the final mix and shot markers.
blender -b --factory-startup -P master_blend.py"""
import bpy, json, os
R = '/home/user/code/amazon_short/'
TL = json.load(open(R + 'scripts/timeline.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
edit = bpy.context.scene; edit.name = 'EDIT'
edit.render.resolution_x, edit.render.resolution_y, edit.render.fps = 1080, 1920, 30
edit.frame_start = 1; edit.frame_end = round(TL['total'] * 30)
edit.render.image_settings.file_format = 'FFMPEG'; edit.render.ffmpeg.format = 'MPEG4'; edit.render.ffmpeg.codec = 'H264'
edit.render.ffmpeg.audio_codec = 'AAC'; edit.render.filepath = R + 'output/EDIT_from_blender.mp4'
# link shot scenes (relative paths so the folder can be moved)
for sh in TL['shots']:
    lib = R + f"blend/shots/{sh['id']}.blend"
    if not os.path.exists(lib): continue
    with bpy.data.libraries.load(lib, link=True, relative=True) as (src, dst):
        dst.scenes = [s for s in src.scenes if s == sh['id']]
se = edit.sequence_editor_create()
for sh in TL['shots']:
    d = R + f"renders/shots/{sh['id']}/"
    files = sorted(f for f in os.listdir(d) if f.endswith('.png')) if os.path.isdir(d) else []
    f0 = sh['f0'] + 1
    if files:
        st = se.strips.new_image(sh['id'], d + files[0], channel=2, frame_start=f0) if hasattr(se, 'strips') else se.sequences.new_image(sh['id'], d + files[0], channel=2, frame_start=f0)
        for f in files[1:]: st.elements.append(f)
        st.frame_final_duration = sh['frames']
        tr = st.transform; st.use_proxy = False
        st.transform.scale_x = st.transform.scale_y = 1080 / 540
    m = edit.timeline_markers.new(sh['id'], frame=f0)
    scn = bpy.data.scenes.get(sh['id'])
    if scn: m.camera = None
strips = se.strips if hasattr(se, 'strips') else se.sequences
for k, t in TL['vo'].items():
    strips.new_sound(k, R + f'audio/vo/{k}.wav', channel=4, frame_start=round(t * 30) + 1)
if os.path.exists(R + 'audio/mix/final_mix.wav'):
    s = strips.new_sound('FINAL_MIX', R + 'audio/mix/final_mix.wav', channel=5, frame_start=1); s.mute = False
    for st in strips:
        if st.type == 'SOUND' and st.name.startswith('L'): st.mute = True   # VO is already inside the mix; kept for reference
bpy.ops.file.make_paths_relative() if False else None
os.makedirs(R + 'blend', exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + 'blend/AmazonShort_Project.blend', compress=True, relative_remap=True)
print('MASTER saved', len(bpy.data.scenes), 'scenes')
