package com.godforge.client.sound;

import java.util.function.ToDoubleFunction;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;

/**
 * A looping sound attached to an effect entity. Volume and pitch are recomputed every tick so loops can
 * intensify (e.g. the laser hum rising with its power level).
 */
public class EntityLoopSound extends AbstractTickableSoundInstance {
	private final Entity entity;
	private final ToDoubleFunction<Entity> volumeFn;
	private final ToDoubleFunction<Entity> pitchFn;
	private int fadeIn;

	public EntityLoopSound(Entity entity, SoundEvent event, ToDoubleFunction<Entity> volume, ToDoubleFunction<Entity> pitch) {
		super(event, SoundSource.PLAYERS, SoundInstance.createUnseededRandom());
		this.entity = entity;
		this.volumeFn = volume;
		this.pitchFn = pitch;
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
		if (this.entity.isRemoved()) {
			this.stop();
			return;
		}
		this.x = this.entity.getX();
		this.y = this.entity.getY();
		this.z = this.entity.getZ();
		this.fadeIn = Math.min(10, this.fadeIn + 1);
		this.volume = (float) Math.max(0.0, this.volumeFn.applyAsDouble(this.entity)) * this.fadeIn / 10.0F;
		this.pitch = (float) Math.max(0.5, Math.min(2.0, this.pitchFn.applyAsDouble(this.entity)));
	}
}
