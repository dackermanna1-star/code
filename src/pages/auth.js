// Login, sign up ("Sign Up and Play"), logout, password reset.
'use strict';
const clock = require('../clock');
const { page } = require('../layout');
const db = require('../db');
const { h } = require('../util');
const { defaultColors } = require('../seed');

function safeReturn(url) {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return '/User.aspx';
  return url;
}

function loginPage(ctx, error = '') {
  const ret = ctx.query.ReturnUrl || ctx.query.returnurl || '/User.aspx';
  if (ctx.method === 'POST') {
    const name = (ctx.form.UserName || ctx.form.usernamefield || '').trim();
    const pass = ctx.form.Password || ctx.form.passwordfield || '';
    const u = db.userByName(name);
    if (u && u.password && db.checkPassword(pass, u.password)) {
      ctx.login(u, true);
      return ctx.redirect(safeReturn(ret));
    }
    error = 'Your login attempt was not successful. Please try again.';
  }
  const body = `
<div id="FrameLogin">
  <div id="PaneNewUser">
    <h3>New User?</h3>
    <p>You need an account to play ROBLOX.</p>
    <p>If you aren't a ROBLOX member then <a href="/Login/New.aspx">register</a>. It's easy and we do <em>not</em> share your personal information with anybody.</p>
  </div>
  <div id="PaneLogin">
    <h3>Log In</h3>
    <form method="post" action="/Login/Default.aspx?ReturnUrl=${encodeURIComponent(ret)}">
      <table cellpadding="0" border="0">
        ${error ? `<tr><td colspan="2" class="Attention" style="padding:0 0 8px">${h(error)}</td></tr>` : ''}
        <tr><td class="TextboxLabel" align="right"><label for="usernamefield">User Name:</label></td><td><input name="usernamefield" type="text" id="usernamefield" value="${h(ctx.form.usernamefield || '')}"/>&nbsp;</td></tr>
        <tr><td class="TextboxLabel" align="right"><label for="passwordfield">Password:</label></td><td><input name="passwordfield" type="password" id="passwordfield"/>&nbsp;</td></tr>
        <tr><td colspan="2" align="right"><input type="submit" name="Login" value="Log In"/></td></tr>
        <tr><td colspan="2"><a href="/Login/ResetPasswordRequest.aspx">Forgot your password?</a></td></tr>
      </table>
    </form>
    <p class="DemoNote">(Recreation: you can try the demo account <b>Robloxian2008</b> / password <b>roblox</b>.)</p>
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function validateName(name) {
  if (!/^[A-Za-z0-9]{3,20}$/.test(name)) return 'Use 3-20 alphanumeric characters: A-Z, a-z, 0-9, no spaces';
  if (db.userByName(name)) return 'That name is already taken. Please choose another.';
  return '';
}

function signupPage(ctx) {
  const f = ctx.form;
  let errName = '', errPass = '', errConfirm = '';
  const ret = ctx.query.ReturnUrl || ctx.query.returnurl || '/User.aspx';
  if (ctx.method === 'POST') {
    const name = (f.username || '').trim();
    errName = validateName(name);
    const pass = f.password || '';
    if (!/^\S{4,10}$/.test(pass)) errPass = '4-10 characters, no spaces';
    if (pass !== (f.confirm || '')) errConfirm = 'The passwords do not match.';
    if (!errName && !errPass && !errConfirm) {
      const state = ctx.state;
      const id = db.nextId('user');
      const now = clock.now();
      const u = {
        id, name, password: db.hashPassword(pass), created: now, blurb: '', robux: 0, tix: 0, bc: false, admin: false,
        under13: f.agegroup === '1', superSafe: f.chatmode === 'true', email: f.email || '',
        avatar: { colors: defaultColors(), hat: null, shirt: null, pants: null, tshirt: null },
        inventory: [], favorites: { items: [], places: [] }, friends: [], knockouts: 0, wipeouts: 0,
        profileViews: 0, forumPosts: 0, badges: [], invited: 0, lastOnline: now, isSeed: false, isBot: false,
        placeId: null, earnings: [], lastAllowance: 0,
      };
      state.users[id] = u;
      // every new member gets a personal place
      const pid = db.nextId('place');
      state.places[pid] = { id: pid, name: `${name}'s Place`, creatorId: id, desc: '', created: now, updated: now, visits: 0, favorited: 0, online: 0, playedRecent: 0, script: 'personal', theme: 'happyhome', public: true, copylocked: true, maxPlayers: 8 };
      state.comments['place:' + pid] = [];
      u.placeId = pid;
      // welcome message from ROBLOX
      const mid = db.nextId('message');
      state.messages[mid] = { id: mid, fromId: 1, toId: id, subject: 'Welcome to ROBLOX!', body: `Hi ${name}!\n\nWelcome to ROBLOX! Visit the Games page to find a place to play, change your look on the Character page, and spend your Tickets in the Catalog.\n\nYou receive 10 Tickets every day you log in.\n\nHave fun!\nThe ROBLOX Team`, t: now, read: false };
      require('../economy').dailyAllowance(u);
      db.save();
      ctx.login(u, true);
      return ctx.redirect(safeReturn(ret === '/Games.aspx' ? '/Games.aspx' : '/User.aspx'));
    }
  }
  const under13 = f.agegroup !== '2';
  const err = (e) => (e ? `<div class="Attention" style="text-align:left;padding-left:9px">${h(e)}</div>` : '');
  const body = `
<div id="Registration">
  <form method="post" action="/Login/New.aspx?ReturnUrl=${encodeURIComponent(ret)}" id="RegistrationForm">
    <h2>Sign Up and Play</h2>
    <h3>Step 1 of 2: Create Account</h3>
    <div id="EnterAgeGroup">
      <fieldset title="Provide your age-group">
        <legend>Provide your age-group</legend>
        <div class="Suggestion">This will help us to customize your experience. Users under 13 years will only be shown pre-approved images.</div>
        <div class="AgeGroupRow">
          <input id="AgeGroup_0" type="radio" name="agegroup" value="1"${under13 ? ' checked="checked"' : ''} onclick="rbxAgeGroup(true)"/><label for="AgeGroup_0">Under 13 years</label><br/>
          <input id="AgeGroup_1" type="radio" name="agegroup" value="2"${!under13 ? ' checked="checked"' : ''} onclick="rbxAgeGroup(false)"/><label for="AgeGroup_1">13 years or older</label>
        </div>
      </fieldset>
    </div>
    <div id="EnterUsername">
      <fieldset title="Choose a name for your ROBLOX character">
        <legend>Choose a name for your ROBLOX character</legend>
        <div class="Suggestion">Use 3-20 alphanumeric characters: A-Z, a-z, 0-9, no spaces</div>
        ${err(errName)}
        <div class="UsernameRow"><label for="UserName" class="Label">Character Name:</label>&nbsp;<input name="username" type="text" id="UserName" class="TextBox" maxlength="20" value="${h(f.username || '')}"/></div>
      </fieldset>
    </div>
    <div id="EnterPassword">
      <fieldset title="Choose your ROBLOX password">
        <legend>Choose your ROBLOX password</legend>
        <div class="Suggestion">4-10 characters, no spaces</div>
        ${err(errPass)}${err(errConfirm)}
        <div class="PasswordRow"><label for="Password" class="Label">Password:</label>&nbsp;<input name="password" type="password" id="Password" class="TextBox" maxlength="10"/></div>
        <div class="ConfirmPasswordRow"><label for="Confirm" class="Label">Confirm Password:</label>&nbsp;<input name="confirm" type="password" id="Confirm" class="TextBox" maxlength="10"/></div>
      </fieldset>
    </div>
    <div id="EnterChatMode">
      <fieldset title="Choose your chat mode">
        <legend>Choose your chat mode</legend>
        <div class="Suggestion">All in-game chat is subject to profanity filtering and moderation. For enhanced chat safety, choose SuperSafe Chat; only chat from pre-approved menus will be shown to you.</div>
        <div class="ChatModeRow">
          <input id="ChatMode_0" type="radio" name="chatmode" value="false"${f.chatmode !== 'true' ? ' checked="checked"' : ''}/><label for="ChatMode_0">Safe Chat</label><br/>
          <input id="ChatMode_1" type="radio" name="chatmode" value="true"${f.chatmode === 'true' ? ' checked="checked"' : ''}/><label for="ChatMode_1">SuperSafe Chat</label>
        </div>
      </fieldset>
    </div>
    <div id="EnterEmail">
      <fieldset title="Provide your email address">
        <legend id="EmailLegend">${under13 ? "Provide your parent's email address" : 'Provide your email address'}</legend>
        <div class="Suggestion">This will allow you to recover a lost password</div>
        <div class="EmailRow"><label for="Email" class="Label" id="EmailLabel">${under13 ? "Your Parent's Email:" : 'Your Email:'}</label>&nbsp;<input name="email" type="text" id="Email" class="TextBox" value="${h(f.email || '')}"/></div>
      </fieldset>
    </div>
    <div class="Confirm"><input type="submit" class="BigButton" value="Register"/></div>
  </form>
</div>
<div id="Sidebars">
  <div id="AlreadyRegistered">
    <h3>Already Registered?</h3>
    <p>If you just need to login, go to the <a href="/Login/Default.aspx">Login</a> page.</p>
    <p>If you have already registered but you still need to download the game installer, go directly to <a href="/Install/Default.aspx">download</a>.</p>
  </div>
  <div id="TermsAndConditions">
    <h3>Terms &amp; Conditions</h3>
    <p>Registration does not provide any guarantees of service. See our <a href="/info/TermsOfService.aspx">Terms of Service</a> for details.</p>
    <p>ROBLOX will not share your email address with 3rd parties. See our <a href="/info/Privacy.aspx">Privacy Policy</a> for details.</p>
  </div>
</div>
<div style="clear:both"></div>
<script>
function rbxAgeGroup(u13){document.getElementById('EmailLegend').innerHTML=u13?"Provide your parent's email address":"Provide your email address";document.getElementById('EmailLabel').innerHTML=u13?"Your Parent's Email:":"Your Email:";}
</script>`;
  return ctx.send(page(ctx, { body }));
}

