package net.earthscapes.item;

import net.earthscapes.block.VictoriaLilyPadBlock;
import net.minecraft.world.item.PlaceOnWaterBlockItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/** Places all nine parts of a giant water lily pad at once, if the water is wide enough. */
public class VictoriaLilyPadItem extends PlaceOnWaterBlockItem {
	public VictoriaLilyPadItem(Block block, Properties properties) {
		super(block, properties);
	}

	@Override
	protected boolean canPlace(BlockPlaceContext context, BlockState state) {
		return this.getBlock() instanceof VictoriaLilyPadBlock pad && pad.canPlacePad(context.getLevel(), context.getClickedPos());
	}

	@Override
	protected boolean placeBlock(BlockPlaceContext context, BlockState state) {
		if (this.getBlock() instanceof VictoriaLilyPadBlock pad && pad.canPlacePad(context.getLevel(), context.getClickedPos())) {
			pad.placePad(context.getLevel(), context.getClickedPos(), Block.UPDATE_ALL_IMMEDIATE);
			return true;
		}
		return false;
	}
}
