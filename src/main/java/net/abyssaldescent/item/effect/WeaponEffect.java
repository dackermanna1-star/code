package net.abyssaldescent.item.effect;

import java.util.List;
import net.abyssaldescent.AbyssalDescent;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * A mechanic carried by a weapon. Hooks fire from vanilla combat events (a landed melee hit, a kill, a projectile
 * launch/impact); none of them adds a new input or replaces vanilla combat.
 */
public interface WeaponEffect {
	/** Translation key suffix, e.g. "soul_flare". */
	String id();

	/** Arguments for the description (numbers shown in the tooltip). */
	default Object[] args() {
		return new Object[0];
	}

	default float damageBonus(LivingEntity attacker, Entity target, float baseDamage) {
		return 0.0F;
	}

	default void onHit(HitContext ctx) {
	}

	default void onKill(HitContext ctx) {
	}

	default void onProjectileLaunch(Projectile projectile, LivingEntity shooter, ItemStack weapon) {
	}

	default void onProjectileHit(ServerLevel level, Projectile projectile, @Nullable Entity hit, Vec3 at, @Nullable LivingEntity owner) {
	}

	default void describe(List<Component> lines, int accentColor) {
		lines.add(Component.literal("◆ ").withColor(accentColor)
			.append(Component.translatable("effect_desc." + AbyssalDescent.MOD_ID + "." + id() + ".name").withColor(accentColor)));
		lines.add(Component.literal("  ").append(Component.translatable("effect_desc." + AbyssalDescent.MOD_ID + "." + id(), args()))
			.withStyle(ChatFormatting.GRAY));
	}

	/**
	 * @param charge attack strength (0..1) captured at the moment of the swing
	 * @param crit   vanilla critical hit conditions were met
	 */
	record HitContext(ServerLevel level, LivingEntity attacker, LivingEntity target, ItemStack weapon, float charge, boolean crit) {
		public boolean fullCharge() {
			return charge >= 0.9F;
		}
	}
}
