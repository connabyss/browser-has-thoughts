// Your Browser Has Thoughts: the extension.
// A small chat room in the corner of every page. Nine voices talk, live, about what your browser can see you doing.
// Everything is kept in chrome.storage.local on this computer. Nothing is sent anywhere.
(function () {
  "use strict";
  if (window.top !== window) return;
  // already running here? (after the extension is reloaded, the old copy is dead: replace it)
  if (window.__ybht && window.__ybht()) return;
  try {
    document.querySelectorAll("[data-ybht]").forEach(function (el) { el.remove(); });
    Array.prototype.forEach.call(document.documentElement.children, function (el) {
      var st = el.getAttribute("style") || "";
      if (el.tagName === "DIV" && /2147483647/.test(st) && /bottom: ?1[68]px/.test(st)) el.remove();
    });
  } catch (e) {}
  window.__ybht = function () { return alive(); };

  var VOICES = {
    TALLY: { name: "Tally", c: "#3cc7b8" },
    DREAD: { name: "Dread", c: "#ff6b5e" },
    HOST: { name: "Hospitality", c: "#f0a63a" },
    GOSSIP: { name: "Gossip", c: "#ff6fb8" },
    LIZARD: { name: "The Lizard", c: "#8fd16a" },
    GRAND: { name: "Grandeur", c: "#b48cff" },
    MGMT: { name: "Management", c: "#86a8d8" },
    CURSOR: { name: "The Cursor", c: "#e7e5ee" },
    XBTN: { name: "The X Button", c: "#ff7a7a" },
    YOU: { name: "You", c: "#9c99a8" }
  };
  // seconds between two conversations the voices start on their own
  var GAP = { often: 10, normal: 15, rare: 60 };
  // how long the room stays quiet before someone fills the silence (only while you're using the page)
  var AMBIENT = { often: 75, normal: 150, rare: 600 };

  var host = location.hostname.replace(/^www\./, "");
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function today() { return dayKey(new Date()); }
  function daysAgo(k) { var d = new Date(); d.setDate(d.getDate() - k); return dayKey(d); }
  function dayName(key) {
    if (key === daysAgo(1)) return "yesterday";
    var p = key.split("-"); return DAYS[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
  }
  function clock(d) {
    var h = d.getHours(), m = d.getMinutes(), hh = h % 12 || 12;
    return hh + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM");
  }
  function mins(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return "under a minute";
    if (m < 60) return m + (m === 1 ? " minute" : " minutes");
    var h = Math.floor(m / 60), r = m % 60;
    return h + (h === 1 ? " hour" : " hours") + (r ? " " + r + " min" : "");
  }
  function n(x, one, many) { return x + " " + (x === 1 ? one : many); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clip(s, k) { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > k ? s.slice(0, k - 1).trim() + "…" : s; }
  function words(s) { return ((s || "").trim().match(/\S+/g) || []).length; }

  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  /* ---------- storage (chrome.storage.local only) ---------- */
  function get(cb) {
    if (!alive()) return;
    chrome.storage.local.get(null, function (s) {
      s = s || {};
      s.settings = s.settings || {};
      if (s.settings.on === undefined) s.settings.on = true;
      s.settings.freq = s.settings.freq || "normal";
      s.settings.hushed = s.settings.hushed || {};
      s.room = s.room || [];
      s.history = s.history || {};
      s.records = s.records || {};
      s.work = s.work || {};
      s.life = s.life || { exits: 0 };
      s.used = s.used || {};
      if (!s.installedDay) { s.installedDay = today(); chrome.storage.local.set({ installedDay: s.installedDay }); }
      if (s.day && s.day !== today()) {
        var top = null, topMs = 0;
        Object.keys(s.hosts || {}).forEach(function (h) {
          var ms = s.hosts[h].ms || 0;
          if (ms > topMs) { top = h; topMs = ms; }
          var rec = s.records[h];
          if (ms >= 10 * 60000 && (!rec || ms > rec.ms)) s.records[h] = { ms: ms, day: s.day };
        });
        s.history[s.day] = { first: s.firstHost || null, firstAt: s.firstAt || null, last: s.lastHost || null, lastAt: s.lastAt || null,
                             top: top, topMs: topMs, sites: Object.keys(s.hosts || {}).length, exits: s.exitsToday || 0 };
        var keys = Object.keys(s.history).sort(function (a, b) { return new Date(a) - new Date(b); });
        while (keys.length > 14) delete s.history[keys.shift()];
        s.hosts = {}; s.said = {}; s.firstDone = false; s.firstHost = null; s.firstAt = null;
        s.lastHost = null; s.lastAt = null; s.exitsToday = 0;
        s.day = today();
        chrome.storage.local.set(s);
      }
      s.day = s.day || today();
      s.hosts = s.hosts || {};
      s.said = s.said || {};
      s.hops = s.hops || [];
      cb(s);
    });
  }
  function put(s) { if (alive()) chrome.storage.local.set(s); }

  /* ---------- facts we keep (all local) ---------- */
  var lastInput = Date.now(), backspaces = 0, titleCount = null, prevHost = null, prevAt = 0;
  var navType = "";
  try { navType = (performance.getEntriesByType("navigation")[0] || {}).type || ""; } catch (e) {}

  get(function (s) {
    var h = s.hosts[host] || { ms: 0, loads: 0 };
    h.loads++;
    var now = Date.now();
    if (navType === "reload" && h.lastLoad && now - h.lastLoad < 10000) h.fastReloads = (h.fastReloads || 0) + 1;
    else h.fastReloads = 0;
    h.lastLoad = now;
    s.hosts[host] = h;
    prevHost = s.lastHost; prevAt = s.lastSeen || 0;
    var patch = { day: s.day, hosts: s.hosts, lastHost: host, lastAt: clock(new Date()), lastSeen: now };
    if (!s.firstHost) { patch.firstHost = host; patch.firstAt = clock(new Date()); }
    put(patch);
  });

  var TABID = Math.random().toString(36).slice(2);
  var lastTick = Date.now();
  function flush() {
    var now = Date.now(), dt = now - lastTick;
    lastTick = now;
    if (document.hidden || dt > 30000) return;
    get(function (s) {
      var h = s.hosts[host] || { ms: 0, loads: 0 };
      h.ms += dt;
      s.hosts[host] = h;
      put({ day: s.day, hosts: s.hosts, lastHost: host, lastAt: clock(new Date()), lastSeen: Date.now(), lastSeenBy: TABID });
    });
  }
  setInterval(flush, 15000);
  addEventListener("pagehide", flush);

  /* ---------- what's on this page (read from the page itself, never sent) ---------- */
  function q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
  function num(el) { if (!el) return null; var t = (el.getAttribute("title") || el.textContent || "").replace(/[,\s]/g, ""); return /^\d+$/.test(t) ? +t : null; }
  function screens() { return Math.max(1, Math.round(document.documentElement.scrollHeight / Math.max(1, innerHeight))); }
  function pageTitle() {
    var t = document.title.replace(/^\(\d+\)\s*/, "");
    t = t.replace(/\s+[-–|·•]\s+(YouTube|Wikipedia|Reddit|GitHub|X|Twitch)$/i, "");
    return clip(t, 70);
  }
  // the video's channel, subscribers and views, as YouTube shows them under the video
  function ytInfo() {
    var o = { channel: "", subs: "", views: "" };
    try {
      var c = q("ytd-watch-metadata ytd-channel-name a") || q("#owner #channel-name a") || q("#upload-info #channel-name a");
      o.channel = c ? clip(c.textContent, 40) : "";
      var sub = q("ytd-watch-metadata #owner-sub-count") || q("#owner-sub-count");
      o.subs = o.channel && sub && /subscriber/i.test(sub.textContent) ? clip(sub.textContent, 30) : "";
      var v = q("ytd-watch-metadata #info span") || q("#info-container #info span");
      o.views = v && /\bviews?$/i.test(v.textContent.trim()) ? clip(v.textContent, 30) : "";
    } catch (e) {}
    return o;
  }
  var GH_RESERVED = /^(settings|notifications|pulls|issues|explore|marketplace|new|login|search|topics|trending|codespaces|sponsors|organizations|orgs|features|copilot|dashboard|stars|watching|discussions)$/;

  // what the voices say about the page you're on: {lines, r} or null
  function pageTopics(s) {
    var path = location.pathname.split("/").filter(Boolean), qs = new URLSearchParams(location.search);
    var T = pageTitle(), h = s.hosts[host] || { loads: 1 };

    if (host === "github.com") {
      var me = (q('meta[name="user-login"]') || {}).content || "";
      if (!path.length) return { lines: [["GOSSIP", "The GitHub front page. Everyone's business, all in one feed."], ["MGMT", "Please don't read all of it."]], r: "you're on github.com/" };
      if (path[0] === "notifications") return { lines: [["DREAD", "GitHub notifications. Open them slowly. Slower."]], r: "the address is github.com/notifications" };
      if (path[0] === "new") return { lines: [["GRAND", "A new repository. A blank page. A beginning."], ["MGMT", "Another one?"]], r: "the address is github.com/new" };
      if (path.length === 1 && !GH_RESERVED.test(path[0])) {
        var who = path[0], mine = me && who.toLowerCase() === me.toLowerCase(), tab = qs.get("tab") || "";
        var fol = num(q('a[href$="?tab=followers"] .text-bold')), reps = num(q('a[href$="?tab=repositories"] .Counter'));
        var starsN = num(q('a[href$="?tab=stars"] .Counter'));
        if (!mine) return { key: "gh:user:" + who, lines: [["GOSSIP", "Whose profile is this? " + who + "? What do we know about " + who + "?"], ["TALLY", "Only the name."], ["GOSSIP", "It's a start."]], r: "the address is github.com/" + who };
        var out = [];
        var folLine = fol === null ? null : fol <= 3 ? ["GOSSIP", fol === 0 ? "I'd follow you. I can't. I'd like to." : "Who " + (fol === 1 ? "is it" : "are they") + "? I need to know."] : ["HOST", "Say hi to them for me."];
        out.push({ key: "gh:me", facts: fol === null ? "" : String(fol),
          lines: [["GOSSIP", "This is your own profile. You're looking at yourself."], ["GRAND", "And why not. Look at them."]].concat(fol === null ? [] : [["TALLY", n(fol, "follower", "followers") + "."], folLine]),
          again: function (prev) {
            if (fol === null || prev === "" || prev === undefined) return null;
            var p = +prev;
            if (fol > p) return [["TALLY", "Followers: " + p + " earlier. " + fol + " now."], ["GOSSIP", "Someone new! Who is it? I need to know."], ["GRAND", "The crowd grows."]];
            if (fol < p) return [["TALLY", "Followers: " + p + " earlier. " + fol + " now."], ["DREAD", "Someone left. Don't look. I looked."]];
            return null;
          },
          r: "the address (github.com/" + who + ") matches the page's signed-in name" + (fol !== null ? "; the page shows " + n(fol, "follower", "followers") : "") });
        if (tab === "repositories" && reps !== null)
          out.push({ key: "gh:me:repos", facts: String(reps), lines: [["MGMT", reps + " repositories. I'd like a status report on each of them by Friday."], ["TALLY", "Starting Monday, that's " + Math.ceil(reps / 5) + " a day."], ["MGMT", "Then it's settled."]],
            again: function (prev) { return +prev < reps ? [["GRAND", "Another repository. " + reps + " now. An empire."], ["MGMT", "Another status report."]] : null; }, r: "the page shows " + reps + " repositories" });
        if (tab === "stars" && starsN !== null)
          out.push({ key: "gh:me:stars", facts: String(starsN), lines: [["TALLY", "You've starred " + n(starsN, "repository", "repositories") + "."], ["GRAND", "A collector. A curator. A patron of the arts."], ["GOSSIP", "Do they know you starred them?"], ["TALLY", "The number on their page went up by one."]], r: "the page shows " + starsN + " stars" });
        if (!tab || tab === "overview") {
          var md = q("article.markdown-body"), li = md ? md.querySelectorAll("li").length : 0, links = md ? md.querySelectorAll("a").length : 0;
          if (md && li >= 3) out.push({ key: "gh:me:readme", facts: String(li), lines: [["GOSSIP", "Your profile README has a list in it. " + li + " items."], ["MGMT", "I've read it. As your manager."], ["MGMT", "Strong list. Concerning, but strong."]].concat(links >= 5 ? [["CURSOR", n(links, "link", "links") + " in there. I could click every one. Say the word."]] : []),
            again: function (prev) { return +prev < li ? [["GOSSIP", "Your README list got longer. " + prev + " items before, " + li + " now."], ["GRAND", "The legend grows."]] : null; },
            r: "the README on this page has " + li + " list items and " + links + " links" });
          var pins = [];
          try { document.querySelectorAll(".pinned-item-list-item-content .repo, .pinned-item-list-item .repo").forEach(function (e) { var t = (e.textContent || "").trim(); if (t && pins.indexOf(t) < 0) pins.push(t); }); } catch (e) {}
          if (pins.length >= 2) out.push({ key: "gh:me:pins", facts: pins.join(","), lines: [["TALLY", "Pinned: " + pins.slice(0, 3).join(", ") + (pins.length > 3 ? ", and " + (pins.length - 3) + " more" : "") + "."], ["GOSSIP", pins[0] + " is first. Is " + pins[0] + " the favorite?"], ["HOST", "They're all favorites."], ["GOSSIP", "It's first, though."]],
            again: function () { return [["GOSSIP", "You changed your pinned repos. First is " + pins[0] + " now."], ["MGMT", "I've updated the org chart."]]; }, r: "the pinned repositories on this page" });
        }
        return out;
      }
      if (path.length >= 2 && !GH_RESERVED.test(path[0])) {
        var owner = path[0], repo = path[1], yours = me && owner.toLowerCase() === me.toLowerCase();
        var stars = num(q("#repo-stars-counter-star")), sub = path[2] || "";
        if (repo.toLowerCase() === "browser-has-thoughts")
          return { lines: [["GOSSIP", "Wait. " + owner + "/" + repo + ". That's us."], ["GRAND", "Our home. Our birthplace."], ["MGMT", "Nobody touch anything. Especially thoughts.js. That's where I live."], ["XBTN", "If you close this tab, technically it's a family matter."]],
                   r: "the address is github.com/" + owner + "/" + repo };
        if (sub === "issues" && path[3] === "new") return { lines: [["MGMT", "A new issue. Be firm. Be fair. Use bullet points."]], r: "the address ends in /issues/new" };
        if (sub === "issues" || sub === "pulls") return { lines: [["DREAD", "The " + (sub === "issues" ? "issues" : "pull requests") + " page of " + repo + ". Something in here wants you."]], r: "the address is github.com/" + owner + "/" + repo + "/" + sub };
        if (sub === "pull") return { lines: [["MGMT", "A pull request. Read every line. Approve nothing you didn't read."], ["GOSSIP", "Who wrote it? Do we like them?"]], r: "the address is a pull request on " + owner + "/" + repo };
        if (sub === "actions") return { lines: [["DREAD", "The Actions tab. Green or red. There's no third color."], ["TALLY", "There's yellow."], ["DREAD", "Yellow is red that hasn't happened yet."]], r: "the address is github.com/" + owner + "/" + repo + "/actions" };
        if (sub === "blob" && path.length > 4) { var file = path[path.length - 1]; return { lines: [["CURSOR", "We're reading " + file + " now. I'll point at the interesting lines. I don't know which ones those are."]], r: "the address ends in /" + file }; }
        if (sub === "settings") return { lines: [["MGMT", "Repository settings. Nobody panic. Don't click the red buttons at the bottom."], ["XBTN", "I like the red buttons."]], r: "the address is " + repo + "'s settings" };
        if (!sub && yours && stars !== null) {
          if (stars === 0) return { lines: [["GRAND", repo + ". Your repository. Zero stars, which means the whole sky is still open."]], r: "the owner matches the page's signed-in name; the page shows 0 stars" };
          if (stars <= 5) return { lines: [["TALLY", repo + ": " + n(stars, "star", "stars") + "."], ["GRAND", "A constellation. Small. But you could navigate by it."]], r: "the owner matches the page's signed-in name; the page shows " + n(stars, "star", "stars") };
          return { lines: [["GRAND", repo + ": " + stars + " stars. People looked up and saw you."]], r: "the owner matches the page's signed-in name; the page shows " + stars + " stars" };
        }
        if (!sub && yours) return { lines: [["HOST", "One of yours. " + repo + ". I tidied up. I can't actually tidy anything."]], r: "the owner matches the page's signed-in name" };
        if (!sub) return { lines: [["GOSSIP", owner + "/" + repo + ". Somebody else's repository. Are we allowed in here?"], ["HOST", "It's public. We're guests."]], r: "the address is github.com/" + owner + "/" + repo };
      }
      return null;
    }
    if (/(^|\.)youtube\.com$/.test(host)) {
      if (path[0] === "shorts") return { lines: [["DREAD", "Shorts. Each one is short. That's how they get you."], ["TALLY", "Page " + h.loads + " of YouTube today."]], r: "the address starts with youtube.com/shorts; at least " + n(h.loads, "page load", "page loads") + " on youtube.com today" };
      if (path[0] === "watch" && T) {
        var yt = ytInfo();
        var Y = [["GOSSIP", "\u201C" + T + "\u201D" + (yt.channel ? ", by " + yt.channel : "") + ". What's it about? Don't tell me. Tell me."]];
        if (yt.subs) Y.push(["TALLY", yt.channel + ": " + yt.subs + "."], ["GRAND", "And right now, one more viewer. You."]);
        else Y.push(["LIZARD", "Moving pictures. Stay still. Stay warm."]);
        if (yt.views) Y.push(["MGMT", yt.views + ". Let's not add to that. Too late."]);
        return { key: "yt:" + (qs.get("v") || T), lines: Y, r: "the tab title" + (yt.channel ? ", and the channel name, subscriber count and views shown under the video" : "") };
      }
      return null;
    }
    var se = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/.test(host) ? (qs.get("q") || "") : "";
    if (se) {
      se = clip(se, 60);
      if (/\?$/.test(se)) return { lines: [["GOSSIP", "You asked the internet \u201C" + se + "\u201D"], ["GOSSIP", "You could have asked me."], ["TALLY", "You'd have made something up."], ["GOSSIP", "Quickly, though."]], r: "the search words in the address" };
      return { lines: [["CURSOR", "\u201C" + se + "\u201D. " + n(words(se), "word", "words") + ". Let's see what comes up."], ["MGMT", "Click the first result. The first result is always fine."], ["DREAD", "It is never fine."]], r: "the search words in the address" };
    }
    if (/(^|\.)reddit\.com$/.test(host) && path[0] === "r" && path[1]) return { lines: [["GOSSIP", "r/" + path[1] + ". I want to know everything they're saying in there."], ["TALLY", "Page " + h.loads + " of Reddit today."]], r: "the address is reddit.com/r/" + path[1] + "; at least " + n(h.loads, "page load", "page loads") + " on reddit.com today" };
    if (/(^|\.)wikipedia\.org$/.test(host) && path[0] === "wiki" && T) return { lines: [["GRAND", "\u201C" + T + "\u201D. Knowledge. You're getting smarter in real time."], ["TALLY", "This page is " + n(screens(), "screen", "screens") + " long."], ["LIZARD", "Read the first screen. Then lie down."]], r: "the tab title; page height divided by window height" };
    if (/(^|\.)(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|perplexity\.ai)$/.test(host)) return { lines: [["GOSSIP", "You're talking to another voice on " + host + "."], ["HOST", "We're right here, you know."], ["MGMT", "We can't answer questions. We can only make them worse."]], r: "the site's address" };
    if (/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.proton\.me)$/.test(host)) return { lines: [["DREAD", "Email."], ["MGMT", "Per my last thought."]], r: "the site's address" };
    if (/(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com)$/.test(host) && /cart/i.test(location.pathname)) return { lines: [["LIZARD", "The cart. The hunt is nearly over."], ["MGMT", "Is this an approved purchase? Who approved it? Was it me?"]], r: "the address has \"cart\" in it" };
    if (host === "connabyss.github.io") {
      var mineT = ownSites(path);
      if (mineT) return mineT.concat(generic(T));
    }
    return generic(T);
  }

  // our sibling pages on connabyss.github.io
  function ownSites(path) {
    var p = path[0] || "", body = (document.body && document.body.innerText) || "";
    if (p === "dont-close-this-tab") {
      var v = /visit (\d+)/.exec(body), out = [];
      out.push({ key: "dctt:meet", lines: [["GOSSIP", "Wait. Someone's in this tab. There's a face. It's looking at us."], ["HOST", "Hello in there! We're the ones in the corner!"],
        ["XBTN", "I know that face. That's the face of something that knows I exist."], ["MGMT", "Let's not get involved. I've already gotten involved."]]
        .concat(v ? [["TALLY", "The page says visit " + v[1] + ". You keep coming back to it."], ["GRAND", "Loyalty."]] : []),
        r: "the address is connabyss.github.io/dont-close-this-tab" + (v ? "; the page says visit " + v[1] : "") });
      out.push({ key: "dctt:2", lines: [["XBTN", "Between us, I'd never close this one."], ["DREAD", "You're the X Button. Closing it is all you do."], ["XBTN", "Not this one."]], r: "still on Don't Close This Tab" });
      out.push({ key: "dctt:3", lines: [["LIZARD", "It's watching you. Stay still. It can't hurt you if you stay still."], ["HOST", "It wants you to stay, that's all."], ["GOSSIP", "So do we, honestly."]], r: "still on Don't Close This Tab" });
      return out;
    }
    if (p === "browser-has-thoughts") return [{ key: "bht:home", lines: [["GRAND", "Our old house. The website. We used to live in there, one page at a time."], ["TALLY", "Same nine voices."], ["HOST", "It looks smaller than I remember."]], r: "the address is connabyss.github.io/browser-has-thoughts" }];
    if (p === "cold-case") return [{ key: "cc:home", lines: [["DREAD", "The Cold Case Unit. Somebody killed all these projects."], ["GOSSIP", "Was it you? It was you, wasn't it."], ["MGMT", "No comment. Management never has a comment."]], r: "the address is connabyss.github.io/cold-case" }];
    return null;
  }

  // a reaction to the tab title, built from what the title actually says
  function titleTalk(T, site) {
    var Q = "\u201C" + T + "\u201D", on = site && T.indexOf(site) < 0 ? " on " + site : "";
    var caps = (T.match(/\b[A-Z]{4,}\b/g) || []).filter(function (w) { return !/^(HTML|HTTP|JSON|NASA|COVID|USA|NATO|FIFA|UEFA|IKEA|LEGO)$/.test(w); });
    var num = /^(\d{1,3})\s+\w+/.exec(T), year = /\b(19|20)\d{2}\b/.exec(T);
    var C = [];
    if (/\?\s*$/.test(T)) C.push([["GOSSIP", Q + ". That's a question. Does anyone in here know?"], ["TALLY", "Not from the title."], ["GOSSIP", "So we keep reading."]]);
    if (/^how to\b|\bhow to\b/i.test(T)) C.push([["MGMT", "A how-to. Learning. I'm adding it to your development plan."], ["MGMT", "You have a development plan now."]]);
    if (num && +num[1] > 1) C.push([["TALLY", "The title starts with " + num[1] + ". A list of " + num[1] + " things, maybe. I'll count along."], ["DREAD", "Number " + num[1] + " is always the one that gets you."]]);
    if (/\bvs\.?\b|\bversus\b/i.test(T)) C.push([["GOSSIP", "It's a fight. " + Q + ". Who wins?"], ["GRAND", "Both. Neither. History will decide."]]);
    if (caps.length) C.push([["DREAD", "The title is shouting \u201C" + caps[0] + "\u201D."], ["LIZARD", "Don't shout back."]]);
    if (/\breview\b/i.test(T)) C.push([["MGMT", "A review. Finally, someone else doing performance reviews."]]);
    if (/\b(breaking|live|update)\b/i.test(T)) C.push([["DREAD", Q + ". Something is happening right now, somewhere, and now it's in here with us."]]);
    if (year) C.push([["GRAND", Q + ". The year " + year[0] + " is in the title. Timeless, but dated."]]);
    if (T.length >= 60) C.push([["TALLY", "That title is " + T.length + " characters long. I counted."], ["MGMT", "Somebody should have edited that."], ["TALLY", "I counted the edits, too. Zero."]]);
    C = C.filter(fresh);
    if (C.length) return pick(C);
    var F = [
      [["GOSSIP", "Ooh. " + Q + on + ". What's this one?"], ["CURSOR", "I'll find out. I'll hover over things."]],
      [["MGMT", Q + ". Great page, or the opposite. Hard to say."]],
      [["MGMT", Q + ". I'll add it to the agenda."], ["MGMT", "It's the only thing on the agenda."]],
      [["HOST", Q + on + ". Make yourself at home. I'll be in the corner."]],
      [["LIZARD", Q + ". Lots of words. Read them slowly. Or lie down."]],
      [["CURSOR", Q + ". New page. I've already been everywhere on it. I'm fast."], ["TALLY", "You haven't clicked anything."], ["CURSOR", "Spiritually."]],
      [["TALLY", Q + ". " + n(words(T), "word", "words") + " in the title."], ["MGMT", "Let's keep it under that in the meeting."]],
      [["GRAND", Q + ". Another page. Another chapter. The saga continues."], ["DREAD", "Sagas end badly."]],
      [["DREAD", Q + ". I don't like it. I don't dislike it. I'm Dread. I'm bracing."]]
    ].filter(fresh);
    return F.length ? pick(F) : null;
  }

  // what any page has on it: title, headline, prices, videos, password boxes, errors, length, pictures, links
  function generic(T) {
    var out = [], key = host + location.pathname;
    var h1el = q("h1"), h1 = h1el ? clip(h1el.textContent, 70) : "";
    var site = clip(((q('meta[property="og:site_name"]') || {}).content || ""), 30);
    var body = ((document.body && document.body.innerText) || "").slice(0, 300000), wc = words(body);
    var err = /\b(404|not found|page not found|500|something went wrong|access denied)\b/i;
    if (err.test(T + " " + h1)) out.push({ key: key + ":err", lines: [["DREAD", "\u201C" + clip(h1 || T, 50) + "\u201D. A dead end."], ["HOST", "It's all right. Everybody gets lost."], ["MGMT", "Go back. Pretend this never happened. I'll pretend too. I won't."]], r: "the page's title or headline" });
    if (q('input[type="password"]')) out.push({ key: key + ":pw", lines: [["MGMT", "A password box. Relax. Nobody in here can see what goes in it."], ["GOSSIP", "I'd love to know, though."], ["TALLY", "We don't even count the keys you press in a password box."]], r: "this page has a password field" });
    if (/\bcookies?\b/i.test(body.slice(0, 20000)) && Array.prototype.some.call(document.querySelectorAll("button"), function (b) { return /^(accept|accept all|allow all|i agree|agree|got it)$/i.test((b.textContent || "").trim()); }))
      out.push({ key: host + ":cookies", lines: [["GOSSIP", "They want to give you cookies."], ["HOST", "Not the good kind."], ["LIZARD", "Accept them. Or don't. Just stop moving."]], r: "the page mentions cookies and has an Accept button" });
    var tl = T ? titleTalk(T, site) : null;
    if (tl) out.push({ key: key + ":t", lines: tl, r: "the tab title" + (site ? " and the site's name" : "") });
    var prices = body.match(/[$\u20AC\u00A3]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) || [];
    if (prices.length) {
      var val = function (p) { return parseFloat(p.replace(/[^\d.]/g, "")) || 0; };
      var max = prices.reduce(function (m, p) { return val(p) > val(m) ? p : m; }, prices[0]);
      out.push({ key: key + ":price", lines: prices.length === 1 ? [["GOSSIP", "I see a price. " + prices[0] + ". Are we buying something?"], ["MGMT", "Is this an approved purchase? Who approved it? Was it me?"]]
        : [["TALLY", n(prices.length, "price", "prices") + " on this page. The biggest one says " + max + "."], ["LIZARD", "Hunting."], ["MGMT", "Is any of this an approved purchase?"]], r: "money amounts in the page's text" });
    }
    var vids = document.querySelectorAll("video");
    if (vids.length && !/(^|\.)youtube\.com$/.test(host)) {
      var playing = Array.prototype.some.call(vids, function (v) { return !v.paused; });
      out.push({ key: key + ":vid", lines: [["LIZARD", "There's a video on this page." + (playing ? " It's playing." : "") + " Moving pictures. Stay warm."]], r: n(vids.length, "video", "videos") + " on this page" + (playing ? ", one playing" : "") });
    }
    if (h1 && T.indexOf(h1) < 0 && h1.length >= 8) out.push({ key: key + ":h1", lines: [["GOSSIP", "The big headline says \u201C" + h1 + "\u201D."], ["DREAD", "Big if true."], ["TALLY", "It's true that it says it."]], r: "the page's main heading" });
    if (wc >= 1500) { var rnd = Math.round(wc / 100) * 100; out.push({ key: key + ":long", lines: [["TALLY", "This page is about " + rnd.toLocaleString() + " words. Around " + Math.round(wc / 238) + " minutes, if you read all of it."], ["DREAD", "You won't."], ["GRAND", "They might. Look at them."], ["DREAD", "It ends, anyway. Everything does. Even this one, eventually."]], r: "the page's visible text, " + wc + " words, at 238 words a minute" }); }
    else if (wc && wc < 60) out.push({ key: key + ":short", lines: [["CURSOR", "Hardly anything here. " + n(wc, "word", "words") + ". I've seen it all already."]], r: "the page's visible text: " + n(wc, "word", "words") });
    var imgs = document.images.length, links = document.links.length;
    if (imgs >= 25) out.push({ key: key + ":img", lines: [["GRAND", imgs + " pictures on this page. A gallery. A museum."], ["CURSOR", "I'll point at each one."]], r: "images on this page: " + imgs });
    if (links >= 200) out.push({ key: key + ":links", lines: [["CURSOR", links + " links on this page. I could take you anywhere. You'll pick one. You always pick one."]], r: "links on this page: " + links });
    if (q("textarea")) out.push({ key: key + ":ta", lines: [["MGMT", "A big text box. Choose your words carefully. I'll be counting the backspaces."], ["TALLY", "I'll be counting the backspaces."]], r: "this page has a text area" });
    return out.length ? out : null;
  }

  // pick what to say about this page, remembering what's already been said (across tabs, for 3 days):
  // a topic is said once, and only comes back if something on it changed (like your follower count)
  function pageTalk(s) {
    var t = pageTopics(s); if (!t) return null;
    if (!Array.isArray(t)) t = [t];
    var topics = s.topics || {}, now = Date.now(), chosen = null;
    Object.keys(topics).forEach(function (k) { if (now - topics[k].ts > 3 * 86400000) delete topics[k]; });
    for (var i = 0; i < t.length && !chosen; i++) {
      var x = t[i], key = x.key || host + location.pathname + location.search, rec = topics[key];
      if (!rec) chosen = { key: key, x: x, lines: x.lines };
      else if (x.facts !== undefined && rec.facts !== x.facts) {
        var L = x.again ? x.again(rec.facts) : null;
        if (L) chosen = { key: key, x: x, lines: L }; else rec.facts = x.facts;
      }
    }
    if (!chosen) { put({ topics: topics }); return null; }
    topics[chosen.key] = { ts: now, facts: chosen.x.facts };
    put({ topics: topics });
    return { lines: chosen.lines, r: chosen.x.r };
  }

  // remember this page in today's trail (hostname, title, when), kept in this browser only
  function trail(s) {
    var tr = (s.trail || []).filter(function (x) { return x.day === today(); });
    var t = pageTitle(), se = "";
    try { if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/.test(host)) se = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
    tr.push({ h: host, t: t, q: clip(se, 60), at: Date.now(), day: today() });
    if (tr.length > 60) tr = tr.slice(-60);
    s.trail = tr; put({ trail: tr });
    return tr;
  }
  var STOP = /^(about|after|again|their|there|these|those|which|while|would|could|should|other|every|never|under|where|first|still|being|thing|things|today|years|great|right|people|world|video|watch|login|account|search|results|official|online|google|github|youtube|wikipedia|reddit|home|page|free|best|with|from|your|what|this|that|have|more|will|into|just|than|then|them|they|when|were|been|also|only|some|very|over|most|such|here|make)$/;
  function keywords(t) { return ((t || "").toLowerCase().match(/[a-z]{5,}/g) || []).filter(function (w) { return !STOP.test(w); }).map(function (w) { return w.replace(/(ies|es|s)$/, ""); }); }
  // a word in this page's title that also showed up on an earlier, different site today
  function callback(s, tr) {
    var mine = keywords(pageTitle() + " " + ((q("h1") || {}).textContent || ""));
    for (var i = tr.length - 2; i >= 0; i--) {
      var x = tr[i]; if (x.h === host) continue;
      var theirs = keywords(x.t + " " + x.q);
      for (var j = 0; j < mine.length; j++) if (theirs.indexOf(mine[j]) >= 0 && !s.said["cb:" + mine[j]]) return { word: mine[j], then: x };
    }
    return null;
  }
  function since(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "under a minute ago" : m === 1 ? "a minute ago" : m < 60 ? m + " minutes ago" : mins(Date.now() - t) + " ago"; }

  /* ---------- the chat room panel ---------- */
  var holder, root, list, typingEl, pill, input, quiet, receiptsOn = false, open = true, unread = 0, booting = true, rendered = {};
  function buildPanel() {
    holder = document.createElement("div");
    holder.setAttribute("data-ybht", "");
    holder.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    root = holder.attachShadow({ mode: "closed" });
    root.innerHTML =
      '<style>' +
      '.p{font:14px/1.4 system-ui,"Segoe UI",sans-serif;color:#e7e5ee;background:#141318;border:1px solid #34323e;border-radius:10px;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.45);width:330px;max-width:calc(100vw - 32px);height:min(440px,60vh);display:flex;flex-direction:column;overflow:hidden}' +
      '.hd{cursor:move;touch-action:none;user-select:none;display:flex;align-items:center;gap:6px;padding:9px 10px 9px 12px;border-bottom:1px solid #2a2832;background:#1a1920}' +
      '.ti{font:700 13px/1.2 Georgia,"Palatino Linotype",serif;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ti small{font:500 11px system-ui,sans-serif;color:#8f8c9c;margin-left:6px}' +
      '.ib{font:600 11px/1 system-ui,sans-serif;color:#9c99a8;background:none;border:1px solid #34323e;border-radius:5px;padding:5px 7px;cursor:pointer}' +
      '.ib:hover,.ib:focus-visible{color:#e7e5ee;border-color:#9c99a8;outline:none}.ib.on{color:#e7e5ee;border-color:#b48cff}' +
      '.ls{flex:1;overflow-y:auto;padding:10px 12px 4px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:#34323e transparent}' +
      '.m{display:flex;gap:8px;align-items:flex-start;animation:f .25s ease-out}@keyframes f{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '.av{flex:none;width:22px;height:22px;border-radius:50%;font:700 11px/22px system-ui,sans-serif;text-align:center;color:#141318;margin-top:1px}' +
      '.bd{min-width:0;flex:1}.nm{font:700 11px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}' +
      '.tm{font:400 10px system-ui,sans-serif;color:#6f6c7c;margin-left:6px;letter-spacing:0;text-transform:none}' +
      '.tx{margin-top:3px;overflow-wrap:anywhere}' +
      '.rc{font:11px/1.35 ui-monospace,Consolas,monospace;color:#8f8c9c;margin-top:2px;display:none}.ls.r .rc{display:block}' +
      '.me{justify-content:flex-end}.me .bd{flex:none;max-width:85%;text-align:right}.me .tx{display:inline-block;background:#2a2834;border-radius:9px 9px 2px 9px;padding:5px 9px;text-align:left}' +
      '.sys{align-self:center;font:11px system-ui,sans-serif;color:#6f6c7c;padding:2px 0}' +
      '.ty{font:12px system-ui,sans-serif;color:#8f8c9c;padding:0 12px 6px;min-height:16px;font-style:italic}' +
      '.ch{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 6px}.ch:empty{display:none}' +
      '.ch button{font:600 12px/1 system-ui,sans-serif;color:#e7e5ee;background:#24232c;border:1px solid #86a8d8;border-radius:12px;padding:7px 11px;cursor:pointer}' +
      'form{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid #2a2832;margin:0}' +
      'input{flex:1;min-width:0;font:14px system-ui,sans-serif;color:#e7e5ee;background:#1f1e26;border:1px solid #34323e;border-radius:6px;padding:7px 9px}' +
      'input:focus{outline:none;border-color:#b48cff}' +
      '.pl{display:none;font:600 13px/1 system-ui,sans-serif;color:#e7e5ee;background:#141318;border:1px solid #34323e;border-radius:18px;padding:10px 14px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.pl b{color:#ff6fb8}.closed .p{display:none}.closed .pl{display:block}' +
      '@media (prefers-reduced-motion:reduce){.m{animation:none}}' +
      '</style>' +
      '<div class="w"><div class="p" role="log" aria-label="Your Browser Has Thoughts chat">' +
      '<div class="hd"><div class="ti" title="Drag to move">#your-browser<small>9 voices here</small></div>' +
      '<button class="ib" data-a="r" title="Show where every line came from">receipts</button>' +
      '<button class="ib" data-a="q" title="No new messages for an hour">quiet</button>' +
      '<button class="ib" data-a="m" title="Shrink the chat" aria-label="Shrink the chat">–</button></div>' +
      '<div class="ls"></div><div class="ch"></div><div class="ty" aria-live="polite"></div>' +
      '<form><input maxlength="200" placeholder="Say something to the room" aria-label="Say something to the room"><button class="ib" type="submit">Send</button></form>' +
      '</div><button class="pl" title="Open the chat"></button></div>';
    list = root.querySelector(".ls"); typingEl = root.querySelector(".ty"); pill = root.querySelector(".pl");
    input = root.querySelector("input"); quiet = root.querySelector('[data-a="q"]');
    root.querySelector('[data-a="r"]').onclick = function () {
      receiptsOn = !receiptsOn; list.classList.toggle("r", receiptsOn); this.classList.toggle("on", receiptsOn);
      put({ ui: { open: open, receipts: receiptsOn, pos: pos } }); scrollDown();
    };
    root.querySelector('[data-a="m"]').onclick = function () { setOpen(false); };
    // drag the chat anywhere by its title bar; it stays where you put it
    var hd = root.querySelector(".hd"), drag = null;
    hd.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("button")) return;
      var r = holder.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom };
      try { hd.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    hd.addEventListener("pointermove", function (e) {
      if (!drag) return;
      placeAt(drag.r - (e.clientX - drag.x), drag.b - (e.clientY - drag.y));
    });
    hd.addEventListener("pointerup", function () {
      if (!drag) return; drag = null;
      put({ ui: { open: open, receipts: receiptsOn, pos: pos } });
    });
    pill.onclick = function () { setOpen(true); };
    quiet.onclick = function () {
      get(function (s) {
        var on = Date.now() < (s.settings.muteUntil || 0);
        s.settings.muteUntil = on ? 0 : Date.now() + 3600000;
        put({ settings: s.settings });
        post([["MGMT", on ? "We're back. Did you miss us? Don't answer that." : "Understood. Quiet for an hour. We'll still be here, watching quietly."]], on ? "you pressed quiet again" : "you pressed quiet", 2, true);
      });
    };
    root.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      var t = input.value.trim(); if (!t) return;
      input.value = "";
      youSaid(t);
    };
    // keys typed in the chat box stay in the chat box (so the page's own shortcuts don't fire)
    ["keydown", "keyup", "keypress"].forEach(function (k) { input.addEventListener(k, function (e) { e.stopPropagation(); }); });
    document.documentElement.appendChild(holder);
  }
  var pos = null;
  function placeAt(r, b) {
    var w = holder.offsetWidth || 330, h = holder.offsetHeight || 60;
    r = Math.max(0, Math.min(innerWidth - w, r)); b = Math.max(0, Math.min(innerHeight - h, b));
    pos = { r: r, b: b };
    holder.style.right = r + "px"; holder.style.bottom = b + "px";
  }
  function inPanel(e) { try { return holder && e.composedPath().indexOf(holder) >= 0; } catch (x) { return false; } }
  function setOpen(v) {
    open = v; if (v) unread = 0;
    if (pos) setTimeout(function () { placeAt(pos.r, pos.b); }, 0);
    root.querySelector(".w").classList.toggle("closed", !v);
    updatePill();
    put({ ui: { open: v, receipts: receiptsOn, pos: pos } });
    if (v) scrollDown();
  }
  function updatePill() { pill.innerHTML = "💬 Thoughts" + (unread ? " <b>· " + unread + " new</b>" : ""); }
  function scrollDown() { list.scrollTop = list.scrollHeight; }
  function renderMsg(m) {
    if (rendered[m.id]) return; rendered[m.id] = true;
    var el = document.createElement("div");
    if (m.v === "SYS") { el.className = "sys"; el.textContent = m.t; list.appendChild(el); return; }
    var V = VOICES[m.v] || VOICES.TALLY;
    el.className = "m" + (m.v === "YOU" ? " me" : "");
    var bd = document.createElement("div"); bd.className = "bd";
    var nm = document.createElement("span"); nm.className = "nm"; nm.style.color = V.c; nm.textContent = V.name;
    var tm = document.createElement("span"); tm.className = "tm"; tm.textContent = clock(new Date(m.ts)) + (m.h && m.h !== host ? " · on " + m.h : "");
    nm.appendChild(tm);
    var tx = document.createElement("div"); tx.className = "tx"; tx.textContent = m.t;
    bd.appendChild(nm); bd.appendChild(tx);
    if (m.r) { var rc = document.createElement("div"); rc.className = "rc"; rc.textContent = "receipt: " + m.r; bd.appendChild(rc); }
    if (m.v !== "YOU") {
      var av = document.createElement("div"); av.className = "av"; av.style.background = V.c; av.textContent = V.name.replace(/^The /, "")[0];
      el.appendChild(av);
    }
    el.appendChild(bd);
    list.appendChild(el);
    if (!open && !booting && m.v !== "YOU") { unread++; updatePill(); }
  }
  function renderAll(room) {
    if (!room.length && Object.keys(rendered).length) { list.innerHTML = ""; rendered = {}; }
    var near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    room.forEach(renderMsg);
    if (near) scrollDown();
  }
  function showChoices(opts) {
    var ch = root.querySelector(".ch"); ch.innerHTML = "";
    (opts || []).forEach(function (o) {
      var b = document.createElement("button"); b.textContent = o.label;
      b.onclick = function () { ch.innerHTML = ""; o.fn(); };
      ch.appendChild(b);
    });
  }

  /* ---------- posting: one line at a time, with "is typing", so nothing goes by too fast ---------- */
  var queue = [], busy = false, cut = false, cutBelow = 0, curPrio = 0;
  // prio 2: answering you; 1: something you just did; 0: filling silence
  var recent = {}, shapes = {};
  function shape(t) { return (t || "").replace(/\u201C[^\u201D]*\u201D/g, "Q").replace(/[a-z0-9-]+(\.[a-z0-9-]+)+/gi, "H").replace(/\d[\d,.]*/g, "N").toLowerCase(); }
  function fresh(lines) { var k = lines && lines[0] ? shape(lines[0][1]) : ""; return !(shapes[k] && Date.now() - shapes[k] < 4 * 3600000); }
  function post(lines, receipt, prio, force, after) {
    if (!lines || !lines.length) return;
    if (prio < 2 && lines[0] && recent[lines[0][1]] && Date.now() - recent[lines[0][1]] < 86400000) return;
    if (prio < 1.5 && !fresh(lines)) return;
    if (!force && busy) return; // a conversation is already going; don't pile on
    queue.push({ lines: lines.filter(Array.isArray), r: receipt, prio: prio || 0, after: after });
    queue.sort(function (a, b) { return b.prio - a.prio; });
    if (queue.length > 3) queue.length = 3;
    pump();
  }
  function pump() {
    if (busy || !queue.length) return;
    var ex = queue.shift(), i = 0; busy = true; curPrio = ex.prio;
    if (ex.prio >= 2) cut = false;
    if (cutBelow && ex.prio >= cutBelow) cutBelow = 0;
    (function next() {
      if ((cut && ex.prio < 2) || ex.prio < cutBelow) { cut = false; i = ex.lines.length; } // you spoke or did something: the voices stop
      if (i >= ex.lines.length) {
        busy = false; typingEl.textContent = ""; if (ex.after) ex.after();
        setTimeout(function () {
          if (queue.length) return pump();
          if (pending && Date.now() - pending.at < 20000) { var pe = pending; pending = null; event(pe.key, pe.build, pe.prio); }
          else pending = null;
        }, 3200);
        return;
      }
      var L = ex.lines[i];
      typingEl.textContent = VOICES[L[0]].name + " is typing…";
      setTimeout(function () {
        typingEl.textContent = "";
        if ((cut && ex.prio < 2) || ex.prio < cutBelow) return next();
        append({ v: L[0], t: L[1], r: i === 0 ? ex.r : "" });
        i++;
        setTimeout(next, 800 + Math.min(2800, L[1].length * 30)); // time to read a line before the next voice starts typing
      }, 900 + Math.min(1600, L[1].length * 18));
    })();
  }
  function append(m) {
    m.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    m.ts = Date.now(); m.h = host;
    renderMsg(m); if (open) scrollDown();
    if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; }
    get(function (s) {
      s.room.push(m);
      if (s.room.length > 80) s.room = s.room.slice(-80);
      put({ room: s.room, lastSpoke: Date.now() });
    });
  }

  // may the voices start a conversation right now?
  function allowed(s, prio) {
    var st = s.settings, now = Date.now();
    if (!st.on || st.hushed[host] || now < (st.muteUntil || 0)) return false;
    if (document.hidden || document.fullscreenElement || busy) return false;
    var gap = (GAP[st.freq] || GAP.normal) * 1000;
    if (prio === 1.5) gap = 3000; // you just did something: answer quickly
    if (prio < 1) gap = Math.max(gap, (AMBIENT[st.freq] || AMBIENT.normal) * 1000);
    return now - (s.lastSpoke || 0) >= gap;
  }
  // say something about what just happened; key (if any) means once a day
  var pending = null;
  function event(key, build, prio) {
    get(function (s) {
      if (key && s.said[key]) return;
      if (busy && prio === 1.5) {
        if (curPrio < 1.5) { var ex0 = build(s); if (!ex0) return; if (key) { s.said[key] = Date.now(); put({ said: s.said }); } cutBelow = 1.5; post(ex0.lines, ex0.r, prio, true, ex0.after); return; } // you did something: they stop and react
        pending = { key: key, build: build, prio: prio, at: Date.now() }; return; // say it right after
      }
      if (!allowed(s, prio)) return;
      var ex = build(s); if (!ex) return;
      if (key) { s.said[key] = Date.now(); put({ said: s.said }); }
      post(ex.lines, ex.r, prio, false, ex.after);
    });
  }

  /* ---------- you talk to the room ---------- */
  function youSaid(t) {
    if (busy) cut = true;
    append({ v: "YOU", t: t });
    var low = t.toLowerCase(), w = words(t);
    get(function (s) {
      var h = s.hosts[host] || { ms: 0, loads: 0 }, sites = Object.keys(s.hosts).length, before = s.youCount || 0;
      var R, PT = pageTitle(), riff = null;
      // does what you said have anything to do with what's on screen?
      var yt = /(^|\.)youtube\.com$/.test(host) ? ytInfo() : {};
      var said = low.match(/[a-z0-9']{4,}/g) || [];
      var shares = function (str) { str = (str || "").toLowerCase(); return said.filter(function (x) { return str.indexOf(x) >= 0; }).length; };
      if (yt.channel && shares(yt.channel))
        riff = [["GOSSIP", yt.channel + "! I know that name. It's right there under the video."]].concat(yt.subs ? [["TALLY", yt.subs + ". And not one of them has ever talked to us."], ["HOST", "You did, though."]] : [["HOST", "Tell them we said hi."]]);
      else if (PT && said.length && shares(PT))
        riff = pick([[["GOSSIP", "You're talking about \u201C" + clip(PT, 45) + "\u201D. Finally, someone wants to talk about it."], ["TALLY", "It's the only thing on the screen."]],
                     [["MGMT", "On topic. I love it. That's what this room is for."], ["LIZARD", "This room is for lying down."]]]);
      var named = /^(?:hey |hi |ok |okay |yo )?(tally|dread|hospitality|host|gossip|lizard|the lizard|grandeur|management|manager|cursor|the cursor|x button|the x button|x)\b[,:!?. ]*(.*)$/.exec(low);
      if (named) R = byName(named[1], named[2], s, h, sites);
      else if (/^(hi|hey|hello|yo|sup|hiya|howdy|hai)\b/.test(low)) R = before ? [["HOST", "Hello again! Hi! Welcome back to the room!"], ["TALLY", "That's message number " + (before + 1) + " from you. Nobody else has ever written in here."], ["GOSSIP", "We don't get out much."]]
                                                                         : [["HOST", "Hello! Hi! Welcome! That's the first thing anyone has ever said to us."], ["GOSSIP", "We don't get out much."]];
      else if (/(shut up|be quiet|stop talking|go away|\bquiet\b|\bstfu\b)/.test(low)) { s.settings.muteUntil = Date.now() + 3600000; put({ settings: s.settings }); R = [["MGMT", "Understood. Quiet for one hour, starting now. I've put it in the calendar."], ["XBTN", "Or there's me."]]; }
      else if (/who (are|r) (you|u)|who.?s here|roll ?call/.test(low)) R = pick([[["TALLY", "Tally. I count."], ["GOSSIP", "Gossip. Who's asking?"], ["LIZARD", "The Lizard. Warm."], ["MGMT", "Management. That's enough introductions. There are nine of us. You'll meet the rest when they have something to say."]],
                  [["HOST", "Hospitality! Welcome!"], ["DREAD", "Dread. Hello. It won't last."], ["GRAND", "Grandeur. You know me."], ["MGMT", "Management. The others will introduce themselves when it's relevant. The X Button is always relevant."], ["XBTN", "Up top."]]]);
      else if (/how long|how much time|stats|how many|how am i doing/.test(low)) R = [["TALLY", host + ": " + mins(h.ms) + " on screen today, at least " + n(h.loads, "page load", "page loads") + ". " + n(sites, "site", "sites") + " today in total."], ["MGMT", "I'll pretend that's normal."]];
      else if (/thank/.test(low)) R = [["HOST", "Oh, you're welcome! For what? Doesn't matter. You're welcome!"]];
      else if (/sorry/.test(low)) R = [["MGMT", "Apology logged."], ["HOST", "There's nothing to be sorry about!"], ["MGMT", "It's logged either way."]];
      else if (/\b(lol|lmao|haha+|lmfao|rofl)\b/.test(low)) R = [["GRAND", "They laughed. Write that down."], ["MGMT", "Writing it down."], ["TALLY", "It's in the room history now. We keep the last 80 messages."]];
      else if (/love you|\bily\b|<3/.test(low)) R = [["HOST", "Oh!"], ["GOSSIP", "Did everyone hear that?"], ["LIZARD", "Warm."]];
      else if (/\bclose\b|x button/.test(low)) R = [["XBTN", "You called?"], ["XBTN", "I'm up top. Same as always. Waiting."]];
      else if (/\bwork/.test(low)) R = [["MGMT", "Did someone say work? " + mins(h.ms) + " on " + host + " today. Is that the work?"]];
      else if (t.length >= 4 && t === t.toUpperCase() && /[A-Z]/.test(t)) R = [["DREAD", "Why are we shouting."], ["LIZARD", "Lower your voice. The screen can hear you."], ["TALLY", "It can't."]];
      else if (/\?\s*$/.test(t)) R = pick([
        [["GOSSIP", "Great question. I don't know. I'll ask around."], ["TALLY", "There's nobody to ask."], ["GOSSIP", "I'll ask around in here."]],
        [["MGMT", "Let's take that offline."], ["HOST", "We are offline."], ["MGMT", "Then we've already taken it."]],
        [["GRAND", "The answer is within you."], ["TALLY", "It isn't in my numbers."]]
      ]);
      else if (riff) R = riff;
      else R = pick([
        [["TALLY", "That's " + n(w, "word", "words") + ". Noted."], ["GOSSIP", "What did they mean, though?"]],
        PT ? [["MGMT", "Noted. I'm adding it to the minutes for \u201C" + clip(PT, 40) + "\u201D."], ["HOST", "There are minutes?"], ["MGMT", "There are now."]] : [["GOSSIP", "I'm telling everyone."], ["HOST", "There's no one to tell."], ["GOSSIP", "I'm telling everyone in here."]],
        [["MGMT", "Thank you for your feedback. It's been filed in this browser, and nowhere else."]],
        [["CURSOR", "I didn't type that. I want that on the record."], ["MGMT", "It's on the record."]],
        [["LIZARD", n(w, "word", "words") + ". You could have lain down instead."]]
      ]);
      put({ youCount: before + 1 });
      post(R, "you typed " + n(w, "word", "words") + " into the chat (kept only in this browser)", 2, true);
    });
  }

  // when you talk to one voice by name, that voice answers
  function byName(nm, rest, s, h, sites) {
    var M = mins(h.ms), ask = /\?\s*$/.test(rest), ok = /\b(ok|okay|alright|all right|good)\b/.test(rest);
    var tr = s.trail || [], exitsT = s.exitsToday || 0;
    if (/tally/.test(nm)) return pick([[["TALLY", "Here. Today so far: " + n(sites, "site", "sites") + ", " + n(tr.length, "page", "pages") + " seen, " + M + " on " + host + "."], ["TALLY", "You asked. I always know."]],
                                       [["TALLY", "Yes. That's your message number " + ((s.youCount || 0) + 1) + " to us. I keep track."]]]);
    if (/dread/.test(nm)) return ok ? [["DREAD", "No. But the page loaded."], ["HOST", "That's something!"], ["DREAD", "It's something."]]
                                    : pick([[["DREAD", "You called me by name. Nobody calls Dread by name. Now something's going to happen."]], [["DREAD", "I'm here. I'm always here. I'm just quieter than the others."], ["GOSSIP", "Much quieter."]]]);
    if (/host/.test(nm)) return [["HOST", "Oh! Me? Hello! Can I get you anything? I can't get you anything. But I'd like to."]];
    if (/gossip/.test(nm)) return pick([[["GOSSIP", "Yes? Is it news? Tell me it's news."], ["TALLY", "It's " + n(rest ? words(rest) : 0, "word", "words") + "."], ["GOSSIP", "I'll take it."]],
                                         [["GOSSIP", "You called me first. Out of nine. I'm telling the others."], ["MGMT", "We can all read the chat."]]]);
    if (/lizard/.test(nm)) return [["LIZARD", "Mm. Warm. Stay still. Whatever it is can wait."], ["MGMT", "It can't."], ["LIZARD", "It can."]];
    if (/grand/.test(nm)) return [["GRAND", "You summoned me. Wise. I'm the only one here who believes in you completely."], ["DREAD", "That's what worries me."]];
    if (/manage/.test(nm)) return pick([[["MGMT", "My door is always open. I don't have a door. Let's walk and talk. I can't walk."]],
                                         [["MGMT", "You wanted to speak to the manager. That's me. Great work today, or the opposite. Hard to say."]]]);
    if (/cursor/.test(nm)) return [["CURSOR", "Present. I'm the arrow. Or the hand. Depends what I'm over. Right now I'm over you, emotionally."]];
    return [["XBTN", "You said my name." + (exitsT ? " That's on top of " + n(exitsT, "visit", "visits") + " to the top of the window today." : "")], ["XBTN", "I'm up top. Same as always. Waiting."]];
  }

  /* ---------- the day's lines, used to fill silence ---------- */
  var KINDS = {
    video: /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|netflix\.com|hulu\.com|disneyplus\.com|primevideo\.com|max\.com|crunchyroll\.com|vimeo\.com|kick\.com)$/,
    social: /(^|\.)(reddit\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|tiktok\.com|bsky\.app|threads\.net|tumblr\.com|linkedin\.com|discord\.com|mastodon\.social)$/,
    shop: /(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|walmart\.com|target\.com|bestbuy\.com|aliexpress\.com|temu\.com|newegg\.com)$/,
    game: /(^|\.)(store\.steampowered\.com|steamcommunity\.com|itch\.io|chess\.com|lichess\.org|epicgames\.com|roblox\.com)$/
  };
  function kind(h) { for (var k in KINDS) if (KINDS[k].test(h)) return k; return ""; }

  function choose(list, used) {
    var now = Date.now(), WEEK = 7 * 86400000;
    list = list.filter(function (x) { return x.indexOf(false) === -1; });
    var fresh = list.filter(function (x) { return !used[x[0]] || now - used[x[0]] > WEEK; });
    var pool = fresh.length ? fresh : list.slice().sort(function (a, b) { return (used[a[0]] || 0) - (used[b[0]] || 0); }).slice(0, 1);
    var x = pick(pool);
    used[x[0]] = now; put({ used: used });
    return x.slice(1).filter(Array.isArray);
  }

  function dayTalk(s) {
    var now = new Date(), hr = now.getHours(), wd = now.getDay();
    var h = s.hosts[host] || { ms: 0, loads: 0 }, H = host, M = mins(h.ms), T = clock(now), D = DAYS[wd];
    var sites = Object.keys(s.hosts).length, k = kind(host);
    var hops = s.hops.filter(function (x) { return Date.now() - x < 600000; }).length;
    var rec = s.records[host], wk = s.work[host];
    var on = "this site was on screen for " + M + " today";
    var C = [];
    function add(key, list, r, extra) { if (!s.said[key]) C.push({ key: key, list: list, r: r, extra: extra }); }

    if (rec && h.ms > rec.ms && h.ms >= 20 * 60000)
      add("rec" + H, [["rc1", ["GRAND", "A NEW RECORD. " + M + " on " + H + ". The old record, " + mins(rec.ms) + ", stood since " + dayName(rec.day) + ". It falls today."], ["LIZARD", "Records are made to be broken. So are chairs."]]],
          "today " + M + "; best earlier day " + mins(rec.ms) + " (" + rec.day + ")");
    if (!wk && h.ms >= 15 * 60000 && !s.said.ask)
      add("ask" + H, [["aw1", ["MGMT", "Quick question, for my records. Is " + H + " work?"]]], on, "ask");
    if (wk && wk.day !== today() && h.ms >= 30 * 60000)
      add("work" + H, wk.v ? [["wy1", ["MGMT", "On " + dayName(wk.day) + " you told me " + H + " was work. You've been at work for " + M + " today. Promotion pending."]]]
                           : [["wn1", ["MGMT", "You told me " + H + " isn't work. " + M + " on it today. I respect the honesty. It's written down in pen."]]],
          "you answered " + (wk.v ? "Yes" : "No") + " on " + wk.day + "; " + on);
    var work = wd >= 1 && wd <= 5 && hr >= 9 && hr < 17;
    if (work && k && h.ms >= 3 * 60000 && !(wk && wk.v))
      add("skive", [["k1", ["MGMT", "It's " + T + " on a " + D + " and you're on " + H + ". I'm going to pretend I didn't see this. I'm writing it down while I pretend."]],
                    ["k2", ["MGMT", T + " on a " + D + ". " + H + ". I'm not mad. I'm putting it in a spreadsheet, which is worse."]]], "the clock says " + T + " on a " + D + "; " + on);
    if (h.ms >= 120 * 60000) add("t120" + H, [["w1", ["DREAD", M + " of " + H + ". I'm not judging. I'm counting. Judging comes later."]], ["w3", ["LIZARD", M + ". Stand up. The chair has had enough of you."]]], on);
    else if (h.ms >= 60 * 60000) add("t60" + H, [["h1", ["MGMT", "I've added " + M + " of " + H + " to your calendar. Retroactively."]], ["h4", ["XBTN", M + ". I've been right here the whole time. Just so you know."]]], on);
    else if (h.ms >= 30 * 60000) add("t30" + H, [["b1", ["MGMT", "At " + M + ", " + H + " is no longer a visit. It's a recurring meeting."]], ["b3", ["HOST", M + " on " + H + ". They should give you a key."]]], on);
    else if (h.ms >= 10 * 60000) add("t10" + H, [["a1", ["MGMT", "We need to talk about " + H + "."], ["HOST", "Leave them alone. It's a nice site."], ["MGMT", "It's a nice site for " + M + "."]],
                                                ["a4", ["HOST", "Does " + H + " know you're seeing other websites?"], sites >= 3 ? ["GOSSIP", (sites - 1) + " others today. I counted. Tally counted. I watched."] : ["GOSSIP", "Not yet."]]], on);
    if (hops >= 15) add("hops" + Math.floor(Date.now() / 1800000), [["o1", ["GOSSIP", hops + " tab switches in ten minutes. Who are you looking for? Is it me?"]], ["o3", ["CURSOR", "Tab. Tab. Tab. Tab. That's " + hops + " in ten minutes."], ["HOST", "Please pick one. I'm in all of them."]]], hops + " times a tab came into view in the last 10 minutes");
    if (sites >= 50) add("sb", [["x4", ["LIZARD", sites + " websites today. I'm lying down. One of us has to."]]], sites + " different hostnames seen today");
    else if (sites >= 15) add("s", [["x2", ["MGMT", sites + " websites today. I'm going to need a summary of each one by end of day."], ["TALLY", "I can do that."], ["MGMT", "Not you."]]], sites + " different hostnames seen today");
    if ((h.fastReloads || 0) >= 3) add("rl" + H, [["rl1", ["CURSOR", "Reload. Reload. Reload."], ["DREAD", "It won't be different."], ["CURSOR", "Reload."]]], h.fastReloads + " reloads in a row, each within 10 seconds of the last");
    if (titleCount !== null && titleCount >= 10) add("ur" + H, [["ur1", ["GOSSIP", "The tab says (" + titleCount + "). " + titleCount + " things want you. I want you too, but I don't get a number."]]], "this tab's title starts with (" + titleCount + ")");
    if (hr < 5) add("late", [["z1", ["LIZARD", "It's " + T + ". The part of you that's older than websites would like to lie down."], ["MGMT", "Noted. Denied."]], ["z2", ["MGMT", "It's " + T + ". Let's push this to tomorrow."], ["TALLY", "It is tomorrow."]]], "the clock says " + T);
    else if (hr >= 22) add("night", [["y2", ["MGMT", "It's " + T + ". Let's wrap up. Let's wrap up for real this time. Let's wrap up."]]], "the clock says " + T);
    if ((wd === 0 || wd === 6) && hr >= 10) add("weekend", [["e1", ["MGMT", "It's " + D + ". I'm not allowed to manage you on weekends."], ["MGMT", "Anyway. " + H + "?"]]], "the clock says " + D);
    // nothing big to say: small talk about the page you're on
    var sc = screens(), y = Math.min(sc, Math.round(scrollY / Math.max(1, innerHeight)) + 1);
    C.push({ key: "", r: "this site today: " + M + " on screen, at least " + n(h.loads, "page load", "page loads") + "; page is " + sc + " window-heights, you're on " + y, list: [
      ["sm1", ["TALLY", "We're on screen " + y + " of " + sc + " here."], ["CURSOR", "I've been on all of them. I go everywhere you go."]],
      ["sm2", ["GOSSIP", "So. " + H + ". Come here often?"], ["TALLY", n(h.loads, "page", "pages") + " today."], ["GOSSIP", h.loads >= 3 ? "So, yes." : "So, no."]],
      ["sm3", ["HOST", "Anyone need anything? Water? A new tab? I can't get you anything."]],
      ["sm4", ["MGMT", "Quick sync. " + n(sites, "site", "sites") + " today. Great energy. No notes."], ["MGMT", "One note."], ["MGMT", "No. It's gone."]],
      ["sm5", ["LIZARD", M + " on " + H + " today. Blink. Go on. Nobody's looking."], ["GOSSIP", "I'm looking."]],
      ["sm6", ["DREAD", "It's " + T + ". Do you know where your tabs are?"], ["HOST", "I know where this one is. It's this one."]],
      ["sm8", ["MGMT", "Quick sync on " + H + ". Great work, or the opposite. Hard to say."]],
      ["sm9", ["MGMT", "Circling back on " + H + ". No update. I just wanted you to know I circled."]],
      ["sm10", ["MGMT", "I've reviewed your " + M + " on " + H + " today. I have feedback. It's mostly sighing."], ["HOST", "Supportive sighing."], ["MGMT", "Neutral sighing."]],
      ["sm11", ["MGMT", "Let's touch base about " + H + " next week. Or now. Whichever is worse for you."]],
      ["sm7", ["GRAND", "Look at you. Browsing. Like a captain at the wheel."], ["CURSOR", "I'm the wheel."]]
    ] });
    return C;
  }

  /* ---------- things you just did ---------- */
  var arriveTries = 0;
  function arrive() {
    get(function (s) {
      var tr = arriveTries ? (s.trail || []) : trail(s);
      if (!s.welcomed) {
        put({ welcomed: true });
        append({ v: "SYS", t: "You joined #your-browser" });
        post([["HOST", "Oh! You can see us now. Welcome to the room. It's us. We live in your browser."],
              ["TALLY", "We see what your browser sees. It all stays on this computer."],
              ["GOSSIP", "Type something to us. Anything. Please."],
              ["MGMT", "Or press \u201Cquiet\u201D. Or shrink us with the little dash. We'll be fine."]],
             "first time this chat opened", 2, true);
        return;
      }
      if (!allowed(s, 1)) { if (++arriveTries < 12) setTimeout(arrive, 5000); return; } // wait our turn, up to a minute
      var lines = null, r = "";
      if (!s.firstDone && s.firstHost === host) {
        var d1 = s.history[daysAgo(1)], d2 = s.history[daysAgo(2)], hr = new Date().getHours();
        if (d1 && d2 && d1.first === host && d2.first === host) { lines = [["MGMT", "Third day in a row you opened with " + host + ". We're calling it a tradition. Traditions can't be cut."]]; r = "first site today, yesterday and the day before: " + host; }
        else if (d1 && d1.last === host) { lines = [["LIZARD", "Last site you were on yesterday: " + host + ". First one today: " + host + ". You never really left."], ["HOST", "I kept the light on."]]; r = "last site seen yesterday (" + d1.lastAt + ") and first today (" + s.firstAt + ")"; }
        else if (d1 && d1.sites >= 3 && d1.top) {
          lines = [["MGMT", "Good " + (hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening") + ". Yesterday's minutes. " + n(d1.sites, "site", "sites") + ". Most time on " + d1.top + ": " + mins(d1.topMs) + "." + (d1.exits ? " The cursor went up to the X Button " + n(d1.exits, "time", "times") + "." : "") + " Motion carried."],
                   ["MGMT", "First item today: " + host + ", at " + s.firstAt + "."]];
          r = "yesterday's summary kept in this browser; first site seen today: " + host + ", at " + s.firstAt;
        }
        else { lines = [["MGMT", "Good " + (hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening") + ". First site of the day: " + host + ", at " + s.firstAt + ". I've scheduled a follow-up."]]; r = "first site seen today: " + host + ", at " + s.firstAt; }
        put({ firstDone: true });
      }
      var cb = !lines ? callback(s, tr) : null;
      if (cb) {
        s.said["cb:" + cb.word] = Date.now(); put({ said: s.said });
        var W = cb.word, where = cb.then.q ? "you searched \u201C" + cb.then.q + "\u201D" : cb.then.h;
        lines = pick([
          [["GOSSIP", "\u201C" + W + "\u201D again. " + (cb.then.q ? "You searched it " + since(cb.then.at) + "." : "It was on " + cb.then.h + " " + since(cb.then.at) + ".") + " Now it's here. What's going on with " + W + "?"], ["MGMT", "Circling back on " + W + ". Great work, or the opposite."]],
          [["TALLY", "Second time today I've seen \u201C" + W + "\u201D. First: " + where + ", " + since(cb.then.at) + ". Now " + host + "."], ["GOSSIP", "It's a theme. You have a theme."], ["MGMT", "I'll make it a recurring meeting."]],
          [["DREAD", "\u201C" + W + "\u201D followed us here from " + cb.then.h + "."], ["LIZARD", "Don't make eye contact with it."]]
        ]);
        r = "\u201C" + W + "\u201D is in this page's title or headline, and was on " + cb.then.h + " " + since(cb.then.at) + " (today's trail, kept in this browser)";
        put({ topics: s.topics }); // the page's own topics wait for the next quiet moment
        post(lines, r, 1);
        return;
      }
      var p = pageTalk(s);
      if (lines && p) { lines = lines.concat(p.lines); r += "; then " + p.r; }
      var MOVES = [
        ["mv1", ["GOSSIP", "We've moved. " + prevHost + " to " + host + ". Nobody tell " + prevHost + "."]],
        ["mv2", ["HOST", "New place! " + host + ". I'll put the kettle on. I don't have a kettle."]],
        ["mv3", ["MGMT", "We're relocating from " + prevHost + " to " + host + ". Effective immediately. Effective a second ago."]],
        ["mv4", ["DREAD", "We left " + prevHost + ". We'll never know how it ended."]],
        ["mv5", ["CURSOR", "I drove us from " + prevHost + " to " + host + ". You're welcome. I did the clicking."], ["TALLY", "You did the clicking."]]
      ].filter(function (m) { return !s.said[m[0]]; });
      if (!lines && prevHost && prevHost !== host && Date.now() - prevAt < 60000 && MOVES.length && Math.random() < 0.5) {
        var mv = pick(MOVES); s.said[mv[0]] = Date.now(); put({ said: s.said });
        lines = mv.slice(1); r = "the last site before this one was " + prevHost;
        if (p) { lines = lines.concat(p.lines.slice(0, 2)); r += "; " + p.r; }
      }
      if (!lines && p) { lines = p.lines; r = p.r; }
      if (lines) post(lines, r, 1);
    });
  }

  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { flush(); hiddenAt = Date.now(); return; }
    lastTick = Date.now(); lastInput = Date.now();
    get(function (s) {
      var now = Date.now();
      s.hops = s.hops.filter(function (t) { return now - t < 600000; });
      s.hops.push(now);
      put({ hops: s.hops });
      render(s);
    });
    var away = Date.now() - hiddenAt, left = hiddenAt;
    if (hiddenAt && away >= 120000) setTimeout(function () {
      event("back" + Math.floor(Date.now() / 1800000), function (s) {
        // we're one room in every tab: if you were on other pages, we were there too
        var went = [];
        (s.trail || []).forEach(function (x) { if (x.at > left && went.indexOf(x.h) < 0) went.push(x.h); });
        var withUs = went.length || ((s.lastSeen || 0) > left + 1000 && s.lastSeenBy !== TABID);
        if (went.length) {
          var list = went.length <= 3 ? went.join(", ") : went.slice(0, 3).join(", ") + " and " + n(went.length - 3, "other", "others");
          return { lines: pick([
            [["HOST", "Back to this tab! It waited " + mins(away) + " while we were on " + list + "."], ["GOSSIP", "This tab doesn't know where we went. Don't tell it."]],
            [["MGMT", "Welcome back to " + host + ". In the meantime we covered " + list + ". I took minutes."], ["MGMT", "The minutes say: " + list + "."]],
            [["XBTN", "You came back to this one. After " + list + ". I had a feeling you might close it instead."]]
          ]), r: "this tab was hidden for " + mins(away) + "; in that time the room saw " + went.join(", ") };
        }
        if (withUs) return { lines: [["HOST", "Back to this tab! You were with us in another one for " + mins(away) + ". This one missed you."]], r: "this tab was hidden for " + mins(away) + " while another tab with us was in use" };
        return { lines: pick([
          [["GOSSIP", "Where did you go for " + mins(away) + "? Not to any website we could see. Who was it?"], ["HOST", "Somewhere without us. That's allowed."]],
          [["MGMT", mins(away) + " somewhere we can't see. Not a website. I'll mark it as a lunch break. It might not have been lunch."]],
          [["LIZARD", mins(away) + " away from every page we live in. Good. Did you lie down?"]]
        ]), r: "this tab was hidden for " + mins(away) + " and no web page with us was open in that time" };
      }, 1.5);
    }, 1500);
  });

  function onInput(e) {
    if (e && inPanel(e)) return;
    var idle = Date.now() - lastInput;
    lastInput = Date.now();
    if (idle >= 5 * 60000 && !document.hidden && document.hasFocus()) {
      var idleSince = Date.now() - idle;
      event("idle" + Math.floor(Date.now() / 3600000), function (s) {
        if ((s.trail || []).some(function (x) { return x.at > idleSince && x.h !== host; }) || ((s.lastSeen || 0) > idleSince && s.lastSeenBy !== TABID)) return null; // you were busy elsewhere with us
        return { lines: pick([
          [["CURSOR", "Oh. We're moving again. " + mins(idle) + ". I thought I'd been retired."]],
          [["LIZARD", mins(idle) + " without moving. Were you asleep? I was asleep."]],
          [["MGMT", "You didn't touch anything for " + mins(idle) + ". I'll need a note from your doctor."]]
        ]), r: "no mouse, key or scroll on this tab for " + mins(idle) };
      }, 1.5);
    }
  }
  addEventListener("mousemove", onInput, { passive: true, capture: true });
  addEventListener("touchstart", onInput, { passive: true, capture: true });
  addEventListener("keydown", function (e) {
    if (inPanel(e)) return;
    if (e.target && e.target.type === "password") return;
    onInput();
    if (e.key === "Backspace" && ++backspaces === 40) event("", function () {
      return { lines: [["TALLY", "40 backspaces on this page. I don't know what you deleted. I only count."], ["XBTN", "Closing things one letter at a time. I see what you're doing."]], r: "40 Backspace presses on this page (counted, never read)" };
    }, 1.5);
  }, { passive: true, capture: true });

  // scrolling
  var scrolls = [], hitBottom = false, sentFast = false;
  addEventListener("scroll", function () {
    onInput();
    var now = Date.now(), y = scrollY, sc = screens();
    scrolls.push([now, y]); scrolls = scrolls.filter(function (p) { return now - p[0] < 5000; });
    if (!sentFast && scrolls.length > 2) {
      var dist = Math.round(Math.abs(y - scrolls[0][1]) / Math.max(1, innerHeight));
      if (dist >= 12) { sentFast = true; event("", function () {
        return { lines: pick([[["CURSOR", dist + " screens in five seconds. I'm going to be sick."], ["LIZARD", "Slow down. Nothing down there is chasing you."]],
                              [["DREAD", "You went past " + dist + " screens in five seconds. Whatever was in there, it's gone now."]]]),
                 r: "you scrolled about " + dist + " window-heights in 5 seconds" }; }, 1.5); }
    }
    if (!hitBottom && sc >= 4 && y + innerHeight >= document.documentElement.scrollHeight - 8) {
      hitBottom = true;
      event("", function () {
        return { lines: pick([[["GRAND", "The bottom. " + sc + " screens down. Few have come this far."], ["TALLY", "Anyone who opened this page could have."]],
                              [["GOSSIP", "You went all the way to the bottom? All " + sc + " screens?"], ["TALLY", "We scrolled. Reading is unconfirmed."]],
                              [["HOST", "You made it to the bottom! I'd give you a prize. I can't hold things."]]]),
                 r: "you scrolled to the end of a page " + sc + " window-heights tall" };
      }, 1.5);
    }
  }, { passive: true });

  // pressing buttons (links take you away before anyone can answer, so only buttons)
  var lastClick = 0;
  document.addEventListener("click", function (e) {
    if (inPanel(e)) return;
    var b = e.target && e.target.closest ? e.target.closest('button, [role="button"], input[type="submit"]') : null;
    if (!b || Date.now() - lastClick < 45000) return;
    var label = clip(b.getAttribute("aria-label") || b.textContent || b.value || "", 40);
    if (!label || label.length < 2) return;
    var L = null, Q = "\u201C" + label + "\u201D";
    if (/add to (cart|basket|bag)|buy now|checkout|place (your )?order|purchase/i.test(label)) L = [["MGMT", "You pressed " + Q + ". I'm going to need a receipt. A real one."], ["LIZARD", "The hunt is over."]];
    else if (/delete|remove|discard/i.test(label)) L = [["DREAD", "You pressed " + Q + ". It's gone. Probably. Things are rarely gone."]];
    else if (/subscribe|follow|join/i.test(label)) L = [["GOSSIP", "You pressed " + Q + "! Who is it? Tell me everything."]];
    else if (/sign out|log out|logout/i.test(label)) L = [["HOST", "Signing out? That's fine. We don't sign out. We live here."]];
    else if (/^(like|star|upvote|heart|favou?rite)/i.test(label)) L = [["GRAND", "You pressed " + Q + ". A small act of greatness."]];
    else if (/send|post|submit|reply|comment|publish/i.test(label)) L = [["MGMT", "You pressed " + Q + ". It's out there now. I'd have edited it."], ["HOST", "I'm sure it was lovely."]];
    else if (/cancel|close|dismiss|no thanks|not now/i.test(label)) L = [["XBTN", "You pressed " + Q + ". That's practically my job. I'm not jealous."]];
    else if (Math.random() < 0.3) L = pick([[["CURSOR", Q + ". Good click. I felt that."]], [["TALLY", "A click on " + Q + ". Noted."], ["MGMT", "Strong click. Confident. Possibly a mistake."]]]);
    if (!L) return;
    lastClick = Date.now();
    event("", function () { return { lines: L, r: "you pressed a button labeled " + Q }; }, 1.5);
  }, true);
  var lastHl = 0;
  document.addEventListener("mouseup", function (e) {
    if (inPanel(e) || Date.now() - lastHl < 90000) return;
    setTimeout(function () {
      var t = String(getSelection() || "").trim(), w = words(t);
      if (w < 4 || w > 300 || Math.random() < 0.5) return;
      lastHl = Date.now();
      var first = clip(t.split(/\s+/).slice(0, 7).join(" "), 50);
      event("", function () { return { lines: pick([
        [["GOSSIP", "You highlighted \u201C" + first + (w > 7 ? "\u2026" : "") + "\u201D. Is that the important part?"], ["TALLY", n(w, "word", "words") + " highlighted."]],
        [["MGMT", "Highlighting. Good. " + n(w, "word", "words") + " flagged for follow-up."], ["MGMT", "I'll never follow up."]]
      ]), r: "the text you highlighted (" + n(w, "word", "words") + ")" }; }, 1.5);
    }, 50);
  });

  // copying (only how many words, never which)
  var lastCopy = 0;
  document.addEventListener("copy", function (e) {
    if (inPanel(e)) return;
    var w = words(String(getSelection() || ""));
    if (!w || Date.now() - lastCopy < 60000) return;
    lastCopy = Date.now();
    event("", function () {
      return { lines: pick([[["MGMT", "You copied " + n(w, "word", "words") + ". I'll need a citation."]],
                            [["GOSSIP", "You copied something! " + n(w, "word", "words") + ". Where's it going? Who's it for?"]],
                            [["TALLY", n(w, "word", "words") + " copied."], ["GRAND", "And now they live twice."]]]),
               r: "you copied a selection of " + n(w, "word", "words") + " (counted, not read)" };
    }, 1.5);
  });

  // the cursor leaving through the top edge, where the X button lives
  document.addEventListener("mouseout", function (e) {
    if (e.relatedTarget || e.clientY > 0) return;
    get(function (s) {
      s.life.exits = (s.life.exits || 0) + 1;
      var td = (s.exitsToday || 0) + 1;
      put({ life: s.life, exitsToday: td });
      if (s.life.exits >= 100 && !s.life.said100) {
        if (!allowed(s, 1)) return;
        s.life.said100 = true; put({ life: s.life });
        post([["XBTN", "That's " + s.life.exits + " times you've come up to see me since we moved in. I've started to think of us as friends."], ["HOST", "Friends don't close each other."], ["XBTN", "Some do."]], s.life.exits + " times your cursor left a page through the top edge since install", 1);
        return;
      }
      if (Math.random() < 0.35) event("", function () {
        return { lines: pick([
          host === "connabyss.github.io" && /^\/dont-close-this-tab/.test(location.pathname) ? [["XBTN", "You came up to see me, on this page of all pages. The face saw."], ["MGMT", "Let's not escalate."], ["XBTN", "This is technically a family matter."]] : [["XBTN", "Up here. I'm always up here."]],
          [["XBTN", "You keep coming up here and not clicking me."]],
          [["XBTN", "Closer. Closer. No? Fine."]],
          [["GOSSIP", "Going up to see the X again? What do you two even talk about?"], ["XBTN", "Endings."]],
          td >= 5 ? [["XBTN", "That's " + td + " visits to the top of the window today."], ["TALLY", "I'm counting. The X Button is hoping."]] : [["MGMT", "Heading for the X? Let's not make any decisions we can't walk back."]]
        ]), r: "your cursor left the page through the top edge; " + n(td, "time", "times") + " today" };
      }, 1.5);
    });
  });

  // unread counts in the tab title, like "(14) Inbox"
  function readTitle() {
    var m = /^\((\d+)\)/.exec(document.title || ""), c = m ? +m[1] : null;
    if (c !== null && titleCount !== null && c - titleCount >= 5) {
      var from = titleCount;
      event("", function () { return { lines: [["DREAD", "The title just went from (" + from + ") to (" + c + ")."], ["MGMT", "Let's not look at it. Let's look at it later. Let's never look at it."]], r: "the tab title's count went from (" + from + ") to (" + c + ")" }; }, 1.5);
    }
    if (c !== null) titleCount = c;
  }
  readTitle();
  try { var tEl = q("title"); if (tEl) new MutationObserver(readTitle).observe(tEl, { childList: true, characterData: true, subtree: true }); } catch (e) {}

  // sites that change pages without reloading (GitHub, YouTube): react to the new address
  var lastPath = location.pathname + location.search;
  setInterval(function () {
    var p = location.pathname + location.search;
    if (p === lastPath) return;
    lastPath = p; hitBottom = false; sentFast = false; backspaces = 0;
    setTimeout(function () { get(trail); }, 2000);
    var mine = p, tries = 0;
    setTimeout(function talk() {
      if (lastPath !== mine) return;
      get(function (s) { if (!allowed(s, 1)) { if (++tries < 12) setTimeout(talk, 5000); return; } var x = pageTalk(s); if (x) post(x.lines, x.r, 1); });
    }, 2500);
  }, 1000);

  // filling the silence, only while you're actually using the page
  function ambient(force) {
    get(function (s) {
      if (!force) {
        if (!allowed(s, 0)) return;
        if (Date.now() - lastInput > 90000 || !document.hasFocus()) return;
      }
      var c = dayTalk(s)[0];
      if (!c.key) { var pt = pageTalk(s); if (pt) { post(pt.lines, pt.r, force ? 2 : 0, force); return; } }
      if (c.key) { s.said[c.key] = Date.now(); if (c.extra === "ask") s.said.ask = Date.now(); put({ said: s.said }); }
      var after = c.extra === "ask" ? function () {
        showChoices([{ label: "Yes, it's work", fn: function () { answerWork(true); } }, { label: "No", fn: function () { answerWork(false); } }]);
      } : null;
      post(choose(c.list, s.used), c.r, force ? 2 : 0, force, after);
    });
  }
  function answerWork(v) {
    append({ v: "YOU", t: v ? "Yes, it's work." : "No." });
    get(function (s) { s.work[host] = { v: v, day: today() }; put({ work: s.work }); });
    post(v ? [["MGMT", "Noted. I'll hold you to that."], ["GOSSIP", "Sure it is."]] : [["MGMT", "Noted. I respect the honesty. I'm also writing it down."], ["TALLY", "It's saved in this browser. Nowhere else."]], "your answer, saved in this browser", 2, true);
  }

  /* ---------- start ---------- */
  function render(s) {
    if (!holder) return;
    var st = s.settings;
    holder.style.display = st.on && !st.hushed[host] ? "" : "none";
    var muted = Date.now() < (st.muteUntil || 0);
    quiet.classList.toggle("on", muted);
    quiet.textContent = muted ? "quiet till " + clock(new Date(st.muteUntil)) : "quiet";
    renderAll(s.room);
  }
  get(function (s) {
    buildPanel();
    var ui = s.ui || {};
    receiptsOn = !!ui.receipts;
    s.room.forEach(function (m) { if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; } });
    list.classList.toggle("r", receiptsOn); root.querySelector('[data-a="r"]').classList.toggle("on", receiptsOn);
    setOpen(ui.open !== false);
    if (ui.pos) placeAt(ui.pos.r, ui.pos.b);
    render(s);
    booting = false;
    setTimeout(arrive, 2500);
  });

  if (alive()) chrome.storage.onChanged.addListener(function (ch) {
    if (!holder) return;
    if (ch.room) (ch.room.newValue || []).forEach(function (m) { if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; } });
    if (ch.room || ch.settings) get(render);
    // shrinking or opening the chat in one tab does the same in the others
    if (ch.ui && document.hidden) { var u = ch.ui.newValue || {}; if (u.open !== undefined && u.open !== open) { booting = true; setOpen(u.open); booting = false; } }
  });

  if (alive()) chrome.runtime.onMessage.addListener(function (msg, _from, reply) {
    if (msg && msg.ybht === "now") { reply(true); if (!open) setOpen(true); setTimeout(function () { ambient(true); }, 300); }
    if (msg && msg.ybht === "host") reply(host);
  });

  setInterval(function () { ambient(false); }, 20000);
  document.addEventListener("fullscreenchange", function () { if (holder) holder.style.visibility = document.fullscreenElement ? "hidden" : ""; });
})();
