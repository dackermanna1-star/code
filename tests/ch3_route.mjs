import { stubOthers } from './ch3_stub.mjs';
import route from './scen_route.mjs';
export default async (ctx) => { await stubOthers(ctx.page); return route(ctx); };
