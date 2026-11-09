(function () {
  "use strict";
  var PLUGIN_ID = "telegram.bot.manager";
  var CMD = "telegram-bots-open";
  var MAX = 7;
  var LS = "tgbots:list";

  var bots = [];
  try { bots = JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { bots = []; }
  var save = function () { localStorage.setItem(LS, JSON.stringify(bots)); if (typeof renderSide === "function") renderSide(); };
  var rt = {}; // bot id -> { running, gen, ctrl, log, err }
  var page = null, wrap = null, app = null, sideEl = null, iconStyle = null, sideMode = false, settingsList = null;
  bots.forEach(function (b, i) { if (b.slot == null) b.slot = i; });
  var view = { name: "list" };

  var CSS =
    ".tgb{height:100%;overflow:auto;background:#17212b;color:#e8eef3;font:15px system-ui,sans-serif}" +
    ".tgb *{box-sizing:border-box}" +
    ".tgb-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#242f3d;position:sticky;top:0;z-index:2}" +
    ".tgb-bar b{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
    ".tgb button{background:#2b95d6;color:#fff;border:0;border-radius:8px;padding:9px 13px;font-size:14px}" +
    ".tgb button.ghost{background:transparent;color:#8fb4d0}" +
    ".tgb button.red{background:#c0392b}.tgb button.green{background:#27a35a}" +
    ".tgb button:disabled{opacity:.5}" +
    ".tgb input,.tgb textarea{width:100%;padding:10px;margin:4px 0;border-radius:8px;border:1px solid #3a4a5c;background:#0e1621;color:#fff;font:15px system-ui,sans-serif}" +
    ".tgb textarea{min-height:60px;resize:vertical}" +
    ".tgb-pad{padding:14px}" +
    ".tgb-card{background:#1f2b38;border-radius:10px;padding:12px;margin:10px 0}" +
    ".tgb-row{display:flex;gap:8px;align-items:center}" +
    ".tgb-row>*{flex:1}.tgb-row>button{flex:none}" +
    ".tgb small{color:#8a9bab}" +
    ".tgb-err{color:#ff8a8a;min-height:18px;margin:6px 0}" +
    ".tgb-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#667}" +
    ".tgb-dot.on{background:#3ddc84}" +
    ".tgb-log div{padding:7px 0;border-bottom:1px solid #26323f;word-break:break-word}" +
    ".tgb-log .o{color:#8fd1ff}";

  function cfg() {
    try { return acode.require("settings").value[PLUGIN_ID] || {}; } catch (e) { return {}; }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(m) { if (window.toast) window.toast(m, 3500); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function byId(id) { return bots.filter(function (b) { return b.id === id; })[0]; }

  function api(token, method, body, signal) {
    return fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: signal
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.description || "Telegram API error");
      return j.result;
    });
  }

  function freeSlot() {
    for (var i = 0; i < MAX; i++) if (!bots.some(function (b) { return b.slot === i; })) return i;
    return -1;
  }
  function botAt(i) { return bots.filter(function (b) { return b.slot === i; })[0]; }

  async function addBot(options, slot) {
    options = options || {};
    var token = String(options.token || "").trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error("That doesn't look like a bot token.");
    var old = botAt(slot);
    if (bots.some(function (b) { return b.token === token && b !== old; })) throw new Error("Bot already added.");
    var type = options.type || (old && old.type) || "commands";
    var apiKey = String(options.apiKey || (old && old.apiKey) || "").trim();
    var apiUrl = String(options.apiUrl || (old && old.apiUrl) || "").trim();
    if (type === "google" && !apiKey) throw new Error("Enter your Google AI API key.");
    if (type === "url") {
      if (!apiUrl) throw new Error("Enter your AI API URL.");
      try { var parsedUrl = new URL(apiUrl); if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error(); }
      catch (e) { throw new Error("Enter a valid HTTP or HTTPS AI API URL."); }
    }
    var me = await api(token, "getMe");
    var cmds = [];
    if (type === "commands") { try { cmds = await api(token, "getMyCommands"); } catch (e) {} }
    if (old) { stop(old); bots = bots.filter(function (b) { return b !== old; }); delete rt[old.id]; }
    var nb = {
      id: me.id, token: token, username: me.username, name: me.first_name, offset: 0, slot: slot,
      type: type, apiKey: apiKey, apiUrl: apiUrl,
      commands: cmds.map(function (c) { return { command: c.command, description: c.description, reply: "" }; })
    };
    bots.push(nb);
    bots.sort(function (a, b) { return a.slot - b.slot; });
    save();
    return nb;
  }
  async function addToken(token, slot) { return addBot({ token: token, type: "commands" }, slot); }

  function syncSettingsList() {
    if (!settingsList) return;
    for (var i = 0; i < MAX; i++) {
      var b = botAt(i);
      settingsList[i].value = b ? b.token : "";
      settingsList[i].info = b ? "@" + b.username + " (clear the field to remove)" : "Paste a token from @BotFather";
    }
  }

  async function tokenFromSettings(slot, value) {
    value = String(value || "").trim();
    var old = botAt(slot);
    try {
      if (!value) {
        if (old) { stop(old); bots = bots.filter(function (b) { return b !== old; }); delete rt[old.id]; save(); toast("Removed @" + old.username); }
      } else if (!old || old.token !== value) {
        var nb = await addBot({ token: value, type: old && old.type || "commands", apiKey: old && old.apiKey, apiUrl: old && old.apiUrl }, slot);
        toast("Bot @" + nb.username + " added in slot " + (slot + 1));
      }
    } catch (e) { toast("Token " + (slot + 1) + ": " + e.message); }
    syncSettingsList();
    if (!sideMode) renderSide();
    if (app) render();
  }

  /* ---------- bot runtime (long polling) ---------- */
  function state(b) { return (rt[b.id] = rt[b.id] || { running: false, gen: 0, log: [], err: "" }); }

  // Build the GET URL for "chat?message=" style APIs. Returns "" when the URL is not of that style.
  function getUrlFor(url, text) {
    var enc = encodeURIComponent(text);
    if (/\{message\}/.test(url)) return url.replace(/\{message\}/g, enc);
    if (/[?&][\w.\-]+=(?=&|$)/.test(url)) return url.replace(/([?&][\w.\-]+=)(?=&|$)/, "$1" + enc);
    return "";
  }

  // Find the answer text in many common JSON reply shapes.
  function pickAnswer(j, depth) {
    depth = depth || 0;
    if (typeof j === "string") return j;
    if (!j || typeof j !== "object" || depth > 3) return "";
    if (Array.isArray(j)) { for (var a = 0; a < j.length; a++) { var x = pickAnswer(j[a], depth + 1); if (x) return x; } return ""; }
    if (j.choices && j.choices[0]) {
      var ch = j.choices[0], t = (ch.message && ch.message.content) || ch.text;
      if (Array.isArray(t)) t = t.map(function (part) { return part.text || ""; }).join("");
      if (typeof t === "string" && t) return t;
    }
    var keys = ["reply", "response", "answer", "message", "text", "output_text", "output", "result", "content", "data"];
    for (var i = 0; i < keys.length; i++) {
      var v = j[keys[i]];
      if (typeof v === "string" && v) return v;
      if (v && typeof v === "object") { var s2 = pickAnswer(v, depth + 1); if (s2) return s2; }
    }
    return "";
  }

  async function aiReply(b, prompt) {
    var response, data, answer;
    if (b.type === "google") {
      var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(b.apiKey);
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
      });
      data = await response.json();
      if (!response.ok) throw new Error((data.error && data.error.message) || "Google AI request failed (HTTP " + response.status + ")");
      answer = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join("").trim() : "";
    } else if (b.type === "url") {
      var getUrl = getUrlFor(b.apiUrl, prompt);
      if (getUrl) {
        response = await fetch(getUrl);
      } else {
        response = await fetch(b.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", message: prompt, prompt: prompt, text: prompt, messages: [{ role: "user", content: prompt }], temperature: 0.7 })
        });
      }
      var raw = await response.text();
      try { data = JSON.parse(raw); } catch (err) { data = null; }
      if (!response.ok) {
        var em = data && data.error && (data.error.message || data.error);
        throw new Error(typeof em === "string" ? em : "AI API request failed (HTTP " + response.status + ")");
      }
      answer = data === null ? raw : pickAnswer(data);
      answer = String(answer || "").trim();
    }
    if (!answer) throw new Error("The AI provider returned an empty reply.");
    return answer.slice(0, 4000);
  }

  async function handle(b, r, m) {
    var text = m.text || m.caption || "[non-text message]";
    var who = (m.from && m.from.first_name) || m.chat.title || "?";
    r.log.unshift({ chat: m.chat.id, who: who, text: text, out: false });
    var mm = /^\/([a-z0-9_]{1,32})(?:@(\w+))?(?:\s|$)/i.exec(m.text || "");
    if (m.from && m.from.is_bot) return;
    if (mm && (!mm[2] || mm[2].toLowerCase() === String(b.username).toLowerCase())) {
      var c = b.commands.filter(function (x) { return x.command === mm[1].toLowerCase(); })[0];
      var rtext = c ? c.reply : (cfg().unknownReply || "");
      if (rtext) {
        var out = rtext
          .replace(/\{first_name\}/g, (m.from && m.from.first_name) || "")
          .replace(/\{username\}/g, m.from && m.from.username ? "@" + m.from.username : "");
        try {
          await api(b.token, "sendMessage", { chat_id: m.chat.id, text: out });
          r.log.unshift({ chat: m.chat.id, who: "bot", text: out, out: true });
        } catch (e) { r.err = e.message; }
      }
    } else if (!mm && (b.type === "google" || b.type === "url") && text !== "[non-text message]") {
      try {
        var aiText = await aiReply(b, text);
        await api(b.token, "sendMessage", { chat_id: m.chat.id, text: aiText });
        r.log.unshift({ chat: m.chat.id, who: "bot", text: aiText, out: true });
      } catch (e) { r.err = e.message; }
    }
    if (r.log.length > 40) r.log.length = 40;
    if (view.name === "bot" && view.id === b.id) { renderLog(); renderStatus(); }
  }

  async function start(b) {
    var r = state(b);
    if (r.running) return;
    r.running = true; r.err = ""; r.gen++;
    var gen = r.gen;
    r.ctrl = new AbortController();
    try { await api(b.token, "deleteWebhook", {}); } catch (e) { r.err = e.message; }
    (async function loop() {
      while (r.running && r.gen === gen) {
        try {
          var ups = await api(b.token, "getUpdates",
            { offset: b.offset || 0, timeout: 25, allowed_updates: ["message"] }, r.ctrl.signal);
          for (var i = 0; i < ups.length; i++) {
            b.offset = ups[i].update_id + 1;
            if (ups[i].message) await handle(b, r, ups[i].message);
          }
          if (ups.length) save();
          if (r.err) { r.err = ""; renderStatus(); }
        } catch (e) {
          if (!r.running || r.gen !== gen) break;
          r.err = e.message; renderStatus();
          await sleep(4000);
        }
      }
    })();
    renderStatus();
  }

  function stop(b) {
    var r = state(b);
    r.running = false; r.gen++;
    if (r.ctrl) r.ctrl.abort();
    renderStatus();
  }

  /* ---------- views ---------- */
  function render() {
    if (!app) return;
    if (view.name === "add") return renderAdd();
    if (view.name === "bot" && byId(view.id)) return renderBot();
    view = { name: "list" }; renderList();
  }

  function renderList() {
    var h = '<div class="tgb-bar"><b>Telegram Bots (' + bots.length + "/" + MAX + ')</b>' +
      '<button id="add"' + (bots.length >= MAX ? " disabled" : "") + ">+ Add bot</button></div><div class=\"tgb-pad\">";
    if (!bots.length) h += "<p><small>No bots yet. Add a bot token from @BotFather.</small></p>";
    bots.forEach(function (b) {
      var on = state(b).running;
      var provider = b.type === "google" ? "Google AI" : (b.type === "url" ? "AI API URL" : "Commands");
      h += '<div class="tgb-card" data-id="' + b.id + '"><span class="tgb-dot' + (on ? " on" : "") + '"></span><b>' +
        esc(b.name) + "</b><br><small>@" + esc(b.username) + " · " + provider + " · " +
        (on ? "running" : "stopped") + "</small></div>";
    });
    app.innerHTML = h + "</div>";
    var add = app.querySelector("#add");
    if (add) add.onclick = function () { view = { name: "add" }; render(); };
    [].forEach.call(app.querySelectorAll(".tgb-card"), function (el) {
      el.onclick = function () { view = { name: "bot", id: parseInt(el.getAttribute("data-id"), 10) }; render(); };
    });
  }

  function renderAdd() {
    app.innerHTML = '<div class="tgb-bar"><button class="ghost" id="back">‹</button><b>Add bot</b></div>' +
      '<div class="tgb-pad"><label>Bot type<select id="type"><option value="commands">Telegram commands / replies</option><option value="google">Google AI (Gemini)</option><option value="url">AI API URL</option></select></label>' +
      '<p><small>All bot types need a Telegram bot token from @BotFather.</small></p>' +
      '<input id="tok" placeholder="Telegram bot token" autocomplete="off">' +
      '<div id="provider-fields"></div><div class="tgb-err" id="err"></div>' +
      '<button id="go">Log in</button></div>';
    app.querySelector("#back").onclick = function () { view = { name: "list" }; render(); };
    var providerFields = app.querySelector("#provider-fields");
    function updateProviderFields() {
      var type = app.querySelector("#type").value;
      if (type === "google") providerFields.innerHTML = '<input id="apikey" type="password" placeholder="Google AI API key" autocomplete="off"><small>Uses Google Gemini 2.5 Flash. The key is stored locally with this bot.</small>';
      else if (type === "url") providerFields.innerHTML = '<input id="apiurl" type="url" placeholder="https://example.com/api/chat?message=" autocomplete="url"><small>Paste your AI API URL. A URL ending in ?message= (or containing {message}) gets the user\'s text as a GET request. Any other URL gets a JSON POST. No separate API key needed.</small>';
      else providerFields.innerHTML = '<small>Configure commands and auto-replies after adding the bot.</small>';
    }
    app.querySelector("#type").onchange = updateProviderFields;
    updateProviderFields();
    app.querySelector("#go").onclick = async function () {
      var err = app.querySelector("#err"), btn = app.querySelector("#go");
      var slot = freeSlot();
      if (slot < 0) { err.textContent = "Maximum " + MAX + " bots."; return; }
      btn.disabled = true; err.textContent = "Checking…";
      try {
        var type = app.querySelector("#type").value;
        var nb = await addBot({
          token: app.querySelector("#tok").value,
          type: type,
          apiKey: type === "google" && app.querySelector("#apikey") ? app.querySelector("#apikey").value : "",
          apiUrl: type === "url" && app.querySelector("#apiurl") ? app.querySelector("#apiurl").value : ""
        }, slot);
        syncSettingsList();
        view = { name: "bot", id: nb.id }; render();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
  }

  function renderBot() {
    var b = byId(view.id), r = state(b);
    var h = '<div class="tgb-bar"><button class="ghost" id="back">‹</button><b>@' + esc(b.username) + '</b>' +
      '<button id="run"></button><button class="red" id="rm">Remove</button></div><div class="tgb-pad">' +
      '<div id="status"></div><h4>Commands</h4><div id="cmds">';
    b.commands.forEach(function (c, i) {
      h += '<div class="tgb-card"><div class="tgb-row"><input data-i="' + i + '" data-f="command" placeholder="command (no /)" value="' + esc(c.command) + '">' +
        '<button class="red" data-del="' + i + '">✕</button></div>' +
        '<input data-i="' + i + '" data-f="description" placeholder="Description (shown in menu)" value="' + esc(c.description) + '">' +
        '<textarea data-i="' + i + '" data-f="reply" placeholder="Auto-reply text. Use {first_name} or {username}">' + esc(c.reply) + "</textarea></div>";
    });
    h += '</div><div class="tgb-row"><button id="addc">+ Command</button><button class="green" id="pub">Save to Telegram</button></div>' +
      '<div class="tgb-err" id="err"></div><h4>Messages</h4><div class="tgb-log" id="log"></div>' +
      '<div id="replybox"></div></div>';
    app.innerHTML = h;

    app.querySelector("#back").onclick = function () { view = { name: "list" }; render(); };
    app.querySelector("#run").onclick = function () { state(b).running ? stop(b) : start(b); };
    app.querySelector("#rm").onclick = function () {
      if (!confirm("Remove @" + b.username + " from this plugin?")) return;
      stop(b);
      bots = bots.filter(function (x) { return x.id !== b.id; }); save();
      delete rt[b.id]; view = { name: "list" }; render();
    };
    [].forEach.call(app.querySelectorAll("[data-f]"), function (el) {
      el.oninput = function () {
        var f = el.getAttribute("data-f"), v = el.value;
        if (f === "command") v = v.replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
        b.commands[parseInt(el.getAttribute("data-i"), 10)][f] = v;
        if (f === "command" && el.value !== v) el.value = v;
        save();
      };
    });
    [].forEach.call(app.querySelectorAll("[data-del]"), function (el) {
      el.onclick = function () { b.commands.splice(parseInt(el.getAttribute("data-del"), 10), 1); save(); render(); };
    });
    app.querySelector("#addc").onclick = function () {
      if (b.commands.length >= 100) return toast("Telegram allows up to 100 commands.");
      b.commands.push({ command: "", description: "", reply: "" }); save(); render();
    };
    app.querySelector("#pub").onclick = async function () {
      var err = app.querySelector("#err");
      var list = b.commands.filter(function (c) { return c.command || c.description; });
      for (var i = 0; i < list.length; i++) {
        if (!/^[a-z0-9_]{1,32}$/.test(list[i].command)) { err.textContent = "Invalid command name (a-z, 0-9, _ , max 32)."; return; }
        if (!list[i].description.trim() || list[i].description.length > 256) { err.textContent = "/" + list[i].command + " needs a description (1-256 chars)."; return; }
      }
      err.textContent = "Saving…";
      try {
        await api(b.token, "setMyCommands", { commands: list.map(function (c) { return { command: c.command, description: c.description.trim() }; }) });
        err.textContent = ""; toast("Commands saved to Telegram");
      } catch (e) { err.textContent = e.message; }
    };
    renderStatus(); renderLog();
  }

  function renderStatus() {
    renderSide();
    if (!app) return;
    if (view.name === "list") return renderList();
    if (view.name !== "bot") return;
    var b = byId(view.id); if (!b) return;
    var r = state(b);
    var run = app.querySelector("#run"), st = app.querySelector("#status");
    if (!run || !st) return;
    run.textContent = r.running ? "Stop" : "Start";
    run.className = r.running ? "red" : "green";
    st.innerHTML = '<span class="tgb-dot' + (r.running ? " on" : "") + '"></span>' + (r.running ? "Running" : "Stopped") +
      (r.err ? '<div class="tgb-err">' + esc(r.err) + "</div>" : "");
  }

  function renderLog() {
    var b = byId(view.id); if (!b) return;
    if (!app) return;
    var r = state(b), el = app.querySelector("#log");
    if (!el) return;
    if (!r.log.length) { el.innerHTML = "<small>No messages yet. Start the bot and message it.</small>"; return; }
    el.innerHTML = r.log.map(function (m, i) {
      return '<div class="' + (m.out ? "o" : "") + '"><b>' + esc(m.who) + "</b>: " + esc(m.text) +
        (m.out ? "" : ' <button class="ghost" data-rep="' + i + '">Reply</button>') + "</div>";
    }).join("");
    [].forEach.call(el.querySelectorAll("[data-rep]"), function (btn) {
      btn.onclick = function () { replyBox(b, r.log[parseInt(btn.getAttribute("data-rep"), 10)]); };
    });
  }

  function replyBox(b, m) {
    var box = app.querySelector("#replybox");
    box.innerHTML = '<div class="tgb-card"><small>Reply to ' + esc(m.who) + '</small><textarea id="rt"></textarea>' +
      '<button id="rs">Send</button></div>';
    box.querySelector("#rs").onclick = async function () {
      var t = box.querySelector("#rt").value.trim(); if (!t) return;
      try {
        await api(b.token, "sendMessage", { chat_id: m.chat, text: t });
        state(b).log.unshift({ chat: m.chat, who: "bot", text: t, out: true });
        box.innerHTML = ""; renderLog();
      } catch (e) { toast(e.message); }
    };
  }

  /* ---------- sidebar ---------- */
  var SIDE_ID = "telegram-bots";
  var SIDE_ICON = "tgb-sidebar-icon";
  var SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#2b95d6' d='M21.9 3.4L2.6 10.8c-.8.3-.8 1.4 0 1.7l4.8 1.5 1.9 5.8c.2.6 1 .8 1.4.3l2.7-2.6 4.6 3.4c.6.4 1.4.1 1.6-.6l3-15.6c.2-.9-.7-1.6-1.7-1.3zM9 13.5l9-5.6-6.9 6.7-.3 3.1L9 13.5z'/></svg>";

  function injectIcon() {
    if (iconStyle) return;
    iconStyle = document.createElement("style");
    iconStyle.textContent =
      ".icon." + SIDE_ICON + "{background:center/22px 22px no-repeat url(\"data:image/svg+xml," + encodeURIComponent(SVG) + "\")!important}" +
      ".tgb-side{padding:10px;font-size:14px}.tgb-side button{width:100%;margin:6px 0;padding:9px;border:0;border-radius:6px;background:#2b95d6;color:#fff}" +
      ".tgb-side .b{padding:8px 0;border-bottom:1px solid rgba(128,128,128,.25)}" +
      ".tgb-side .d{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#889}.tgb-side .d.on{background:#3ddc84}";
    document.head.appendChild(iconStyle);
  }

  function renderSide() {
    if (!sideEl || sideMode) return;
    var h = '<div class="tgb-side"><b>Telegram Bots (' + bots.length + "/" + MAX + ")</b>";
    bots.forEach(function (b) {
      var on = state(b).running;
      h += '<div class="b"><span class="d' + (on ? " on" : "") + '"></span>@' + esc(b.username) + " · " + (on ? "running" : "stopped") +
        ' <button data-run="' + b.id + '">' + (on ? "Stop" : "Start") + "</button></div>";
    });
    if (!bots.length) h += "<p>No bots yet. Add tokens in the plugin settings or tap Open manager.</p>";
    h += '<button id="tgb-open">Open manager</button></div>';
    sideEl.innerHTML = h;
    sideEl.querySelector("#tgb-open").onclick = function () { setTimeout(open, 80); };
    [].forEach.call(sideEl.querySelectorAll("[data-run]"), function (btn) {
      btn.onclick = function () {
        var b = byId(parseInt(btn.getAttribute("data-run"), 10));
        if (!b) return;
        state(b).running ? stop(b) : start(b);
      };
    });
  }

  /* ---------- Acode glue ---------- */
  function open() {
    try { acode.require("sidebar").hide(); } catch (e) {}
    try { doOpen(); } catch (e) { openInSidebar(e); }
  }

  function doOpen() {
    sideMode = false;
    if (!page) {
      var P = acode.require("wcPage") || acode.require("page");
      page = P("Telegram Bots");
      wrap = document.createElement("div");
      wrap.className = "tgb";
      var style = document.createElement("style");
      style.textContent = CSS;
      app = document.createElement("div");
      wrap.appendChild(style); wrap.appendChild(app);
      page.body = wrap;
      page.onhide = function () { page = null; app = null; wrap = null; };
    }
    if (typeof page.show === "function") {
      page.show();
    } else if (!page.isConnected) {
      (document.getElementById("root") || document.body).appendChild(page);
      try {
        acode.require("actionStack").push({ id: "tgb-page", action: function () { if (page) page.hide(); } });
      } catch (e) {}
    }
    render();
  }

  // Fallback: if the page API is unavailable, show the whole manager inside the sidebar.
  function openInSidebar(err) {
    toast("Full page unavailable, using the sidebar.");
    console.error("Telegram Bots page error", err);
    if (!sideEl) return;
    sideMode = true;
    sideEl.innerHTML = "";
    wrap = document.createElement("div");
    wrap.className = "tgb";
    var style = document.createElement("style");
    style.textContent = CSS;
    app = document.createElement("div");
    wrap.appendChild(style); wrap.appendChild(app);
    sideEl.appendChild(wrap);
    try { acode.require("sidebar").show(); } catch (e) {}
    render();
  }

  if (window.acode) {
    var settingsDef;
    try {
      var st = acode.require("settings");
      if (!st.value[PLUGIN_ID]) { st.value[PLUGIN_ID] = { autostart: false, unknownReply: "" }; st.update(false); }
      var c0 = cfg();
      settingsList = [];
      for (var i = 0; i < MAX; i++) {
        settingsList.push({ key: "token" + (i + 1), text: "Bot token " + (i + 1), info: "", value: "", prompt: "Bot token " + (i + 1) + " (from @BotFather). Leave empty to remove.", promptType: "text" });
      }
      syncSettingsList();
      settingsDef = {
        list: settingsList.concat([
          { key: "autostart", text: "Auto-start bots when Acode opens", checkbox: !!c0.autostart },
          { key: "unknownReply", text: "Reply for unknown commands", info: "Sent when someone uses a command you have not defined. Leave empty to ignore.", value: c0.unknownReply || "", prompt: "Unknown command reply", promptType: "text" }
        ]),
        cb: function (key, value) {
          var m = /^token([1-7])$/.exec(key);
          if (m) { tokenFromSettings(parseInt(m[1], 10) - 1, value); return; }
          var s2 = acode.require("settings");
          s2.value[PLUGIN_ID] = s2.value[PLUGIN_ID] || {};
          s2.value[PLUGIN_ID][key] = value;
          s2.update(false);
        }
      };
    } catch (e) { settingsDef = undefined; }
    acode.setPluginInit(PLUGIN_ID, function () {
      injectIcon();
      try {
        acode.require("sidebarApps").add(SIDE_ICON, SIDE_ID, "Telegram Bots", function (el) { sideEl = el; renderSide(); }, false, renderSide);
      } catch (e) { console.error("Telegram Bots: sidebar unavailable", e); }
      editorManager.editor.commands.addCommand({ name: CMD, description: "Telegram Bots: Open", exec: function () { open(); } });
      if (cfg().autostart) bots.forEach(function (b) { start(b); });
    }, settingsDef);
    acode.setPluginUnmount(PLUGIN_ID, function () {
      editorManager.editor.commands.removeCommand(CMD);
      bots.forEach(stop);
      try { acode.require("sidebarApps").remove(SIDE_ID); } catch (e) {}
      if (iconStyle) { iconStyle.remove(); iconStyle = null; }
      if (page) { try { page.hide(); } catch (e) { if (page.remove) page.remove(); } }
    });
  }
})();
