// Front page (/Default.aspx), July 2008 layout.
'use strict';
const { page } = require('../layout');
const v = require('../views');
const { h } = require('../util');

function coolPlaces(state) {
  const ids = [44814, 47828, 2240711, 2611430, 1818];
  return ids.map((id) => state.places[id]).filter(Boolean);
}

function defaultPage(ctx) {
  const u = ctx.user;
  const signIn = u ? `
        <div id="LoginView">
          <h5>Logged In</h5>
          <div id="AlreadySignedIn">
            <a href="/User.aspx" title="${h(u.name)}" style="display:inline-block;width:150px;height:200px;">${v.avatarThumb(u, 150, 200)}</a>
          </div>
        </div>` : `
        <div id="LoginView">
          <h5>Member Login</h5>
          <form method="post" action="/Login/Default.aspx?ReturnUrl=%2fUser.aspx" class="AspNet-Login">
            <div class="AspNet-Login-UserPanel">
              <label for="UserName" class="Label">Character Name</label>
              <input name="UserName" type="text" id="UserName" class="Text" tabindex="1"/>
            </div>
            <div class="AspNet-Login-PasswordPanel">
              <label for="Password" class="Label">Password</label>
              <input name="Password" type="password" id="Password" class="Text" tabindex="2"/>
            </div>
            <div class="AspNet-Login-SubmitPanel">
              <a class="Button" href="#" onclick="this.parentNode.parentNode.submit();return false;" tabindex="4">Login</a>
              <input type="submit" style="position:absolute;left:-9999px" tabindex="-1"/>
            </div>
            <div class="AspNet-Login-SubmitPanel">
              <a class="Button" href="/Login/New.aspx" tabindex="5">Register</a>
            </div>
            <div class="AspNet-Login-PasswordRecoveryPanel">
              <a href="/Login/ResetPasswordRequest.aspx" tabindex="6">Forgot your password?</a>
            </div>
          </form>
        </div>`;

  const places = coolPlaces(ctx.state);
  const body = `
<div id="SplashContainer">
  <div id="SignInPane">
    <div id="LoginViewContainer">${signIn}
    </div>
    <br/>
    <div id="Figure"><img src="/images/NewFrontPageGuy.png" border="0" alt="Figure"/></div>
  </div>
  <div id="RobloxAtAGlance">
    <h2>ROBLOX Virtual Playworld</h2>
    <h3>ROBLOX is Free!</h3>
    <ul id="ThingsToDo">
      <li id="Point1"><h3>Build your personal Place</h3><div>Create buildings, vehicles, scenery, and traps with thousands of virtual bricks.</div></li>
      <li id="Point2"><h3>Meet new friends online</h3><div>Visit your friend's place, chat in 3D, and build together.</div></li>
      <li id="Point3"><h3>Battle in the Brick Arenas</h3><div>Play with the slingshot, rocket, or other brick battle tools. Be careful not to get "bloxxed".</div></li>
    </ul>
    <div id="Showcase">
      <div class="TrailerBox" id="Trailer">
        <canvas id="TrailerCanvas" width="400" height="326"></canvas>
        <div class="TrailerCaption">ROBLOX &mdash; Think. Create.</div>
      </div>
    </div>
    <div id="Install">
      <div id="CompatibilityNote"><div>Works with your<br/>Windows PC!</div></div>
      <div id="DownloadAndPlay"><a href="${u ? '/Games.aspx' : '/Login/New.aspx'}"><img src="/images/DownloadAndPlay.png" alt="FREE - Download and Play!" border="0"/></a></div>
    </div>
    <div id="ForParents"><a href="/Parents.aspx" title="for parents"><img src="/images/COPPASeal-125x125.png" alt="for parents" border="0" width="125" height="125"/></a></div>
  </div>
  <div id="UserPlacesPane">
    <div id="UserPlaces_Content">
      <table cellspacing="0" border="0"><tr>
        ${places.map((p) => `<td><div class="UserPlace"><a href="/Item.aspx?ID=${p.id}" title="${h(p.name)}">${v.placeThumb(p, 120, 70)}</a></div></td>`).join('')}
      </tr></table>
    </div>
    <div id="UserPlaces_Header">
      <h3>Cool Places</h3>
      <p>Check out some of our favorite ROBLOX places!</p>
    </div>
    <div style="clear:both"></div>
  </div>
</div>`;
  return ctx.send(page(ctx, { body, scripts: '<script type="module" src="/js/trailer.js"></script>' }));
}

function notFound(ctx) {
  const body = `<div class="ErrorPage" style="text-align:center;padding:40px 0;font-family:Verdana,sans-serif;">
    <h2>Page Not Found</h2>
    <p>Sorry, the page you requested could not be found.</p>
    <p><a href="/Default.aspx">Return to the ROBLOX home page</a></p></div>`;
  return ctx.send(page(ctx, { body }), 404);
}

module.exports = { routes: { '/default.aspx': defaultPage, '/__404': notFound } };