function logout(ctx) {
  ctx.logout();
  return ctx.redirect('/Default.aspx');
}

function resetPassword(ctx) {
  const sent = ctx.method === 'POST';
  const body = `
<div class="StandardBox" style="width:500px;margin:20px auto;">
  <h2 class="BoxTitle">Forgot your password?</h2>
  <div class="BoxBody">
    ${sent ? '<p>If an account with that name has an email address, instructions for resetting the password have been sent to it.</p><p>(This recreation does not send email.)</p>'
    : `<p>Enter your character name and we'll email password reset instructions to the address on your account (or your parent's address).</p>
      <form method="post"><p><label class="Label">Character Name:</label> <input type="text" name="name" class="TextBox"/></p><p><input type="submit" class="Button" value="Submit"/></p></form>`}
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function install(ctx) {
  const body = `
<div class="StandardBox" style="width:620px;margin:20px auto;">
  <h2 class="BoxTitle">Step 2 of 2: Install ROBLOX</h2>
  <div class="BoxBody">
    <p>In 2008, playing ROBLOX meant downloading the ROBLOX installer for Windows. The installer added the <b>ROBLOX Game Launcher</b> browser plugin, so clicking <b>Visit Online</b> on any place opened the game in the ROBLOX window.</p>
    <p>In this recreation the ROBLOX client runs right in your browser, so there is nothing to install. Just pick a place on the <a href="/Games.aspx">Games</a> page and click <b>Visit Online</b>.</p>
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

module.exports = {
  routes: {
    '/login/default.aspx': (ctx) => loginPage(ctx),
    '/login/new.aspx': signupPage,
    '/login/newage.aspx': signupPage,
    '/login/logout.aspx': logout,
    '/login/resetpasswordrequest.aspx': resetPassword,
    '/install/default.aspx': install,
  },
};
