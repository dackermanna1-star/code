package net.abyssaldescent.item.combat;

import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.item.effect.WeaponEffect;
import net.abyssaldescent.registry.ModAttachments;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Remembers which dungeon weapon fired a projectile, so its traits can run on impact (and clients can draw trails). */
public final class ProjectileTraits {
	private ProjectileTraits() {
	}

	public static void tag(Projectile projectile, Item weapon) {
		projectile.setAttached(ModAttachments.PROJECTILE_SOURCE, BuiltInRegistries.ITEM.getKey(weapon));
	}

	@Nullable
	public static GearItem source(Entity projectile) {
		Identifier id = projectile.getAttached(ModAttachments.PROJECTILE_SOURCE);
		if (id == null) {
			return null;
		}
		Item item = BuiltInRegistries.ITEM.getValue(id);
		return item instanceof GearItem gear ? gear : null;
	}

	public static void onImpact(Projectile projectile, @Nullable Entity hit, Vec3 at) {
		if (!(projectile.level() instanceof ServerLevel level)) {
			return;
		}
		GearItem gear = source(projectile);
		if (gear == null) {
			return;
		}
		LivingEntity owner = projectile.getOwner() instanceof LivingEntity living ? living : null;
		for (WeaponEffect effect : gear.spec().effects()) {
			effect.onProjectileHit(level, projectile, hit, at, owner);
		}
	}
}
