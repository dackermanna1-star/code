package net.abyssaldescent.item.relic;

import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.config.AdConfig;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/** Tracks which relics are active per player and applies their passive effects. */
public final class Relics {
	private static final Identifier LOCKET_HEALTH = AbyssalDescent.id("relic_gravedust_locket");
	private static final Map<UUID, Set<RelicKind>> ACTIVE = new HashMap<>();

	private Relics() {
	}

	public static boolean isActive(Player player, RelicKind kind) {
		Set<RelicKind> set = ACTIVE.get(player.getUUID());
		return set != null && set.contains(kind);
	}

	public static Set<RelicKind> active(Player player) {
		Set<RelicKind> set = ACTIVE.get(player.getUUID());
		return set == null ? EnumSet.noneOf(RelicKind.class) : set;
	}

	/** Client-side query (the client knows its own inventory). */
	public static boolean carries(Player player, RelicKind kind) {
		return scan(player).contains(kind);
	}

	private static Set<RelicKind> scan(Player player) {
		Set<RelicKind> found = EnumSet.noneOf(RelicKind.class);
		int cap = AdConfig.get().rules.maxActiveRelics;
		Inventory inventory = player.getInventory();
		for (int i = 0; i < 9 && found.size() < cap; i++) {
			add(found, inventory.getItem(i));
		}
		if (found.size() < cap) {
			add(found, player.getOffhandItem());
		}
		return found;
	}

	private static void add(Set<RelicKind> found, ItemStack stack) {
		if (stack.getItem() instanceof RelicItem relic) {
			found.add(relic.kind());
		}
	}

	/** Called every 10 ticks per player. */
	public static void tick(ServerPlayer player) {
		Set<RelicKind> found = scan(player);
		ACTIVE.put(player.getUUID(), found);
		AttributeInstance health = player.getAttribute(Attributes.MAX_HEALTH);
		if (health != null) {
			boolean has = health.hasModifier(LOCKET_HEALTH);
			if (found.contains(RelicKind.GRAVEDUST_LOCKET) && !has) {
				health.addTransientModifier(new AttributeModifier(LOCKET_HEALTH, 2.0, AttributeModifier.Operation.ADD_VALUE));
			} else if (!found.contains(RelicKind.GRAVEDUST_LOCKET) && has) {
				health.removeModifier(LOCKET_HEALTH);
				if (player.getHealth() > player.getMaxHealth()) {
					player.setHealth(player.getMaxHealth());
				}
			}
		}
		if (found.contains(RelicKind.VIGIL_CANDLE)) {
			player.removeEffect(MobEffects.BLINDNESS);
			player.removeEffect(MobEffects.DARKNESS);
		}
		if (found.contains(RelicKind.HOLLOW_CROWN) && player.level() instanceof ServerLevel level) {
			for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(6.0),
				e -> e.getType().is(EntityTypeTags.UNDEAD) && e.isAlive())) {
				e.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 25, 0, true, true));
			}
		}
	}

	public static void forget(Player player) {
		ACTIVE.remove(player.getUUID());
	}
}
