package dev.visceral.combat;

import dev.visceral.state.BodyRegion;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Carries the details of one of our melee hits through vanilla's damage pipeline
 * ({@code Player.attack -> LivingEntity.hurtServer}) so the mixins can apply regional damage,
 * suppress vanilla sweep/knockback and build a precise physical impact.
 */
public final class CombatContext {
	private static final ThreadLocal<CombatContext> CURRENT = new ThreadLocal<>();

	public final LivingEntity attacker;
	public final LivingEntity target;
	public final AttackDef def;
	public final Vec3 hitPoint;
	/** Horizontal-ish unit push direction (world). */
	public final Vec3 push;
	public final BodyRegion region;
	public final boolean finisher;
	public final boolean opening;
	/** Set by the damage hook: whether damage actually got through. */
	public boolean landed;
	public float dealt;

	private CombatContext(LivingEntity attacker, LivingEntity target, AttackDef def, Vec3 hitPoint, Vec3 push, BodyRegion region, boolean finisher,
		boolean opening) {
		this.attacker = attacker;
		this.target = target;
		this.def = def;
		this.hitPoint = hitPoint;
		this.push = push;
		this.region = region;
		this.finisher = finisher;
		this.opening = opening;
	}

	public static CombatContext begin(LivingEntity attacker, LivingEntity target, AttackDef def, Vec3 hitPoint, Vec3 push, BodyRegion region,
		boolean finisher, boolean opening) {
		CombatContext ctx = new CombatContext(attacker, target, def, hitPoint, push, region, finisher, opening);
		CURRENT.set(ctx);
		return ctx;
	}

	public static void end() {
		CURRENT.remove();
	}

	public static @Nullable CombatContext current() {
		return CURRENT.get();
	}

	/** The active context if it concerns {@code entity} as target. */
	public static @Nullable CombatContext forTarget(LivingEntity entity) {
		CombatContext ctx = CURRENT.get();
		return ctx != null && ctx.target == entity ? ctx : null;
	}

	public static boolean active() {
		return CURRENT.get() != null;
	}
}
