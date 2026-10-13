package dev.calibercraft.item;

import dev.calibercraft.core.GunState;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.CaliberDataHolder;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * A firearm. All behaviour is driven by the data-driven {@link dev.calibercraft.data.WeaponDefinition}
 * whose id equals this item's id; firing/reloading is handled by the client input layer and validated by
 * the server ({@link dev.calibercraft.server.GunService}).
 */
public class FirearmItem extends Item {
	private final Identifier weaponId;

	public FirearmItem(Properties properties, Identifier weaponId) {
		super(properties);
		this.weaponId = weaponId;
	}

	public Identifier weaponId() {
		return weaponId;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		// Aiming is handled client-side; returning PASS lets vanilla continue (e.g. off-hand items).
		return InteractionResult.PASS;
	}

	@Override
	public boolean canDestroyBlock(ItemStack stack, BlockState state, Level level, BlockPos pos, LivingEntity entity) {
		return false;
	}

	@Override
	public void inventoryTick(ItemStack stack, ServerLevel level, Entity entity, @Nullable EquipmentSlot slot) {
		WeaponStacks.ensureInitialized(stack, CaliberDataHolder.server());
	}

	@Override
	public void onCraftedPostProcess(ItemStack stack, Level level) {
		WeaponStacks.ensureInitialized(stack, CaliberDataHolder.get(level));
	}

	// The item bar shows the magazine level (or heat while the weapon is hot). Only rendered client-side.
	@Override
	public boolean isBarVisible(ItemStack stack) {
		return stack.has(dev.calibercraft.registry.ModComponents.GUN_STATE);
	}

	@Override
	public int getBarWidth(ItemStack stack) {
		CaliberData data = CaliberDataHolder.client();
		Optional<WeaponStats> stats = WeaponStacks.stats(stack, data);
		GunState s = WeaponStacks.state(stack);
		if (stats.isEmpty()) {
			return 0;
		}
		int cap = Math.max(1, stats.get().i(Stat.MAGAZINE));
		return Mth.clamp(Math.round(13.0f * Math.min(cap, s.rounds()) / cap), 0, 13);
	}

	@Override
	public int getBarColor(ItemStack stack) {
		GunState s = WeaponStacks.state(stack);
		if (s.overheated()) {
			return 0xFF4020;
		}
		return s.total() == 0 ? 0xC03030 : 0xE8C050;
	}
}
