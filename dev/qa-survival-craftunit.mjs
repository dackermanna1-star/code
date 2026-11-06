// Offline unit checks for crafting / inventory rules (node dev/qa-survival-craftunit.mjs)
import { PlayerInventory, fitsPocket } from '../src/inventory/Inventory.js';
import { createItem } from '../src/items/items.js';
import { craft } from '../src/items/crafting.js';
const inv = new PlayerInventory();
inv.setEquipped('back', createItem('backpack_hiking'));
inv.addItem(createItem('duct_tape', { count: 2 }));
inv.addItem(createItem('metal_pipe'));
const r = craft(inv, 'lead_pipe', {});
const tapes = inv.find('duct_tape').map((f) => `count${f.stack.count}/uses${f.stack.uses}`);
console.log('lead_pipe:', r.ok, r.message, '| tapes:', tapes.join(' '), '| pipe club:', inv.count('lead_pipe'));
console.assert(tapes.length === 2 && tapes.includes('count1/uses10') && tapes.includes('count1/uses8'), 'duct tape split failed');
// pockets
for (const id of ['leather_jacket', 'backpack_school', 'baseball_bat', 'pistol_m9', 'rifle_ar15', 'kitchen_knife', 'log', 'canned_beans', 'work_boots', 'bandana', 'water_jug', 'water_bottle', 'crowbar', 'hammer', 'molotov', 'plank'])
  process.stdout.write(`${id}:${fitsPocket(createItem(id)) ? 'pocket' : 'bag'} `);
console.log();
