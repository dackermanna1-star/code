// ROBUX and Tickets: the 2008 rules. 10 Tix login award per day, 15 R$ per
// day for Builders Club, place traffic awards and sale of goods.
'use strict';
const db = require('./db');

function dayKey(t) { return new Date(t).toDateString(); }

function addEarning(user, kind, robux, tix) {
  user.earnings = user.earnings || [];
  user.earnings.push({ t: Date.now(), kind, robux, tix });
  if (user.earnings.length > 2000) user.earnings.splice(0, user.earnings.length - 2000);
  user.robux += robux;
  user.tix += tix;
}

/** Grant the daily allowance if a new day started. Returns true if anything changed. */
function dailyAllowance(user) {
  const now = Date.now();
  if (user.lastAllowance && dayKey(user.lastAllowance) === dayKey(now)) return false;
  user.lastAllowance = now;
  addEarning(user, 'LoginAward', user.bc ? 15 : 0, 10);
  return true;
}

/** A visit to someone's personal place: 1 Ticket (10 for Builders Club). */
function placeTraffic(place, visitor) {
  const owner = db.userById(place.creatorId);
  if (!owner || owner.id === visitor?.id) return;
  addEarning(owner, 'PlaceTrafficAward', 0, owner.bc ? 10 : 1);
}

/**
 * Buy an item. currency: 'robux' | 'tix' | 'free'. Returns {ok, error}.
 */
function purchase(user, item, currency) {
  if (user.inventory.includes(item.id)) return { ok: false, error: 'You already own this item.' };
  if (item.bcOnly) return { ok: false, error: 'This item is only available to Builders Club members.' };
  let price = 0;
  if (currency === 'free') {
    if (!item.publicDomain && (item.robux || item.tix)) return { ok: false, error: 'This item is not free.' };
  } else {
    if (!item.forSale) return { ok: false, error: 'This item is not for sale.' };
    price = currency === 'robux' ? item.robux : item.tix;
    if (price == null) return { ok: false, error: 'This item cannot be bought with that currency.' };
    const bal = currency === 'robux' ? user.robux : user.tix;
    if (bal < price) return { ok: false, error: `You don't have enough ${currency === 'robux' ? 'ROBUX' : 'Tickets'} to buy this item.` };
  }
  if (currency === 'robux') user.robux -= price;
  if (currency === 'tix') user.tix -= price;
  user.inventory.push(item.id);
  item.sales = (item.sales || 0) + 1;
  const seller = db.userById(item.creatorId);
  if (seller && seller.id !== user.id && price > 0 && seller.id !== 1) {
    addEarning(seller, 'SaleOfGoods', currency === 'robux' ? price : 0, currency === 'tix' ? price : 0);
  }
  db.save();
  return { ok: true, price };
}

module.exports = { dailyAllowance, placeTraffic, purchase, addEarning };
