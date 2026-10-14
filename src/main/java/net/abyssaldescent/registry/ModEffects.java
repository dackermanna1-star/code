package net.abyssaldescent.registry;

import java.util.List;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.effect.BleedingEffect;
import net.abyssaldescent.effect.MendingEffect;
import net.abyssaldescent.effect.SimpleEffect;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;

public final class ModEffects {
	public static final Holder<MobEffect> BLEEDING = register("bleeding", new BleedingEffect());
	public static final Holder<MobEffect> MENDING = register("mending", new MendingEffect());
	/** -15% damage taken per level, plus knockback resistance. */
	public static final Holder<MobEffect> WARDING = register("warding", new SimpleEffect(MobEffectCategory.BENEFICIAL, 0xC9D6E3)
		.addAttributeModifier(Attributes.KNOCKBACK_RESISTANCE, AbyssalDescent.id("effect.warding"), 0.5, AttributeModifier.Operation.ADD_VALUE));
	/** Risk/reward: +25% melee damage, -25% armour. */
	public static final Holder<MobEffect> BLOODRAGE = register("bloodrage", new SimpleEffect(MobEffectCategory.NEUTRAL, 0xB0123A)
		.addAttributeModifier(Attributes.ATTACK_DAMAGE, AbyssalDescent.id("effect.bloodrage_damage"), 0.25, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL)
		.addAttributeModifier(Attributes.ARMOR, AbyssalDescent.id("effect.bloodrage_armor"), -0.25, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
	/** -40% soul magic damage. */
	public static final Holder<MobEffect> SOULWARD = register("soulward", new SimpleEffect(MobEffectCategory.BENEFICIAL, 0x56D8FF));
	/** Gravewarden Deathward cooldown indicator. */
	public static final Holder<MobEffect> DEATHWARD_SPENT = register("deathward_spent", new SimpleEffect(MobEffectCategory.NEUTRAL, 0x3E5A6B));
	public static final Holder<MobEffect> CURSE_FRAILTY = register("curse_frailty", new SimpleEffect(MobEffectCategory.HARMFUL, 0x5B2A7A)
		.addAttributeModifier(Attributes.MAX_HEALTH, AbyssalDescent.id("effect.curse_frailty"), -0.2, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
	/** +20% damage taken. */
	public static final Holder<MobEffect> CURSE_FRAGILITY = register("curse_fragility", new SimpleEffect(MobEffectCategory.HARMFUL, 0x7A2A5B));
	public static final Holder<MobEffect> CURSE_LETHARGY = register("curse_lethargy", new SimpleEffect(MobEffectCategory.HARMFUL, 0x3A2A7A)
		.addAttributeModifier(Attributes.MOVEMENT_SPEED, AbyssalDescent.id("effect.curse_lethargy_speed"), -0.1, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL)
		.addAttributeModifier(Attributes.ATTACK_SPEED, AbyssalDescent.id("effect.curse_lethargy_attack"), -0.1, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));

	/** Curses granted by Cursed Idols; all are removed when leaving the dungeon. */
	public static final List<Holder<MobEffect>> CURSES = List.of(CURSE_FRAILTY, CURSE_FRAGILITY, CURSE_LETHARGY);

	private ModEffects() {
	}

	private static Holder<MobEffect> register(String name, MobEffect effect) {
		return Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT, AbyssalDescent.id(name), effect);
	}

	public static void init() {
	}
}
