"""Writes assets/godforge/lang/en_us.json. Run from the repository root:  python3 tools/gen_lang.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_sounds import SOUNDS  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'godforge', 'lang', 'en_us.json')

WEAPONS = {
    'worldcutter': ('The Worldcutter', 'Reality-Splitting Blade', [
        'A blade forged from the seam between worlds.',
        'Its slashes cleave space itself; fully charged,',
        'it severs reality and pushes the halves apart.',
    ], ('%1$s was split from reality', '%1$s was severed from reality by %2$s')),
    'laser_beam': ('The Laser Beam', 'Annihilation Cannon', [
        'A continuous beam that burns, melts, vaporizes',
        'or detonates whatever it touches. Tune its power,',
        'width, range, intensity and colour with [G].',
    ], ('%1$s was vaporized', '%1$s was vaporized by %2$s')),
    'orb_eraser': ('The Orb Eraser', 'Rainbow Singularity', [
        'Hold to grow a prismatic orb, then release it.',
        'It erases everything in its path at thousands',
        'of blocks per second.',
    ], ('%1$s was erased from existence', '%1$s was erased from existence by %2$s')),
    'asteroid_gun': ('The Asteroid Gun', 'Planetfall', [
        'Tap to designate a target. Hold to charge,',
        'release to call an asteroid down from the heavens.',
        'Charge decides how much of the world it ends.',
    ], ('%1$s was flattened by an asteroid', '%1$s was flattened by an asteroid summoned by %2$s')),
    'black_hole': ('The Black Hole', 'Event Horizon', [
        'Launches a singularity that drags in creatures,',
        'items and the very terrain, growing with every meal,',
        'until it collapses in a cataclysmic release.',
    ], ('%1$s crossed the event horizon', '%1$s was spaghettified by %2$s\'s singularity')),
    'reality_breaker': ('The Reality Breaker', 'Dimensional Collapse', [
        'Shatters the land into floating fragments and',
        'tears rifts into other dimensions. Its ultimate',
        'spreads the collapse across the landscape.',
    ], ('%1$s fell through a crack in reality', '%1$s was torn out of reality by %2$s')),
    'starfall_bow': ('The Starfall Bow', 'Celestial Judgment', [
        'Looses miniature stars. Draw longer to call a',
        'meteor shower; in Judgment mode, a full draw',
        'brings a gigantic star down upon the land.',
    ], ('%1$s was struck down by a falling star', '%1$s received celestial judgment from %2$s')),
    'godfist': ('The Godfist', 'Fist of Absolute Destruction', [
        'Every punch is a kinetic event: foes fly across',
        'the horizon and shatter the ground they land on.',
        'Charge to project giant fists, or slam the world.',
    ], ('%1$s was punched into orbit', '%1$s was punched into orbit by %2$s')),
    'sunforge': ('The Sunforge', 'Portable Star', [
        'Forges and commands miniature stars: solar bolts,',
        'orbiting suns, an unstable stellar core, and an',
        'artificial sun that ends in apocalyptic eruption.',
    ], ('%1$s was incinerated by a star', '%1$s was incinerated by %2$s\'s star')),
    'planet_cracker': ('The Planet Cracker', 'World-Ender', [
        'A siege cannon whose shells crack continents,',
        'rolling concentric shockwaves over the land.',
        'Its ultimate calls down an orbital bombardment.',
    ], ('%1$s was caught in a world-ending blast', '%1$s was obliterated by %2$s\'s Planet Cracker')),
}

MODES = {
    'rift_slash': 'Rift Slash',
    'sever_reality': 'Sever Reality',
    'annihilation_beam': 'Annihilation Beam',
    'overload': 'Overload',
    'eraser_orb': 'Eraser Orb',
    'prismatic_annihilation': 'Prismatic Annihilation',
    'summon_asteroid': 'Summon Asteroid',
    'planetfall': 'Planetfall',
    'singularity': 'Singularity',
    'event_horizon': 'Event Horizon',
    'fracture': 'Fracture',
    'dimensional_collapse': 'Dimensional Collapse',
    'star_shot': 'Star Shot',
    'meteor_shower': 'Meteor Shower',
    'celestial_judgment': 'Celestial Judgment',
    'kinetic_shockwave': 'Kinetic Shockwave',
    'worldbreaker': 'Worldbreaker',
    'solar_bolt': 'Solar Bolt',
    'orbiting_suns': 'Orbiting Suns',
    'stellar_core': 'Stellar Core',
    'artificial_sun': 'Artificial Sun',
    'cracker_shell': 'Cracker Shell',
    'orbital_bombardment': 'Orbital Bombardment',
}

SETTINGS = {
    'cut_length': 'Cut Length',
    'cut_gap': 'Chasm Width',
    'cut_depth': 'Cut Depth',
    'no_terrain': 'Protect Terrain',
    'laser_power': 'Power',
    'beam_width': 'Beam Width',
    'beam_range': 'Range',
    'beam_intensity': 'Intensity',
    'beam_color': 'Beam Colour',
    'orb_size': 'Max Orb Size',
    'orb_speed': 'Orb Speed',
    'asteroid_size': 'Asteroid Size',
    'pull_strength': 'Gravity',
    'singularity_lifetime': 'Lifetime',
    'fracture_size': 'Fracture Size',
    'rift_count': 'Rifts',
    'shower_density': 'Shower Density',
    'star_size': 'Star Size',
    'launch_power': 'Launch Power',
    'shockwave_size': 'Shockwave Size',
    'orbiter_count': 'Orbiting Suns',
    'sun_size': 'Sun Size',
    'crater_size': 'Crater Size',
    'barrage_density': 'Barrage Density',
    'client.shake': 'Screen Shake',
    'client.flashes': 'Flashes',
    'client.particles': 'Particles',
    'client.distortion': 'Distortion',
    'client.hud': 'Weapon HUD',
}

COLORS = {
    'crimson': 'Crimson', 'solar': 'Solar Orange', 'gold': 'Gold', 'toxic': 'Toxic Green', 'aqua': 'Aqua', 'azure': 'Azure',
    'cobalt': 'Cobalt', 'violet': 'Violet', 'magenta': 'Magenta', 'white': 'White', 'rainbow': 'Rainbow',
}

ENTITIES = {
    'rift_slash': 'Rift Slash', 'reality_cut': 'Reality Cut', 'laser_beam': 'Laser Beam', 'prism_orb': 'Prism Orb', 'asteroid': 'Asteroid',
    'target_marker': 'Target Marker', 'singularity': 'Singularity', 'flying_debris': 'Flying Debris', 'fracture_chunk': 'Fracture Chunk',
    'dimensional_rift': 'Dimensional Rift', 'star_bolt': 'Miniature Star', 'kinetic_fist': 'Kinetic Fist', 'solar_bolt': 'Solar Bolt',
    'mini_sun': 'Miniature Sun', 'artificial_sun': 'Artificial Sun', 'cracker_shell': 'Cracker Shell', 'orbital_strike': 'Orbital Bombardment',
}


def main():
    lang = {
        'itemGroup.godforge.arsenal': 'Godforge Arsenal',
        'item.godforge.divine_core': 'Divine Core',
        'block.godforge.kinetic_fracture': 'Kinetic Fracture',
        'key.category.godforge.weapons': 'Godforge Arsenal',
        'key.godforge.cycle_mode': 'Cycle Weapon Mode (Sneak: back)',
        'key.godforge.configure': 'Configure Weapon',
        'tooltip.godforge.mode': 'Mode: %s',
        'tooltip.godforge.controls': 'Use: fire / hold to charge   [R] mode   [G] configure',
        'screen.godforge.configure': 'Configure Weapon',
        'screen.godforge.mode': 'Mode: %s',
        'screen.godforge.reset': 'Reset',
        'screen.godforge.apply': 'Apply',
        'screen.godforge.weapon_settings': 'Weapon (server-checked)',
        'screen.godforge.visual_settings': 'Your visual effects',
        'format.godforge.blocks': '%s blocks',
        'format.godforge.level': 'Level %s',
        'hud.godforge.ultimate_cd': 'Ultimate in %ss',
        'hud.godforge.ultimate_ready': 'Ultimate READY',
        'hud.godforge.charged': 'CHARGED',
        'hud.godforge.power': 'Power %s',
        'message.godforge.disabled': '%s is disabled on this server.',
        'message.godforge.no_permission': 'You are not permitted to wield god weapons here.',
        'message.godforge.no_ultimate_permission': 'You are not permitted to unleash ultimates here.',
        'message.godforge.ultimate_cooldown': 'Ultimate recharging: %ss',
        'message.godforge.no_target': 'No valid target in range.',
        'message.godforge.target_locked': 'Target locked: %s, %s, %s',
        'message.godforge.too_many': 'Too many of these cataclysms are active - wait for one to end.',
        'message.godforge.mode': 'Mode: %s',
        'message.godforge.orbital_inbound': 'Orbital bombardment inbound!',
        'command.godforge.info': 'Destruction jobs: %s | block changes last tick: %s | debris: %s | singularities: %s | terrain destruction: %s',
        'command.godforge.reloaded': 'Godforge configuration reloaded.',
        'command.godforge.stopped': 'Halted %s destruction jobs and removed %s effect entities.',
        'command.godforge.destruction': 'Terrain destruction is now %s.',
        'command.godforge.given': 'Gave %s item(s) to %s player(s).',
        'command.godforge.cooldowns_reset': 'Reset weapon cooldowns for %s player(s).',
        'command.godforge.unknown_weapon': 'Unknown weapon: %s',
    }
    for wid, (name, title, lore, death) in WEAPONS.items():
        lang['item.godforge.' + wid] = name
        lang['item.godforge.%s.title' % wid] = title
        for i, line in enumerate(lore, 1):
            lang['item.godforge.%s.lore%d' % (wid, i)] = line
        lang['death.attack.godforge.' + wid] = death[0]
        lang['death.attack.godforge.%s.player' % wid] = death[1]
    for key, value in MODES.items():
        lang['mode.godforge.' + key] = value
    for key, value in SETTINGS.items():
        lang['setting.godforge.' + key] = value
    for key, value in COLORS.items():
        lang['color.godforge.' + key] = value
    for key, value in ENTITIES.items():
        lang['entity.godforge.' + key] = value
    for key, (_, subtitle) in SOUNDS.items():
        lang['subtitles.godforge.' + key] = subtitle
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(lang, f, indent=2, ensure_ascii=False)
    print('%d translation keys written' % len(lang))


if __name__ == '__main__':
    main()
