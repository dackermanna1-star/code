/**
 * Painters for vehicle items (helicopter): side view, nose to the left. Units: 16×16 px.
 */
import { Painter as P, rgba, lin, darken, lighten, rrect, ellipse, poly, circle, METAL, GLASS, type Ctx } from './kit';

export function helicopter(p: P) {
  const top = p.params.color || 0xa51d18;
  const bottom = p.params.color2 || 0xe9e5dc;
  const metal = 0xb7bbc1;
  // tail rotor disc (behind the fin)
  p.part((g) => { circle(g, 14.3, 6.1, 1.45); g.fillStyle = rgba(0xc8c8c8, 0.35); g.fill(); }, undefined, METAL, 0.8);
  // tail boom (tapered)
  const boom = (g: Ctx) => poly(g, [7.6, 6.7, 14.8, 5.6, 14.9, 6.7, 7.6, 9.0]);
  p.part((g) => { boom(g); g.fillStyle = rgba(top); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 0, 5.6, 0, 9, [[0, lighten(top, 0.3)], [0.5, top], [0.55, bottom], [1, darken(bottom, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
  }, { rough: 0.25 });
  // vertical fin + stabiliser
  p.part((g) => { poly(g, [13.3, 6.2, 14.3, 3.1, 15.6, 3.1, 15.3, 6.6]); g.fillStyle = rgba(top); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 13, 3, 15.6, 6.5, [[0, lighten(top, 0.25)], [1, darken(top, 0.3)]]);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = rgba(bottom); g.fillRect(13, 3.0, 3, 0.7);
  }, { rough: 0.25 });
  p.part((g) => { rrect(g, 11.6, 6.5, 2.6, 0.7, 0.3); g.fillStyle = rgba(bottom); g.fill(); }, undefined, { rough: 0.3 });
  // engine cowling + mast
  p.part((g) => { rrect(g, 5.2, 4.3, 4.6, 1.8, 0.8); g.fillStyle = rgba(top); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 0, 4.3, 0, 6.1, [[0, lighten(top, 0.35)], [1, darken(top, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = rgba(0x141518); g.fillRect(6.6, 4.9, 1.6, 0.5);
  }, { rough: 0.25 });
  p.part((g) => { rrect(g, 7.0, 2.6, 0.7, 2.0, 0.2); g.fillStyle = rgba(0x404349); g.fill(); }, undefined, METAL);
  // exhaust
  p.part((g) => { rrect(g, 9.2, 4.1, 1.0, 0.8, 0.3); g.fillStyle = rgba(0x4b4239); g.fill(); }, undefined, METAL);
  // cabin bubble: red top, white bottom with a dark cheat line
  const cabin = (g: Ctx) => {
    g.beginPath();
    g.moveTo(1.0, 9.2);
    g.bezierCurveTo(1.0, 6.4, 3.0, 5.4, 5.4, 5.4);
    g.lineTo(8.6, 5.6);
    g.bezierCurveTo(9.6, 6.0, 9.8, 7.0, 9.6, 8.4);
    g.bezierCurveTo(9.4, 10.2, 8.4, 10.9, 7.2, 10.9);
    g.lineTo(3.4, 10.9);
    g.bezierCurveTo(1.8, 10.9, 1.0, 10.2, 1.0, 9.2);
    g.closePath();
  };
  p.part((g) => { cabin(g); g.fillStyle = rgba(top); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 0, 5.4, 0, 10.9, [[0, lighten(top, 0.35)], [0.48, top], [0.5, 0x1f2125], [0.54, 0x1f2125], [0.56, bottom], [1, darken(bottom, 0.3)]]);
    g.fillRect(0, 0, 16, 16);
    p.spec(g, 4.6, 6.4, 2.2, 0.6, -0.15, 0.55);
  }, { rough: 0.2 });
  // windscreen + door window (glass)
  const glassFill = (g: Ctx) => {
    g.fillStyle = lin(g, 1, 5.5, 5, 9, [[0, 0x9fd0f0], [0.5, 0x3b6a8c], [1, 0x1a2c3c]]);
    g.fill();
  };
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.5, 8.2);
    g.bezierCurveTo(1.7, 6.6, 3.2, 5.9, 5.0, 5.9);
    g.lineTo(5.0, 8.2);
    g.closePath();
    glassFill(g);
  }, (g) => p.spec(g, 3.2, 6.6, 1.2, 0.4, -0.5, 0.8), GLASS);
  p.part((g) => { rrect(g, 5.6, 6.0, 2.4, 2.0, 0.4); glassFill(g); }, (g) => p.spec(g, 6.4, 6.5, 0.8, 0.3, 0, 0.6), GLASS);
  // skids and struts
  for (const x of [3.8, 8.0]) p.part((g) => { poly(g, [x, 10.6, x + 0.6, 10.6, x + 0.2, 12.7, x - 0.4, 12.7]); g.fillStyle = rgba(metal); g.fill(); }, undefined, METAL);
  p.part((g) => {
    g.beginPath();
    g.moveTo(0.8, 11.4);
    g.quadraticCurveTo(1.1, 12.9, 2.6, 12.9);
    g.lineTo(11.2, 12.9);
    g.lineWidth = 0.75;
    g.strokeStyle = rgba(metal);
    g.stroke();
  }, (g) => { g.fillStyle = lin(g, 0, 12.4, 0, 13.3, [[0, lighten(metal, 0.4)], [1, darken(metal, 0.4)]]); g.fillRect(0, 0, 16, 16); }, METAL);
  // main rotor blade with yellow tips
  p.part((g) => { rrect(g, 0.3, 2.1, 15.4, 0.55, 0.25); g.fillStyle = rgba(0x2a2c30); g.fill(); }, (g) => {
    g.fillStyle = rgba(0xf0bf00); g.fillRect(0, 2, 1.1, 1); g.fillRect(14.9, 2, 1.2, 1);
  }, { rough: 0.4 });
  p.part((g) => { ellipse(g, 7.35, 2.4, 0.8, 0.45); g.fillStyle = rgba(0x6a6d72); g.fill(); }, undefined, METAL);
  // nav light
  p.part((g) => { circle(g, 1.6, 9.6, 0.35); g.fillStyle = rgba(0xfff2d8); g.fill(); }, undefined, { rough: 0.2, emissive: 0.6 });
}
