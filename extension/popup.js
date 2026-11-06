var $ = function (id) { return document.getElementById(id); };
function settings(cb) {
  chrome.storage.local.get("settings", function (s) {
    var st = (s && s.settings) || { on: true, freq: "normal", muteUntil: 0, hushed: {} };
    st.hushed = st.hushed || {};
    cb(st);
  });
}
function save(st) { chrome.storage.local.set({ settings: st }); }
function activeTab(cb) { chrome.tabs.query({ active: true, currentWindow: true }, function (t) { cb(t && t[0]); }); }

settings(function (st) {
  $("on").checked = st.on;
  $("freq").value = st.freq;
  if (st.muteUntil > Date.now()) {
    $("unmute").hidden = false;
    $("status").textContent = "Quiet until " + new Date(st.muteUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
  }
});
$("on").onchange = function () { var v = this.checked; settings(function (st) { st.on = v; save(st); }); };
$("freq").onchange = function () { var v = this.value; settings(function (st) { st.freq = v; save(st); }); };
$("unmute").onclick = function () {
  settings(function (st) { st.muteUntil = 0; save(st); $("unmute").hidden = true; $("status").textContent = "They're allowed to talk again."; });
};
$("now").onclick = function () {
  activeTab(function (tab) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { ybht: "now" }, function () {
      if (chrome.runtime.lastError) $("status").textContent = "They can't talk on this page. Try a normal website, or reload it.";
      else window.close();
    });
  });
};
$("clear").onclick = function () { chrome.storage.local.set({ room: [] }); $("status").textContent = "Chat history cleared."; };
$("forget").onclick = function () { chrome.storage.local.remove(["leaves", "trail", "history", "records", "topics", "work", "closed", "advice", "patAt", "seen", "focusLog"]); $("status").textContent = "Forgotten: habits, history and today's trail. The chat itself is still there."; };
// hide or show the chat on the site you're on (the button says which)
var curHost = null;
function showHush(st) {
  var hid = curHost && st.hushed[curHost];
  $("hush").textContent = hid ? "Show the chat on this site again" : "Hide the chat on this site";
  if (hid) $("status").textContent = "The chat is hidden on " + curHost + ".";
}
activeTab(function (tab) {
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { ybht: "host" }, function (host) {
    if (chrome.runtime.lastError || !host) return;
    curHost = host; settings(showHush);
  });
});
$("hush").onclick = function () {
  activeTab(function (tab) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { ybht: "host" }, function (host) {
      if (chrome.runtime.lastError || !host) { $("status").textContent = "They don't talk on this page anyway."; return; }
      curHost = host;
      settings(function (st) {
        if (st.hushed[host]) { delete st.hushed[host]; save(st); $("status").textContent = "The chat is back on " + host + "."; }
        else { st.hushed[host] = true; save(st); $("status").textContent = "The chat is hidden on " + host + "."; }
        $("hush").textContent = st.hushed[host] ? "Show the chat on this site again" : "Hide the chat on this site";
      });
    });
  });
};
