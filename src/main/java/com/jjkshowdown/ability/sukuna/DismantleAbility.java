package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.entity.projectile.DismantleEntity;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.util.Fx;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** Dismantle. Tap for a single razor slash; hold (mastery 3+) to unleash a barrage. */
public class DismantleAbility extends Ability {
	public static final int BARRAGE_DELAY = 6;

	public DismantleAbility() {
		super("dismantle", CharacterType.SUKUNA, AbilitySlot.PRIMARY, Mode.CHARGE, 1, true, 55f, 14, 50);
	}

	@Override
	public boolean autoRelease() {
		return true;
	}

	@Override
	public float chargeCostScale(int chargeTicks) {
		return chargeTicks >= BARRAGE_DELAY ? 0.4f : 1.0f;
	}

	@Override
	public void onChargeStart(CastContext ctx) {
		Casting.pose(ctx, CastPose.SLASH, 8);
	}

	@Override
	public void onChargeTick(CastContext ctx, int ticks) {
		if (ticks < BARRAGE_DELAY || Mastery.effective(ctx.caster()) < 3) return;
		if ((ticks - BARRAGE_DELAY) % 3 == 0) {
			if (!CursedEnergy.spend(ctx.caster(), cost(ctx.caster()) * 0.4f)) return;
			LivingEntity c = ctx.caster();
			Vec3 aim = ctx.aim();
			Vec3 spread = new Vec3(c.getRandom().nextGaussian() * 0.06, c.getRandom().nextGaussian() * 0.05, c.getRandom().nextGaussian() * 0.06);
			fire(ctx, aim.add(spread).normalize(), 2.2f, damage(c, 4.5f), c.getRandom().nextFloat() * 160 - 80);
			Casting.pose(ctx, CastPose.SLASH, 6);
			if (ticks == BARRAGE_DELAY) Fx.sound(c, ModSounds.DISMANTLE_BARRAGE, 1.4f, 1.0f);
		}
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		LivingEntity c = ctx.caster();
		if (chargeTicks >= BARRAGE_DELAY && Mastery.effective(c) >= 3) {
			return; // barrage already fired while held
		}
		float roll = (c.tickCount % 2 == 0 ? 1 : -1) * (10 + c.getRandom().nextFloat() * 25);
		fire(ctx, ctx.aim(), 2.8f, damage(c, 7f), roll);
		Casting.pose(ctx, CastPose.SLASH, 8);
		Fx.sound(c, ModSounds.DISMANTLE, 1.3f, 0.9f + c.getRandom().nextFloat() * 0.2f);
		Casting.voice(ctx, VoiceLine.SUKUNA_DISMANTLE, 0.18f);
	}

	private void fire(CastContext ctx, Vec3 dir, float width, float dmg, float roll) {
		DismantleEntity d = DismantleEntity.create(ctx.level(), ctx.caster(), width, dmg, roll, 2.0f + Mastery.effective(ctx.caster()) * 0.15f);
		d.launch(ctx.eye().add(dir.scale(0.9)).add(0, -0.2, 0), dir, 3.2);
		ctx.level().addFreshEntity(d);
		if (ctx.caster().getRandom().nextInt(2) == 0) Fx.sound(ctx.caster(), ModSounds.SHRINE_SLASH, 0.6f, 1.4f);
	}
}
