# Chinatown: vehicles, props, pickups, menu art (tools/ct/render_props.py)

Everything here is rendered by `tools/ct/render_props.py` with Blender (bpy,
Cycles) and quantized to the DOOM palette. Sources and licences:

| used for | source | licence |
|---|---|---|
| VPOL VAMB VTAX VVAN VPCK VSED VSUV VTRK VFTR VGRB VMIL (humvee body), PCON | Kenney **Car Kit** 3.1 (police, ambulance, taxi, van, truck, sedan, suv, delivery, firetruck, garbage-truck, cone), www.kenney.nl | CC0 1.0 |
| PBAR | Poly Haven `concrete_road_barrier` | CC0 |
| PHYD | Poly Haven `fire_hydrant` (aged variant) | CC0 |
| PTRA | Poly Haven `metal_trash_can` (rust variant) | CC0 |
| PPHN (phone unit) | Poly Haven `korean_public_payphone_01` | CC0 |
| PLMP | Poly Haven `street_lamp_01` | CC0 |
| PGEN (generator) | Poly Haven `portable_generator` | CC0 |
| PRAD | Poly Haven `vintage_radio_transceiver`, `small_wooden_table_01` | CC0 |
| PWLD | Poly Haven `portable_welding_cart` | CC0 |
| IGAS, CTIGAS | Poly Haven `metal_jerrycan` | CC0 |
| ITOR, CTITOR | Poly Haven `propane_torch_02` | CC0 |
| VHEL, VMIL bed cover/brush guard/roof ring, PSAW, PGEN trailer, PPHN hood, PBEN, PCRT, PPAL, PLNT, IPLG, CTIPLG | modelled procedurally in the script (original) | CC0 (this project) |
| text on PSAW / PPHN sign / VHEL | DejaVu Sans Bold (Bitstream Vera licence; rasterized) | permissive |
| 福, 唐人街, 酒家, 藥行, 中華門 | Ma Shan Zheng (Google Fonts, via npm `@fontsource/ma-shan-zheng`), fallback WenQuanYi Zen Hei | SIL OFL 1.1 / GPLv2 with font exception (only rasterized pixels ship) |
| M_EPICT, CTTITLE title letters | cut from the IWAD's own menu graphics (M_SKILL, M_EPI1, M_LOADG, M_NGAME) at build time | id Software (needs the IWAD present; nothing is copied into the repo) |

Download URLs: Kenney Car Kit `https://kenney.nl/assets/car-kit` (cached as
`build/ct/cache/veh_kenney_car_kit/kenney_car-kit.zip`); Poly Haven models
via `https://api.polyhaven.com/files/<id>` -> 1k glTF from
`https://dl.polyhaven.org/file/ph-assets/Models/...` (cached in
`build/ct/cache/prop_ph_<id>/`).
