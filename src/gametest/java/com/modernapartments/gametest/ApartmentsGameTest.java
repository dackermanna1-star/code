package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacedBuilding;
import com.modernapartments.build.placement.PlacementManager;
import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.build.validation.ReachabilityValidator;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;

/**
 * Server game tests: every complex must generate with the exact plot size, and the reachability
 * validator must reach every unit, room and amenity from the entrance with no structural warnings.
 * Run with {@code ./gradlew runGameTest}.
 */
public class ApartmentsGameTest {
	private static void check(GameTestHelper helper, ComplexType type, long seed) {
		long start = System.currentTimeMillis();
		BlockBuffer buffer = BuildCache.generate(type, seed);
		ReachabilityValidator.Report report = ReachabilityValidator.validate(buffer);
		int units = buffer.markers("unit").size();
		System.out.printf("[gametest] %s seed %d: %d units, %d markers, %d unreachable, %d warnings, %d ms%n", type.id(), seed, units,
			report.markersChecked(), report.unreachable().size(), report.warnings().size(), System.currentTimeMillis() - start);
		report.unreachable().stream().limit(20).forEach(u -> System.out.println("[gametest]   unreachable " + u));
		report.warnings().stream().limit(20).forEach(w -> System.out.println("[gametest]   warning " + w));
		if (!report.unreachable().isEmpty()) {
			String first = report.unreachable().get(0);
			java.util.regex.Matcher m = java.util.regex.Pattern.compile("x=(-?\\d+), y=(-?\\d+), z=(-?\\d+)").matcher(first);
			if (m.find()) {
				int x = Integer.parseInt(m.group(1));
				int y = Integer.parseInt(m.group(2));
				int z = Integer.parseInt(m.group(3));
				TestDump.dump(buffer, x - 14, z - 12, x + 14, z + 12, y);
				TestDump.dump(buffer, x - 14, z - 12, x + 14, z + 12, y + 1);
				TestDump.list(buffer, x - 3, z - 3, x + 3, z + 3, y);
			}
		}
		helper.assertTrue(units > 0, "no apartments generated in " + type.id());
		helper.assertTrue(report.unreachable().isEmpty(), type.id() + ": " + report.unreachable().size() + " unreachable markers");
		helper.assertTrue(report.warnings().isEmpty(), type.id() + ": " + report.warnings().size() + " structural warnings");
		helper.succeed();
	}

	@GameTest(maxTicks = 400)
	public void metropolitan(GameTestHelper helper) {
		check(helper, ComplexType.METROPOLITAN, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void parkside(GameTestHelper helper) {
		check(helper, ComplexType.PARKSIDE, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void skyline(GameTestHelper helper) {
		check(helper, ComplexType.SKYLINE, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void courtyard(GameTestHelper helper) {
		check(helper, ComplexType.COURTYARD, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void urbanLofts(GameTestHelper helper) {
		check(helper, ComplexType.URBAN_LOFTS, 1234L);
	}

	/** Placement refuses a spot overlapping (or crowding) a building already placed, and accepts one well away. */
	@GameTest(maxTicks = 100)
	public void placementKeepsApart(GameTestHelper helper) {
		ServerLevel level = helper.getLevel();
		List<PlacedBuilding> before = PlacementManager.placed(level);
		PlacementTransform existing = PlacementManager.transformFor(ComplexType.PARKSIDE, new BlockPos(5000, 0, 5000), Direction.SOUTH);
		level.setAttached(PlacementManager.PLACED, List.of(new PlacedBuilding(UUID.randomUUID(), "parkside", 1L, existing, 0L)));
		try {
			PlacementTransform near = PlacementManager.transformFor(ComplexType.URBAN_LOFTS, new BlockPos(5060, 0, 5000), Direction.SOUTH);
			PlacementTransform far = PlacementManager.transformFor(ComplexType.URBAN_LOFTS, new BlockPos(5300, 0, 5000), Direction.SOUTH);
			helper.assertTrue(PlacementManager.checkFits(level, near) != null, "a complex was allowed on top of another");
			helper.assertTrue(PlacementManager.checkFits(level, far) == null, "a complex well away from the others was refused");
		} finally {
			level.setAttached(PlacementManager.PLACED, before);
		}
		helper.succeed();
	}

	@GameTest(maxTicks = 400)
	public void otherSeeds(GameTestHelper helper) {
		for (ComplexType type : ComplexType.values()) {
			for (long seed : new long[] {7L, 99L}) {
				BlockBuffer buffer = BuildCache.generate(type, seed);
				ReachabilityValidator.Report report = ReachabilityValidator.validate(buffer);
				System.out.printf("[gametest] %s seed %d: %d units, %d unreachable, %d warnings%n", type.id(), seed,
					buffer.markers("unit").size(), report.unreachable().size(), report.warnings().size());
				report.unreachable().stream().limit(5).forEach(u -> System.out.println("[gametest]   unreachable " + u));
				helper.assertTrue(report.ok(), type.id() + " seed " + seed + " failed validation");
			}
		}
		helper.succeed();
	}
}
