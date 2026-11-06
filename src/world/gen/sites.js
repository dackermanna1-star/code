// Dispatch special sites to their generators.
import { ZONES } from '../World.js';
import { buildDowntown, buildDowntownSpecial } from './downtown.js';
import { buildHospital } from './hospital.js';
import { buildSchool, buildChurch } from './school.js';
import { buildFema, buildCheckpoint, buildHeliCrash } from './military.js';
import { buildFarm, buildFields, buildCampground, buildRanger, buildCabin, buildSurvivorCamp } from './rural.js';
import { buildMotel, buildBurger, buildCarLot, buildStripMall, buildExitGas, buildRiversideApts, buildConstruction, buildTrailerPark, buildIndustrial, buildWaterTower } from './misc.js';

const GENERATORS = {
  hospital: buildHospital,
  school: buildSchool,
  church: buildChurch,
  fema: buildFema,
  checkpoint: buildCheckpoint,
  heli: buildHeliCrash,
  farm: buildFarm,
  fields: buildFields,
  campground: buildCampground,
  ranger: buildRanger,
  cabin: buildCabin,
  camp: buildSurvivorCamp,
  motel: buildMotel,
  burger: buildBurger,
  carlot: buildCarLot,
  autoparts: buildStripMall,
  gas: buildExitGas,
  apartments: buildRiversideApts,
  construction: buildConstruction,
  trailer: buildTrailerPark,
  industrial: buildIndustrial,
  watertower: buildWaterTower,
};
export function registerSite(key, fn) { GENERATORS[key] = fn; }

export async function buildSites(ctx, progress) {
  const sites = ctx.sites;
  let i = 0;
  for (const site of sites) {
    i++;
    try {
      if (site.key.startsWith('dt_')) {
        if (!buildDowntownSpecial(ctx, site)) buildDowntown(ctx, site);
      } else if (GENERATORS[site.key]) {
        GENERATORS[site.key](ctx, site);
      } else if (GENERATORS[site.key.replace(/_.*$/, '')]) {
        GENERATORS[site.key.replace(/_.*$/, '')](ctx, site);
      }
    } catch (e) {
      e.message = `site ${site.key}: ${e.message}`;
      throw e;
    }
    if (i % 6 === 0) await progress(i / sites.length, 'Building ' + site.name);
  }
  void ZONES;
}
