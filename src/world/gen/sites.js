// Dispatch special sites to their generators.
import { ZONES } from '../World.js';
import { buildDowntown, buildDowntownSpecial } from './downtown.js';

const GENERATORS = {};
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
