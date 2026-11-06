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
  if (!tab.url || !/^https?:/.test(tab.url) || !(change.title || change.status)) return;
  var h = new URL(tab.url).hostname.replace(/^www\./, "");
  if (SENSITIVE.test(h)) return;
  chrome.storage.session.get("tabinfo", function (x) {
    var m = x.tabinfo || {}, old = m[id] || {};
    m[id] = { t: (tab.title || "").slice(0, 80), h: h, o: change.status === "loading" ? Date.now() : old.o || 0, l: old.l || 0 };
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

// When you look at a tab, remember when (for the tab bar talking; kept in memory only, cleared when the browser closes)
chrome.tabs.onActivated.addListener(function (info) {
  chrome.storage.session.get(["tabinfo", "cur"], function (x) {
    var m = x.tabinfo || {}, cur = x.cur || {}, prev = cur[info.windowId];
    if (prev && prev !== info.tabId && m[prev]) m[prev].l = Date.now(); // the tab you just left: you last saw it now
    cur[info.windowId] = info.tabId;
    chrome.storage.session.set({ tabinfo: m, cur: cur });
  });
});

// The tab bar talks: for a few seconds, the titles of the open tabs in this window become one conversation.
function ago(ms) { var m = Math.round(ms / 60000); if (m < 60) return m + " min"; var h = Math.floor(m / 60); return h + (h === 1 ? " hour" : " hours"); }
function clock(t) { var d = new Date(t), h = d.getHours(), mm = d.getMinutes(); return (h % 12 || 12) + ":" + (mm < 10 ? "0" : "") + mm + " " + (h < 12 ? "AM" : "PM"); }
function tabTalk(winId, reply) {
  chrome.tabs.query({ windowId: winId }, function (tabs) {
    chrome.storage.session.get("tabinfo", function (x) {
      var info = x.tabinfo || {}, now = Date.now();
      var ok = tabs.filter(function (t) { return t.url && /^https?:/.test(t.url) && !t.discarded && !SENSITIVE.test(new URL(t.url).hostname); });
      if (ok.length < 3) return reply(null);
      ok = ok.slice(0, 10);
      var hosts = {}; ok.forEach(function (t) { var h = new URL(t.url).hostname.replace(/^www\./, ""); hosts[h] = (hosts[h] || 0) + 1; });
      var used = {}, out = [];
      ok.forEach(function (t, i) {
        var h = new URL(t.url).hostname.replace(/^www\./, ""), f = info[t.id] || {}, c = [];
        if (t.active) c.push("👀 You're looking at me");
        if (!t.active && f.l && now - f.l > 30 * 60000) c.push("😴 Ignored for " + ago(now - f.l));
        if (f.o && now - f.o > 60 * 60000) c.push("🕰 Loaded at " + clock(f.o));
        if (/(^|\.)youtube\.com$/.test(h)) c.push("▶️ The video tab. Obviously");
        if (hosts[h] >= 2) c.push("👯 One of " + hosts[h] + " " + h + " tabs");
        if (t.audible) c.push("🔊 I'm the noisy one");
        if (t.pinned) c.push("📌 Pinned. Never leaving");
        if (i === 0) c.push("☝️ I was here first");
        if (i === ok.length - 1) c.push("❌ Close one of us");
        if (i > 0 && i < ok.length - 1) c.push("🤐 Middle child");
        c.push("💬 " + h + " here. Hi");
        var line = c.filter(function (l) { return !used[l]; })[0] || ("💬 Tab " + (i + 1));
        used[line] = 1; out.push({ id: t.id, line: line });
      });
      var done = 0, shown = [];
      out.forEach(function (o) {
        chrome.scripting.executeScript({ target: { tabId: o.id }, args: [o.line, 7000], func: function (line, ms) {
          var was = document.title; document.title = line;
          setTimeout(function () { if (document.title === line) document.title = was; }, ms);
          return true;
        } }).then(function () { shown.push(o.line); }).catch(function () {}).finally(function () { if (++done === out.length) reply(shown.length >= 3 ? { n: shown.length, lines: shown } : null); });
      });
    });
  });
}
chrome.runtime.onMessage.addListener(function (msg, from, reply) {
  if (msg && msg.ybht === "tabtalk" && from.tab) { tabTalk(from.tab.windowId, reply); return true; }
});
