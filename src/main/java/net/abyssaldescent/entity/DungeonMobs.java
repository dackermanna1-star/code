package net.abyssaldescent.entity;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModAttachments;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;

/** Applies dungeon scaling, elite affixes and bookkeeping to freshly summoned enemies. */
public final class DungeonMobs {
	private static final Identifier HEALTH = AbyssalDescent.id("dungeon_health");
	private static final Identifier DAMAGE = AbyssalDescent.id("dungeon_damage");
	private static final Identifier ELITE_SCALE = AbyssalDescent.id("elite_scale");
	private static final Identifier ELITE_ARMOR = AbyssalDescent.id("elite_armor");
	private static final Identifier ELITE_KNOCKBACK = AbyssalDescent.id("elite_knockback");
	private static final Identifier ELITE_SPEED = AbyssalDescent.id("elite_speed");

	private DungeonMobs() {
	}

	public static void prepare(Mob mob, MobInfo info, int partySize) {
		mob.setPersistenceRequired();
		mob.setAttached(ModAttachments.MOB_INFO, info);
		AdConfig.Difficulty d = AdConfig.get().difficulty;
		int floor = Math.max(1, info.floor());
		boolean elite = info.elite();
		double health = d.healthMultiplier * (1.0 + d.perFloorHealthScaling * (floor - 1)) * (elite ? 2.4 : 1.0) * (1.0 + 0.15 * (partySize - 1));
		double damage = d.damageMultiplier * (1.0 + d.perFloorDamageScaling * (floor - 1)) * (elite ? 1.25 : 1.0);
		modify(mob, Attributes.MAX_HEALTH, HEALTH, health - 1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		modify(mob, Attributes.ATTACK_DAMAGE, DAMAGE, damage - 1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		if (elite) {
			EliteAffix affix = info.eliteAffix();
			modify(mob, Attributes.SCALE, ELITE_SCALE, 0.15, AttributeModifier.Operation.ADD_VALUE);
			switch (affix) {
				case BULWARK -> {
					modify(mob, Attributes.ARMOR, ELITE_ARMOR, 8.0, AttributeModifier.Operation.ADD_VALUE);
					modify(mob, Attributes.KNOCKBACK_RESISTANCE, ELITE_KNOCKBACK, 0.8, AttributeModifier.Operation.ADD_VALUE);
					modify(mob, Attributes.MOVEMENT_SPEED, ELITE_SPEED, -0.15, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
				}
				case FRENZIED -> modify(mob, Attributes.MOVEMENT_SPEED, ELITE_SPEED, 0.3, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
				default -> {
				}
			}
			mob.setCustomName(Component.translatable("affix.abyssal_descent.title", affix.displayName(), mob.getType().getDescription())
				.withStyle(affix.chatColor()));
			mob.setCustomNameVisible(true);
		}
		mob.setHealth(mob.getMaxHealth());
		if (mob instanceof DungeonMonster monster) {
			monster.onPrepared();
		}
	}

	private static void modify(Mob mob, Holder<Attribute> attribute, Identifier id, double amount, AttributeModifier.Operation op) {
		AttributeInstance instance = mob.getAttribute(attribute);
		if (instance != null && Math.abs(amount) > 1.0E-4) {
			instance.addOrReplacePermanentModifier(new AttributeModifier(id, amount, op));
		}
	}
}
