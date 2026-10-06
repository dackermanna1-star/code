package com.laptopcraft.block.decor;

import com.laptopcraft.registry.ModSounds;
import com.mojang.serialization.MapCodec;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/** A huggable plushie. Right-click squishes it: a squish, a tiny (high-pitched) version of the mob's voice and hearts. */
public class PlushBlock extends FacingDecorBlock {
	public static final MapCodec<PlushBlock> CODEC = simpleCodec(p -> new PlushBlock(Kind.TEDDY_BEAR, p));

	/** The plushie kinds with their outline shape (facing north) and voice. */
	public enum Kind {
		CREEPER("creeper", Block.box(4, 0, 4, 12, 15, 12), SoundEvents.CREEPER_PRIMED, 1.7F, 0.35F),
		PIG("pig", Shapes.or(Block.box(4, 0, 2.5, 12, 11.5, 13), Block.box(5.5, 4, 1.5, 10.5, 7, 2.5)), SoundEvents.PIG_AMBIENT, 1.5F, 0.6F),
		TEDDY_BEAR("teddy_bear", Shapes.or(Block.box(3.5, 0, 2.5, 12.5, 7, 11), Block.box(4.5, 7, 4.5, 11.5, 14.5, 10.5)), ModSounds.TOY_SQUEAK, 0.7F, 0.6F),
		AXOLOTL("axolotl", Block.box(2, 0, 1.5, 14, 6.5, 15.5), SoundEvents.AXOLOTL_IDLE_AIR, 1.4F, 0.7F),
		ENDERMAN("enderman", Block.box(4.5, 0, 3.5, 11.5, 16, 10.5), SoundEvents.ENDERMAN_AMBIENT, 1.8F, 0.35F),
		SNIFFER("sniffer", Block.box(4, 0, 0.5, 12, 10.5, 13), SoundEvents.SNIFFER_HAPPY, 1.5F, 0.6F);

		final String id;
		final VoxelShape shape;
		final SoundEvent voice;
		final float pitch;
		final float volume;

		Kind(String id, VoxelShape shape, SoundEvent voice, float pitch, float volume) {
			this.id = id;
			this.shape = shape;
			this.voice = voice;
			this.pitch = pitch;
			this.volume = volume;
		}
	}

	private final Kind kind;

	public PlushBlock(Kind kind, BlockBehaviour.Properties properties) {
		super(properties, kind.shape);
		this.kind = kind;
	}

	@Override
	protected MapCodec<? extends PlushBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		var random = level.getRandom();
		double x = pos.getX() + 0.5;
		double y = pos.getY() + 0.5;
		double z = pos.getZ() + 0.5;
		level.playSound(null, pos, SoundEvents.SLIME_SQUISH_SMALL, SoundSource.BLOCKS, 0.7F, 1.3F + random.nextFloat() * 0.2F);
		level.playSound(null, pos, kind.voice, SoundSource.BLOCKS, kind.volume, kind.pitch + random.nextFloat() * 0.15F);
		if (level instanceof ServerLevel serverLevel) {
			serverLevel.sendParticles(ParticleTypes.HEART, x, y + 0.45, z, 2 + random.nextInt(2), 0.25, 0.1, 0.25, 0.0);
			if (random.nextInt(6) == 0) {
				player.displayClientMessage(Component.translatable("block.laptopcraft.plush.squish." + kind.id)
						.withStyle(ChatFormatting.LIGHT_PURPLE), true);
			}
		}
		return InteractionResult.SUCCESS;
	}
}
