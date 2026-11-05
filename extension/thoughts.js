// Your Browser Has Thoughts: the extension.
// Every so often one voice says one true thing about your browsing, in a small bubble in the corner.
// Everything is kept in chrome.storage.local on this computer. Nothing is sent anywhere.
(function () {
  "use strict";
  if (window.top !== window) return;
  if (window.__ybht) return;
  window.__ybht = true;

  var VOICES = {
    TALLY: { name: "Tally", c: "#3cc7b8" },
    DREAD: { name: "Dread", c: "#ff6b5e" },
    HOST: { name: "Hospitality", c: "#f0a63a" },
    GOSSIP: { name: "Gossip", c: "#ff6fb8" },
    LIZARD: { name: "The Lizard", c: "#8fd16a" },
    GRAND: { name: "Grandeur", c: "#b48cff" },
    MGMT: { name: "Management", c: "#86a8d8" },
    CURSOR: { name: "The Cursor", c: "#e7e5ee" },
    XBTN: { name: "The X Button", c: "#ff7a7a" }
  };
  // minutes between two thoughts, across all tabs
  var GAP = { rare: 25, normal: 10, often: 4 };

  var host = location.hostname.replace(/^www\./, "");
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
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
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  function get(cb) {
    if (!alive()) return;
    chrome.storage.local.get(null, function (s) {
      s = s || {};
      if (s.day !== today()) {
        s = { installedDay: s.installedDay, settings: s.settings, day: today(), hosts: {}, hops: s.hops || [], lastShown: s.lastShown || 0, said: {}, firstDone: false, used: s.used || {} };
      }
      s.settings = s.settings || { on: true, freq: "normal", muteUntil: 0, hushed: {} };
      s.settings.hushed = s.settings.hushed || {};
      s.hosts = s.hosts || {};
      s.said = s.said || {};
      s.hops = s.hops || [];
      if (s.firstDay !== today()) { s.firstHost = null; s.firstAt = null; }
      if (!s.installedDay) { s.installedDay = today(); chrome.storage.local.set({ installedDay: s.installedDay }); }
      cb(s);
    });
  }
  function put(s) { if (alive()) chrome.storage.local.set(s); }

  /* ---------- facts we keep (all local) ---------- */
  var lastInput = Date.now(), idleFrom = null, idleAt = 0;
  addEventListener("focus", function () { lastInput = Date.now(); idleFrom = null; });
  var battery = null;
  try {
    if (navigator.getBattery) navigator.getBattery().then(function (b) { battery = b; }, function () {});
  } catch (e) {}

  // count this page load and, if it is a new site today, the site count
  get(function (s) {
    var h = s.hosts[host] || { ms: 0, loads: 0 };
    h.loads++;
    s.hosts[host] = h;
    if (!s.firstHost) { s.firstHost = host; s.firstAt = clock(new Date()); s.firstDay = today(); }
    put({ installedDay: s.installedDay, day: s.day, hosts: s.hosts, said: s.said, settings: s.settings, hops: s.hops, lastShown: s.lastShown, firstDone: s.firstDone, used: s.used || {}, firstHost: s.firstHost, firstAt: s.firstAt, firstDay: s.firstDay });
  });

  // on-screen time for this site, counted only while this tab is visible
  var lastTick = Date.now();
  function flush() {
    var now = Date.now(), dt = now - lastTick;
    lastTick = now;
    if (document.hidden || dt > 30000) return;
    get(function (s) {
      var h = s.hosts[host] || { ms: 0, loads: 0 };
      h.ms += dt;
      s.hosts[host] = h;
      put({ day: s.day, hosts: s.hosts });
    });
  }
  setInterval(flush, 15000);
  addEventListener("pagehide", flush);

  // tab hopping: each time a tab comes back into view, note the time
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { flush(); return; }
    lastTick = Date.now();
    lastInput = Date.now(); idleFrom = null;
    get(function (s) {
      var now = Date.now();
      s.hops = s.hops.filter(function (t) { return now - t < 600000; });
      s.hops.push(now);
      put({ hops: s.hops });
    });
    schedule(4000 + Math.random() * 6000);
  });

  function onInput() {
    var idle = Date.now() - lastInput;
    if (idle >= 5 * 60000 && !document.hidden && document.hasFocus()) { idleFrom = idle; idleAt = Date.now(); }
    lastInput = Date.now();
    if (idleFrom) schedule(1500);
  }
  addEventListener("mousemove", onInput, { passive: true, capture: true });
  addEventListener("keydown", onInput, { passive: true, capture: true });
  addEventListener("wheel", onInput, { passive: true, capture: true });
  addEventListener("touchstart", onInput, { passive: true, capture: true });

  var topExit = false;
  document.addEventListener("mouseout", function (e) {
    if (!e.relatedTarget && e.clientY <= 0) { topExit = Date.now(); schedule(300); }
  });

  /* ---------- the thoughts ---------- */
  // What kind of site this is, for the well-known ones only. Unknown sites get the general lines.
  var KINDS = {
    video: /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|netflix\.com|hulu\.com|disneyplus\.com|primevideo\.com|max\.com|crunchyroll\.com|vimeo\.com|kick\.com)$/,
    social: /(^|\.)(reddit\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|tiktok\.com|bsky\.app|threads\.net|tumblr\.com|linkedin\.com|discord\.com|mastodon\.social)$/,
    shop: /(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|walmart\.com|target\.com|bestbuy\.com|aliexpress\.com|temu\.com|newegg\.com)$/,
    code: /(^|\.)(github\.com|gitlab\.com|stackoverflow\.com|developer\.mozilla\.org|npmjs\.com|pypi\.org|codepen\.io|replit\.com)$/,
    news: /(^|\.)(cnn\.com|bbc\.co\.uk|bbc\.com|nytimes\.com|theguardian\.com|reuters\.com|apnews\.com|washingtonpost\.com|foxnews\.com|nbcnews\.com|news\.ycombinator\.com|theverge\.com)$/,
    ai: /(^|\.)(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|perplexity\.ai|copilot\.microsoft\.com)$/,
    mail: /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|proton\.me|mail\.proton\.me)$/,
    search: /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/,
    game: /(^|\.)(store\.steampowered\.com|steamcommunity\.com|itch\.io|chess\.com|lichess\.org|epicgames\.com|roblox\.com)$/
  };
  function kind(h) {
    for (var k in KINDS) if (KINDS[k].test(h)) return k;
    return "";
  }

  // id, then [voice, text] lines. Lines are picked at random, skipping any seen in the last week.
  // The receipt under the bubble carries the number, so most lines don't repeat it.
  function bank(f) {
    var H = f.host, T = f.t, D = f.day;
    return {
      firstInstall: [
        ["n1", ["MGMT", "First website since you installed us: " + H + ". I'll be taking notes. A lot of notes."]],
        ["n2", ["HOST", "Hello! We just moved in. First site we've seen: " + H + ". I'll be in the corner."]],
        ["n3", ["XBTN", "You installed nine voices. Your first stop with us is " + H + ". I'm up in the corner if this was a mistake."]]
      ],
      first: [
        ["f1", ["MGMT", "First website of the day: " + H + ". Bold. Let's see if it pays off."]],
        ["f2", ["MGMT", "Good morning. Today's first site is " + H + ". I've already scheduled a follow-up."], f.hr < 12],
        ["f3", ["HOST", "First site of the day: " + H + ". I'll be in the corner. I live in the corner now."]],
        ["f5", ["CURSOR", "Morning. First stop was " + H + ". I'll be pointing at things all day. Mostly away from the X."], f.hr < 12],
        ["f6", ["XBTN", "First site of the day. I'm up in the corner if you need me. You will need me."]]
      ],
      t10: {
        "": [["a1", ["MGMT", "We need to talk about " + H + "."], ["HOST", "Leave them alone. It's a nice site."]],
             ["a3", ["TALLY", "I've been timing this. Don't look at the receipt."]],
             ["a4", ["HOST", "Does " + H + " know you're seeing other websites?"]]],
        video: [["v1", ["MGMT", "I'll file " + H + " under professional development."]],
                ["v2", ["LIZARD", "Moving pictures. Good. Stay still. Stay warm."]],
                ["v4", ["GOSSIP", "What are we watching? Is it good? Is it about people? I love people."]]],
        social: [["s1", ["GOSSIP", "Anyone interesting on " + H + "? Don't tell me. Tell me."]],
                 ["s2", ["CURSOR", "Scroll. Scroll. Scroll. Where does it end?"], ["TALLY", "It doesn't."]],
                 ["s4", ["HOST", "It's very loud on " + H + ". You can sit in the corner with me for a bit."]]],
        shop: [["p1", ["MGMT", "Is this an approved purchase? Who approved it? Was it me?"]],
               ["p2", ["LIZARD", "You are hunting. I respect hunting."]]],
        code: [["c1", ["MGMT", "I'll put this down as work. Don't make me regret it."]],
               ["c2", ["GRAND", "A builder. A maker of things. An architect of the future."], ["TALLY", "For at least ten minutes."]]],
        news: [["n1", ["DREAD", "Whatever " + H + " says, I already feel worse."]],
               ["n2", ["MGMT", "Let's take this offline. All of it. The whole world."]]],
        ai: [["i1", ["GOSSIP", "You're talking to another voice on " + H + ", aren't you."], ["HOST", "We're right here."]],
             ["i2", ["TALLY", "Asking a computer for help, inside a computer, while we watch."], ["GRAND", "Beautiful."]]],
        mail: [["m1", ["MGMT", "Per my last thought."]],
               ["m2", ["DREAD", "There's always one more. There is always one more."]]],
        search: [["q1", ["GOSSIP", "Asking " + H + " things. You could have asked me."], ["TALLY", "You don't know anything."], ["GOSSIP", "I'd have made something up."]]],
        game: [["g1", ["MGMT", "Team building. I'll allow it. I won't approve it, but I'll allow it."]]]
      },
      t30: {
        "": [["b1", ["MGMT", "At this point " + H + " is a recurring meeting."]],
             ["b2", ["LIZARD", "Look away from the screen. Look at something far away. A wall counts."]],
             ["b3", ["HOST", "They should give you a key to " + H + "."]]],
        video: [["v3", ["GRAND", "A connoisseur. A critic. A scholar of the couch."]]],
        social: [["s3", ["GOSSIP", "I need to know everything that happened on " + H + ". Who said what."]]],
        mail: [["m3", ["XBTN", "You could close the email. I'm right here. I'm always right here."]]]
      },
      t60: [
        ["h1", ["MGMT", "I've added " + H + " to your calendar. Retroactively."]],
        ["h2", ["MGMT", "Let's sync on " + H + "."], ["LIZARD", "No."]],
        ["h3", ["DREAD", "That hour is not coming back. I checked."]],
        ["h4", ["XBTN", "I've been right here the whole time. Just so you know."]]
      ],
      t120: [
        ["w1", ["DREAD", "I'm not judging. I'm counting. Judging comes later."]],
        ["w2", ["MGMT", "You should be getting paid for this. Are you? Can I see the contract?"]],
        ["w3", ["LIZARD", "Stand up. The chair has had enough of you."]],
        ["w4", ["TALLY", "I'm not saying anything."], ["TALLY", "Read the receipt."]]
      ],
      loads: [
        ["l1", ["TALLY", "I'm not keeping score."], ["TALLY", "I am the score."]],
        ["l2", ["MGMT", "Strong engagement with " + H + ". Worrying engagement."]],
        ["l3", ["GOSSIP", "Back on " + H + " again. Is something going on over there?"]],
        ["l6", ["CURSOR", "I know my way around " + H + " now. Down, down, click. I could do it in my sleep."], ["LIZARD", "Do it in your sleep."]]
      ],
      loadsBig: [
        ["l4", ["HOST", "You should get your mail delivered to " + H + "."]]
      ],
      sites: [
        ["x1", ["TALLY", "I've counted every site I could see today. I'll never tell anyone. I don't know anyone."]],
        ["x2", ["MGMT", "That many websites. I'm going to need a summary of each one by end of day."], ["TALLY", "I can do that."], ["MGMT", "Not you."]]
      ],
      sitesBig: [
        ["x4", ["LIZARD", "That many websites. I'm lying down. One of us has to."]],
        ["x5", ["MGMT", "This isn't browsing anymore. This is a portfolio."]]
      ],
      hops: [
        ["o1", ["GOSSIP", "Tab after tab after tab. Who are you looking for? Is it me?"]],
        ["o2", ["MGMT", "We call that multitasking. We call it that so we don't have to call it something else."]],
        ["o3", ["CURSOR", "Tab. Tab. Tab. Tab."], ["HOST", "Please pick one. I'm in all of them."]]
      ],
      idle: [
        ["d1", ["CURSOR", "Oh. We're moving again. I thought I'd been retired."]],
        ["d2", ["MGMT", "You didn't touch anything for " + f.idle + ". I'll need a note from your doctor."]],
        ["d3", ["LIZARD", "Were you asleep? I was asleep."]],
        ["d4", ["HOST", "You're back! I kept everything exactly where you left it. I couldn't move it anyway."]]
      ],
      top: [
        ["u1", ["XBTN", "Up here. I'm always up here."]],
        ["u2", ["XBTN", "You keep coming up here and not clicking me."]],
        ["u3", ["MGMT", "Heading for the X? Let's not make any decisions we can't walk back."]],
        ["u4", ["XBTN", "Closer. Closer. No? Fine."]],
        ["u5", ["GOSSIP", "Going up to see the X again? What do you two even talk about?"], ["XBTN", "Endings."]]
      ],
      late: [
        ["z1", ["LIZARD", "It's " + T + ". The part of you that's older than websites would like to lie down."], ["MGMT", "Noted. Denied."]],
        ["z2", ["MGMT", "It's " + T + ". I'm not approving overtime for this."]],
        ["z3", ["DREAD", "It's " + T + " and you're on " + H + ". Of all the places to be at " + T + "."]]
      ],
      night: [
        ["y2", ["MGMT", "It's " + T + ". Let's wrap up. Let's wrap up for real this time. Let's wrap up."]],
        ["y3", ["LIZARD", "It's " + T + ". Every part of you that isn't your eyes has gone to bed."], ["XBTN", "I can show the eyes the way out."]]
      ],
      skive: [
        ["k1", ["MGMT", "It's " + T + " on a " + D + " and you're on " + H + ". I'm going to pretend I didn't see this. I'm writing it down while I pretend."]],
        ["k2", ["MGMT", T + " on a " + D + ". " + H + ". I'm not mad. I'm putting it in a spreadsheet, which is worse."]]
      ],
      weekend: [
        ["e1", ["MGMT", "It's " + D + ". I'm not allowed to manage you on weekends."], ["MGMT", "Anyway. " + H + "?"]],
        ["e2", ["LIZARD", "It's " + D + ". Management isn't allowed in today."], ["MGMT", "I'm just visiting."]]
      ],
      battery: [
        ["r1", ["DREAD", f.pct + "% battery and you're on " + H + ". Is this how you want to go?"]],
        ["r2", ["DREAD", f.pct + "%. Not plugged in. I'm not panicking. I'm just going to say the number again. " + f.pct + "%."]],
        ["r4", ["XBTN", "Low battery. I can make this quick."]]
      ],
      asked: [
        ["q2", ["MGMT", "Quick sync on " + H + ". Great work, or the opposite. Hard to say."]],
        ["q4", ["TALLY", "You asked. It's all on the receipt."]],
        ["q5", ["GOSSIP", "You pressed a button just to hear from me. Nobody presses a button for Gossip."], ["HOST", "Somebody did."]],
        ["q6", ["MGMT", "Per your request, here is a thought. Please rate this thought from one to five."]],
        ["q7", ["CURSOR", "You clicked a button to make us talk. I helped. I'm the one who clicked it."]],
        ["q8", ["XBTN", "You opened a menu just to hear from us. Next time, try the other button. Up here."]]
      ]
    };
  }
  function choose(list, used) {
    var now = Date.now(), WEEK = 7 * 86400000;
    list = list.filter(function (x) { return x[2] !== false && typeof x[1][0] === "string"; });
    var fresh = list.filter(function (x) { return !used[x[0]] || now - used[x[0]] > WEEK; });
    var pool = fresh.length ? fresh : list.slice().sort(function (a, b) { return (used[a[0]] || 0) - (used[b[0]] || 0); }).slice(0, 1);
    var x = pick(pool);
    // lines may be [id, line] or [id, line, condition] or [id, line, line]
    var lines = x.slice(1).filter(function (l) { return Array.isArray(l); });
    return { id: x[0], lines: lines };
  }

  // Each candidate: {key (said at most once a day), list (of variants), receipt}
  function candidates(s) {
    var out = [], now = new Date(), hr = now.getHours(), wd = now.getDay();
    var h = s.hosts[host] || { ms: 0, loads: 0 };
    var sites = Object.keys(s.hosts).length;
    var hops = s.hops.filter(function (x) { return Date.now() - x < 600000; }).length;
    var k = kind(host);
    var f = { host: host, t: clock(now), day: DAYS[wd], hr: hr, loads: h.loads, sites: sites, hops: hops,
              mins: mins(h.ms), idle: idleFrom ? mins(idleFrom) : "", pct: battery ? Math.round(battery.level * 100) : 0 };
    var B = bank(f), slot = Math.floor(Date.now() / 3600000);
    function add(key, list, receipt) { out.push({ key: key, list: list, receipt: receipt }); }

    if (!s.firstDone && s.firstHost) {
      var BF = bank(Object.assign({}, f, { host: s.firstHost }));
      if (s.installedDay === today()) add("first", BF.firstInstall, "first site seen since install: " + s.firstHost + ", at " + s.firstAt);
      else add("first", BF.first, "first site seen today: " + s.firstHost + ", at " + s.firstAt);
    }
    if (topExit && Date.now() - topExit < 10000) { topExit = false; if (Math.random() < 0.5) add("top", B.top, "your cursor left the page through the top edge"); }
    if (idleFrom && Date.now() - idleAt > 30000) idleFrom = null;
    if (idleFrom) { add("idle" + slot, B.idle, "no mouse, key or scroll on this tab for " + f.idle); idleFrom = null; }
    if (hops >= 15) add("hops" + Math.floor(Date.now() / 1800000), B.hops, hops + " times a tab came into view in the last 10 minutes");

    var work = wd >= 1 && wd <= 5 && hr >= 9 && hr < 17;
    if (work && (k === "video" || k === "social" || k === "game" || k === "shop") && h.ms >= 3 * 60000)
      add("skive", B.skive, "the clock says " + f.t + " on a " + f.day + "; this site was on screen for " + f.mins + " today");

    var r = "this site was on screen for " + f.mins + " today";
    if (h.ms >= 120 * 60000) add("t120" + host, B.t120, r);
    else if (h.ms >= 60 * 60000) add("t60" + host, B.t60, r);
    else if (h.ms >= 30 * 60000) add("t30" + host, (B.t30[k] || []).concat(B.t30[""]), r);
    else if (h.ms >= 10 * 60000) add("t10" + host, (B.t10[k] || []).concat(B.t10[k] ? [] : B.t10[""]), r);

    if (h.loads >= 25) add("lb" + host, B.loadsBig, "at least " + h.loads + " page loads on this site today");
    else if (h.loads >= 6) add("l" + host, B.loads, "at least " + h.loads + " page loads on this site today");

    if (sites >= 50) add("sb", B.sitesBig, sites + " different hostnames seen today");
    else if (sites >= 15) add("s", B.sites, sites + " different hostnames seen today");

    if (battery && !battery.charging && battery.level <= 0.2) add("bat" + Math.ceil(f.pct / 5), B.battery, "navigator.getBattery(): " + f.pct + "%, not charging");

    if (hr < 5) add("late", B.late, "the clock says " + f.t);
    else if (hr >= 22) add("night", B.night, "the clock says " + f.t);
    if ((wd === 0 || wd === 6) && hr >= 10) add("weekend", B.weekend, "the clock says " + f.day);
    s._asked = { key: "asked" + Date.now(), list: B.asked, receipt: "you asked; " + f.mins + " of this site on screen today, " + f.loads + (f.loads === 1 ? " page load, " : " page loads, ") + f.sites + (f.sites === 1 ? " hostname" : " hostnames") + " today" };
    return out;
  }

  /* ---------- deciding when to speak ---------- */
  var timer = null, showing = false;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { maybeSpeak(false); }, ms); }

  function maybeSpeak(force) {
    if ((document.hidden && !force) || showing || document.fullscreenElement) return;
    get(function (s) {
      var st = s.settings, now = Date.now();
      if (!force) {
        if (!st.on || now < (st.muteUntil || 0) || st.hushed[host]) return;
        if (now - (s.lastShown || 0) < (GAP[st.freq] || GAP.normal) * 60000) return;
      }
      var c = candidates(s).filter(function (x) { return !s.said[x.key]; });
      if (!c.length) {
        if (!force) return;
        c = [s._asked];
      }
      var cand = c[0];
      s.used = s.used || {};
      var ch = choose(cand.list, s.used);
      var th = { lines: ch.lines, receipt: cand.receipt };
      s.said[cand.key] = now;
      s.used[ch.id] = now;
      var patch = { said: s.said, lastShown: now, used: s.used };
      if (cand.key === "first") patch.firstDone = true;
      put(patch);
      show(th);
    });
  }

  /* ---------- the bubble ---------- */
  function show(th) {
    showing = true;
    var holder = document.createElement("div");
    holder.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;";
    var root = holder.attachShadow({ mode: "closed" });
    root.innerHTML =
      '<style>' +
      '.b{font:15px/1.45 Georgia,"Palatino Linotype",serif;color:#e7e5ee;background:#18171d;border:1px solid #34323e;border-radius:6px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);padding:12px 14px 10px;width:300px;max-width:calc(100vw - 36px);box-sizing:border-box;' +
      'opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}' +
      '.b.in{opacity:1;transform:none}' +
      '.l{margin:0 0 6px}' +
      '.w{font:700 11px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;margin-right:6px}' +
      '.r{font:11px/1.35 ui-monospace,Consolas,monospace;color:#9c99a8;margin:2px 0 8px}' +
      '.f{display:flex;gap:8px;justify-content:flex-end}' +
      'button{font:600 11px/1 system-ui,sans-serif;color:#9c99a8;background:none;border:1px solid #34323e;border-radius:4px;padding:5px 8px;cursor:pointer}' +
      'button:hover,button:focus-visible{color:#e7e5ee;border-color:#9c99a8;outline:none}' +
      '@media (prefers-reduced-motion:reduce){.b{transition:none}}' +
      '</style><div class="b" role="status"><div class="t"></div><div class="r"></div>' +
      '<div class="f"><button class="m">Quiet for 1 hour</button><button class="x">Close</button></div></div>';
    var box = root.querySelector(".b"), tx = root.querySelector(".t");
    root.querySelector(".r").textContent = "receipt: " + th.receipt;
    document.documentElement.appendChild(holder);
    requestAnimationFrame(function () { box.classList.add("in"); });

    var total = 0, hovering = false, closed = false;
    function addLine(i) {
      var v = VOICES[th.lines[i][0]];
      var p = document.createElement("p"); p.className = "l";
      var w = document.createElement("span"); w.className = "w"; w.style.color = v.c; w.textContent = v.name;
      p.appendChild(w); p.appendChild(document.createTextNode(th.lines[i][1]));
      tx.appendChild(p);
    }
    addLine(0);
    th.lines.forEach(function (l) { total += Math.max(3000, l[1].length * 70); });
    // a reply appears after there's been time to read the first line
    var i = 1;
    (function more() {
      if (i >= th.lines.length) return;
      setTimeout(function () { if (!closed) { addLine(i++); more(); } }, Math.max(1800, th.lines[i - 1][1].length * 40));
    })();
    var left = total + 6000;
    box.addEventListener("mouseenter", function () { hovering = true; });
    box.addEventListener("mouseleave", function () { hovering = false; });
    var iv = setInterval(function () { if (!hovering && !document.hidden) left -= 500; if (left <= 0) close(); }, 500);
    function close() {
      if (closed) return; closed = true; clearInterval(iv);
      box.classList.remove("in");
      setTimeout(function () { holder.remove(); showing = false; }, 350);
    }
    root.querySelector(".x").onclick = close;
    root.querySelector(".m").onclick = function () {
      get(function (s) { s.settings.muteUntil = Date.now() + 3600000; put({ settings: s.settings }); });
      close();
    };
  }

  // the popup's "Say something now" button
  if (alive()) chrome.runtime.onMessage.addListener(function (msg, _from, reply) {
    if (msg && msg.ybht === "now") { reply(true); setTimeout(function () { maybeSpeak(true); }, 400); }
    if (msg && msg.ybht === "host") reply(host);
  });

  // first look a little while after the page settles, then check now and then
  schedule(20000 + Math.random() * 20000);
  setInterval(function () { if (!timer || !showing) maybeSpeak(false); }, 120000);
})();
