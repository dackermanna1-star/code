// Runs the viewmodel weapon shots and then the combat verification in one browser session.
import weapons from './vm_weapons.mjs';
import verify from './vm_verify.mjs';
export default async (ctx) => {
  if (process.env.SKIP_WEAPONS !== '1') await weapons(ctx);
  if (process.env.SKIP_VERIFY !== '1') await verify(ctx);
};
