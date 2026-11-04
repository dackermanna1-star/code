import bpy, sys
sys.path.insert(0,'/opt/work/scripts')
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
import set_terminal as T
s=bpy.context.scene
M, rows = T.build(s)
T.world(s)
T.fill_board(rows)
vl=s.view_layers[0]
for lc in vl.layer_collection.children:
    if lc.name=='LIBRARY': lc.exclude=True
bpy.ops.wm.save_as_mainfile(filepath='/opt/work/set.blend')
