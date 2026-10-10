package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/** Damage types are data-driven (see data/overkill/damage_type); these are the keys used in code. */
public final class ModDamageTypes {
	public static final ResourceKey<DamageType> SUNLINE = key("sunline");
	public static final ResourceKey<DamageType> WORLDBREAKER = key("worldbreaker");
	public static final ResourceKey<DamageType> BACKFIRE = key("backfire");
	public static final ResourceKey<DamageType> RIFT = key("rift");
	public static final ResourceKey<DamageType> STORM = key("storm");
	public static final ResourceKey<DamageType> SINGULARITY = key("singularity");
	public static final ResourceKey<DamageType> SEARING = key("searing");
	public static final ResourceKey<DamageType> ELECTRIFIED = key("electrified");

	private ModDamageTypes() {
	}

	private static ResourceKey<DamageType> key(String name) {
		return ResourceKey.create(Registries.DAMAGE_TYPE, OverkillArsenal.id(name));
	}

	public static DamageSource source(Level level, ResourceKey<DamageType> key, @Nullable Entity direct, @Nullable Entity causing) {
		return new DamageSource(level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).getOrThrow(key), direct, causing);
	}

	public static DamageSource source(Level level, ResourceKey<DamageType> key, @Nullable Entity attacker) {
		return source(level, key, attacker, attacker);
	}
}
