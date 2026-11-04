import bpy, bmesh
from mathutils import Vector

def _tex_node(m):
    for n in m.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.name=='diffuseTexture': return n
    return None

def recolor(obj, color, lo=0.6, hi=1.25, rough=None, sheen=0.0):
    """Replace a cloth texture color with `color`, preserving its luminance detail."""
    for ms in obj.material_slots:
        m=ms.material; nt=m.node_tree; tx=_tex_node(m)
        bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
        bw=nt.nodes.new('ShaderNodeRGBToBW'); mr=nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value=lo; mr.inputs['To Max'].default_value=hi
        if tx:
            nt.links.new(tx.outputs['Color'], bw.inputs[0])
            # normalise texture luminance range
            import numpy as np
            img=tx.image; arr=np.empty(len(img.pixels),dtype=np.float32); img.pixels.foreach_get(arr); arr=arr.reshape(-1,4)[::37]
            arr=arr[arr[:,3]>0.5] if (arr[:,3]>0.5).sum()>100 else arr
            lum=sorted((0.3*arr[:,0]+0.59*arr[:,1]+0.11*arr[:,2]).tolist()); mr.inputs['From Min'].default_value=lum[int(len(lum)*0.05)]; mr.inputs['From Max'].default_value=max(lum[int(len(lum)*0.95)],lum[int(len(lum)*0.05)]+0.01)
            nt.links.new(bw.outputs[0], mr.inputs['Value'])
        else:
            mr.inputs['Value'].default_value=0.5
        mul=nt.nodes.new('ShaderNodeMix'); mul.data_type='RGBA'; mul.blend_type='MULTIPLY'; mul.inputs['Factor'].default_value=1.0
        nt.links.new(mr.outputs[0], mul.inputs['A']); mul.inputs['A'].default_value=(1,1,1,1)
        comb=nt.nodes.new('ShaderNodeCombineColor'); 
        for i in range(3): nt.links.new(mr.outputs[0], comb.inputs[i])
        nt.links.new(comb.outputs[0], mul.inputs['A'])
        mul.inputs['B'].default_value=(*color,1)
        nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
        if rough is not None: bsdf.inputs['Roughness'].default_value=rough
        if sheen: bsdf.inputs['Sheen Weight'].default_value=sheen
        # alpha stays from texture
        if tx and 'Alpha' in tx.outputs and not bsdf.inputs['Alpha'].is_linked: pass

def hair_material(obj, dark=(0.025,0.018,0.014), grey_name='GreyAmt'):
    """Dark hair whose greyness is driven by a Value node (animatable)."""
    for ms in obj.material_slots:
        m=ms.material; nt=m.node_tree; tx=_tex_node(m)
        bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
        bw=nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(tx.outputs['Color'], bw.inputs[0])
        cr=nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(bw.outputs[0], cr.inputs[0])
        cr.color_ramp.elements[0].position=0.0; cr.color_ramp.elements[0].color=(dark[0]*0.5,dark[1]*0.5,dark[2]*0.5,1)
        cr.color_ramp.elements[1].position=0.6; cr.color_ramp.elements[1].color=(dark[0]*2.2,dark[1]*2.0,dark[2]*1.8,1)
        # greyness: smooth large-scale variation (temples go first), animatable via GreyAmt
        tc=nt.nodes.new('ShaderNodeTexCoord'); nz=nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value=6; nz.inputs['Detail'].default_value=1
        nt.links.new(tc.outputs['UV'], nz.inputs['Vector'])
        val=nt.nodes.new('ShaderNodeValue'); val.name=grey_name; val.label=grey_name; val.outputs[0].default_value=0.0
        mul=nt.nodes.new('ShaderNodeMath'); mul.operation='MULTIPLY'; nt.links.new(val.outputs[0], mul.inputs[0]); nt.links.new(nz.outputs['Fac'], mul.inputs[1])
        mask=nt.nodes.new('ShaderNodeMath'); mask.operation='MULTIPLY'; mask.use_clamp=True; mask.inputs[1].default_value=1.7
        nt.links.new(mul.outputs[0], mask.inputs[0])
        mix=nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; nt.links.new(mask.outputs[0], mix.inputs['Factor'])
        nt.links.new(cr.outputs['Color'], mix.inputs['A']); mix.inputs['B'].default_value=(0.55,0.54,0.52,1)
        # keep texture strand detail on top of grey
        ov=nt.nodes.new('ShaderNodeMix'); ov.data_type='RGBA'; ov.blend_type='MULTIPLY'; ov.inputs['Factor'].default_value=0.6
        nt.links.new(mix.outputs['Result'], ov.inputs['A']); nt.links.new(bw.outputs[0], ov.inputs['B'])
        mix=ov
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value=0.62; bsdf.inputs['Specular IOR Level'].default_value=0.22
        bsdf.inputs['Coat Weight'].default_value=0.0

