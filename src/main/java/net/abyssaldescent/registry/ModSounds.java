package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvent;

/** Sound events; definitions (layered vanilla samples and original sounds) live in assets/abyssal_descent/sounds.json. */
public final class ModSounds {
	public static final SoundEvent TRAP_CLICK = register("block.trap.click");
	public static final SoundEvent SPIKES_EXTEND = register("block.spike_trap.extend");
	public static final SoundEvent DART_FIRE = register("block.dart_trap.fire");
	public static final SoundEvent WALL_CRUMBLE = register("block.crumbling_wall.crumble");
	public static final SoundEvent RELIQUARY_OPEN = register("block.reliquary.open");
	public static final SoundEvent SEAL_CLOSE = register("block.runic_seal.close");
	public static final SoundEvent SEAL_OPEN = register("block.runic_seal.open");
	public static final SoundEvent GATE_ATTUNE = register("block.abyssal_gate.attune");
	public static final SoundEvent GATE_TRAVEL = register("block.abyssal_gate.travel");
	public static final SoundEvent DESCEND = register("event.descend");
	public static final SoundEvent EXTRACT = register("event.extract");
	public static final SoundEvent DEFEAT = register("event.defeat");
	public static final SoundEvent FLOOR_ENTER = register("event.floor_enter");
	public static final SoundEvent ROOM_CLEAR = register("event.room_clear");
	public static final SoundEvent ENCOUNTER_START = register("event.encounter_start");
	public static final SoundEvent ENEMY_SUMMON = register("event.enemy_summon");
	public static final SoundEvent CURSE_ACCEPT = register("event.curse_accept");
	public static final SoundEvent TRIAL_BEGIN = register("event.trial_begin");
	public static final SoundEvent LOOT_UNCOMMON = register("loot.uncommon");
	public static final SoundEvent LOOT_RARE = register("loot.rare");
	public static final SoundEvent LOOT_EPIC = register("loot.epic");
	public static final SoundEvent LOOT_LEGENDARY = register("loot.legendary");
	public static final SoundEvent CHAIN_LIGHTNING = register("weapon.chain_lightning");
	public static final SoundEvent SOUL_FLARE = register("weapon.soul_flare");
	public static final SoundEvent SHOCKWAVE = register("weapon.shockwave");
	public static final SoundEvent BLEED = register("weapon.bleed");
	public static final SoundEvent BONE_SHRAPNEL = register("weapon.bone_shrapnel");
	public static final SoundEvent DEATHWARD = register("armor.deathward");
	public static final SoundEvent WARDEN_AWAKEN = register("entity.hollow_warden.awaken");
	public static final SoundEvent WARDEN_ROAR = register("entity.hollow_warden.roar");
	public static final SoundEvent WARDEN_CLEAVE = register("entity.hollow_warden.cleave");
	public static final SoundEvent WARDEN_SLAM = register("entity.hollow_warden.slam");
	public static final SoundEvent WARDEN_CHARGE = register("entity.hollow_warden.charge");
	public static final SoundEvent WARDEN_VOLLEY = register("entity.hollow_warden.volley");
	public static final SoundEvent WARDEN_HURT = register("entity.hollow_warden.hurt");
	public static final SoundEvent WARDEN_DEATH = register("entity.hollow_warden.death");
	public static final SoundEvent WARDEN_STEP = register("entity.hollow_warden.step");
	public static final SoundEvent TELEGRAPH = register("entity.telegraph");
	public static final SoundEvent SKULL_WAIL = register("entity.wailing_skull.wail");
	public static final SoundEvent SKULL_SHOOT = register("entity.wailing_skull.shoot");
	public static final SoundEvent GHOUL_SCREECH = register("entity.crypt_ghoul.screech");
	public static final SoundEvent GHOUL_LEAP = register("entity.crypt_ghoul.leap");
	public static final SoundEvent KNIGHT_SWING = register("entity.barrow_knight.swing");
	public static final SoundEvent SOUL_BOLT_HIT = register("entity.soul_bolt.hit");
	public static final SoundEvent BOSS_MUSIC_STING = register("music.boss_sting");
	public static final SoundEvent AMBIENT_FORGOTTEN_LOOP = register("ambient.forgotten_halls.loop");
	public static final SoundEvent AMBIENT_FORGOTTEN_ADDITIONS = register("ambient.forgotten_halls.additions");
	public static final Holder.Reference<SoundEvent> MUSIC_FORGOTTEN_HALLS_BOSS = registerHolder("music.boss.forgotten_halls");

	private ModSounds() {
	}

	private static SoundEvent register(String name) {
		return Registry.register(BuiltInRegistries.SOUND_EVENT, AbyssalDescent.id(name), SoundEvent.createVariableRangeEvent(AbyssalDescent.id(name)));
	}

	private static Holder.Reference<SoundEvent> registerHolder(String name) {
		return Registry.registerForHolder(BuiltInRegistries.SOUND_EVENT, AbyssalDescent.id(name), SoundEvent.createVariableRangeEvent(AbyssalDescent.id(name)));
	}

	public static void init() {
	}
}
