"""Master timeline: VO placement + shot cut points (cuts land just before key words)."""
import json, os
R = '/home/user/code/amazon_short/'
FPS = 30
dur = json.load(open(R + 'audio/vo/durations.json'))
words = json.load(open(R + 'audio/vo/words.json'))
gap_before = {'L01': 0.5, 'L02': 0.5, 'L03': 0.5, 'L04': 0.55, 'L05': 0.6, 'L06': 0.6, 'L07': 0.9, 'L08': 1.1, 'L09': 0.6,
              'L10': 1.2, 'L11': 1.1, 'L12': 1.0, 'L13': 0.9, 'L14': 1.0, 'L15': 1.3}
TAIL = 1.8
t = 0; vo = {}
for k in sorted(dur):
    t += gap_before[k]; vo[k] = round(t, 3); t += dur[k]
TOTAL = t + TAIL
def at(line, wi, lead=0.25):
    return vo[line] + words[line][wi]['s'] - lead
# (shot id, start time, description)
cuts = [
 ('S01', 0.0, 'Aerial over endless canopy, descend toward gap'),
 ('S02', at('L02', 0, 0.4), 'Trail: character steps off trail following blue morpho'),
 ('S03', at('L02', 9), 'Over-shoulder turn around: trail gone'),
 ('S04', at('L03', 0), 'Orbit around character looking around, identical jungle'),
 ('S05', at('L03', 5), 'Low angle POV up through canopy, sun hidden'),
 ('S06', at('L03', 10), 'Phone close-up: No Service'),
 ('S07', at('L04', 0), 'Wide: sits on buttress root, calms down (stay put)'),
 ('S08', at('L04', 12), 'Slow push-in on worried face'),
 ('S09', at('L05', 0), 'Gets up and walks, low angle boots in mud'),
 ('S10', at('L05', 3), 'Top-down: walking in a circle, passes same log + orange fungus, trail line'),
 ('S11', at('L06', 0), 'Face close-up sweating, humid haze, 32C / 90% overlay'),
 ('S12', at('L06', 14), 'Medium: pushes through foliage, shirt soaked, wipes brow'),
 ('S13', at('L07', 0), 'Parts leaves: reveals stream'),
 ('S14', at('L07', 4), 'Kneels at stream, scoops water in hands'),
 ('S15', at('L07', 9), 'Macro zoom into water: microbes'),
 ('S16', at('L07', 13), 'Lets water drain from hands, shakes head'),
 ('S17', at('L08', 0, 0.6), 'Rain arrives: wide with rain sheets and thunder'),
 ('S18', at('L08', 5), 'Catches rain from leaf tip into bottle, drinks'),
 ('S19', at('L09', 0), 'Looks at stream flowing, realization'),
 ('S20', at('L09', 7), 'Aerial diagram: stream joins river, arrows'),
 ('S21', at('L09', 19), 'Tracking: follows stream downstream'),
 ('S22', at('L10', 0, 0.9), 'Night falls timelapse, sits against buttress, fireflies'),
 ('S23', at('L10', 15), 'Close-up shivering in dark, faint moonlight'),
 ('S24', at('L11', 0, 0.6), 'DAY 3: forearm with mosquitoes, bites, slap'),
 ('S25', at('L11', 8), 'Cut on forearm red and swollen'),
 ('S26', at('L12', 0, 0.5), 'Ground-level: boot about to step, snake camouflaged'),
 ('S27', at('L12', 9), 'Snake head close-up, tongue flick'),
 ('S28', at('L12', 17), 'Freeze and back away slowly'),
 ('S29', at('L13', 0), 'Exhausted crouch: berries & mushrooms, refuses'),
 ('S30', at('L13', 10), 'Stumbling along stream, drinks'),
 ('S31', at('L14', 0, 0.5), 'Reveal: emerges onto wide river at golden hour'),
 ('S32', at('L14', 10), 'Head turns to engine; boat rounds bend'),
 ('S33', at('L15', 0), 'Waves at boat, boat approaches'),
 ('S34', at('L15', 18), 'Final aerial pull back over river and canopy'),
]
shots = []
for i, (sid, st, desc) in enumerate(cuts):
    en = cuts[i + 1][1] if i + 1 < len(cuts) else TOTAL
    f0 = round(st * FPS); f1 = round(en * FPS)
    shots.append(dict(id=sid, start=round(st, 3), end=round(en, 3), f0=f0, frames=f1 - f0, desc=desc))
json.dump(dict(fps=FPS, total=round(TOTAL, 3), vo=vo, shots=shots), open(R + 'scripts/timeline.json', 'w'), indent=1)
if __name__ == '__main__':
    for s in shots: print(s['id'], f"{s['start']:7.2f} {s['frames']:4d}f {s['frames']/FPS:5.2f}s", s['desc'])
    print('TOTAL', round(TOTAL, 2), 'frames', round(TOTAL * FPS))
