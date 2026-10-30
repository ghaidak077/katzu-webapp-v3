/* Katzu admin panel — no framework, no CDN.
 *
 * Every value that comes from the Worker is written with textContent. Nothing
 * here builds markup from data: a conversation is text a learner typed, so it is
 * always displayed, never parsed.
 */

(function () {
  "use strict";

  var state = { view: "overview", drawerTurn: null, conversation: null };

  function $(id) { return document.getElementById(id); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === "text") node.textContent = props[key];
        else if (key === "className") node.className = props[key];
        else if (key === "dataset") Object.assign(node.dataset, props[key]);
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), props[key]);
        else if (props[key] !== null && props[key] !== undefined) node.setAttribute(key, props[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function toast(message, bad) {
    var node = $("toast");
    node.textContent = message;
    node.className = bad ? "toast bad" : "toast";
    node.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { node.hidden = true; }, 5000);
  }

  async function api(path, options) {
    var init = Object.assign({ credentials: "same-origin", headers: {} }, options || {});
    if (init.body && !init.headers["content-type"]) init.headers["content-type"] = "application/json";
    var response = await fetch("/api" + path, init);
    if (!response.ok) {
      var text = await response.text();
      var error = new Error(errorMessage(response.status, text));
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function apiJson(path, options) {
    return (await api(path, options)).json();
  }

  function errorMessage(status, text) {
    if (status === 401) return "Access session expired. Reload and sign in again.";
    if (status === 429) return "Rate limited. Wait a minute and retry.";
    try {
      var body = JSON.parse(text);
      if (body && body.error) return String(body.error).replace(/_/g, " ");
    } catch (ignored) { /* not JSON */ }
    return "Request failed (" + status + ")";
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return "—";
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : "—";
  }

  function pct(value) {
    if (value === null || value === undefined) return "—";
    return (Number(value) * 100).toFixed(1) + "%";
  }

  function ms(value) {
    if (value === null || value === undefined) return "—";
    return Math.round(Number(value)) + " ms";
  }

  function time(value) {
    if (!value) return "—";
    var parsed = Number(value);
    var date = Number.isFinite(parsed) ? new Date(parsed) : new Date(String(value));
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function text(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function card(label, value, hint, className) {
    return el("div", { className: "card" + (className ? " " + className : "") }, [
      el("div", { className: "label", text: label }),
      el("div", { className: "value", text: value }),
      hint ? el("div", { className: "hint", text: hint }) : null,
    ]);
  }

  function table(headers, rows, cells) {
    if (!rows || !rows.length) return el("div", { className: "empty", text: "No rows." });
    var head = el("tr", null, headers.map(function (header, index) {
      return el("th", { className: index === 0 ? "" : "", text: header });
    }));
    var body = el("tbody", null, rows.map(function (row) {
      return el("tr", null, cells(row).map(function (cell) {
        if (cell !== null && typeof cell === "object" && cell.nodeType) return el("td", null, [cell]);
        return el("td", { text: text(cell) });
      }));
    }));
    return el("table", null, [el("thead", null, [head]), body]);
  }

  function render(target, node) {
    var host = typeof target === "string" ? $(target) : target;
    clear(host);
    host.appendChild(node);
  }

  function badge(value, kind) {
    return el("span", { className: "badge" + (kind ? " " + kind : ""), text: value });
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  async function loadHealth() {
    try {
      var health = await apiJson("/health");
      var status = $("status");
      clear(status);
      status.appendChild(document.createTextNode("DB "));
      status.appendChild(badge(health.db === "ok" ? "ok" : "down", health.db === "ok" ? "ok" : "bad"));
      status.appendChild(document.createTextNode(" · logging "));
      status.appendChild(badge(health.logging_enabled ? "on" : "off", health.logging_enabled ? "warn" : "ok"));
      status.appendChild(document.createTextNode(" · " + text(health.release)));
      $("footer").textContent =
        "Retention: conversations " + num(health.retention_days && health.retention_days.conversations) +
        " days, events " + num(health.retention_days && health.retention_days.events) +
        " days. Token source: " + text(health.token_source) + ".";
      return health;
    } catch (error) {
      $("status").textContent = "Unavailable";
      toast(error.message, true);
      return null;
    }
  }

  async function loadOverview() {
    var data = await apiJson("/overview?hours=24");
    var cards = $("overview-cards");
    clear(cards);
    cards.appendChild(card("AI calls", num(data.ai.total), "last 24 h"));
    cards.appendChild(card("Success rate", pct(data.ai.success_rate), num(data.ai.ok) + " succeeded"));
    cards.appendChild(card("Avg latency", ms(data.ai.avg_latency_ms), "max " + ms(data.ai.max_latency_ms)));
    cards.appendChild(card("API errors", num(data.routes.errors), pct(data.routes.error_rate) + " of " + num(data.routes.total)));
    cards.appendChild(card("Conversation turns", num(data.conversations.turns), data.logging_enabled ? "text logging ON" : "text logging OFF"));
    cards.appendChild(card("Release", text(data.release), "worker"));

    render("overview-kinds", table(["Outcome", "Calls"], data.ai.by_kind, function (row) {
      return [row.kind, num(row.n)];
    }));
    render("overview-routes", table(["Route", "Calls"], data.ai.by_route, function (row) {
      return [row.route, num(row.n)];
    }));
    render("overview-providers", table(["Provider", "Calls"], data.ai.by_provider, function (row) {
      return [row.provider, num(row.n)];
    }));
  }

  async function loadAlerts() {
    var data = await apiJson("/alerts");
    var host = $("alert-cards");
    clear(host);
    if (!data.alerts || !data.alerts.length) {
      host.appendChild(el("div", { className: "empty", text: "No alert in the last hour." }));
      return;
    }
    data.alerts.forEach(function (alert) {
      host.appendChild(el("div", { className: "card alert " + alert.level }, [
        el("div", { className: "label", text: alert.code }),
        el("div", { className: "value", text: alert.message }),
        el("div", { className: "hint", text: "value " + num(alert.value) + " · " + alert.level }),
      ]));
    });
  }

  async function loadErrors() {
    var data = await apiJson("/errors?hours=24&limit=50");
    render("error-ai", table(["When", "Route", "Kind", "Status", "Provider", "Latency"], data.ai, function (row) {
      return [time(row.ts), row.route, row.kind, row.status, row.provider, ms(row.latency_ms)];
    }));
    render("error-routes", table(["When", "Route", "Method", "Status", "Latency"], data.routes, function (row) {
      return [time(row.ts), row.route, row.method, row.status, ms(row.latency_ms)];
    }));
    render("error-reports", table(["When", "Type", "Endpoint", "Message"], data.reports, function (row) {
      return [time(row.created_at), row.error_type, row.endpoint, row.message];
    }));
  }

  async function loadConversations() {
    var params = new URLSearchParams();
    var user = $("filter-user").value.trim();
    var scenario = $("filter-scenario").value.trim();
    var hours = $("filter-hours").value;
    if (user) params.set("user", user);
    if (scenario) params.set("scenario", scenario);
    if (hours) params.set("hours", hours);
    var data = await apiJson("/conversations?" + params.toString());
    $("conversation-mode").textContent = data.logging_enabled
      ? "Text logging is ON. Showing stored turns; 90-day retention."
      : "Text logging is OFF. This list is empty until the master switch is turned on; metrics continue.";
    render("conversation-rows", table(
      ["When", "User", "Scenario", "Outcome", "Preview", "Flags"],
      data.rows,
      function (row) {
        var open = el("button", {
          type: "button",
          text: "Open",
          onclick: function () { openConversation(row.turn_id); },
        });
        return [
          time(row.ts),
          row.user_id || "anonymous",
          row.scenario,
          row.outcome,
          row.learner_preview,
          el("span", null, [
            open,
            row.flagged ? el("span", { className: "badge warn", text: " flagged" }) : null,
          ]),
        ];
      },
    ));
  }

  async function openConversation(turnId) {
    state.drawerTurn = turnId;
    var drawer = $("drawer");
    drawer.hidden = false;
    $("drawer-title").textContent = "Conversation " + turnId;
    render("drawer-body", el("div", { className: "empty", text: "Loading…" }));
    try {
      var data = await apiJson("/conversations/" + encodeURIComponent(turnId));
      state.conversation = data.conversation;
      var row = data.conversation;
      var pairs = [
        ["When", time(row.ts) + (row.ts_local ? " (" + row.ts_local + ")" : "")],
        ["User", row.user_id || "anonymous"],
        ["Plan", row.plan],
        ["Scenario", row.scenario],
        ["Level", row.level],
        ["Outcome", row.outcome],
        ["Guard", row.guard],
        ["Provider", row.provider],
        ["Model", row.model],
        ["Latency", ms(row.latency_ms)],
        ["Flagged", row.flagged ? "yes" : "no"],
        ["Note", row.note],
        ["Redacted", row.redacted ? "yes" : "no"],
      ];
      var body = el("div", null, [
        el("dl", { className: "kv" }, pairs.map(function (pair) {
          return el("div", null, [
            el("dt", { text: pair[0] }),
            el("dd", { text: text(pair[1]) }),
          ]);
        })),
        el("h3", { text: "Learner" }),
        el("pre", { className: "block", text: text(row.learner_text) }),
        el("h3", { text: "Reply" }),
        el("pre", { className: "block", text: text(row.reply_text) }),
        el("h3", { text: "Corrections" }),
        el("pre", { className: "block", text: pretty(row.corrections) }),
        el("h3", { text: "Hints" }),
        el("pre", { className: "block", text: pretty(row.hints) }),
        el("h3", { text: "Word cards" }),
        el("pre", { className: "block", text: pretty(row.word_cards) }),
        el("h3", { text: "Attempts" }),
      ]);
      body.appendChild(table(["When", "Provider", "Model", "Kind", "Status", "Latency"], data.attempts, function (attempt) {
        return [time(attempt.ts), attempt.provider, attempt.model, attempt.kind, attempt.status, ms(attempt.latency_ms)];
      }));
      render("drawer-body", body);
      $("flag").disabled = false;
      $("clear-flag").disabled = false;
      $("delete").disabled = false;
    } catch (error) {
      render("drawer-body", el("div", { className: "empty", text: error.message }));
    }
  }

  function pretty(value) {
    if (value === null || value === undefined || value === "") return "—";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (ignored) {
      return String(value);
    }
  }

  function closeDrawer() {
    $("drawer").hidden = true;
    state.drawerTurn = null;
    state.conversation = null;
  }

  async function flag(flagged) {
    if (!state.drawerTurn) return;
    var note = "";
    if (flagged) {
      var answer = window.prompt("Note (optional)", "");
      if (answer === null) return;
      note = answer.slice(0, 500);
    }
    try {
      await apiJson("/conversations/" + encodeURIComponent(state.drawerTurn) + "/flag", {
        method: "POST",
        body: JSON.stringify({ flagged: flagged, note: note }),
      });
      toast(flagged ? "Flagged." : "Flag cleared.");
      await openConversation(state.drawerTurn);
      if (state.view === "conversations") loadView("conversations").catch(function () {});
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function removeConversation() {
    if (!state.drawerTurn) return;
    if (!window.confirm("Delete this stored conversation and its attempts? This cannot be undone.")) return;
    try {
      await apiJson("/conversations/" + encodeURIComponent(state.drawerTurn), { method: "DELETE" });
      toast("Deleted.");
      closeDrawer();
      loadView("conversations").catch(function () {});
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function exportConversations() {
    var hours = Number($("filter-hours").value) || 720;
    try {
      var response = await api("/export", { method: "POST", body: JSON.stringify({ hours: hours }) });
      var blob = await response.blob();
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "katzu-conversations-" + Date.now() + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
      toast("Export downloaded.");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function loadUsers() {
    var query = $("user-q").value.trim();
    var path = "/users" + (query ? "?q=" + encodeURIComponent(query) : "");
    var data = await apiJson(path);
    $("user-totals").textContent = "Total " + num(data.total) + " · Pro " + num(data.pro);
    render("user-rows", table(
      ["ID", "Email", "Plan", "Expires", "Last seen", "Platform", "Source", ""],
      data.rows,
      function (row) {
        var remove = el("button", {
          type: "button",
          className: "danger",
          text: "Delete conversations",
          onclick: function () {
            if (!window.confirm("Delete every stored conversation for " + (row.email || row.id) + "?")) return;
            apiJson("/users/" + encodeURIComponent(row.id) + "/conversations", { method: "DELETE" })
              .then(function () { toast("Deleted."); loadUsers(); })
              .catch(function (error) { toast(error.message, true); });
          },
        });
        return [row.id, row.email, row.plan, time(row.plan_expires_at), time(row.last_seen_at), row.platform, row.src, remove];
      },
    ));
  }

  async function loadContent() {
    var data = await apiJson("/content");
    var cards = $("content-cards");
    clear(cards);
    Object.keys(data.counts).forEach(function (name) {
      cards.appendChild(card(name.replace(/_/g, " "), num(data.counts[name]), "rows"));
    });
    render("content-recent", table(["Event", "Count"], data.recent_activity, function (row) {
      return [row.event_type, num(row.n)];
    }));
  }

  async function loadAudit() {
    var data = await apiJson("/audit?limit=200");
    render("audit-rows", table(["When", "Actor", "Action", "Target", "Meta"], data.rows, function (row) {
      return [time(row.ts), row.actor, row.action, row.target, row.meta];
    }));
  }

  async function loadView(view) {
    if (view === "overview") return loadOverview();
    if (view === "alerts") return loadAlerts();
    if (view === "errors") return loadErrors();
    if (view === "conversations") return loadConversations();
    if (view === "users") return loadUsers();
    if (view === "content") return loadContent();
    if (view === "audit") return loadAudit();
    return null;
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  function selectView(view) {
    state.view = view;
    document.querySelectorAll("nav.tabs button").forEach(function (button) {
      button.setAttribute("aria-selected", String(button.dataset.view === view));
    });
    document.querySelectorAll("section.view").forEach(function (section) {
      section.hidden = section.id !== "view-" + view;
    });
    loadHealth();
    loadView(view).catch(function (error) { toast(error.message, true); });
  }

  function wire() {
    document.querySelectorAll("nav.tabs button").forEach(function (button) {
      button.addEventListener("click", function () { selectView(button.dataset.view); });
    });

    $("refresh").addEventListener("click", function () {
      loadHealth();
      loadView(state.view).catch(function (error) { toast(error.message, true); });
    });

    $("conversation-filters").addEventListener("submit", function (event) {
      event.preventDefault();
      loadView("conversations").catch(function (error) { toast(error.message, true); });
    });
    $("user-search").addEventListener("click", function () {
      loadView("users").catch(function (error) { toast(error.message, true); });
    });
    $("user-q").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        loadView("users").catch(function (error) { toast(error.message, true); });
      }
    });
    $("export").addEventListener("click", exportConversations);
    $("drawer-close").addEventListener("click", closeDrawer);
    $("flag").addEventListener("click", function () { flag(true); });
    $("clear-flag").addEventListener("click", function () { flag(false); });
    $("delete").addEventListener("click", removeConversation);
    $("drawer").addEventListener("click", function (event) {
      if (event.target === $("drawer")) closeDrawer();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("drawer").hidden) closeDrawer();
    });

    $("provider-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var provider = $("provider-name").value;
      var enabled = $("provider-enabled").value === "true";
      if (!window.confirm((enabled ? "Enable " : "Disable ") + provider + "?")) return;
      apiJson("/providers/state", { method: "POST", body: JSON.stringify({ provider: provider, enabled: enabled }) })
        .then(function () { toast("Applied."); loadView("overview"); })
        .catch(function (error) { toast(error.message, true); });
    });
  }

  wire();
  selectView("overview");
})();
