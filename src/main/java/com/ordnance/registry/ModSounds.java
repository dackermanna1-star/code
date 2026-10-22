package com.ordnance.registry;

import com.ordnance.Ordnance;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Identifier;

/** Sound events; the files and per-sound attenuation live in {@code assets/ordnance/sounds.json}. */
public final class ModSounds {
	// Explosions, picked by size and listener distance on the client.
	public static final SoundEvent EXPLOSION_SMALL = register("explosion.small");
	public static final SoundEvent EXPLOSION_MEDIUM = register("explosion.medium");
	public static final SoundEvent EXPLOSION_LARGE = register("explosion.large");
	public static final SoundEvent EXPLOSION_HUGE = register("explosion.huge");
	public static final SoundEvent EXPLOSION_DISTANT = register("explosion.distant");
	public static final SoundEvent EXPLOSION_DISTANT_HUGE = register("explosion.distant_huge");
	public static final SoundEvent EXPLOSION_UNDERWATER = register("explosion.underwater");
	public static final SoundEvent EXPLOSION_DEBRIS = register("explosion.debris");
	public static final SoundEvent EXPLOSION_INCENDIARY = register("explosion.incendiary");
	public static final SoundEvent SMOKE_POP = register("explosion.smoke_pop");
	public static final SoundEvent SMOKE_HISS = register("smoke.hiss");
	public static final SoundEvent DEBRIS_LAND = register("debris.land");

	// Hand grenades.
	public static final SoundEvent GRENADE_PIN = register("grenade.pin");
	public static final SoundEvent GRENADE_THROW = register("grenade.throw");
	public static final SoundEvent GRENADE_BOUNCE = register("grenade.bounce");

	// RPG-7.
	public static final SoundEvent RPG_FIRE = register("rpg.fire");
	public static final SoundEvent RPG_RELOAD = register("rpg.reload");
	public static final SoundEvent RPG_RELOAD_DONE = register("rpg.reload_done");
	public static final SoundEvent ROCKET_MOTOR = register("rocket.motor");

	// Grenade launcher.
	public static final SoundEvent GL_FIRE = register("grenade_launcher.fire");
	public static final SoundEvent GL_RELOAD = register("grenade_launcher.reload");
	public static final SoundEvent GL_MODE = register("grenade_launcher.mode");

	// Flamethrower.
	public static final SoundEvent FLAMETHROWER_IGNITE = register("flamethrower.ignite");
	public static final SoundEvent FLAMETHROWER_LOOP = register("flamethrower.loop");
	public static final SoundEvent FLAMETHROWER_STOP = register("flamethrower.stop");
	public static final SoundEvent FLAMETHROWER_REFUEL = register("flamethrower.refuel");

	// Missile strike.
	public static final SoundEvent DESIGNATOR_BEEP = register("designator.beep");
	public static final SoundEvent DESIGNATOR_LOCK = register("designator.lock");
	public static final SoundEvent DESIGNATOR_CONFIRM = register("designator.confirm");
	public static final SoundEvent MISSILE_ALARM = register("missile.alarm");
	public static final SoundEvent MISSILE_INCOMING = register("missile.incoming");
	public static final SoundEvent MISSILE_BOOM = register("missile.sonic_boom");

	public static final SoundEvent WEAPON_DRY_FIRE = register("weapon.dry_fire");

	private ModSounds() {
	}

	private static SoundEvent register(String name) {
		Identifier id = Ordnance.id(name);
		return Registry.register(Registries.SOUND_EVENT, id, SoundEvent.of(id));
	}

	public static void init() {
	}
}
