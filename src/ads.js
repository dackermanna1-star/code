// Advertising slots. In 2008 non-BC pages carried a Google AdSense 728x90
// leaderboard (and a 160x600 skyscraper on some pages). Real third-party ads
// can't be reproduced, so these slots show ROBLOX house ads in the period
// style ("Never see any outside ads" was a Builders Club perk).
'use strict';

const LEADERBOARDS = [
  `<a class="HouseAd HouseAd728 HouseAdBC" href="/Upgrades/BuildersClub.aspx"><span class="ha-hat"></span><span class="ha-big">Join Builders Club!</span><span class="ha-small">Get 15 ROBUX every day &bull; Create up to 10 places &bull; No outside ads</span><span class="ha-btn">Join Now &raquo;</span></a>`,
  `<a class="HouseAd HouseAd728 HouseAdTeapots" href="/Item.aspx?ID=44814"><span class="ha-big">Dodge The Teapots of Doom!</span><span class="ha-small">Can you make it to the yellow platform? Play now on ROBLOX</span><span class="ha-btn">Play &raquo;</span></a>`,
  `<a class="HouseAd HouseAd728 HouseAdShirts" href="/Catalog.aspx?m=TopFavorites&amp;c=11"><span class="ha-big">Shirts and Pants are here!</span><span class="ha-small">Dress up your Robloxian &mdash; check out the Catalog</span><span class="ha-btn">Shop &raquo;</span></a>`,
  `<a class="HouseAd HouseAd728 HouseAdPaintball" href="/Item.aspx?ID=47828"><span class="ha-big">Ultimate Paintball CTF</span><span class="ha-small">Red vs. Blue! Capture the flag &mdash; say "join reds" or "join blues"</span><span class="ha-btn">Play &raquo;</span></a>`,
];

const SKYSCRAPERS = [
  `<a class="HouseAd HouseAd160 HouseAdBC" href="/Upgrades/BuildersClub.aspx"><span class="ha-hat"></span><span class="ha-big">Builders Club</span><span class="ha-small">15 ROBUX a day!<br/><br/>Up to 10 places!<br/><br/>Sell shirts &amp; pants!<br/><br/>Exclusive hard hat!</span><span class="ha-btn">Join Now</span></a>`,
  `<a class="HouseAd HouseAd160 HouseAdObby" href="/Item.aspx?ID=2240711"><span class="ha-big">Can you beat the obby?</span><span class="ha-small">Jump over the lava, climb the tower and win a sword!</span><span class="ha-btn">Play</span></a>`,
];

let n = 0;
function leaderboard() {
  return `<div class="AdLabel">Advertisement</div>${LEADERBOARDS[n++ % LEADERBOARDS.length]}`;
}
function skyscraper() {
  return SKYSCRAPERS[n++ % SKYSCRAPERS.length];
}

module.exports = { leaderboard, skyscraper };
