package com.jjkshowdown.sorcerer;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.boss.SorcererBoss;
import net.minecraft.world.entity.LivingEntity;

/** Cursed energy pool: capacity, regeneration and spending. */
public final class CursedEnergy {
	public static final float BASE_MAX = 1000f;
	public static final float BASE_REGEN = 3.2f;

	private CursedEnergy() {
	}

	public static float max(LivingEntity e) {
		SorcererData d = Sorcerers.data(e);
		float m = BASE_MAX * (1.0f + 0.08f * (Mastery.effective(e) - 1));
		if (d.character() == CharacterType.SUKUNA) m *= 1.0f + 0.03f * d.fingers();
		if (e instanceof SorcererBoss) m *= 1.25f;
		return m * JjkConfig.get().energy.maxMultiplier;
	}

	public static float regenPerTick(LivingEntity e, SorcererState s) {
		float r = BASE_REGEN * (1.0f + 0.05f * (Mastery.effective(e) - 1)) * JjkConfig.get().energy.regenMultiplier;
		if (s.zoneTicks > 0) r *= 2.0f;
		if (s.exhaustedTicks > 0) r *= 0.3f;
		if (s.blocking) r *= 0.5f;
		if (e instanceof SorcererBoss boss) r *= boss.energyRegenScale();
		return r;
	}

	public static float get(LivingEntity e) {
		SorcererData d = Sorcerers.data(e);
		if (d.energy < 0) d.energy = max(e);
		return d.energy;
	}

	public static boolean has(LivingEntity e, float amount) {
		return get(e) >= amount - 0.001f;
	}

	/** Spend if possible. Returns false (and spends nothing) when there is not enough energy. */
	public static boolean spend(LivingEntity e, float amount) {
		if (amount <= 0) return true;
		SorcererData d = Sorcerers.data(e);
		float cur = get(e);
		if (cur < amount - 0.001f) return false;
		d.energy = Math.max(0, cur - amount);
		SorcererState s = Sorcerers.state(e);
		s.dirty = true;
		if (d.energy <= 1f) s.exhaustedTicks = Math.max(s.exhaustedTicks, 60);
		return true;
	}

	/** Drain up to {@code amount}; returns how much was actually drained. */
	public static float drain(LivingEntity e, float amount) {
		SorcererData d = Sorcerers.data(e);
		float cur = get(e);
		float taken = Math.min(cur, amount);
		d.energy = cur - taken;
		Sorcerers.state(e).dirty = true;
		return taken;
	}

	public static void add(LivingEntity e, float amount) {
		SorcererData d = Sorcerers.data(e);
		d.energy = Math.min(max(e), get(e) + amount);
		Sorcerers.state(e).dirty = true;
	}

	public static void fill(LivingEntity e) {
		Sorcerers.data(e).energy = max(e);
		Sorcerers.state(e).dirty = true;
	}

	public static float ratio(LivingEntity e) {
		float m = max(e);
		return m <= 0 ? 0 : get(e) / m;
	}
}
