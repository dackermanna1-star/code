# render settings
import bpy
def eevee(s, samples=8, res=(1080,1920), pct=100):
    s.render.engine='BLENDER_EEVEE_NEXT'
    e=s.eevee
    e.taa_render_samples=samples
    e.use_shadows=True
    e.shadow_ray_count=1; e.shadow_step_count=4
    e.use_raytracing=False
    e.fast_gi_method='GLOBAL_ILLUMINATION' if hasattr(e,'fast_gi_method') else None
    e.use_fast_gi=True if hasattr(e,'use_fast_gi') else None
    e.volumetric_tile_size='8'
    e.use_bokeh_jittered=False
    s.render.resolution_x, s.render.resolution_y = res; s.render.resolution_percentage=pct
    s.render.fps=30
    s.view_settings.view_transform='AgX'; s.view_settings.look='AgX - Medium High Contrast'
    s.render.film_transparent=False
