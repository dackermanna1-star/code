package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ScaffoldTest {
	@Test
	void laptopDataRoundTripsThroughBuild() {
		LaptopData data = new LaptopData(42L);
		data.putEdit(1, MiniWorld.index(3, 10, 4), MiniBlock.BRICKS);
		assertEquals(MiniBlock.BRICKS, data.build(1).get(3, 10, 4));
	}
}
