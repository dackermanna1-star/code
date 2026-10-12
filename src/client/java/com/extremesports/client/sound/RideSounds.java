package com.extremesports.client.sound;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.anim.RideAnimState;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.registry.ModSounds;
import com.extremesports.sport.SportType;
import com.extremesports.sport.SurfaceType;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;

/**
 * Continuous loops attached to each nearby ride: wheels rolling (per surface), grinding, wind and BMX freewheel.
 * Volume and pitch follow speed every tick.
 */
public final class RideSounds {
	enum Loop {
		ROLL_CONCRETE,
		ROLL_WOOD,
		ROLL_ROUGH,
		GRIND_METAL,
		GRIND_CONCRETE,
		WIND,
		FREEWHEEL
	}

	private static final Map<Integer, Map<Loop, LoopSound>> ACTIVE = new HashMap<>();

	private RideSounds() {
	}

	public static void tick(SportEquipmentEntity entity) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || entity.distanceToSqr(mc.player) > 40 * 40) {
			return;
		}
		Map<Loop, LoopSound> loops = ACTIVE.computeIfAbsent(entity.getId(), id -> new HashMap<>());
		for (Loop loop : Loop.values()) {
			LoopSound sound = loops.get(loop);
			if ((sound == null || sound.isStopped() || !mc.getSoundManager().isActive(sound)) && target(entity, loop)[0] > 0.01F) {
				sound = new LoopSound(entity, loop);
				loops.put(loop, sound);
				mc.getSoundManager().play(sound);
			}
		}
	}

	public static void clear() {
		ACTIVE.clear();
	}

	/** {volume, pitch} for a loop given the entity's current state. */
	static float[] target(SportEquipmentEntity entity, Loop loop) {
		if (entity.isRemoved()) {
			return new float[]{0.0F, 1.0F};
		}
		RideAnimState state = RideAnimState.of(entity);
		float speed = state.speed.value;
		boolean grinding = state.contact == RideController.Contact.GRIND;
		boolean grounded = state.contact == RideController.Contact.GROUND || state.contact == RideController.Contact.RAMP;
		float rollScale = ClientConfig.get().rollVolume;
		SportType sport = entity.sport();
		switch (loop) {
			case ROLL_CONCRETE, ROLL_WOOD, ROLL_ROUGH -> {
				if (!grounded || speed < 0.015F) {
					return new float[]{0.0F, 1.0F};
				}
				SurfaceType.RollSound roll = surface(entity).rollSound;
				boolean match = switch (loop) {
					case ROLL_CONCRETE -> roll == SurfaceType.RollSound.CONCRETE;
					case ROLL_WOOD -> roll == SurfaceType.RollSound.WOOD;
					default -> roll == SurfaceType.RollSound.ROUGH;
				};
				if (!match) {
					return new float[]{0.0F, 1.0F};
				}
				float sportScale = sport == SportType.BMX ? 0.55F : sport == SportType.SKATES ? 0.7F : 1.0F;
				return new float[]{Mth.clamp(speed * 2.4F, 0.0F, 1.0F) * 0.75F * rollScale * sportScale, 0.75F + Mth.clamp(speed, 0.0F, 1.0F) * 0.6F};
			}
			case GRIND_METAL, GRIND_CONCRETE -> {
				if (!grinding) {
					return new float[]{0.0F, 1.0F};
				}
				boolean metal = entity.ride.grind == null || entity.ride.grind.segment.metal();
				if (metal != (loop == Loop.GRIND_METAL)) {
					return new float[]{0.0F, 1.0F};
				}
				return new float[]{0.8F, 0.85F + Mth.clamp(speed, 0.0F, 0.8F) * 0.4F};
			}
			case WIND -> {
				Minecraft mc = Minecraft.getInstance();
				if (entity.getControllingPassenger() != mc.player) {
					return new float[]{0.0F, 1.0F};
				}
				float wind = Mth.clamp((speed - 0.3F) * 1.6F, 0.0F, 0.6F) + (state.contact == RideController.Contact.AIR ? 0.15F : 0.0F);
				return new float[]{wind, 0.8F + speed * 0.3F};
			}
			case FREEWHEEL -> {
				boolean coasting = sport == SportType.BMX && grounded && speed > 0.04F && (state.flags & SportEquipmentEntity.FLAG_PEDALING) == 0;
				return new float[]{coasting ? Mth.clamp(speed * 1.5F, 0.0F, 0.5F) : 0.0F, 0.8F + speed * 0.8F};
			}
			default -> {
				return new float[]{0.0F, 1.0F};
			}
		}
	}

	private static SurfaceType surface(SportEquipmentEntity entity) {
		BlockPos below = BlockPos.containing(entity.getX(), entity.getY() - 0.05, entity.getZ());
		var level = entity.level();
		var state = level.getBlockState(below);
		if (state.isAir()) {
			state = level.getBlockState(below.below());
		}
		if (state.isAir()) {
			state = level.getBlockState(BlockPos.containing(entity.getX(), entity.getY() + 0.2, entity.getZ()));
		}
		return SurfaceType.classify(state);
	}

	static SoundEvent event(Loop loop) {
		return switch (loop) {
			case ROLL_CONCRETE -> ModSounds.ROLL_CONCRETE;
			case ROLL_WOOD -> ModSounds.ROLL_WOOD;
			case ROLL_ROUGH -> ModSounds.ROLL_ROUGH;
			case GRIND_METAL -> ModSounds.GRIND_METAL;
			case GRIND_CONCRETE -> ModSounds.GRIND_CONCRETE;
			case WIND -> ModSounds.WIND;
			case FREEWHEEL -> ModSounds.BMX_FREEWHEEL;
		};
	}

	static final class LoopSound extends AbstractTickableSoundInstance {
		private final SportEquipmentEntity entity;
		private final Loop loop;
		private int silentTicks;

		LoopSound(SportEquipmentEntity entity, Loop loop) {
			super(event(loop), SoundSource.PLAYERS, SoundInstance.createUnseededRandom());
			this.entity = entity;
			this.loop = loop;
			this.looping = true;
			this.delay = 0;
			this.volume = 0.01F;
			this.x = entity.getX();
			this.y = entity.getY();
			this.z = entity.getZ();
		}

		@Override
		public boolean canStartSilent() {
			return true;
		}

		@Override
		public void tick() {
			if (entity.isRemoved()) {
				stop();
				return;
			}
			float[] target = target(entity, loop);
			volume += (target[0] - volume) * 0.35F;
			pitch += (target[1] - pitch) * 0.35F;
			x = entity.getX();
			y = entity.getY();
			z = entity.getZ();
			silentTicks = target[0] < 0.01F ? silentTicks + 1 : 0;
			if (silentTicks > 40) {
				stop();
			}
		}
	}
}
