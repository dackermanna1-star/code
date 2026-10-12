package com.chaosunleashed.block;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.registry.ModBlockEntities;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/** Keeps the panel's screen color, redstone output and comparator output in sync with the event manager. */
public class ChaosControlPanelBlockEntity extends BlockEntity {
	private int comparatorOutput;

	public ChaosControlPanelBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.CHAOS_CONTROL_PANEL, pos, state);
	}

	public int getComparatorOutput() {
		return this.comparatorOutput;
	}

	public static void serverTick(World world, BlockPos pos, BlockState state, ChaosControlPanelBlockEntity panel) {
		ChaosEventManager manager = ChaosEventManager.get();
		PanelStatus status = PanelStatus.IDLE;
		int comparator = 0;
		if (manager != null) {
			status = PanelStatus.fromPhase(manager.dominantPhase());
			if (!manager.activeEvents().isEmpty()) {
				ChaosEvent event = manager.activeEvents().getFirst();
				comparator = event.type().ordinal() + 1;
			}
		}
		if (state.get(ChaosControlPanelBlock.STATUS) != status) {
			world.setBlockState(pos, state.with(ChaosControlPanelBlock.STATUS, status), Block.NOTIFY_ALL);
		}
		if (panel.comparatorOutput != comparator) {
			panel.comparatorOutput = comparator;
			world.updateComparators(pos, state.getBlock());
		}
	}
}
