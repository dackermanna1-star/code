import json, os, sys, urllib.request
op=urllib.request.build_opener(); op.addheaders=[('User-Agent','blender-short-builder/1.0')]; urllib.request.install_opener(op)
OUT='/opt/assets/ph'
def get(u): return json.load(urllib.request.urlopen(u))
def dl(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path): urllib.request.urlretrieve(url, path)
models=['wheelchair_01','clipboard','stationery_supplies','alarm_clock_01','vintage_suitcase','cardboard_box_01','metal_trash_can','potted_plant_02','potted_plant_04','wall_clock','CoffeeCart_01','croissant','office_notepads','binder_notebook','korean_public_payphone_01','vintage_video_camera','Camera_01','security_camera_01','WetFloorSign_01','modular_street_seating','hand_truck','trashbag','round_spectacles','plastic_monobloc_chair_01','metal_office_desk','industrial_storage_cart','decorative_book_set_01','mounted_fluorescent_lights','postcard_set_01','wicker_basket_01','Television_01']
tex=['terrazzo_tiles','large_grey_tiles','concrete_wall_008','rough_concrete','painted_concrete','leather_red_02','long_white_tiles','brushed_concrete','marble_tiles','asphalt_02','fabric_pattern_07','denim_fabric']
hdr=['rostock_laage_airport','qwantani_night_puresky','kloofendal_overcast_puresky']
for m in models:
    try:
        f=get(f'https://api.polyhaven.com/files/{m}')['gltf']; r='1k' if '1k' in f else list(f)[0]; g=f[r]['gltf']
        dl(g['url'], f'{OUT}/models/{m}/{os.path.basename(g["url"])}')
        for p,v in g.get('include',{}).items(): dl(v['url'], f'{OUT}/models/{m}/{p}')
        print('M',m)
    except Exception as e: print('FAIL',m,e)
for t in tex:
    try:
        f=get(f'https://api.polyhaven.com/files/{t}')
        for k,mp in [('Diffuse','diff'),('nor_gl','nor'),('Rough','rough'),('AO','ao')]:
            if k in f and '2k' in f[k]: dl(f[k]['2k']['jpg']['url'], f'{OUT}/tex/{t}/{t}_{mp}.jpg')
        print('T',t)
    except Exception as e: print('FAIL',t,e)
for h in hdr:
    try:
        f=get(f'https://api.polyhaven.com/files/{h}')['hdri']; dl(f['2k']['hdr']['url'], f'{OUT}/hdri/{h}_2k.hdr'); print('H',h)
    except Exception as e: print('FAIL',h,e)
