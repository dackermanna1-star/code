package net.abyssaldescent.entity.merchant;

import java.util.List;
import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.dungeon.run.Unsecured;
import net.abyssaldescent.registry.ModItems;
import net.abyssaldescent.registry.ModPotions;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.LookAtTradingPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.npc.villager.AbstractVillager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jetbrains.annotations.Nullable;

/**
 * A hooded delver who has made camp in the dark. Trades potions, arrows, food, emergency Waystone Shards and a few
 * pieces of gear for Ancient Coins. Everything bought inside the dungeon is unsecured until extraction.
 */
public class DelverMerchant extends AbstractVillager {
	private long runId = -1;
	private int floor = 1;

	public DelverMerchant(EntityType<? extends AbstractVillager> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, 20.0).add(Attributes.MOVEMENT_SPEED, 0.0);
	}

	public void setup(long runId, int floor) {
		this.runId = runId;
		this.floor = floor;
		setPersistenceRequired();
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(1, new LookAtTradingPlayerGoal(this));
		goalSelector.addGoal(2, new LookAtPlayerGoal(this, Player.class, 8.0F));
		goalSelector.addGoal(3, new RandomLookAroundGoal(this));
	}

	@Override
	public InteractionResult mobInteract(Player player, InteractionHand hand) {
		if (isAlive() && !isTrading()) {
			if (!level().isClientSide()) {
				if (getOffers().isEmpty()) {
					return InteractionResult.CONSUME;
				}
				setTradingPlayer(player);
				openTradingScreen(player, getDisplayName(), 1);
			}
			return InteractionResult.SUCCESS;
		}
		return super.mobInteract(player, hand);
	}

	@Override
	protected void updateTrades(ServerLevel level) {
		MerchantOffers offers = getOffers();
		offers.add(offer(ItemStack.EMPTY, potion(ModPotions.MENDING), 6, 3));
		offers.add(offer(ItemStack.EMPTY, potion(ModPotions.WARDING), 8, 2));
		offers.add(offer(ItemStack.EMPTY, potion(ModPotions.SOULWARD), 8, 2));
		if (random.nextBoolean()) {
			offers.add(offer(ItemStack.EMPTY, potion(ModPotions.BLOODRAGE), 10, 1));
		}
		offers.add(offer(ItemStack.EMPTY, new ItemStack(Items.ARROW, 16), 3, 4));
		offers.add(offer(ItemStack.EMPTY, new ItemStack(Items.COOKED_MUTTON, 4), 3, 4));
		offers.add(offer(ItemStack.EMPTY, new ItemStack(ModItems.WAYSTONE_SHARD), 22, 1));
		List<ItemStack> gear = LootRoller.rollMerchantStock(level.random, floor, 2);
		for (ItemStack stack : gear) {
			Rarity rarity = Rarity.of(stack);
			int price = switch (rarity) {
				case COMMON -> 6;
				case UNCOMMON -> 12;
				case RARE -> 20;
				case EPIC -> 32;
				case LEGENDARY -> 48;
			};
			offers.add(offer(ItemStack.EMPTY, stack, price + random.nextInt(4), 1));
		}
	}

	private ItemStack potion(Holder<Potion> potion) {
		ItemStack stack = new ItemStack(Items.POTION);
		stack.set(DataComponents.POTION_CONTENTS, new PotionContents(potion));
		return stack;
	}

	private MerchantOffer offer(ItemStack unused, ItemStack result, int coins, int uses) {
		ItemStack tagged = result.copy();
		if (runId >= 0) {
			Unsecured.tag(tagged, runId);
		}
		return new MerchantOffer(new ItemCost(ModItems.ANCIENT_COIN, Math.max(1, Math.min(64, coins))), tagged, uses, 0, 0.0F);
	}

	@Override
	protected void rewardTradeXp(MerchantOffer offer) {
	}

	@Override
	public boolean showProgressBar() {
		return false;
	}

	@Override
	public @Nullable AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
		return null;
	}

	@Override
	public boolean isInvulnerableTo(ServerLevel level, DamageSource source) {
		return !source.isCreativePlayer() || super.isInvulnerableTo(level, source);
	}

	@Override
	public boolean removeWhenFarAway(double distance) {
		return false;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return isTrading() ? SoundEvents.WANDERING_TRADER_TRADE : SoundEvents.WANDERING_TRADER_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.WANDERING_TRADER_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.WANDERING_TRADER_DEATH;
	}

	@Override
	protected SoundEvent getTradeUpdatedSound(boolean accepted) {
		return accepted ? SoundEvents.WANDERING_TRADER_YES : SoundEvents.WANDERING_TRADER_NO;
	}

	@Override
	public SoundEvent getNotifyTradeSound() {
		return SoundEvents.WANDERING_TRADER_YES;
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putLong("run_id", runId);
		output.putInt("floor", floor);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		runId = input.getLongOr("run_id", -1);
		floor = input.getIntOr("floor", 1);
	}
}
