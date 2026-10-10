package com.blademode.cut;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.blademode.Scenes;
import com.blademode.piece.PieceBlock;
import java.util.List;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class PieceCutterTest {
	private static final Bonds.Space WORLD = Vector3d::new;

	@BeforeAll
	static void bootstrap() {
		SharedConstants.tryDetectVersion();
		Bootstrap.bootStrap();
	}

	@Test
	void sameSlashDoesNotSplitItsOwnPiece() {
		Slash slash = Scenes.houseSlash();
		List<PieceBlock> top = Scenes.sideOf(Scenes.house(), slash.worldPlane(), new Vec3(23.5, -50, 11));
		List<PieceCutter.Fragment> fragments = PieceCutter.split(top, slash.worldPlane(), slash, WORLD);
		assertTrue(fragments.size() < 2, () -> "re-cutting with the same slash must not split the piece, got " + describe(fragments));
	}

	@Test
	void horizontalCutSplitsTheTopInTwo() {
		Slash slash = Scenes.houseSlash();
		List<PieceBlock> top = Scenes.sideOf(Scenes.house(), slash.worldPlane(), new Vec3(23.5, -50, 11));
		// A level stroke through the roof line, seen from the same spot.
		Slash second = Slash.of(new Vec3(23.5, -55.5, -1.5), new Vec3(1, 0, 1), new Vec3(-1, 0, 1), 32);
		assertNotNull(second);
		List<PieceCutter.Fragment> fragments = PieceCutter.split(top, second.worldPlane(), second, WORLD);
		assertEquals(2, fragments.size(), () -> describe(fragments));
	}

	private static String describe(List<PieceCutter.Fragment> fragments) {
		StringBuilder sb = new StringBuilder();
		for (PieceCutter.Fragment f : fragments) {
			sb.append("\n  fragment side=").append(f.side()).append(" blocks=").append(f.blocks().size());
			if (f.blocks().size() < 12) {
				for (PieceBlock b : f.blocks()) {
					sb.append("\n    ").append(b.pos().toShortString()).append(' ').append(b.state()).append(" planes=").append(b.planes());
				}
			}
		}
		return sb.toString();
	}
}
