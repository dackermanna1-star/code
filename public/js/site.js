// Small page behaviours for the 2008 site (no frameworks, like the original
// ASP.NET AJAX-era pages).

// --- Place launcher: "Visit Online" / "Visit Solo" --------------------------------
// In 2008 the site showed a modal while the ROBLOX Game Launcher plugin
// requested a server, then the ROBLOX client window opened.
function rbxVisit(placeId, mode) {
  var bg = document.getElementById('LauncherBackground');
  var box = document.getElementById('PlaceLauncher');
  if (!box) {
    bg = document.createElement('div');
    bg.id = 'LauncherBackground';
    bg.className = 'modalBackground';
    box = document.createElement('div');
    box.id = 'PlaceLauncher';
    box.className = 'modalPopup';
    box.innerHTML = '<div id="Spinner"><img src="/images/ProgressIndicator2.gif" alt="" width="32" height="32"/></div>' +
      '<div id="LauncherStatus">Requesting a server</div>' +
      '<div class="LauncherButtons"><a class="Button" href="#" onclick="return rbxCloseLauncher()">Cancel</a></div>';
    document.body.appendChild(bg);
    document.body.appendChild(box);
  }
  bg.style.display = 'block';
  box.style.display = 'block';
  var status = document.getElementById('LauncherStatus');
  var steps = mode === 'solo' || mode === 'edit'
    ? ['Starting ROBLOX...']
    : ['Requesting a server', 'Waiting for a server', 'A server is loading the game', 'The server is ready. Joining the game...'];
  var i = 0;
  status.innerHTML = steps[0];
  var cancelled = false;
  window.rbxCloseLauncher = function () { cancelled = true; bg.style.display = 'none'; box.style.display = 'none'; return false; };
  // check that the place has servers before "launching"
  fetch('/Game/Join.ashx?placeId=' + placeId + '&mode=' + mode, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (info) {
    if (info.error) { status.innerHTML = info.error; return; }
    var t = setInterval(function () {
      if (cancelled) { clearInterval(t); return; }
      i++;
      if (i < steps.length) { status.innerHTML = steps[i]; return; }
      clearInterval(t);
      rbxLaunchClient(placeId, mode);
      setTimeout(function () { bg.style.display = 'none'; box.style.display = 'none'; }, 600);
    }, 700);
  }).catch(function () { status.innerHTML = 'An error occured. Please try again later'; });
  return false;
}

function rbxLaunchClient(placeId, mode) {
  var url = '/Game/Play.aspx?placeId=' + placeId + '&mode=' + mode;
  // The 2008 client was a separate window (800x600 by default).
  var w = window.open(url, 'ROBLOX', 'width=800,height=600,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
  if (!w) location.href = url;
  else w.focus();
}

// --- Catalog purchase confirmation (AJAX ModalPopup in the original) ------------------
function rbxPurchase(itemId, currency) {
  var it = window.rbxItem;
  var bg = document.getElementById('PurchaseModalBackground');
  var box = document.getElementById('PurchaseModal');
  var q = document.getElementById('PurchaseQuestion');
  var b = document.getElementById('PurchaseBalance');
  var form = document.getElementById('PurchaseForm');
  form.action = '/Item.aspx?ID=' + itemId + '&buy=' + currency;
  if (currency === 'free') {
    q.innerHTML = 'Would you like to take ' + it.type + ' "' + rbxEsc(it.name) + '" from ' + rbxEsc(it.creator) + ' for free?';
    b.innerHTML = '';
  } else {
    var sym = currency === 'robux' ? 'R$' : 'Tx';
    var price = currency === 'robux' ? it.robux : it.tix;
    var bal = (currency === 'robux' ? it.balRobux : it.balTix) - price;
    q.innerHTML = 'Would you like to purchase ' + it.type + ' "' + rbxEsc(it.name) + '" from ' + rbxEsc(it.creator) + ' for ' + sym + ' ' + price + '?';
    b.innerHTML = bal >= 0 ? 'Your balance after this purchase will be ' + sym + ' ' + bal + '.' : '<span class="Attention">You do not have enough ' + (currency === 'robux' ? 'ROBUX' : 'Tickets') + ' to buy this item.</span>';
    form.querySelector('input[type=submit]').disabled = bal < 0;
  }
  bg.style.display = 'block';
  box.style.display = 'block';
  return false;
}
function rbxClosePurchase() {
  document.getElementById('PurchaseModalBackground').style.display = 'none';
  document.getElementById('PurchaseModal').style.display = 'none';
}
function rbxEsc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// --- Accordion (places on profiles) / tabs (place pages) -------------------------------
function rbxAccordion(header) {
  var bodies = header.parentNode.querySelectorAll('.AccordionBody');
  for (var i = 0; i < bodies.length; i++) bodies[i].style.display = 'none';
  header.nextElementSibling.style.display = 'block';
}
function rbxTab(tab) { rbxShowTab(tab.getAttribute('data-tab')); }
function rbxShowTab(id) {
  var tabs = document.querySelectorAll('.ajax__tab_tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].className = 'ajax__tab_tab' + (tabs[i].getAttribute('data-tab') === id ? ' ajax__tab_active' : '');
  var panels = document.querySelectorAll('.ajax__tab_panel');
  for (var j = 0; j < panels.length; j++) if (panels[j].id) panels[j].style.display = panels[j].id === id ? 'block' : 'none';
}

// --- Character page colour popups ------------------------------------------------------
function rbxColorPopup(part, el) {
  var pops = document.querySelectorAll('.popupControl');
  for (var i = 0; i < pops.length; i++) pops[i].style.visibility = 'hidden';
  var pop = document.getElementById('Popup' + part);
  var r = el.getBoundingClientRect();
  pop.style.left = (r.right + window.scrollX + 4) + 'px';
  pop.style.top = (r.top + window.scrollY) + 'px';
  pop.style.visibility = 'visible';
  setTimeout(function () {
    document.addEventListener('click', function close(e) {
      if (!pop.contains(e.target)) { pop.style.visibility = 'hidden'; document.removeEventListener('click', close); }
    });
  }, 0);
}
function rbxRedraw() {
  var imgs = document.querySelectorAll('.CharacterImage img');
  for (var i = 0; i < imgs.length; i++) imgs[i].dispatchEvent(new CustomEvent('rbx-redraw'));
  return false;
}

// --- Inbox -------------------------------------------------------------------------------
function rbxCheckAll(box) {
  var boxes = document.querySelectorAll('.InboxGrid input[type=checkbox]');
  for (var i = 0; i < boxes.length; i++) boxes[i].checked = box.checked;
}
