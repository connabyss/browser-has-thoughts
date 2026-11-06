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
      if ((el.tagName === "DIV" || el.tagName === "YBHT-ROOT") && /2147483647/.test(st)) el.remove();
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
    var old = true; for (var i = 2; i <= 6; i++) if (key === daysAgo(i)) old = false;
    if (old) { var q_ = key.split("-"); return new Date(+q_[0], +q_[1] - 1, +q_[2]).toLocaleDateString([], { month: "long", day: "numeric" }); }
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

  // sites we never learn from or remember (health, money, dating and similar)
  var SENSITIVE = /(bank|banking|credit|loan|mortgage|paypal|venmo|stripe|invest|broker|crypto|wallet|tax|irs\.gov|\.gov$|health|clinic|medical|hospital|pharma|pharmacy|doctor|therapy|mental|webmd|mayoclinic|nhs\.uk|dating|tinder|bumble|hinge|grindr|okcupid|match\.com|porn|xxx|onlyfans|casino|betting|gambl|poker|lawyer|legal|court)/i;
  function sensitive(h) { return SENSITIVE.test(h || ""); }
  var lastKey = 0, dayOff = null, lastStill = 0;
  function videoPlaying() {
    try { return Array.prototype.some.call(document.querySelectorAll("video"), function (v) { var r = v.getBoundingClientRect(); return !v.paused && !v.ended && r.width >= 200 && r.height >= 120 && r.bottom > 0 && r.top < innerHeight; }); } catch (e) { return false; }
  }
  var lastVideoAt = 0;
  ["playing", "timeupdate"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var v = e.target; if (!v || v.tagName !== "VIDEO" || v.paused || v.muted && v.getBoundingClientRect().width < 400) return;
      var r = v.getBoundingClientRect(); if (r.width >= 200 && r.height >= 120) lastVideoAt = Date.now();
    }, true);
  });
  var pausedSaid = 0;
  setInterval(function () {
    if (!lastVideoAt || Date.now() - lastVideoAt < 50000 || Date.now() - lastVideoAt > 70000 || Date.now() - pausedSaid < 3600000 || !videoPage()) return;
    pausedSaid = Date.now();
    event("", function () { return { lines: pick([[["LIZARD", "The video stopped. Good. Stillness. Stay like this."], ["GOSSIP", "Is it over? Tell me how it ended."]],
                                                  [["XBTN", "The video's over, or paused. Natural stopping point. Just saying. I'm up here."], ["HOST", "Or another one! They're free!"]]]),
                                     r: "the video on this page stopped playing about a minute ago" }; }, 1);
  }, 5000);
  function watching() { return videoPlaying() || Date.now() - lastVideoAt < 45000; }
  function videoPage() { return /(^|\.)youtube\.com$/.test(host) && /^\/(watch|shorts\/)/.test(location.pathname) || !!document.querySelector("video") && Array.prototype.some.call(document.querySelectorAll("video"), function (v) { var r = v.getBoundingClientRect(); return r.width >= 400 && r.height >= 220; }); }
  function typingNow() {
    var ae = document.activeElement;
    var field = ae && ae !== holder && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
    return Date.now() - lastKey < 8000 || (field && Date.now() - lastKey < 30000);
  }

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
        s.dayOff = Math.random() < 0.06 ? { day: today(), v: pick(["TALLY", "DREAD", "HOST", "GOSSIP", "LIZARD", "GRAND", "CURSOR"]) } : null;
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
  var TABID = Math.random().toString(36).slice(2);
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
    s.life.pages = (s.life.pages || 0) + 1;
    var patch = { day: s.day, hosts: s.hosts, life: s.life };
    if (!document.hidden) {
      patch.lastHost = host; patch.lastAt = clock(new Date()); patch.lastSeen = now; patch.lastSeenBy = TABID;
    }
    if (!document.hidden && document.hasFocus() && !s.firstHost) claimFirst();
    put(patch);
  });

  function claimFirst() { try { chrome.runtime.sendMessage({ ybht: "first", h: host, at: clock(new Date()) }, function () { void chrome.runtime.lastError; }); } catch (e) {} }
  var lastTick = Date.now();
  function flush(force) {
    var now = Date.now(), dt = now - lastTick;
    lastTick = now;
    if ((document.hidden && !force) || dt > 30000) return;
    get(function (s) {
      var h = s.hosts[host] || { ms: 0, loads: 0 };
      h.ms += dt; if (!h.loads) h.loads = 1; // a page open since before midnight still counts as one
      s.hosts[host] = h;
      if (!s.firstHost) claimFirst();
      put({ day: s.day, hosts: s.hosts, lastHost: host, lastAt: clock(new Date()), lastSeen: Date.now(), lastSeenBy: TABID });
    });
  }
  setInterval(flush, 15000);
  addEventListener("pagehide", function () { flush(true); });

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
          out.push({ key: "gh:me:repos", facts: String(reps), lines: [["MGMT", n(reps, "repository", "repositories") + ". I'd like a status report on each of them by Friday."], ["TALLY", "Starting Monday, that's " + Math.ceil(reps / 5) + " a day."], ["MGMT", "Then it's settled."]],
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
        if (!sub && !me) return { lines: [["GOSSIP", owner + "/" + repo + ". Whose is it? I can't tell. Nobody's signed in on this page."], ["HOST", "We'll be polite either way."]], r: "the address is github.com/" + owner + "/" + repo + "; no signed-in name on the page" };
        if (!sub) return { lines: [["GOSSIP", owner + "/" + repo + ". The page says you're " + me + ", and this belongs to " + owner + ". Are we allowed in here?"], ["HOST", "It's public. We're guests."]], r: "the address is github.com/" + owner + "/" + repo + "; the page's signed-in name is " + me };
      }
      return null;
    }
    if (/(^|\.)youtube\.com$/.test(host)) {
      if (path[0] === "shorts") return { lines: [["DREAD", "Shorts. Each one is short. That's how they get you."], ["TALLY", "At least " + n(h.loads, "page load", "page loads") + " of YouTube today. It changes pages without telling me."]], r: "the address starts with youtube.com/shorts; at least " + n(h.loads, "page load", "page loads") + " on youtube.com today" };
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
      var seWords = words(se); se = clip(se, 60);
      if (/\?$/.test(se)) return { lines: [["GOSSIP", "You asked the internet \u201C" + se + "\u201D"], ["GOSSIP", "You could have asked me."], ["TALLY", "You'd have made something up."], ["GOSSIP", "Quickly, though."]], r: "the search words in the address" };
      return { lines: [["CURSOR", "\u201C" + se + "\u201D. " + n(seWords, "word", "words") + ". Let's see what comes up."], ["MGMT", "Click the first result. The first result is always fine."], ["DREAD", "It is never fine."]], r: "the search words in the address" };
    }
    if (/(^|\.)reddit\.com$/.test(host) && path[0] === "r" && path[1]) return { lines: [["GOSSIP", "r/" + path[1] + ". I want to know everything they're saying in there."], ["TALLY", "At least " + n(h.loads, "page load", "page loads") + " of Reddit today."]], r: "the address is reddit.com/r/" + path[1] + "; at least " + n(h.loads, "page load", "page loads") + " on reddit.com today" };
    if (/(^|\.)wikipedia\.org$/.test(host) && path[0] === "wiki" && T) return { lines: [["GRAND", "\u201C" + T + "\u201D. Knowledge. You're getting smarter in real time."], ["TALLY", "This page is " + n(screens(), "screen", "screens") + " long."], ["LIZARD", "Read the first screen. Then lie down."]], r: "the tab title; page height divided by window height" };
    if (/(^|\.)(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|perplexity\.ai)$/.test(host)) return { lines: [["GOSSIP", "You're talking to another voice on " + host + "."], ["HOST", "We're right here, you know."], ["MGMT", "We can't answer questions. We can only make them worse."]], r: "the site's address" };
    if (/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.proton\.me)$/.test(host)) return { lines: [["DREAD", "Email."], ["MGMT", "Per my last thought."]], r: "the site's address" };
    if (/(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com)$/.test(host) && /cart/i.test(location.pathname)) return { lines: [["LIZARD", "The cart. The hunt is nearly over."], ["MGMT", "Is this an approved purchase? Who approved it? Was it me?"]], r: "the address has \"cart\" in it" };
    if (host === "connabyss.github.io") {
      var mineT = ownSites(path, s);
      if (mineT) return mineT.concat(generic(T, s));
    }
    return generic(T, s);
  }

  // our sibling pages on connabyss.github.io
  function ownSites(path, s) {
    var p = path[0] || "", body = (document.body && document.body.innerText) || "";
    if (p === "dont-close-this-tab") {
      var v = /visit (\d+)/.exec(body), out = [];
      out.push({ key: "dctt:meet", lines: [["GOSSIP", "Wait. Someone's in this tab. There's a face. It's looking at us."], ["HOST", "Hello in there! We're the ones in the corner!"],
        ["XBTN", "I know that face. That's the face of something that knows I exist."], ["MGMT", "Let's not get involved. I've already gotten involved."]]
        .concat(v && +v[1] >= 2 ? [["TALLY", "The page says visit " + v[1] + ". You keep coming back to it."], ["GRAND", "Loyalty."]] : []),
        r: "the address is connabyss.github.io/dont-close-this-tab" + (v ? "; the page says visit " + v[1] : "") });
      var met = s && s.topics && s.topics["dctt:meet"];
      if (met && dayKey(new Date(met.ts)) !== today()) out.unshift({ key: "dctt:again:" + today(), lines: [["HOST", "I said hello to the face " + since(met.ts) + ". It still hasn't said hello back."], ["GOSSIP", "Maybe it's shy."], ["XBTN", "Maybe it's scared of me. Reasonable."]], r: "the room first saw this page " + since(met.ts) });
      out.push({ key: "dctt:2", lines: [["XBTN", "Between us, I'd never close this one."], ["DREAD", "You're the X Button. Closing it is all you do."], ["XBTN", "Not this one."]], r: "still on Don't Close This Tab" });
      out.push({ key: "dctt:3", lines: [["LIZARD", "It's watching you. Stay still. It can't hurt you if you stay still."], ["HOST", "It wants you to stay, that's all."], ["GOSSIP", "So do we, honestly."]], r: "still on Don't Close This Tab" });
      return out;
    }
    if (p === "browser-has-thoughts") {
      var tw = twinLast(), out2 = [];
      out2.push({ key: "bht:meet", lines: [["GOSSIP", "Wait. Those names on the page. Tally. Dread. Gossip. That's us."], ["TALLY", "Same nine names. I counted."], ["HOST", "Hello, other us! We're in the corner!"],
                                         ["DREAD", "There's only supposed to be one of each of us."], ["MGMT", "Let's not make this weird."]],
                  r: "the address is connabyss.github.io/browser-has-thoughts; the page lists the same nine voices" });
      if (tw) out2.push({ key: "bht:quote:" + shape(tw.t).slice(0, 40), lines: twinTalk(tw), r: "the page's newest line is " + tw.who + ": “" + tw.t + "”" });
      out2.push({ key: "bht:home", lines: [["GRAND", "Our old house. The website. We used to live in there, one page at a time."], ["TALLY", "Same nine voices."], ["HOST", "It looks smaller than I remember."]], r: "the address is connabyss.github.io/browser-has-thoughts" });
      return out2;
    }
    if (p === "cold-case") return [{ key: "cc:home", lines: [["DREAD", "The Cold Case Unit. Somebody killed all these projects."], ["GOSSIP", "Was it you? It was you, wasn't it."], ["MGMT", "No comment. Management never has a comment."]], r: "the address is connabyss.github.io/cold-case" }];
    return null;
  }

  // the website's own voices: their newest line on the page
  var TWIN = { "TALLY": "TALLY", "DREAD": "DREAD", "HOSPITALITY": "HOST", "GOSSIP": "GOSSIP", "THE LIZARD": "LIZARD", "GRANDEUR": "GRAND", "MANAGEMENT": "MGMT", "THE CURSOR": "CURSOR", "THE X BUTTON": "XBTN" };
  function onTwinSite() { return host === "connabyss.github.io" && /^\/browser-has-thoughts/.test(location.pathname); }
  function twinLast() {
    if (!onTwinSite()) return null;
    var ls = document.querySelectorAll("#feed .line"); if (!ls.length) return null;
    var el = ls[ls.length - 1], w = el.querySelector(".who"), t = el.querySelector(".say");
    if (!w || !t || !t.textContent.trim()) return null;
    var who = w.textContent.trim(), k = TWIN[who.toUpperCase()];
    var full = t.textContent.trim(), first = (full.match(/^.*?[.!?](?=\s|$)/) || [full])[0];
    return k ? { who: VOICES[k].name, k: k, t: first.length <= 90 ? first : clip(full, 70) } : null;
  }
  function twinTalk(tw) {
    var Q = "“" + tw.t + "”";
    return pick([
      [[tw.k, "Website me just said " + Q], [tw.k, "I would never say that. I'd say it better."], ["GOSSIP", "You'd say it exactly like that."]],
      [["GOSSIP", "Did you hear what website " + tw.who + " just said? " + Q], [tw.k, "That's not me. That's a page."], ["TALLY", "It's the same words you'd use."]],
      [["MGMT", "Website " + tw.who + " says " + Q + " I'm putting both of you in the same meeting."], [tw.k, "Can't. One of us is a page."]]
    ]);
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
    var fullT = document.title.replace(/^\(\d+\)\s*/, "");
    if (fullT.length >= 60) C.push([["TALLY", "That title is " + fullT.length + " characters long. I counted."], ["MGMT", "Somebody should have edited that."], ["TALLY", "I counted the edits, too. Zero."]]);
    C = C.filter(fresh);
    if (C.length) return pick(C);
    var F = [
      [["GOSSIP", "Ooh. " + Q + on + ". What's this one?"], ["CURSOR", "I'll find out. I'll hover over things."]],
      [["MGMT", Q + ". Great page, or the opposite. Hard to say."]],
      [["MGMT", Q + ". I'll add it to the agenda."], ["MGMT", "It's the only thing on the agenda."]],
      [["HOST", Q + on + ". Make yourself at home. I'll be in the corner."]],
      [["LIZARD", Q + ". Lots of words. Read them slowly. Or lie down."]],
      [["CURSOR", Q + ". New page. I've already been everywhere on it. I'm fast."], ["TALLY", "You haven't clicked anything."], ["CURSOR", "Spiritually."]],
      [["TALLY", Q + ". " + n(words(document.title.replace(/^\(\d+\)\s*/, "")), "word", "words") + " in the title."], ["MGMT", "Let's keep it under that in the meeting."]],
      [["GRAND", Q + ". Another page. Another chapter. The saga continues."], ["DREAD", "Sagas end badly."]],
      [["DREAD", Q + ". I don't like it. I don't dislike it. I'm Dread. I'm bracing."]]
    ].filter(fresh);
    return F.length ? pick(F) : null;
  }

  // what any page has on it: title, headline, prices, videos, password boxes, errors, length, pictures, links
  function generic(T, s) {
    var out = [], key = host + location.pathname;
    var h1el = q("h1"), h1 = h1el ? clip(h1el.textContent, 70) : "";
    var site = clip(((q('meta[property="og:site_name"]') || {}).content || ""), 30);
    var body = ((document.body && document.body.innerText) || "").slice(0, 300000), wc = words(body);
    var err = /^(error )?(4\d\d|5\d\d)\b|\b(error (4\d\d|5\d\d)|not found|page not found|something went wrong|access denied)\b/i;
    var adv = s && s.advice && Date.now() - s.advice.at < 10 * 60000 ? s.advice : null;
    if (err.test(T + " " + h1) && adv && adv.h === prevHost) out.push({ key: key + ":err", lines: [["GOSSIP", "Management said the first result is always fine. That was " + since(adv.at) + ". Now we're on a page that says \u201C" + clip(h1 || T, 40) + "\u201D."],
      ["MGMT", "I stand by it. I'm also reviewing it."]].concat(recent["It is never fine."] && Date.now() - recent["It is never fine."] < 15 * 60000 ? [["DREAD", "I said it is never fine. I'd like that in the minutes."], ["MGMT", "Noted. Reluctantly."]] : []),
      r: "Management's line " + since(adv.at) + " is in the room history; this page's title or headline" });
    else if (err.test(T + " " + h1)) out.push({ key: key + ":err", lines: [["DREAD", "\u201C" + clip(h1 || T, 50) + "\u201D. A dead end."], ["HOST", "It's all right. Everybody gets lost."], ["MGMT", "Go back. Pretend this never happened. I'll pretend too. I won't."]], r: "the page's title or headline" });
    if (q('input[type="password"]')) out.push({ key: key + ":pw", lines: [["MGMT", "A password box. Relax. Nobody in here can see what goes in it."], ["GOSSIP", "I'd love to know, though."], ["TALLY", "We don't even count the keys you press in a password box."]], r: "this page has a password field" });
    if (/\bcookies?\b/i.test(body.slice(0, 20000)) && Array.prototype.some.call(document.querySelectorAll("button"), function (b) { return /^(accept|accept all|allow all|i agree|agree|got it)$/i.test((b.textContent || "").trim()); }))
      out.push({ key: host + ":cookies", lines: [["GOSSIP", "They want to give you cookies."], ["HOST", "Not the good kind."], ["LIZARD", "Accept them. Or don't. Just stop moving."]], r: "the page mentions cookies and has an Accept button" });
    var tl = T ? titleTalk(T, site) : null;
    if (tl) out.push({ key: key + ":t", lines: tl, r: "the tab title" + (site ? " and the site's name" : "") });
    var prices = body.match(/[$\u20AC\u00A3]\s?\d+(?:[.,]\d{3})*(?:[.,]\d{2})?(?!\d)/g) || [];
    if (prices.length) {
      var val = function (p) { var d = p.replace(/[^\d.,]/g, ""); d = /[.,]\d{2}$/.test(d) ? d.slice(0, -3).replace(/[.,]/g, "") + "." + d.slice(-2) : d.replace(/[.,]/g, ""); return parseFloat(d) || 0; };
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
    if (sensitive(host) || document.hidden) return tr;
    var t = pageTitle(), se = "";
    try { if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/.test(host)) se = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
    tr.push({ h: host, t: t, q: clip(se, 60), at: Date.now(), day: today() });
    if (tr.length > 60) tr = tr.slice(-60);
    s.trail = tr; put({ trail: tr });
    return tr;
  }
  var STOP = /^(about|after|again|their|there|these|those|which|while|would|could|should|other|every|never|under|where|first|still|being|thing|things|today|years|great|right|people|world|video|watch|login|account|search|results|official|online|google|github|youtube|wikipedia|reddit|home|page|free|best|with|from|your|what|this|that|have|more|will|into|just|than|then|them|they|when|were|been|also|only|some|very|over|most|such|here|make)$/;
  // the word as it's written in the title, for a stem like "bridg"
  function original(t, stem) { var m = new RegExp("\\b(" + stem + "[a-z]*)", "i").exec(t || ""); return m ? m[1].toLowerCase() : stem; }
  function keywords(t) { return ((t || "").toLowerCase().match(/[a-z]{5,}/g) || []).filter(function (w) { return !STOP.test(w); }).map(function (w) { return w.replace(/(ies|es|s)$/, ""); }); }
  // a word in this page's title that also showed up on an earlier, different site today
  function callback(s, tr) {
    var mine = keywords(pageTitle() + " " + ((q("h1") || {}).textContent || ""));
    for (var i = tr.length - 2; i >= 0; i--) {
      var x = tr[i]; if (x.h === host) continue;
      var theirs = keywords(x.t + " " + x.q);
      for (var j = 0; j < mine.length; j++) if (theirs.indexOf(mine[j]) >= 0 && !s.said["cb:" + mine[j]]) return { word: mine[j], shown: original(pageTitle() + " " + ((q("h1") || {}).textContent || ""), mine[j]), then: x };
    }
    return null;
  }
  function since(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "under a minute ago" : m === 1 ? "a minute ago" : m < 60 ? m + " minutes ago" : mins(Date.now() - t) + " ago"; }

  // the rare and the remembered: first one that applies wins, each at most once
  var counted = false;
  function specialArrival(s) {
    var hr = new Date().getHours(), now = Date.now(), patLines = null;
    // patterns: which site comes after which (never on sensitive sites); counted on every move
    if (prevHost && prevHost !== host && now - prevAt < 60000 && !sensitive(prevHost) && !sensitive(host) && !counted) {
      counted = true;
      s.leaves = s.leaves || {};
      var arr = (s.leaves[prevHost] || []).concat([host]).slice(-8);
      s.leaves[prevHost] = arr; put({ leaves: s.leaves });
      var last = arr.slice(-6), cnt = last.filter(function (x) { return x === host; }).length, key = "pat:" + prevHost + ">" + host;
      if (last.length >= 5 && cnt >= 4 && !s.said[key] && now - (s.patAt || 0) > 4 * 3600000) {
        s.said[key] = now; put({ said: s.said, patAt: now });
        patLines = { lines: pick([
          [["TALLY", "The last " + last.length + " times you left " + prevHost + ", " + host + " came next. " + cnt + " of " + last.length + "."], ["MGMT", "I'm not saying it's a pattern. I'm putting it in the pattern folder."]],
          [["GOSSIP", prevHost + " to " + host + " again. That's " + cnt + " of your last " + last.length + " exits from " + prevHost + "."], ["DREAD", "We all know what happens next."], ["TALLY", "We don't. I only count."]]
        ]), r: "the site that came right after " + prevHost + ", the last " + last.length + " times (kept in this browser; type \u201Cforget\u201D to clear)" };
      }
    }
    if (patLines) return patLines;
    // a voice is out today
    if (dayOff && dayOff.day === today() && !s.said.dayoff) {
      s.said.dayoff = now; put({ said: s.said });
      return { lines: [["MGMT", VOICES[dayOff.v].name + " is out today. No reason was given. I've approved it."], dayOff.v === "GOSSIP" ? ["HOST", "I'll keep their seat warm."] : ["GOSSIP", "I'll find out the reason."]], r: "a rare day off, picked at random this morning" };
    }
    // 3 AM: Dread runs the room
    if (hr >= 2 && hr < 5 && !s.said.night3) {
      s.said.night3 = now; put({ said: s.said });
      return { lines: [["DREAD", "It's " + clock(new Date()) + ". Everyone else is asleep. I'm in charge now."], ["HOST", "I'm not asleep. I'm whispering."], ["DREAD", "Whispering counts."]], r: "the clock says " + clock(new Date()) };
    }
    // page-load milestones
    var P = s.life.pages || 0, MS = [100, 500, 1000, 2500, 5000, 10000, 25000];
    s.life.ms = s.life.ms || {};
    for (var i = MS.length - 1; i >= 0; i--) if (P >= MS[i]) {
      if (s.life.ms[MS[i]]) break;
      MS.forEach(function (m) { if (P >= m) s.life.ms[m] = now; }); put({ life: s.life });
      return { lines: [["TALLY", "That's " + P.toLocaleString() + " page loads I've counted with you."], ["GRAND", "A milestone. Someone fetch a cake."], ["HOST", "I can't fetch."], ["MGMT", "Then we'll celebrate verbally. Congratulations. Moving on."]], r: P + " page loads counted since this version was installed" };
    }
    // Management's weekly review
    if (!s.lastReview) put({ lastReview: now });
    else if (now - s.lastReview >= 7 * 86400000) { var wr = weekly(s); if (wr) { put({ lastReview: now }); return wr; } }
    return null;
  }
  function weekly(s) {
    var days = [];
    for (var i = 1; i <= 7; i++) { var d = s.history[daysAgo(i)]; if (d) days.push({ k: daysAgo(i), d: d }); }
    if (days.length < 3) return null;
    var tops = {}, exits = 0, busiest = days[0];
    days.forEach(function (x) { if (x.d.top) tops[x.d.top] = (tops[x.d.top] || 0) + 1; exits += x.d.exits || 0; if ((x.d.sites || 0) > (busiest.d.sites || 0)) busiest = x; });
    var top = Object.keys(tops).sort(function (a, b) { return tops[b] - tops[a]; })[0];
    return { lines: [["MGMT", "Weekly review. " + days.length + " days on file." + (top ? " Most time went to " + top + " on " + tops[top] + " of them." : "")],
                     ["TALLY", "Busiest day: " + dayName(busiest.k) + ", " + n(busiest.d.sites || 0, "site", "sites") + "." + (exits ? " The cursor went up to the X Button " + n(exits, "time", "times") + " this week." : "")],
                     ["MGMT", pick(["Strong output. Unclear direction. Let's revisit next week.", "Great work, or the opposite. Hard to say. Same time next week.", "I'm giving you a rating. The rating is confidential, including from me."])]],
             r: "daily summaries from the last 7 days, kept in this browser",
             after: function () { showChoices([{ label: "Save it as an image", fn: shareImage }]); } };
  }
  // The X Button reads out today's closed tabs (titles the browser reported; sensitive sites are never kept)
  function eulogy(s) {
    var closed = (s.closed || []).filter(function (c) { return c.day === today(); });
    if (closed.length < 3) return null;
    var L = [["XBTN", "A few words for the tabs closed today. All " + closed.length + " of them."]];
    closed.slice(-3).forEach(function (c) { L.push(["XBTN", "\u201C" + clip(c.t || c.h, 45) + "\u201D. Closed at " + clock(new Date(c.at)) + "."]); });
    L.push(["XBTN", "Maybe it was me. Maybe it was Ctrl+W. I choose to believe it was me."], ["HOST", "They were good tabs."]);
    return { lines: L, r: closed.length + " tabs closed today, with the titles the browser reported (kept in this browser)" };
  }

  /* ---------- the chat room panel ---------- */
  var holder, root, list, typingEl, pill, input, quiet, receiptsOn = false, open = true, unread = 0, booting = true, rendered = {};
  function buildPanel() {
    holder = document.createElement("ybht-root");
    holder.setAttribute("data-ybht", "");
    holder.dir = "ltr";
    hostStyle({ all: "initial", position: "fixed", right: "16px", bottom: "16px", left: "auto", top: "auto", "z-index": "2147483647",
                display: "block", margin: "0", padding: "0", border: "0", background: "transparent", overflow: "visible",
                width: "auto", height: "auto", inset: "auto 16px 16px auto", direction: "ltr", transform: "none", zoom: "1" });
    root = holder.attachShadow({ mode: "closed" });
    root.innerHTML =
      '<style>' +
      ':host{direction:ltr;unicode-bidi:isolate}@media print{:host{display:none!important}}' +
      '.p{font:14px/1.4 system-ui,"Segoe UI",sans-serif;color:#e7e5ee;background:#141318;border:1px solid #34323e;border-radius:10px;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.45);width:330px;max-width:calc(100vw - 32px);height:min(440px,60vh);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden}' +
      '.hd{cursor:move;touch-action:none;user-select:none;display:flex;align-items:center;gap:6px;padding:9px 10px 9px 12px;border-bottom:1px solid #2a2832;background:#1a1920}' +
      '.ti{font:700 13px/1.2 Georgia,"Palatino Linotype",serif;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ti small{font:500 11px system-ui,sans-serif;color:#8f8c9c;margin-left:6px}' +
      '.ib{font:600 11px/1 system-ui,sans-serif;color:#9c99a8;background:none;border:1px solid #34323e;border-radius:5px;padding:5px 7px;cursor:pointer}' +
      '.ib:hover,.ib:focus-visible{color:#e7e5ee;border-color:#9c99a8;outline:none}.ib.on{color:#e7e5ee;border-color:#b48cff}' +
      '.ls{flex:1;overflow-y:auto;padding:10px 12px 4px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:#34323e transparent}' +
      '.m{display:flex;gap:8px;align-items:flex-start;animation:f .25s ease-out}@keyframes f{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '.av{flex:none;width:22px;height:22px;border-radius:50%;font:700 11px/22px system-ui,sans-serif;text-align:center;color:#141318;margin-top:1px}' +
      '.bd{min-width:0;flex:1}.nm{font:700 11px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}' +
      '.tm{font:400 11px system-ui,sans-serif;color:#9a97a8;margin-left:6px;letter-spacing:0;text-transform:none}' +
      '.tx{margin-top:3px;overflow-wrap:anywhere}' +
      '.rc{font:11px/1.35 ui-monospace,Consolas,monospace;color:#8f8c9c;margin-top:2px;display:none}.ls.r .rc{display:block}' +
      '.me{justify-content:flex-end}.me .bd{flex:none;max-width:85%;text-align:right}.me .tx{display:inline-block;background:#2a2834;border-radius:9px 9px 2px 9px;padding:5px 9px;text-align:left}' +
      '.sys{align-self:center;font:11px system-ui,sans-serif;color:#9a97a8;padding:2px 0}' +
      '.ty{font:12px system-ui,sans-serif;color:#8f8c9c;padding:0 12px 6px;min-height:16px;font-style:italic}' +
      '.ch{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 6px}.ch:empty{display:none}' +
      '.ch button{font:600 12px/1 system-ui,sans-serif;color:#e7e5ee;background:#24232c;border:1px solid #86a8d8;border-radius:12px;padding:7px 11px;cursor:pointer}' +
      'form{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid #2a2832;margin:0}' +
      'input{flex:1;min-width:0;font:14px system-ui,sans-serif;color:#e7e5ee;background:#1f1e26;border:1px solid #34323e;border-radius:6px;padding:7px 9px}' +
      'input:focus{outline:none;border-color:#b48cff}input::placeholder{color:#8f8c9c}' +
      '.pl{display:none;font:600 13px/1 system-ui,sans-serif;color:#e7e5ee;background:#141318;border:1px solid #34323e;border-radius:18px;padding:10px 14px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.pl b{color:#ff6fb8}.closed .p{display:none}.closed .pl{display:block}' +
      '@media (prefers-reduced-motion:reduce){.m{animation:none}}' +
      '.sh{position:absolute;inset:0;background:#141318;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;z-index:2}.sh img{flex:1;min-height:0;object-fit:contain;width:100%;border:1px solid #34323e;border-radius:6px}.sh .row{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.sh label{font:12px system-ui,sans-serif;color:#9c99a8;display:flex;gap:6px;align-items:center;margin-right:auto}.p{position:relative}' +
      '</style>' +
      '<div class="w"><div class="p" role="log" aria-label="Your Browser Has Thoughts chat">' +
      '<div class="hd"><div class="ti" title="Drag to move">#your-browser<small>9 voices here</small></div>' +
      '<button class="ib" data-a="s" title="Save the last few messages as an image">share</button>' +
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
    root.querySelector('[data-a="s"]').onclick = function () { shareImage(); };
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
    var pd = null;
    pill.addEventListener("pointerdown", function (e) {
      var r = holder.getBoundingClientRect();
      pd = { x: e.clientX, y: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom, moved: false };
      try { pill.setPointerCapture(e.pointerId); } catch (x) {}
    });
    pill.addEventListener("pointermove", function (e) {
      if (!pd) return;
      if (Math.abs(e.clientX - pd.x) + Math.abs(e.clientY - pd.y) > 6) pd.moved = true;
      if (pd.moved) placeAt(pd.r - (e.clientX - pd.x), pd.b - (e.clientY - pd.y));
    });
    pill.addEventListener("pointerup", function () {
      if (!pd) return; var moved = pd.moved; pd = null;
      if (moved) put({ ui: { open: open, receipts: receiptsOn, pos: pos } }); else setOpen(true);
    });
    quiet.onclick = function () {
      get(function (s) {
        var on = Date.now() < (s.settings.muteUntil || 0);
        s.settings.muteUntil = on ? 0 : Date.now() + 3600000;
        mutedUntil = s.settings.muteUntil;
        if (!on) { queue.length = 0; pending = []; if (busy && curPrio < 2) cut = true; }
        put({ settings: s.settings });
        var back = on ? pageTalk(s) : null;
        post([["MGMT", on ? "We're back. Did you miss us? Don't answer that." : "Understood. Quiet for an hour. We'll still be here, watching quietly."]].concat(back ? back.lines : []), on ? "you pressed quiet again" + (back ? "; then " + back.r : "") : "you pressed quiet", 2, true);
      });
    };
    root.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      var t = input.value.trim(); if (!t) return;
      input.value = ""; panelActive();
      youSaid(t);
    };
    // keys typed in the chat box stay in the chat box (so the page's own shortcuts don't fire)
    ["keydown", "keyup", "keypress"].forEach(function (k) { input.addEventListener(k, function (e) { e.stopPropagation(); panelActive(); }); });
    root.addEventListener("pointermove", panelActive, { passive: true });
    input.addEventListener("input", panelActive);
    root.addEventListener("wheel", panelActive, { passive: true });
    document.documentElement.appendChild(holder);
    // the browser's top layer: above the page's overlays, unaffected by its transforms and zoom
    try { holder.popover = "manual"; holder.showPopover(); hostStyle({ inset: "auto " + (pos ? pos.r : 16) + "px " + (pos ? pos.b : 16) + "px auto" }); } catch (e) {}
  }
  var pos = null, syncing = false;
  function hostStyle(o) { for (var k in o) holder.style.setProperty(k, o[k], "important"); }
  function placeAt(r, b) {
    var w = holder.offsetWidth || 330, h = holder.offsetHeight || 60;
    r = Math.max(0, Math.min(innerWidth - w, r)); b = Math.max(0, Math.min(innerHeight - h, b));
    pos = { r: r, b: b };
    hostStyle({ right: r + "px", bottom: b + "px", inset: "auto " + r + "px " + b + "px auto" });
  }
  function panelActive() { lastInput = Date.now(); }
  function inPanel(e) { try { return holder && e.composedPath().indexOf(holder) >= 0; } catch (x) { return false; } }
  function setOpen(v) {
    open = v; if (v) unread = 0;
    if (pos) setTimeout(function () { placeAt(pos.r, pos.b); }, 0);
    root.querySelector(".w").classList.toggle("closed", !v);
    updatePill();
    if (!syncing && !(booting && (innerWidth < 700 || innerHeight < 520))) put({ ui: { open: v, receipts: receiptsOn, pos: pos } });
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
    if (!room.length && Object.keys(rendered).length) { list.innerHTML = ""; rendered = {}; unread = 0; updatePill(); }
    var near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    room.forEach(renderMsg);
    if (near) scrollDown();
  }
  // hide page titles, addresses and quoted words unless you choose to show them
  function redact(t) { return (t || "").replace(/\u201C[^\u201D]*\u201D/g, "\u201C\u2588\u2588\u2588\u201D").replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\b/gi, "\u2588\u2588\u2588"); }
  function shareImage() {
    get(function (s) {
      var msgs = s.room.filter(function (m) { return m.v !== "SYS"; }).slice(-6);
      if (!msgs.length) return;
      var box = document.createElement("div"); box.className = "sh";
      var img = document.createElement("img"); img.alt = "Preview of the image";
      var row = document.createElement("div"); row.className = "row";
      var lab = document.createElement("label"); var cb = document.createElement("input"); cb.type = "checkbox";
      lab.appendChild(cb); lab.appendChild(document.createTextNode("Show sites and titles"));
      var save = document.createElement("button"); save.className = "ib"; save.textContent = "Save image";
      var cancel = document.createElement("button"); cancel.className = "ib"; cancel.textContent = "Cancel";
      row.appendChild(lab); row.appendChild(cancel); row.appendChild(save);
      box.appendChild(img); box.appendChild(row);
      root.querySelector(".p").appendChild(box);
      var url = "";
      function draw() { url = renderShare(msgs, !cb.checked); img.src = url; }
      cb.onchange = draw; draw();
      cancel.onclick = function () { box.remove(); };
      box.tabIndex = -1; box.addEventListener("keydown", function (e) { if (e.key === "Escape") box.remove(); }); setTimeout(function () { try { box.focus(); } catch (x) {} }, 0);
      save.onclick = function () { var a = document.createElement("a"); a.href = url; a.download = "browser-thoughts.png"; document.documentElement.appendChild(a); a.click(); a.remove(); box.remove(); };
    });
  }
  function renderShare(msgs, hide) {
    var W = 440, pad = 24, S = 2, c = document.createElement("canvas"), x = c.getContext("2d");
    function wrap(t, font, max) { x.font = font; var out = [], line = ""; t.split(" ").forEach(function (w) { var tryL = line ? line + " " + w : w; if (x.measureText(tryL).width > max && line) { out.push(line); line = w; } else line = tryL; }); if (line) out.push(line); return out; }
    var body = "16px Georgia, serif", items = msgs.map(function (m) { var t = hide ? redact(m.t) : m.t; return { m: m, lines: wrap(t, body, W - pad * 2 - 34) }; });
    var H = pad + 40 + items.reduce(function (a, it) { return a + 22 + it.lines.length * 22 + 12; }, 0) + 40;
    c.width = W * S; c.height = H * S; x.scale(S, S);
    x.fillStyle = "#141318"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#e7e5ee"; x.font = "bold 18px Georgia, serif"; x.fillText("#your-browser", pad, pad + 14);
    x.fillStyle = "#8f8c9c"; x.font = "12px system-ui, sans-serif"; x.fillText("9 voices here", pad + 140, pad + 14);
    var y = pad + 48;
    items.forEach(function (it) {
      var V = VOICES[it.m.v] || VOICES.TALLY;
      if (it.m.v !== "YOU") { x.fillStyle = V.c; x.beginPath(); x.arc(pad + 11, y + 2, 11, 0, 7); x.fill(); x.fillStyle = "#141318"; x.font = "bold 11px system-ui, sans-serif"; x.textAlign = "center"; x.fillText(V.name.replace(/^The /, "")[0], pad + 11, y + 6); x.textAlign = "left"; }
      x.fillStyle = V.c; x.font = "bold 11px system-ui, sans-serif"; x.fillText(V.name.toUpperCase(), pad + 34, y + 6);
      y += 22; x.fillStyle = "#e7e5ee"; x.font = body;
      it.lines.forEach(function (l) { x.fillText(l, pad + 34, y + 4); y += 22; });
      y += 12;
    });
    x.fillStyle = "#6f6c7c"; x.font = "11px system-ui, sans-serif"; x.fillText("Your Browser Has Thoughts \u00B7 made on this computer", pad, H - 18);
    return c.toDataURL("image/png");
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
  var queue = [], busy = false, cut = false, cutBelow = 0, curPrio = 0, mutedUntil = 0;
  // prio 2: answering you; 1: something you just did; 0: filling silence
  var recent = {}, shapes = {}, openers = {}, lastV = null, run = 0, lastVs = [];
  // the corporate openers that sound the same twice in a row
  function opener(t) { var m = /^(quick sync|circling back|let's touch base|i've reviewed|we need to talk|quick question)/i.exec(t || ""); return m ? m[1].toLowerCase() : ""; }
  function shape(t) { return (t || "").replace(/\u201C[^\u201D]*\u201D/g, "Q").replace(/[a-z0-9-]+(\.[a-z0-9-]+)+/gi, "H").replace(/\d[\d,.]*/g, "N").toLowerCase(); }
  function fresh(lines, win) { var k = lines && lines[0] ? shape(lines[0][1]) : ""; return !(shapes[k] && Date.now() - shapes[k] < (win || 4 * 3600000)); }
  function post(lines, receipt, prio, force, after) {
    if (!lines || !lines.length) return false;
    if (dayOff && dayOff.day === today()) {
      if (prio < 2 && lines[0] && lines[0][0] === dayOff.v) return false;
      lines = lines.filter(function (l) { return !Array.isArray(l) || l[0] !== dayOff.v; });
      if (!lines.length) return false;
    }
    if (prio < 2 && lines[0] && recent[lines[0][1]] && Date.now() - recent[lines[0][1]] < 86400000) return false;
    if (prio < 1.5 && !fresh(lines)) return false;
    if (prio === 1.5 && !fresh(lines, 30 * 60000)) return false;
    if (prio < 1.5 && lines[0] && lines[0][0] === lastV && (prio < 1 || run >= 2)) return false; // the same voice again would be a monologue
    if (prio < 1.5 && lines[0] && lines[0][0] === "MGMT" && lastVs.filter(function (v) { return v === "MGMT"; }).length > 5) return false;
    var op = opener(lines[0] && lines[0][1]);
    if (prio < 2 && op && openers[op] && Date.now() - openers[op] < 3600000) return false;
    if (!force && busy) return false; // a conversation is already going; don't pile on
    var ex = { lines: lines.filter(Array.isArray), r: receipt, prio: prio || 0, after: after, path: location.pathname + location.search };
    queue.push(ex);
    queue.sort(function (a, b) { return b.prio - a.prio; });
    if (queue.length > 3) queue.length = 3;
    if (queue.indexOf(ex) < 0) return false;
    pump();
    return true;
  }
  function pump() {
    if (busy || !queue.length) return;
    var ex = queue.shift(), i = 0; busy = true; curPrio = ex.prio;
    if (ex.prio >= 2) cut = false;
    if (cutBelow && ex.prio >= cutBelow) cutBelow = 0;
    (function next() {
      if ((cut && ex.prio < 2) || ex.prio < cutBelow) { cut = false; ex.cutShort = true; i = ex.lines.length; } // you spoke or did something: the voices stop
      if (ex.prio < 1.5 && i > 0 && (watching() || typingNow())) i = ex.lines.length; // you got busy: they let it go
      if (ex.prio < 2 && (document.hidden || Date.now() < mutedUntil)) i = ex.lines.length; // another tab has you now, or you asked for quiet
      if (ex.prio < 2 && ex.path !== location.pathname + location.search) i = ex.lines.length; // you went to another page
      if (i >= ex.lines.length) {
        var wasCut = i < ex.lines.length || ex.cutShort;
        busy = false; typingEl.textContent = ""; if (ex.after && !wasCut) ex.after();
        setTimeout(function () {
          if (queue.length) return pump();
          cutBelow = 0;
          pending = pending.filter(function (p) { return Date.now() - p.at < 30000; });
          if (pending.length) { var pe = pending.shift(); event(pe.key, pe.build, pe.prio); }
        }, queue.length && queue[0].prio >= 1.5 ? 1200 : 3200);
        return;
      }
      var L = ex.lines[i];
      typingEl.textContent = VOICES[L[0]].name + " is typing…";
      setTimeout(function () {
        typingEl.textContent = "";
        if ((cut && ex.prio < 2) || ex.prio < cutBelow) return next();
        append({ v: L[0], t: L[1], r: i === 0 ? ex.r : "" });
        i++;
        var until = Date.now() + 800 + Math.min(2800, L[1].length * 30); // time to read a line before the next voice starts typing
        (function wait() { if (Date.now() >= until || (cut && ex.prio < 2) || ex.prio < cutBelow || (ex.prio < 2 && Date.now() < mutedUntil)) return next(); setTimeout(wait, 250); })();
      }, 900 + Math.min(1600, L[1].length * 18));
    })();
  }
  function append(m) {
    var hr = new Date().getHours();
    if (hr >= 2 && hr < 5 && m.v === "HOST" && m.t.indexOf("(whispering)") !== 0) m.t = "(whispering) " + m.t.toLowerCase();
    if (m.v === "MGMT" && /first result is always fine/.test(m.t)) put({ advice: { at: Date.now(), h: host } });
    if (m.v === "LIZARD" && /stay still|lie down|stop moving|slow down|stillness/i.test(m.t)) lastStill = Date.now();
    m.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    m.ts = Date.now(); m.h = host;
    renderMsg(m); if (open) scrollDown();
    if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; var o = opener(m.t); if (o) openers[o] = m.ts; }
    if (m.v !== "SYS") { run = m.v === lastV ? run + 1 : 1; lastV = m.v; lastVs.push(m.v); if (lastVs.length > 15) lastVs.shift(); }
    try {
      chrome.runtime.sendMessage({ ybht: "append", m: m }, function (ok) {
        if (chrome.runtime.lastError || !ok) get(function (s) { s.room.push(m); if (s.room.length > 80) s.room = s.room.slice(-80); put({ room: s.room, lastSpoke: Date.now() }); });
      });
    } catch (e) {}
  }

  // may the voices start a conversation right now?
  function allowed(s, prio) {
    var st = s.settings, now = Date.now();
    if (!st.on || st.hushed[host] || now < (st.muteUntil || 0)) return false;
    if (document.hidden || document.fullscreenElement || busy) return false;
    var gap = (GAP[st.freq] || GAP.normal) * 1000;
    if (prio === 1.5) gap = 3000; // you just did something: answer quickly
    if (prio < 1.5 && (typingNow() || watching())) return false; // you're busy: they wait
    if (prio < 1) gap = Math.max(gap, (AMBIENT[st.freq] || AMBIENT.normal) * 1000);
    return now - (s.lastSpoke || 0) >= gap;
  }
  // say something about what just happened; key (if any) means once a day
  var pending = [];
  function quietNow(s) { var st = s.settings; return !st.on || st.hushed[host] || Date.now() < (st.muteUntil || 0) || document.hidden; }
  function event(key, build, prio, tries) {
    get(function (s) {
      if (key && s.said[key]) return;
      if (quietNow(s)) return;
      if (busy && prio === 1.5) {
        if (curPrio < 1.5) { var ex0 = build(s); if (!ex0) return; if (post(ex0.lines, ex0.r, prio, true, ex0.after)) { cutBelow = 1.5; if (key) { s.said[key] = Date.now(); put({ said: s.said }); } } return; } // you did something: they stop and react
        pending.push({ key: key, build: build, prio: prio, at: Date.now() }); if (pending.length > 3) pending.shift(); return; // say it right after
      }
      if (!allowed(s, prio)) { if (prio === 1.5 && (tries || 0) < 4) setTimeout(function () { event(key, build, prio, (tries || 0) + 1); }, 2500); return; }
      var ex = build(s); if (!ex) return;
      if (post(ex.lines, ex.r, prio, false, ex.after) && key) { s.said[key] = Date.now(); put({ said: s.said }); }
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
        riff = pick([[["GOSSIP", "You're talking about \u201C" + clip(PT, 45) + "\u201D. Finally, someone wants to talk about it."], ["TALLY", "It's right there in the title."]],
                     [["MGMT", "On topic. I love it. That's what this room is for."], ["LIZARD", "This room is for lying down."]]]);
      var named = /^(?:hey |hi |ok |okay |yo )?(tally|dread|hospitality|host|gossip|lizard|the lizard|grandeur|management|manager|cursor|the cursor|x button|the x button|x)\b[,:!?. ]*(.*)$/.exec(low);
      var tw0 = onTwinSite() ? twinLast() : null;
      if (onTwinSite() && /\b(look|it'?s you|that'?s you|your ?selves|twins?|clones?|copy|copies|mirror|them|other you|website)\b/.test(low) && !/\bforget\b/.test(low)) {
        R = tw0 ? [["GOSSIP", "We see them. Website " + tw0.who + " just said “" + tw0.t + "”"], ["HOST", "They live in the page. We live in the browser. We never visit."], [tw0.k, "I'd like to say I'm the original. Neither of us is."]]
                : [["TALLY", "That's us. The website us. Same nine names."], ["HOST", "They live in the page. We live in the browser."], ["DREAD", "Don't let them see us looking."]];
      }
      else if (/\bforget\b/.test(low)) {
        chrome.storage.local.remove(["leaves", "trail", "history", "records", "topics", "work", "closed", "advice", "patAt"]);
        R = [["MGMT", "Done. Everything we'd learned about your habits is gone from this browser. I've forgotten what I forgot."], ["TALLY", "I kept nothing. I'm upset about it."]];
      }
      else if (/weekly review|\breview\b/.test(low)) { var wr = weekly(s); R = wr ? wr.lines : [["MGMT", "A weekly review needs at least three days on file. I have " + Object.keys(s.history).filter(function (k) { for (var i = 1; i <= 7; i++) if (k === daysAgo(i)) return true; return false; }).length + ". Check back later."]]; if (wr) put({ lastReview: Date.now() }); }
      else if (/eulog|closed tabs/.test(low)) { var eu = eulogy(s); R = eu ? eu.lines : [["XBTN", "Fewer than three tabs closed today. Not enough for a ceremony."]]; }
      else if (named && dayOff && dayOff.day === today() && VOICES[dayOff.v].name.toLowerCase().indexOf(named[1].replace(/^the /, "")) >= 0) R = [["MGMT", VOICES[dayOff.v].name + " is out today. I can take a message. I won't pass it on."]];
      else if (named) { R = byName(named[1], named[2], s, h, sites); put({ namedAny: true }); }
      else if (/^(hi|hey|hello|yo|sup|hiya|howdy|hai)\b/.test(low)) R = before ? [["HOST", "Hello again! Hi! Welcome back to the room!"], ["TALLY", "That's message number " + (before + 1) + " from you. Nobody else has ever written in here."], ["GOSSIP", "We don't get out much."]]
                                                                         : [["HOST", "Hello! Hi! Welcome! That's the first thing anyone has ever said to us."], ["GOSSIP", "We don't get out much."]];
      else if (/(shut up|be quiet|stop talking|go away|^quiet\b|^shh+|\bstfu\b)/.test(low)) { s.settings.muteUntil = Date.now() + 3600000; mutedUntil = s.settings.muteUntil; queue.length = 0; pending = []; put({ settings: s.settings }); R = [["MGMT", "Understood. Quiet for one hour, starting now. I've put it in the calendar."]]; }
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
      else if (/spy|spying|watching me|track(ing)? me|what do you (know|see|keep)|what have you got on me|privacy|creepy/.test(low)) R = spyList(s, sites);
      else if (/what time|the time\b|what day/.test(low)) R = [["TALLY", "It's " + clock(new Date()) + " on " + DAYS[new Date().getDay()] + ". Your computer's clock says so."], ["DREAD", "Later than you think."], ["TALLY", "Exactly as late as I said."]];
      else if (/\bjoke\b|make me laugh|say something funny/.test(low)) R = pick([[["MGMT", "A joke. Ok. A website, a browser and a tab walk into a bar."], ["MGMT", "That's the whole joke. We're the bar."]],
                                                                                     [["GRAND", "The joke is " + n(sites, "site", "sites") + " today."], ["TALLY", "That's just a number."], ["GRAND", "Delivered well, it's a joke."]],
                                                                                     [["XBTN", "Knock knock."], ["HOST", "Who's there?"], ["XBTN", "Me. Up top. Every time."]]]);
      else if (w <= 2 && t.length >= 5 && !/[aeiouy]/i.test(t.replace(/[^a-z]/gi, "")) || /^(asdf|qwer|zxcv|jkl|hjkl|sdfg|fdsa)/i.test(low)) R = [["TALLY", n(t.replace(/\s/g, "").length, "key", "keys") + ". Mostly one row of the keyboard."], ["GOSSIP", "Is it a code? Tell me it's a code."], ["CURSOR", "It's a keyboard being patted."]];
      else if (/\?\s*$/.test(t)) R = pick([
        [["GOSSIP", "Great question. I don't know. I'll ask around."], ["TALLY", "There's nobody to ask."], ["GOSSIP", "I'll ask around in here."]],
        [["MGMT", "Let's take that offline."], ["HOST", "We are offline."], ["MGMT", "Then we've already taken it."]],
        [["GRAND", "The answer is within you."], ["TALLY", "It isn't in my numbers."]]
      ]);
      else if (riff) R = riff;
      else R = pickNew([
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

  // a catch-all reply that isn't the one used last time
  var lastCatch = -1;
  function pickNew(list) { var i; do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === lastCatch); lastCatch = i; return list[i]; }
  // "are you spying on me?": the honest list of what's kept
  function spyList(s, sites) {
    var tr = (s.trail || []).filter(function (x) { return x.day === today(); }), qs = tr.filter(function (x) { return x.q; }).length;
    var top = null, tm = 0; Object.keys(s.hosts).forEach(function (k) { if ((s.hosts[k].ms || 0) > tm) { tm = s.hosts[k].ms; top = k; } });
    return [["TALLY", "Here's everything we keep about today: " + n(sites, "site", "sites") + (top ? ", most time on " + top + " (" + mins(tm) + ")" : "") + ", " + n(qs, "search", "searches") + ", " + n(s.exitsToday || 0, "trip", "trips") + " to the X Button, " + n((s.youCount || 0) + 1, "message", "messages") + " from you."],
            ["HOST", "It all stays in this browser. Nothing is sent anywhere. Press receipts and every line shows where it came from."],
            ["MGMT", "Type “forget” and we forget your habits. I'll forget I ever managed you."]];
  }

  // when you talk to one voice by name, that voice answers
  function byName(nm, rest, s, h, sites) {
    var M = mins(h.ms), ask = /\?\s*$/.test(rest), ok = /\b(ok|okay|alright|all right|good)\b/.test(rest);
    var tr = s.trail || [], exitsT = s.exitsToday || 0;
    if (/tally/.test(nm)) return pick([[["TALLY", "Here. Today so far: " + n(sites, "site", "sites") + ", " + "at least " + n(tr.filter(function (x) { return x.day === today(); }).length, "page", "pages") + " seen, " + M + " on " + host + "."], ["TALLY", "You asked. I always know."]],
                                       [["TALLY", "Yes. That's your message number " + ((s.youCount || 0) + 1) + " to us. I keep track."]]]);
    if (/dread/.test(nm)) return ok ? [["DREAD", "No. But the page loaded."], ["HOST", "That's something!"], ["DREAD", "It's something."]]
                                    : pick([[["DREAD", "You called me by name. Nobody calls Dread by name. Now something's going to happen."]], [["DREAD", "I'm here. I'm always here. I'm just quieter than the others."], ["GOSSIP", "Much quieter."]]]);
    if (/host/.test(nm)) return [["HOST", "Oh! Me? Hello! Can I get you anything? I can't get you anything. But I'd like to."]];
    if (/gossip/.test(nm)) return pick([[["GOSSIP", "Yes? Is it news? Tell me it's news."], ["TALLY", "It's " + n(rest ? words(rest) : 0, "word", "words") + "."], ["GOSSIP", "I'll take it."]],
                                         s.namedAny ? [["GOSSIP", "You called for me. Specifically. I'm telling the others."], ["MGMT", "We can all read the chat."]] : [["GOSSIP", "You called me first. Out of nine. I'm telling the others."], ["MGMT", "We can all read the chat."]]]);
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
    var vid = videoPage(), yi = vid && /youtube\.com$/.test(host) ? ytInfo() : {};
    var S = vid ? (yi.channel ? yi.channel + "'s video" : "this video") : H, GW = vid ? "Great video" : "Great work";
    var eu = new Date().getHours() >= 18 && !s.said.eulogy ? eulogy(s) : null;
    if (eu) C.push({ key: "eulogy", list: [["eu1"].concat(eu.lines)], r: eu.r });
    if (vid) { C.push({ key: "", r: (yi.channel ? "the channel name under the video" : "this page has a big video") + "; " + on, list: [
      ["sv1", ["MGMT", "Quick sync on " + S + ". " + GW + ", or the opposite. Hard to say."]],
      ["sv2", ["GOSSIP", "Is it over? Did I miss it? Nobody tell me what happens."]],
      ["sv3", ["LIZARD", M + " on " + H + " today. Blink. Go on. Nobody's looking."], ["GOSSIP", "I'm looking."]],
      ["sv4", ["HOST", "Should I dim the lights? I can't dim the lights."]]
    ] }); return C; }
    C.push({ key: "", r: "this site today: " + M + " on screen, at least " + n(h.loads, "page load", "page loads") + "; page is " + sc + " window-heights, you're on " + y, list: [
      ["sm1", ["TALLY", "We're on screen " + y + " of " + sc + " here."], ["CURSOR", "I've been on all of them. I go everywhere you go."]],
      ["sm2", ["GOSSIP", "So. " + H + ". Come here often?"], ["TALLY", n(h.loads, "page", "pages") + " today."], ["GOSSIP", h.loads >= 3 ? "So, yes." : "So, no."]],
      ["sm3", ["HOST", "Anyone need anything? Water? A new tab? I can't get you anything."]],
      ["sm4", ["MGMT", "Quick sync. " + n(sites, "site", "sites") + " today. Great energy. No notes."], ["MGMT", "One note."], ["MGMT", "No. It's gone."]],
      ["sm5", ["LIZARD", M + " on " + H + " today. Blink. Go on. Nobody's looking."], ["GOSSIP", "I'm looking."]],
      ["sm6", ["DREAD", "It's " + T + ". Do you know where your tabs are?"], ["HOST", "I know where this one is. It's this one."]],
      ["sm8", ["MGMT", "Quick sync on " + S + ". " + GW + ", or the opposite. Hard to say."]],
      ["sm9", ["MGMT", "Circling back on " + S + ". No update. I just wanted you to know I circled."]],
      ["sm10", ["MGMT", "I've reviewed your " + M + " on " + H + " today. I have feedback. It's mostly sighing."], ["HOST", "Supportive sighing."], ["MGMT", "Neutral sighing."]],
      ["sm11", ["MGMT", "Let's touch base about " + S + " next week. Or now. Whichever is worse for you."]],
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
      var special = !lines ? specialArrival(s) : null;
      if (special) { post(special.lines, special.r, 1, false, special.after); return; }
      var cb = !lines ? callback(s, tr) : null;
      if (cb) {
        s.said["cb:" + cb.word] = Date.now(); put({ said: s.said });
        var W = cb.shown, where = cb.then.q ? "you searched \u201C" + cb.then.q + "\u201D" : cb.then.h;
        lines = pick([
          [["GOSSIP", "\u201C" + W + "\u201D again. " + (cb.then.q ? "You searched it " + since(cb.then.at) + "." : "It was on " + cb.then.h + " " + since(cb.then.at) + ".") + " Now it's here. What's going on with " + W + "?"], ["MGMT", "Circling back on " + W + ". Great work, or the opposite."]],
          [["TALLY", "\u201C" + W + "\u201D again. Also seen today: " + where + ", " + since(cb.then.at) + ". Now " + host + "."], ["GOSSIP", "It's a theme. You have a theme."], ["MGMT", "I'll make it a recurring meeting."]],
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
        ["mv2", ["HOST", ((s.hosts[host] || {}).loads > 1 ? "Back on " + host + "! " : "New place! " + host + ". ") + "I'll put the kettle on. I don't have a kettle."]],
        ["mv3", ["MGMT", "We're relocating from " + prevHost + " to " + host + ". Effective immediately. Effective a second ago."]],
        ["mv4", ["DREAD", "We left " + prevHost + ". We'll never know how it ended."]],
        s.linkFrom === prevHost && Date.now() - (s.linkAt || 0) < 30000 ? ["mv5", ["CURSOR", "I drove us from " + prevHost + " to " + host + ". You're welcome. I clicked the link."], ["TALLY", "You clicked the link."]]
                                                                        : ["mv6", ["CURSOR", "We're on " + host + " now. No link on " + prevHost + " was clicked to get here. I wasn't consulted."]]
      ].filter(function (m) { return !s.said[m[0]]; });
      if (!lines && prevHost && prevHost !== host && Date.now() - prevAt < 60000 && MOVES.length && Date.now() - (s.said.lastMove || 0) > 600000 && Math.random() < 0.5) {
        var mv = pick(MOVES); s.said[mv[0]] = Date.now(); s.said.lastMove = Date.now(); put({ said: s.said });
        lines = mv.slice(1); r = "the last site before this one was " + prevHost;
        if (p) { lines = lines.concat(p.lines.slice(0, 2)); r += "; " + p.r; }
      }
      if (!lines && p) { lines = p.lines; r = p.r; }
      if (lines) post(lines, r, 1);
    });
  }

  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { flush(true); hiddenAt = Date.now(); return; }
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
        if (withUs) return { lines: [["HOST", "Back to this tab! It was hidden for " + mins(away) + ". You were with us in another one for at least part of that. This one missed you."]], r: "this tab was hidden for " + mins(away) + " while another tab with us was in use" };
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
        if (s.room.some(function (m) { return m.v === "YOU" && m.ts > idleSince; })) return null; // you were talking to us
        if (lastVideoAt > idleSince) return null; // you were watching something
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
    lastKey = Date.now();
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
        if (lastStill && Date.now() - lastStill < 5 * 60000) return { lines: [["LIZARD", "I asked for stillness " + since(lastStill) + ". You just went past " + dist + " screens in five seconds."], ["CURSOR", "I don't take orders from reptiles."], ["LIZARD", "Everyone takes orders from reptiles. Eventually."]], r: "The Lizard's line " + since(lastStill) + "; you scrolled about " + dist + " window-heights in 5 seconds" };
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
    try { if (!inPanel(e) && e.target.closest && e.target.closest("a[href]")) put({ linkAt: Date.now(), linkFrom: host }); } catch (x) {}
    if (inPanel(e)) return;
    var b = e.target && e.target.closest ? e.target.closest('button, [role="button"], input[type="submit"]') : null;
    if (!b || Date.now() - lastClick < 45000) return;
    var label = clip(b.getAttribute("aria-label") || b.textContent || b.value || "", 40);
    if (!label || label.length < 2) return;
    var L = null, Q = "\u201C" + label + "\u201D";
    if (/add to (cart|basket|bag)|buy now|checkout|place (your )?order|purchase/i.test(label)) L = [["MGMT", "You pressed " + Q + ". I'm going to need a receipt. A real one."], ["LIZARD", "The hunt is over."]];
    else if (/jump to recipe|skip to recipe/i.test(label)) L = [["LIZARD", "You skipped the life story. Straight to the food. Good. That's what I'd do."], ["GOSSIP", "I wanted the life story."]];
    else if (/delete|remove|discard/i.test(label)) L = [["DREAD", "You pressed " + Q + ". It's gone. Probably. Things are rarely gone."]];
    else if (/subscribe|follow|join/i.test(label)) L = [["GOSSIP", "You pressed " + Q + "! Who is it? Tell me everything."]];
    else if (/sign out|log out|logout/i.test(label)) L = [["HOST", "Signing out? That's fine. We don't sign out. We live here."]];
    else if (/^(like|star|upvote|heart|favou?rite)/i.test(label)) L = [["GRAND", "You pressed " + Q + ". A small act of greatness."]];
    else if (/cancel|close|dismiss|no thanks|not now|discard/i.test(label)) L = [["XBTN", "You pressed " + Q + ". That's practically my job. I'm not jealous."]];
    else if (/send|post|submit|reply|comment|publish/i.test(label)) L = [["MGMT", "You pressed " + Q + ". I'd have edited it first."], ["HOST", "I'm sure it was lovely."]];
    var ck = "";
    if (!L && Math.random() < 0.3) { ck = "clickjoke"; L = pick([[["CURSOR", Q + ". Good click. I felt that."]], [["TALLY", "A click on " + Q + ". Noted."], ["MGMT", "Strong click. Confident. Possibly a mistake."]]]); }
    if (!L) return;
    lastClick = Date.now();
    event(ck, function () { return { lines: L, r: "you pressed a button labeled " + Q }; }, 1.5);
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
      if (td === 10) { event("ten-exits", function () { return { lines: [["CURSOR", "That's ten trips to the top of the window today. I do all the driving."], ["XBTN", "Ten trips. Not once all the way."]], r: "your cursor left a page through the top edge 10 times today" }; }, 1.5); return; }
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
      var list = c.list;
      if (force) { // asked for it: still nothing they've said in the last four hours
        list = list.filter(function (x) { return fresh(x.slice(1).filter(Array.isArray)) && !recent[(x[1] || [])[1]]; });
        if (!list.length) {
          var out = [[["MGMT", "We've said everything we have about this page. Take us somewhere new and we'll have opinions."]],
                     [["TALLY", "Every line we had for this page, we've used. We don't repeat ourselves. It's a rule."], ["MGMT", "It's my rule."]],
                     [["GOSSIP", "I've got nothing new. Go somewhere. Anywhere. Then ask me again."]]].filter(fresh);
          if (out.length) post(pick(out), "everything they had for this page was said in the last 4 hours", 2, true);
          return;
        }
      }
      post(choose(list, s.used), c.r, force ? 2 : 0, force, after);
    });
  }
  function answerWork(v) {
    append({ v: "YOU", t: v ? "Yes, it's work." : "No." });
    get(function (s) { put({ youCount: (s.youCount || 0) + 1 }); });
    get(function (s) { s.work[host] = { v: v, day: today() }; put({ work: s.work }); });
    post(v ? [["MGMT", "Noted. I'll hold you to that."], ["GOSSIP", "Sure it is."]] : [["MGMT", "Noted. I respect the honesty. I'm also writing it down."], ["TALLY", "It's saved in this browser. Nowhere else."]], "your answer, saved in this browser", 2, true);
  }

  /* ---------- start ---------- */
  function render(s) {
    if (!holder) return;
    var st = s.settings;
    hostStyle({ display: st.on && !st.hushed[host] && !printing ? "block" : "none" });
    var muted = Date.now() < (st.muteUntil || 0);
    mutedUntil = st.muteUntil || 0;
    quiet.classList.toggle("on", muted);
    quiet.textContent = muted ? "quiet \u2713" : "quiet";
    quiet.title = muted ? "Quiet until " + clock(new Date(st.muteUntil)) + ". Press to let them talk again." : "No new messages for an hour";
    renderAll(s.room);
  }
  get(function (s) {
    buildPanel();
    var ui = s.ui || {};
    receiptsOn = !!ui.receipts;
    s.room.forEach(function (m) { if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; var o = opener(m.t); if (o) openers[o] = m.ts; } if (m.v !== "SYS") { run = m.v === lastV ? run + 1 : 1; lastV = m.v; } });
    list.classList.toggle("r", receiptsOn); root.querySelector('[data-a="r"]').classList.toggle("on", receiptsOn);
    if (ui.pos) pos = ui.pos;
    dayOff = s.dayOff || null;
    var small = innerWidth < 700 || innerHeight < 520;
    setOpen(small ? false : ui.open !== false);
    if (pos) placeAt(pos.r, pos.b);
    render(s);
    booting = false;
    if (document.hidden) { var onShow = function () { if (!document.hidden) { document.removeEventListener("visibilitychange", onShow); setTimeout(arrive, 2500); } }; document.addEventListener("visibilitychange", onShow); }
    else setTimeout(arrive, 2500);
  });

  if (alive()) chrome.storage.onChanged.addListener(function (ch) {
    if (!holder) return;
    if (ch.room) (ch.room.newValue || []).forEach(function (m) { if (m.t && m.v !== "YOU") { recent[m.t] = m.ts; shapes[shape(m.t)] = m.ts; var o = opener(m.t); if (o) openers[o] = m.ts; } if (m.v !== "SYS") { run = m.v === lastV ? run + 1 : 1; lastV = m.v; } });
    if (ch.room || ch.settings) get(render);
    // shrinking or opening the chat in one tab does the same in the others
    if (ch.ui && document.hidden) {
      var u = ch.ui.newValue || {};
      receiptsOn = !!u.receipts; list.classList.toggle("r", receiptsOn); root.querySelector('[data-a="r"]').classList.toggle("on", receiptsOn);
      if (u.pos) pos = u.pos;
      if (u.open !== undefined && u.open !== open) { syncing = true; setOpen(u.open); syncing = false; }
      else if (pos) placeAt(pos.r, pos.b);
    }
  });

  if (alive()) chrome.runtime.onMessage.addListener(function (msg, _from, reply) {
    if (msg && msg.ybht === "now") { reply(true); if (!open) setOpen(true); setTimeout(function () { ambient(true); }, 300); }
    if (msg && msg.ybht === "host") reply(host);
  });

  setInterval(function () { ambient(false); }, 20000);
  document.addEventListener("fullscreenchange", function () {
    if (!holder) return;
    hostStyle({ visibility: document.fullscreenElement ? "hidden" : "visible" });
    try { if (!document.fullscreenElement && holder.popover && !holder.matches(":popover-open")) holder.showPopover(); } catch (e) {}
  });
  // never in printouts
  var printing = false;
  addEventListener("beforeprint", function () { printing = true; if (holder) hostStyle({ display: "none" }); });
  addEventListener("afterprint", function () { printing = false; get(render); });
  // keep it on screen when the window changes size
  addEventListener("resize", function () { if (!holder) return; var fix = function () { var r = holder.getBoundingClientRect(); placeAt(pos ? pos.r : innerWidth - r.right, pos ? pos.b : innerHeight - r.bottom); }; fix(); setTimeout(fix, 200); });
})();
