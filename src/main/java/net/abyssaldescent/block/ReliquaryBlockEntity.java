package net.abyssaldescent.block;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.registry.ModBlockEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

public class ReliquaryBlockEntity extends BlockEntity {
	private int tier = LootTier.CHEST.ordinal();
	private int floor = 1;
	private final Set<UUID> looted = new HashSet<>();

	public ReliquaryBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.RELIQUARY, pos, state);
	}

	public void setup(LootTier tier, int floor) {
		this.tier = tier.ordinal();
		this.floor = floor;
		setChanged();
	}

	public LootTier tier() {
		return LootTier.byId(tier);
	}

	public int floor() {
		return floor;
	}

	public boolean hasLooted(UUID player) {
		return looted.contains(player);
	}

	public void markLooted(UUID player) {
		looted.add(player);
		setChanged();
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		tier = input.getIntOr("tier", LootTier.CHEST.ordinal());
		floor = input.getIntOr("floor", 1);
		looted.clear();
		input.read("looted", UUIDUtil.CODEC.listOf()).ifPresent(looted::addAll);
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		output.putInt("tier", tier);
		output.putInt("floor", floor);
		output.store("looted", UUIDUtil.CODEC.listOf(), new ArrayList<>(looted));
	}

	public List<UUID> lootedBy() {
		return List.copyOf(looted);
	}
}
