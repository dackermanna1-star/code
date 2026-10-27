package dev.visceral.registry;

import dev.visceral.Visceral;
import dev.visceral.state.WoundList;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageType;

/** Particles, sounds, damage types and data attachments. */
public final class VisceralRegistry {
	/** Blood droplet that falls, splats on surfaces and leaves a decal. Colour comes from velocity sign-encoded data. */
	public static final SimpleParticleType BLOOD_DROP = FabricParticleTypes.simple(true);
	public static final SimpleParticleType BLOOD_MIST = FabricParticleTypes.simple(true);
	public static final SimpleParticleType BONE_CHIP = FabricParticleTypes.simple(true);

	public static final SoundEvent SWING_LIGHT = sound("combat.swing_light");
	public static final SoundEvent SWING_HEAVY = sound("combat.swing_heavy");
	public static final SoundEvent HIT_FLESH = sound("combat.hit_flesh");
	public static final SoundEvent HIT_BLUNT = sound("combat.hit_blunt");
	public static final SoundEvent KICK_HIT = sound("combat.kick_hit");
	public static final SoundEvent STOMP = sound("combat.stomp");
	public static final SoundEvent BODY_FALL = sound("body.fall");
	public static final SoundEvent BODY_SLAM = sound("body.slam");
	public static final SoundEvent GORE = sound("body.gore");

	public static final ResourceKey<DamageType> BLEEDING = ResourceKey.create(Registries.DAMAGE_TYPE, Visceral.id("bleeding"));
	public static final ResourceKey<DamageType> WALL_SLAM = ResourceKey.create(Registries.DAMAGE_TYPE, Visceral.id("wall_slam"));
	public static final ResourceKey<DamageType> KICK = ResourceKey.create(Registries.DAMAGE_TYPE, Visceral.id("kick"));

	/** Localised wounds: persistent with the entity and synced to everyone tracking it. */
	public static final AttachmentType<WoundList> WOUNDS = AttachmentRegistry.create(Visceral.id("wounds"), builder -> builder
		.persistent(WoundList.CODEC)
		.syncWith(WoundList.STREAM_CODEC, AttachmentSyncPredicate.all())
	);

	private VisceralRegistry() {
	}

	private static SoundEvent sound(String path) {
		return SoundEvent.createVariableRangeEvent(Visceral.id(path));
	}

	public static void register() {
		Registry.register(BuiltInRegistries.PARTICLE_TYPE, Visceral.id("blood_drop"), BLOOD_DROP);
		Registry.register(BuiltInRegistries.PARTICLE_TYPE, Visceral.id("blood_mist"), BLOOD_MIST);
		Registry.register(BuiltInRegistries.PARTICLE_TYPE, Visceral.id("bone_chip"), BONE_CHIP);
		for (SoundEvent event : new SoundEvent[] {SWING_LIGHT, SWING_HEAVY, HIT_FLESH, HIT_BLUNT, KICK_HIT, STOMP, BODY_FALL, BODY_SLAM, GORE}) {
			Registry.register(BuiltInRegistries.SOUND_EVENT, event.location(), event);
		}
	}
}
