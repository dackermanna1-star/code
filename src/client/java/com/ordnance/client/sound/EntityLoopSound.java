package com.ordnance.client.sound;

import java.util.function.Predicate;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.sound.MovingSoundInstance;
import net.minecraft.client.sound.SoundInstance;
import net.minecraft.entity.Entity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.MathHelper;

/**
 * A looping sound attached to an entity, with a Doppler pitch shift from the rate of change of listener distance
 * (rocket motors rise in pitch as they approach and drop as they pass).
 */
public class EntityLoopSound extends MovingSoundInstance {
	private static final double SPEED_OF_SOUND = 17.15;
	private final Entity entity;
	private final Predicate<Entity> active;
	private final float basePitch;
	private final float baseVolume;
	private double lastDistance = -1.0;
	private int age;

	public EntityLoopSound(Entity entity, SoundEvent sound, SoundCategory category, float volume, float pitch, Predicate<Entity> active) {
		super(sound, category, SoundInstance.createRandom());
		this.entity = entity;
		this.active = active;
		this.basePitch = pitch;
		this.baseVolume = volume;
		this.volume = volume;
		this.pitch = pitch;
		this.repeat = true;
		this.repeatDelay = 0;
		this.x = entity.getX();
		this.y = entity.getY();
		this.z = entity.getZ();
	}

	@Override
	public void tick() {
		if (this.entity.isRemoved() || !this.active.test(this.entity)) {
			this.setDone();
			return;
		}

		this.age++;
		this.x = this.entity.getX();
		this.y = this.entity.getY();
		this.z = this.entity.getZ();
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.gameRenderer != null) {
			double distance = client.gameRenderer.getCamera().getCameraPos().distanceTo(this.entity.getEntityPos());
			if (this.lastDistance >= 0.0) {
				double radial = distance - this.lastDistance;
				this.pitch = this.basePitch * (float)MathHelper.clamp(SPEED_OF_SOUND / (SPEED_OF_SOUND + radial), 0.5, 2.0);
			}

			this.lastDistance = distance;
		}

		this.volume = this.baseVolume * Math.min(1.0F, this.age / 4.0F + 0.25F);
	}

	@Override
	public boolean shouldAlwaysPlay() {
		return true;
	}

	@Override
	public boolean canPlay() {
		return !this.entity.isSilent();
	}
}
