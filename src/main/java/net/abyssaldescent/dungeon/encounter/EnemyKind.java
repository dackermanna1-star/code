package net.abyssaldescent.dungeon.encounter;

import java.util.function.Supplier;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.registry.ModEntities;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;

/**
 * The dungeon's enemy roster. {@code cost} is spent from an encounter's threat budget; {@code role} keeps waves mixed
 * (a frontline that holds the player while the backline harasses).
 */
public enum EnemyKind {
	RISEN(Zone.FORGOTTEN_HALLS, Role.FRONTLINE, 2, 1, 10, () -> ModEntities.RISEN),
	BONE_ARCHER(Zone.FORGOTTEN_HALLS, Role.BACKLINE, 3, 1, 7, () -> ModEntities.BONE_ARCHER),
	CRYPT_GHOUL(Zone.FORGOTTEN_HALLS, Role.SKIRMISHER, 3, 2, 7, () -> ModEntities.CRYPT_GHOUL),
	BONE_SHIELDBEARER(Zone.FORGOTTEN_HALLS, Role.FRONTLINE, 4, 2, 6, () -> ModEntities.BONE_SHIELDBEARER),
	WAILING_SKULL(Zone.FORGOTTEN_HALLS, Role.BACKLINE, 3, 3, 6, () -> ModEntities.WAILING_SKULL),
	BARROW_KNIGHT(Zone.FORGOTTEN_HALLS, Role.HEAVY, 7, 4, 3, () -> ModEntities.BARROW_KNIGHT);

	public enum Role {
		FRONTLINE,
		BACKLINE,
		SKIRMISHER,
		HEAVY
	}

	private final Zone zone;
	private final Role role;
	private final int cost;
	private final int minFloor;
	private final int weight;
	private final Supplier<EntityType<? extends Mob>> type;

	EnemyKind(Zone zone, Role role, int cost, int minFloor, int weight, Supplier<EntityType<? extends Mob>> type) {
		this.zone = zone;
		this.role = role;
		this.cost = cost;
		this.minFloor = minFloor;
		this.weight = weight;
		this.type = type;
	}

	public Zone zone() {
		return zone;
	}

	public Role role() {
		return role;
	}

	public int cost() {
		return cost;
	}

	public int minFloor() {
		return minFloor;
	}

	public int weight() {
		return weight;
	}

	public EntityType<? extends Mob> type() {
		return type.get();
	}

	public boolean availableOn(int floor) {
		return Zone.forFloor(floor) == zone && floor >= minFloor;
	}
}
