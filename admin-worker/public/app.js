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
      var body = null;
      try { body = JSON.parse(text); } catch (ignored) { body = null; }
      var message = body && Array.isArray(body.errors) && body.errors.length
        ? body.errors.join(" · ")
        : errorMessage(response.status, text);
      var error = new Error(message);
      error.status = response.status;
      error.body = body;
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

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  var content = {
    meta: null,
    type: "scenarios",
    status: "all",
    level: "",
    scenario: "",
    q: "",
    rows: [],
    counts: { rows: 0, drafts: 0, trash: 0 },
    editor: null,
    bundled: null,
    bundledKind: "opener",
    bundledQuery: "",
    reviews: {},
  };

  function contentMeta() {
    if (!content.meta) return null;
    for (var index = 0; index < content.meta.types.length; index += 1) {
      if (content.meta.types[index].type === content.type) return content.meta.types[index];
    }
    return null;
  }

  function contentSummary(row) {
    if (!row) return "—";
    if (content.type === "scenarios") return text(row.title_de || row.id) + " · " + text(row.title_ar);
    if (content.type === "vocabulary" || content.type === "starter_phrases") {
      return text(row.german) + " · " + text(row.translation_ar);
    }
    if (content.type === "grammar") return text(row.title_ar) + " · " + text(row.id);
    return text(row.id);
  }

  function actionButton(label, className, handler) {
    return el("button", { type: "button", className: className || "", text: label, onclick: handler });
  }

  async function ensureContentMeta() {
    if (content.meta) return content.meta;
    content.meta = await apiJson("/content/meta");
    var types = $("content-type");
    if (!types.options.length) {
      content.meta.types.forEach(function (entry) {
        types.appendChild(el("option", { value: entry.type, text: entry.label }));
      });
      var levels = $("content-level");
      content.meta.levels.forEach(function (level) {
        levels.appendChild(el("option", { value: level, text: level }));
      });
    }
    types.value = content.type;
    return content.meta;
  }

  async function loadContent() {
    await ensureContentMeta();
    var params = new URLSearchParams();
    if (content.status && content.status !== "all") params.set("status", content.status);
    if (content.level) params.set("level", content.level);
    if (content.scenario) params.set("scenario", content.scenario);
    if (content.q) params.set("q", content.q);
    var results = await Promise.all([
      apiJson("/content/" + content.type + "?" + params.toString()),
      apiJson("/content"),
    ]);
    var data = results[0];
    content.rows = data.rows || [];
    content.counts = data.counts || { rows: 0, drafts: 0, trash: 0 };
    renderContentCards();
    renderContentRows();
    render("content-recent", table(["Event", "Count"], results[1].recent_activity || [], function (row) {
      return [row.event_type, num(row.n)];
    }));
    loadContentBackups().catch(function () {});
    loadBundled().catch(function (error) {
      render("bundled-rows", el("div", { className: "empty", text: error.message }));
    });
  }

  function renderContentCards() {
    var cards = $("content-cards");
    clear(cards);
    cards.appendChild(card("Published rows", num(content.counts.rows), content.type));
    cards.appendChild(card("Drafts", num(content.counts.drafts), "not visible to learners"));
    cards.appendChild(card("In trash", num(content.counts.trash), "restorable"));
    var backup = content.meta && content.meta.last_backup;
    cards.appendChild(card(
      "Last backup",
      backup ? time(backup.ts) : "none",
      backup ? backup.backup_id + (backup.bookmark ? " · bookmark recorded" : " · no bookmark") : "the first write takes one",
    ));
    $("content-backup").textContent = backup
      ? "Latest backup " + backup.backup_id + (backup.bookmark ? " · Time Travel bookmark recorded" : "")
      : "No backup yet. The first write of the day creates one.";
  }

  function renderContentRows() {
    render("content-list", table(
      ["Status", "Row", "Level", "Draft", "Actions"],
      content.rows,
      function (entry) {
        var label = el("div", null, [
          el("div", { text: contentSummary(entry.row) }),
          el("div", { className: "mono muted", text: entry.key }),
        ]);
        var draft = entry.draft
          ? el("div", null, [
              badge(entry.draft.operation, "warn"),
              el("div", { className: "muted", text: time(entry.draft.updated_at) }),
              el("div", { className: "muted", text: (entry.diff || []).length + " field(s) changed" }),
            ])
          : el("span", { className: "muted", text: "—" });
        return [
          badge(
            entry.status,
            entry.status === "published" ? "ok" : entry.status === "draft" ? "warn" : "bad",
          ),
          label,
          text(entry.row.level),
          draft,
          el("div", { className: "actions" }, contentActions(entry)),
        ];
      },
    ));
  }

  function contentActions(entry) {
    var actions = [
      actionButton("Edit", "", function () { openContentEditor(entry.key); }),
      actionButton("History", "", function () { openContentHistory(entry.key); }),
    ];
    if (entry.status === "trash") {
      actions.push(actionButton("Restore", "primary", function () { restoreContent(entry); }));
      return actions;
    }
    if (entry.draft) {
      actions.push(actionButton("Publish", "primary", function () { publishContent(entry.key); }));
      actions.push(actionButton("Discard", "danger", function () { discardContent(entry.key); }));
    }
    actions.push(actionButton("Duplicate", "", function () { duplicateContent(entry.key); }));
    actions.push(actionButton("Delete", "danger", function () { deleteContent(entry.key); }));
    return actions;
  }

  function openContentEditor(key) {
    var meta = contentMeta();
    if (!meta) {
      toast("Content types are still loading.", true);
      return;
    }
    var entry = null;
    content.rows.forEach(function (row) {
      if (row.key === key) entry = row;
    });
    if (key && !entry) {
      toast("That row is not on this page. Search for it first.", true);
      return;
    }
    if (entry && entry.status === "trash") {
      toast("Restore this row before editing it.", true);
      return;
    }
    var base = entry ? entry.row : null;
    content.editor = {
      key: key || null,
      operation: entry && entry.published ? "update" : "create",
      draft: entry && entry.draft ? entry : null,
    };
    $("content-editor").hidden = false;
    $("content-editor-fields").hidden = false;
    $("content-editor-title").textContent = entry ? contentSummary(base) : "New " + meta.label.replace(/s$/, "");
    $("content-editor-hint").textContent = entry && entry.draft
      ? "A draft is pending. Learners still see the published row until you press Publish."
      : "Saving stores a draft. Nothing reaches a learner until you press Publish.";
    showContentErrors([]);
    clear($("content-diff"));
    clear($("content-history"));
    renderContentFields(base, meta, Boolean(entry && entry.published));
    $("content-save").hidden = false;
    $("content-publish").hidden = !(entry && entry.draft);
    $("content-discard").hidden = !(entry && entry.draft);
    if (entry && entry.diff && entry.diff.length) renderContentDiff(entry.diff);
    if (key) openContentHistory(key);
    if (typeof $("content-editor").scrollIntoView === "function") {
      $("content-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderContentFields(base, meta, editingExisting) {
    var host = $("content-editor-fields");
    clear(host);
    meta.columns.forEach(function (column) {
      var value =
        base && base[column.name] !== null && base[column.name] !== undefined ? String(base[column.name]) : "";
      var field;
      if (column.name === "level") {
        field = el("select", { id: "field-" + column.name });
        [""].concat(content.meta.levels).forEach(function (option) {
          field.appendChild(el("option", { value: option, text: option || "(empty)" }));
        });
        field.value = value;
      } else if (column.ui === "select" && column.options) {
        field = el("select", { id: "field-" + column.name });
        column.options.forEach(function (option) {
          field.appendChild(el("option", { value: option, text: option || "(empty)" }));
        });
        field.value = value;
      } else if (column.ui === "textarea") {
        field = el("textarea", { id: "field-" + column.name, rows: "3", spellcheck: "false" });
        field.value = value;
      } else {
        field = el("input", {
          id: "field-" + column.name,
          type: column.type === "integer" ? "number" : "text",
          autocomplete: "off",
        });
        field.value = value;
      }
      if (column.name === meta.key && meta.key !== "rowid" && editingExisting) field.disabled = true;
      if (/_ar$/.test(column.name)) {
        field.setAttribute("dir", "rtl");
        field.setAttribute("lang", "ar");
      }
      host.appendChild(el("label", { className: "field" }, [
        el("span", { text: column.name + (column.required ? " *" : "") }),
        field,
        el("small", { className: "muted", text: column.note || "" }),
      ]));
    });
  }

  function contentFieldValues(meta) {
    var row = {};
    meta.columns.forEach(function (column) {
      var field = $("field-" + column.name);
      if (field) row[column.name] = field.value;
    });
    return row;
  }

  function renderContentDiff(diff) {
    render("content-diff", el("div", null, [
      el("h3", { text: "Pending changes" }),
      table(["Field", "Published", "Draft"], diff, function (row) {
        return [row.column, text(row.before), text(row.after)];
      }),
    ]));
  }

  function showContentErrors(errors) {
    var host = $("content-editor-errors");
    clear(host);
    if (!errors || !errors.length) return;
    host.appendChild(el("div", { className: "empty bad", text: "Not saved:" }));
    host.appendChild(el("ul", { className: "errors" }, errors.map(function (message) {
      return el("li", { text: message });
    })));
  }

  async function saveContentDraft() {
    var meta = contentMeta();
    if (!meta || !content.editor) return;
    var body = { row: contentFieldValues(meta) };
    if (content.editor.key) body.key = content.editor.key;
    try {
      var result = await apiJson("/content/" + content.type + "/draft", {
        method: "POST",
        body: JSON.stringify(body),
      });
      showContentErrors([]);
      toast("Draft saved. Learners still see the published row.");
      content.meta = null;
      await loadContent();
      openContentEditor(result.draft.key);
    } catch (error) {
      showContentErrors(error.body && error.body.errors ? error.body.errors : [error.message]);
      toast("Draft not saved.", true);
    }
  }

  async function publishContent(key) {
    if (!window.confirm("Publish this draft? Learners see it immediately.")) return;
    try {
      await apiJson("/content/" + content.type + "/publish", {
        method: "POST",
        body: JSON.stringify({ key: key }),
      });
      toast("Published.");
      content.meta = null;
      closeContentEditor();
      await loadContent();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function publishAllContent() {
    if (!content.counts.drafts) {
      toast("No drafts for this type.");
      return;
    }
    if (!window.confirm("Publish " + content.counts.drafts + " draft(s) for " + content.type + "?")) return;
    try {
      var result = await apiJson("/content/" + content.type + "/publish-all", {
        method: "POST",
        body: JSON.stringify({}),
      });
      var failed = result.failed || [];
      toast(
        "Published " + num(result.published) + (failed.length ? ", " + failed.length + " failed." : "."),
        failed.length > 0,
      );
      content.meta = null;
      await loadContent();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function discardContent(key) {
    if (!window.confirm("Discard this draft? The published row stays exactly as it is.")) return;
    try {
      await apiJson("/content/" + content.type + "/discard", {
        method: "POST",
        body: JSON.stringify({ key: key }),
      });
      toast("Draft discarded.");
      content.meta = null;
      closeContentEditor();
      await loadContent();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function duplicateContent(key) {
    try {
      var result = await apiJson("/content/" + content.type + "/duplicate", {
        method: "POST",
        body: JSON.stringify({ key: key }),
      });
      toast("Copied as a draft. Publish it when the copy is ready.");
      content.meta = null;
      await loadContent();
      openContentEditor(result.draft.key);
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function deleteContent(key) {
    if (!window.confirm("Move this row to trash? It leaves the app immediately and can be restored from Trash.")) return;
    try {
      await apiJson("/content/" + content.type + "/delete", {
        method: "POST",
        body: JSON.stringify({ key: key }),
      });
      toast("Moved to trash. Restore it from the Trash filter.");
      content.meta = null;
      closeContentEditor();
      await loadContent();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function restoreContent(entry) {
    if (!entry.trash || !entry.trash.uid) {
      toast("No trash entry for this row.", true);
      return;
    }
    try {
      await apiJson("/content/" + content.type + "/restore", {
        method: "POST",
        body: JSON.stringify({ trash_uid: entry.trash.uid }),
      });
      toast("Restored exactly as it was.");
      content.meta = null;
      await loadContent();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function undoContent(auditUid) {
    if (!window.confirm("Undo this change and put the row back to its exact before-state?")) return;
    try {
      await apiJson("/content/" + content.type + "/undo", {
        method: "POST",
        body: JSON.stringify({ audit_uid: auditUid }),
      });
      toast("Undone.");
      content.meta = null;
      await loadContent();
      if (content.editor && content.editor.key) openContentHistory(content.editor.key);
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function openContentHistory(key) {
    if (!key) {
      render("content-history", el("div", { className: "empty", text: "History starts at the first saved draft." }));
      return;
    }
    var host = $("content-history");
    render(host, el("div", { className: "muted", text: "Loading history…" }));
    try {
      var data = await apiJson("/content/" + content.type + "/history?key=" + encodeURIComponent(key));
      render(host, el("div", null, [
        el("h3", { text: "History" }),
        table(["When", "Action", "Actor", "Note", ""], data.rows || [], function (row) {
          var undo = row.undoable
            ? actionButton("Undo", "danger", function () { undoContent(row.uid); })
            : el("span", { className: "muted", text: row.undone ? "undone" : "" });
          return [time(row.ts), row.action, row.actor, row.note || "—", undo];
        }),
      ]));
    } catch (error) {
      render(host, el("div", { className: "empty", text: error.message }));
    }
  }

  function closeContentEditor() {
    content.editor = null;
    $("content-editor").hidden = true;
    clear($("content-editor-fields"));
    clear($("content-editor-errors"));
    clear($("content-diff"));
    clear($("content-history"));
  }

  async function runContentImport(apply) {
    var source = $("content-import-text").value;
    if (!source.trim()) {
      toast("Paste CSV or JSON first.", true);
      return;
    }
    var body = {
      type: content.type,
      format: $("content-import-format").value,
      content: source,
      apply: apply,
    };
    try {
      var result = await apiJson("/content/import", { method: "POST", body: JSON.stringify(body) });
      renderImportResult(result, apply);
      if (apply) {
        content.meta = null;
        await loadContent();
      }
    } catch (error) {
      renderImportResult(error.body || { error: error.message }, apply);
      toast(apply ? "Import not applied." : "Dry run found errors.", true);
    }
  }

  function renderImportResult(result, applied) {
    var host = $("content-import-result");
    clear(host);
    if (result.error && result.total === undefined) {
      host.appendChild(el("div", { className: "empty bad", text: String(result.error).replace(/_/g, " ") }));
      return;
    }
    var line = result.applied
      ? "Applied as drafts. Nothing is live until you publish."
      : applied
        ? "Not applied."
        : "Dry run: nothing changed.";
    line += " Rows " + num(result.total) + " · valid " + num(result.valid) + " · invalid " + num(result.invalid) +
      " · creates " + num(result.creates) + " · updates " + num(result.updates);
    if (result.drafts !== undefined) line += " · drafts " + num(result.drafts);
    host.appendChild(el("p", { className: "muted", text: line }));
    if (result.errors && result.errors.length) {
      host.appendChild(el("ul", { className: "errors" }, result.errors.slice(0, 50).map(function (message) {
        return el("li", { text: message });
      })));
      if (result.errors.length > 50) {
        host.appendChild(el("p", { className: "muted", text: "…and " + (result.errors.length - 50) + " more." }));
      }
    }
  }

  async function loadContentBackups() {
    var data = await apiJson("/content/backup?list=1");
    render("content-backup-rows", table(["Backup", "Taken", "Tables", "Bookmark"], data.backups || [], function (row) {
      return [row.backup_id, time(row.ts), num(row.tables), row.bookmark ? "recorded" : "—"];
    }));
  }

  async function backupNow() {
    try {
      var result = await apiJson("/content/backup", { method: "POST", body: JSON.stringify({}) });
      toast("Backup written for " + result.backup_id + ".");
      content.meta = null;
      await ensureContentMeta();
      renderContentCards();
      await loadContentBackups();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function downloadFromApi(path, fallbackName) {
    var response = await api(path);
    var blob = await response.blob();
    var disposition = response.headers.get("content-disposition") || "";
    var match = /filename="([^"]+)"/.exec(disposition);
    var link = document.createElement("a");
    var href = URL.createObjectURL(blob);
    link.href = href;
    link.download = match ? match[1] : fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(href); }, 10000);
  }

  async function exportContent(format) {
    try {
      await downloadFromApi(
        "/content/" + content.type + "/export?format=" + format,
        "katzu-" + content.type + "." + format,
      );
      toast("Export downloaded.");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function exportCorrections() {
    try {
      await downloadFromApi(
        "/content/reviews/export?kind=" + content.bundledKind,
        "katzu-" + content.bundledKind + "-corrections.json",
      );
      toast("Corrections file downloaded. A build step imports it; production content was not touched.");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function loadBundled() {
    if (!content.bundled) {
      var response = await fetch("/bundled-content.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Bundled snapshot unavailable (" + response.status + ")");
      content.bundled = await response.json();
    }
    var data = await apiJson("/content/reviews?kind=" + content.bundledKind);
    content.reviews = {};
    (data.rows || []).forEach(function (review) {
      content.reviews[review.key] = review;
    });
    renderBundled();
  }

  function bundledEntries() {
    if (!content.bundled) return [];
    var entries = content.bundledKind === "opener"
      ? content.bundled.openers || []
      : content.bundled.glosses || [];
    var needle = content.bundledQuery.toLowerCase();
    var filtered = entries.filter(function (entry) {
      if (!needle) return true;
      if (String(entry.key).toLowerCase().indexOf(needle) !== -1) return true;
      if (String(entry.ar || "").toLowerCase().indexOf(needle) !== -1) return true;
      return String(entry.lemma || "").toLowerCase().indexOf(needle) !== -1;
    });
    var rank = { A0: 0, A1: 1, "": 2, A2: 2, B1: 3, B2: 4 };
    filtered.sort(function (left, right) {
      var a = rank[left.level] === undefined ? 5 : rank[left.level];
      var b = rank[right.level] === undefined ? 5 : rank[right.level];
      return a - b || String(left.key).localeCompare(String(right.key));
    });
    return filtered;
  }

  function renderBundled() {
    $("bundled-kind").value = content.bundledKind;
    var entries = bundledEntries();
    var visible = entries.slice(0, 80);
    $("bundled-count").textContent = entries.length + " entries" + (entries.length > visible.length ? ", showing first 80" : "");
    render("bundled-rows", table(
      ["Term", "Arabic", "Level", "Needs review", "Note", "Corrected Arabic", ""],
      visible,
      function (entry) {
        var existing = content.reviews[entry.key] || {};
        var flag = el("input", { type: "checkbox" });
        flag.checked = Boolean(existing.needs_review);
        var note = el("input", { type: "text", autocomplete: "off", size: "18" });
        note.value = existing.note || "";
        var corrected = el("input", { type: "text", autocomplete: "off", size: "18", lang: "ar", dir: "rtl" });
        corrected.value = existing.corrected_ar || "";
        return [
          el("div", { dir: "ltr", text: entry.key }),
          el("div", { dir: "rtl", text: entry.ar || "—" }),
          text(entry.level),
          flag,
          note,
          corrected,
          actionButton("Save", "", function () {
            saveReview(entry.key, flag.checked, note.value, corrected.value);
          }),
        ];
      },
    ));
  }

  async function saveReview(key, needsReview, note, corrected) {
    try {
      var saved = await apiJson("/content/reviews", {
        method: "POST",
        body: JSON.stringify({
          kind: content.bundledKind,
          key: key,
          needs_review: needsReview,
          note: note,
          corrected_ar: corrected,
        }),
      });
      content.reviews[key] = saved;
      toast("Review note saved. Bundled content itself is unchanged.");
    } catch (error) {
      toast(error.message, true);
    }
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

    // Content: filters reload the list; every mutation confirms first.
    function readContentFilters() {
      content.status = $("content-status").value;
      content.level = $("content-level").value;
      content.scenario = $("content-scenario").value.trim();
      content.q = $("content-q").value.trim();
    }
    function reloadContent() {
      loadContent().catch(function (error) { toast(error.message, true); });
    }

    $("content-type").addEventListener("change", function () {
      content.type = $("content-type").value;
      content.rows = [];
      closeContentEditor();
      reloadContent();
    });
    $("content-apply").addEventListener("click", function () {
      readContentFilters();
      reloadContent();
    });
    ["content-q", "content-scenario"].forEach(function (id) {
      $(id).addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          readContentFilters();
          reloadContent();
        }
      });
    });
    $("content-new").addEventListener("click", function () { openContentEditor(null); });
    $("content-publish-all").addEventListener("click", publishAllContent);
    $("content-export-csv").addEventListener("click", function () { exportContent("csv"); });
    $("content-export-json").addEventListener("click", function () { exportContent("json"); });
    $("content-editor-close").addEventListener("click", closeContentEditor);
    $("content-save").addEventListener("click", saveContentDraft);
    $("content-discard").addEventListener("click", function () {
      if (content.editor && content.editor.key) discardContent(content.editor.key);
    });
    $("content-publish").addEventListener("click", function () {
      if (content.editor && content.editor.key) publishContent(content.editor.key);
    });
    $("content-import-dry").addEventListener("click", function () { runContentImport(false); });
    $("content-import-apply").addEventListener("click", function () {
      if (!window.confirm("Apply these rows as drafts? Nothing goes live until you publish.")) return;
      runContentImport(true);
    });
    $("content-backup-now").addEventListener("click", backupNow);
    $("content-backup-download").addEventListener("click", function () {
      downloadFromApi("/content/backup", "katzu-content-backup.json").catch(function (error) {
        toast(error.message, true);
      });
    });
    $("bundled-apply").addEventListener("click", function () {
      content.bundledQuery = $("bundled-q").value.trim();
      renderBundled();
    });
    $("bundled-q").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        content.bundledQuery = $("bundled-q").value.trim();
        renderBundled();
      }
    });
    $("bundled-kind").addEventListener("change", function () {
      content.bundledKind = $("bundled-kind").value;
      content.reviews = {};
      loadBundled().catch(function (error) { toast(error.message, true); });
    });
    $("bundled-export").addEventListener("click", exportCorrections);
  }

  wire();
  selectView("overview");
})();
