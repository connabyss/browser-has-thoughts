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
