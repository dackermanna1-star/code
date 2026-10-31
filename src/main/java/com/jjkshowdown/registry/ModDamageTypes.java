package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import org.jetbrains.annotations.Nullable;

/** Data-driven damage types (see data/jjkshowdown/damage_type). */
public final class ModDamageTypes {
	public static final ResourceKey<DamageType> TECHNIQUE = key("technique");
	public static final ResourceKey<DamageType> BLUE = key("blue");
	public static final ResourceKey<DamageType> RED = key("red");
	public static final ResourceKey<DamageType> HOLLOW_PURPLE = key("hollow_purple");
	public static final ResourceKey<DamageType> DISMANTLE = key("dismantle");
	public static final ResourceKey<DamageType> CLEAVE = key("cleave");
	public static final ResourceKey<DamageType> FUGA = key("fuga");
	public static final ResourceKey<DamageType> WORLD_SLASH = key("world_slash");
	public static final ResourceKey<DamageType> SURE_HIT = key("domain_sure_hit");
	public static final ResourceKey<DamageType> BLACK_FLASH = key("black_flash");
	public static final ResourceKey<DamageType> SLAM = key("slam");
	public static final ResourceKey<DamageType> BACKLASH = key("backlash");
	public static final ResourceKey<DamageType> FINISHER = key("finisher");

	/** Damage that ignores Gojo's Infinity. */
	public static final TagKey<DamageType> BYPASSES_INFINITY = TagKey.create(Registries.DAMAGE_TYPE, JjkShowdown.id("bypasses_infinity"));
	/** Damage that cannot be blocked or parried. */
	public static final TagKey<DamageType> UNBLOCKABLE = TagKey.create(Registries.DAMAGE_TYPE, JjkShowdown.id("unblockable"));
	/** All damage dealt by cursed techniques (used for XP and multipliers). */
	public static final TagKey<DamageType> IS_TECHNIQUE = TagKey.create(Registries.DAMAGE_TYPE, JjkShowdown.id("is_technique"));

	private ModDamageTypes() {
	}

	private static ResourceKey<DamageType> key(String name) {
		return ResourceKey.create(Registries.DAMAGE_TYPE, JjkShowdown.id(name));
	}

	public static DamageSource source(ServerLevel level, ResourceKey<DamageType> type, @Nullable Entity direct, @Nullable Entity causing) {
		return new DamageSource(level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).getOrThrow(type), direct, causing);
	}

	public static DamageSource source(ServerLevel level, ResourceKey<DamageType> type, @Nullable Entity attacker) {
		return source(level, type, attacker, attacker);
	}
}