def skin_tone(body, color=(0.62,0.40,0.25), strength=0.42, rough=0.5):
    m=body.material_slots[0].material; g=[n for n in m.node_tree.nodes if n.type=='GROUP'][0]
    g.inputs['colorMixIn'].default_value=(*color,1); g.inputs['colorMixInStrength'].default_value=strength
    g.inputs['Roughness'].default_value=rough
    g.inputs['Brightness'].default_value=-0.02
    gt=g.node_tree; tx=gt.nodes.get('DiffuseTexture')
    if tx and not gt.nodes.get('OliveTint'):
        mix=gt.nodes.new('ShaderNodeMix'); mix.name='OliveTint'; mix.data_type='RGBA'; mix.blend_type='MULTIPLY'
        mix.inputs['Factor'].default_value=1.0; mix.inputs['B'].default_value=(0.88,0.74,0.62,1)
        outs=[(l.to_socket) for l in gt.links if l.from_node==tx and l.from_socket.name=='Color']
        gt.links.new(tx.outputs['Color'], mix.inputs['A'])
        for so in outs: gt.links.new(mix.outputs['Result'], so)
    if 'Clearcoat' in g.inputs: g.inputs['Clearcoat'].default_value=0.05

def eye_color(eyes, major=(0.16,0.07,0.025), minor=(0.05,0.022,0.01)):
  for ms in eyes.material_slots:
    m=ms.material; g=[n for n in m.node_tree.nodes if n.type=='GROUP'][0]
    g.inputs['IrisMajorColor'].default_value=(*major,1); g.inputs['IrisMinorColor'].default_value=(*minor,1)
    for k,v in (('OuterLayerTransmission',0.0),('Clearcoat',0.6),('EyeWhiteColor',(0.82,0.78,0.74,1))):
        if k in g.inputs: g.inputs[k].default_value=v
    for gn in m.node_tree.nodes:
        if gn.type=='GROUP':
            for n in gn.node_tree.nodes: pass

def recede_hair(hair, body, front=0.035, top_keep=0.0):
    """Delete hair polygons on the front of the crown to get a receding hairline / thin top."""
    hb = [v.co for v in body.data.vertices]
    zmax = max(c.z for c in hb)
    me=hair.data; bm=bmesh.new(); bm.from_mesh(me)
    ys=[v.co.y for v in bm.verts]; zs=[v.co.z for v in bm.verts]
    ymin=min(ys); ymax=max(ys); ztop=max(zs)
    kill=[]
    for f in bm.faces:
        c=f.calc_center_median()
        # MakeHuman faces -Y. front region: y < ymin+front*... and high z
        fy=(c.y-ymin)/(ymax-ymin)  # 0 = front
        hz=(ztop-c.z)
        side=abs(c.x)
        if fy < 0.16 and side < 0.045: kill.append(f)          # receding front
        elif fy < 0.32 and side < 0.030 and hz < 0.035: kill.append(f)  # thin crown
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()
