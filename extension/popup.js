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
$("hush").onclick = function () {
  activeTab(function (tab) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { ybht: "host" }, function (host) {
      if (chrome.runtime.lastError || !host) { $("status").textContent = "They don't talk on this page anyway."; return; }
      settings(function (st) { st.hushed[host] = true; save(st); $("status").textContent = "The chat is hidden on " + host + "."; });
    });
  });
};
