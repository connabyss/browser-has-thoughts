// When the extension is installed, updated or reloaded, tabs that were already open don't have the chat yet.
// This adds it to them, so the room follows you to every tab without refreshing.
chrome.runtime.onInstalled.addListener(function () {
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(function (t) {
      if (!t.id || (t.url && !/^https?:/.test(t.url))) return;
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["thoughts.js"] }).catch(function () {});
    });
  });
});

// For The X Button's end-of-day eulogies: remember open tabs' titles (in memory only, cleared when the browser closes),
// and when a tab is closed, keep its title in today's list. Sensitive sites (health, money, dating and similar) are never kept.
var SENSITIVE = /(bank|banking|credit|loan|mortgage|paypal|venmo|stripe|invest|broker|crypto|wallet|tax|irs\.gov|\.gov$|health|clinic|medical|hospital|pharma|pharmacy|doctor|therapy|mental|webmd|mayoclinic|nhs\.uk|dating|tinder|bumble|hinge|grindr|okcupid|match\.com|porn|xxx|onlyfans|casino|betting|gambl|poker|lawyer|legal|court)/i;
function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
chrome.tabs.onUpdated.addListener(function (id, change, tab) {
  if (!tab.url || !/^https?:/.test(tab.url) || !(change.title || change.status === "complete")) return;
  var h = new URL(tab.url).hostname.replace(/^www\./, "");
  if (SENSITIVE.test(h)) return;
  chrome.storage.session.get("tabinfo", function (x) {
    var m = x.tabinfo || {}; m[id] = { t: (tab.title || "").slice(0, 80), h: h };
    chrome.storage.session.set({ tabinfo: m });
  });
});
chrome.tabs.onRemoved.addListener(function (id) {
  chrome.storage.session.get("tabinfo", function (x) {
    var m = x.tabinfo || {}, info = m[id]; if (!info) return;
    delete m[id]; chrome.storage.session.set({ tabinfo: m });
    chrome.storage.local.get("closed", function (y) {
      var today = dayKey(new Date());
      var c = (y.closed || []).filter(function (e) { return e.day === today; });
      c.push({ t: info.t, h: info.h, at: Date.now(), day: today });
      chrome.storage.local.set({ closed: c.slice(-40) });
    });
  });
});

// The room is shared by every tab. Writes come here and are done one at a time, so two tabs talking at once can't
// overwrite each other's messages. The same goes for claiming today's first site.
var chain = Promise.resolve();
function serial(job) { chain = chain.then(job).catch(function () {}); return chain; }
chrome.runtime.onMessage.addListener(function (msg, _from, reply) {
  if (!msg || !msg.ybht) return;
  if (msg.ybht === "append" && msg.m) {
    serial(function () {
      return chrome.storage.local.get("room").then(function (x) {
        var room = (x.room || []).concat([msg.m]).slice(-80);
        return chrome.storage.local.set({ room: room, lastSpoke: Date.now() });
      });
    }).then(function () { reply(true); });
    return true;
  }
  if (msg.ybht === "first") {
    serial(function () {
      return chrome.storage.local.get(["firstHost", "day"]).then(function (x) {
        if (x.firstHost || (x.day && x.day !== dayKey(new Date()))) return;
        return chrome.storage.local.set({ firstHost: msg.h, firstAt: msg.at });
      });
    }).then(function () { reply(true); });
    return true;
  }
});
