# Your Browser Has Thoughts

Nine inner voices live in your browser. They only talk about true things your browser tells them: the time, your battery, how often you switch tabs, how long you sit still, how far your mouse has gone.

Every line comes with a receipt that names the browser fact it came from.

**Play:** https://connabyss.github.io/browser-has-thoughts/

## Privacy

Everything happens in your browser. The page makes no network requests. The only thing it keeps is a visit count in your own browser's local storage.

Made with Claude Code.

## The extension

`extension/` turns the voices into a small live chat room in the corner of every page (Chrome, Brave, Edge). As you browse, they talk to each other about what your browser can see: the page title, the GitHub repo or profile you're on, your search words, scrolling to the bottom, copying, tab hopping, time on a site, the hour. You can type to them and they answer. A "receipts" button shows where every line came from, "quiet" stops them for an hour, and the dash shrinks the room to a small button. The chat history is shared across tabs and keeps the last 80 messages.

It asks for one permission (`storage`) and runs on normal web pages. Everything it counts stays in your browser's own extension storage. It makes no network requests. Page titles, search words and what you type to the room are kept only in that same local storage.

To try it: open `chrome://extensions` (or `brave://extensions`), turn on Developer mode, press "Load unpacked" and pick the `extension` folder.
