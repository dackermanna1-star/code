// Residential package: Soviet panel/brick blocks. build() places nothing; layout packages call
// placeResidential() from ./api.js. The runtime (doors, lifts, the endless stairwell) runs here.
import './models.js'

export default {
  name: 'residential',
  order: 25,
  build() {},
  init() {},
  update() {},
}
