import bpy, sys
sys.path.insert(0,'/opt/work/scripts')
import board; board.register()
s=bpy.context.scene
s.eevee.taa_render_samples=2
s.eevee.shadow_pool_size='128'
s.render.resolution_percentage=67
s.render.use_overwrite=False; s.render.use_placeholder=True
s.render.filepath='/opt/work/frames/f_#####'
s.render.image_settings.file_format='PNG'; s.render.image_settings.color_mode='RGB'; s.render.image_settings.compression=30
bpy.ops.render.render(animation=True)
