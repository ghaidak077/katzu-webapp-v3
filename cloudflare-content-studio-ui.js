// ============================================================================
// CONTENT STUDIO — dashboard CSS, markup, and the table/form script
// ============================================================================
//
// These strings are injected into `renderAdminDashboardHtml` (cloudflare-admin.js)
// rather than written inline there for one practical reason: that function is a
// single large template literal, and this is the part of the dashboard that will
// change most. Keeping it here means the Content Studio can be edited without
// touching the shell at all.
//
// The browser-side code is split across this file and
// `cloudflare-content-studio-tools.js` because this repo's edit tool cannot reach
// past roughly 48 KB of a file (AGENTS.md section 8). Table/forms live here; the
// spreadsheet codec, bulk upload, export and Schema tab live there. They talk
// through one explicit namespace (`window.KatzuContentStudio`) rather than
// sharing implicit globals, so each half stays independently readable.
//
// The injected code follows the same ES5-style concatenation idiom as the shell it
// plugs into (no backticks, no interpolated placeholders in these strings, by
// construction) and every dynamic value goes through `el()`/`textContent`.
// `innerHTML` is only ever used to CLEAR a container — never to build markup from
// a DB value, a schema note, an error message or a preview cell.

export const CONTENT_STUDIO_CSS = `
  /* ---- Content Studio ---- */
  .cs-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .cs-tab { background: var(--panel); border: 1px solid var(--line); color: var(--muted);
    padding: 8px 14px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .cs-tab:hover { color: var(--text); border-color: var(--accent); }
  .cs-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .cs-tab .cs-count { margin-left: 8px; font-size: 11px; opacity: .8; }
  .cs-menu { position: absolute; right: 0; top: 100%; margin-top: 6px; background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 12px; padding: 6px; z-index: 40; min-width: 230px;
    box-shadow: 0 22px 44px rgba(0,0,0,.45); }
  .cs-menu button { display: block; width: 100%; text-align: left; background: transparent; border: 0;
    color: var(--text); padding: 9px 11px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .cs-menu button:hover { background: var(--panel); }
  .cs-rel { position: relative; }
  .cs-bulk { position: sticky; top: 8px; z-index: 30; display: flex; gap: 8px; align-items: center;
    flex-wrap: wrap; background: var(--panel-2); border: 1px solid var(--accent); border-radius: 12px;
    padding: 10px 12px; margin-bottom: 12px; }
  .cs-banner { border: 1px solid var(--err); background: rgba(232,155,155,.10); color: var(--err);
    border-radius: 12px; padding: 11px 13px; margin-bottom: 12px; font-size: 13px; display: flex;
    gap: 10px; align-items: center; flex-wrap: wrap; }
  .cs-banner.ok { border-color: var(--ok); background: rgba(127,217,168,.10); color: var(--ok); }
  .cs-wrap { overflow-x: auto; }
  .cs-skel { height: 12px; border-radius: 6px;
    background: linear-gradient(90deg, var(--panel-2), var(--line), var(--panel-2));
    background-size: 200% 100%; animation: cs-shimmer 1.3s infinite; }
  @keyframes cs-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
  td.cs-tight, th.cs-tight { width: 34px; }
  th.cs-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
  th.cs-sortable:hover { color: var(--text); }
  .cs-cell { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cs-modal-host { position: fixed; inset: 0; background: rgba(4,6,10,.72); z-index: 90;
    display: flex; align-items: flex-start; justify-content: center; padding: 28px 14px; overflow-y: auto; }
  .cs-modal { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; width: 100%;
    max-width: 640px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
  .cs-modal.wide { max-width: 980px; }
  .cs-modal-head { display: flex; align-items: center; gap: 10px; padding: 15px 18px;
    border-bottom: 1px solid var(--line); }
  .cs-modal-head h2 { margin: 0; font-size: 15px; }
  .cs-modal-body { padding: 16px 18px; }
  .cs-modal-foot { display: flex; gap: 8px; align-items: center; padding: 14px 18px;
    border-top: 1px solid var(--line); }
  .cs-field { margin-bottom: 12px; }
  .cs-field label { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px;
    color: var(--muted); font-weight: 700; margin-bottom: 5px; }
  .cs-field input, .cs-field select, .cs-field textarea { width: 100%; }
  .cs-field textarea { min-height: 74px; resize: vertical; }
  .cs-field .cs-note { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
  .cs-field .cs-req { color: var(--warn); margin-left: 5px; }
  .cs-subtabs { display: flex; gap: 6px; margin-bottom: 14px; }
  .cs-subtab { background: var(--panel-2); border: 1px solid var(--line); color: var(--muted);
    border-radius: 9px; padding: 7px 12px; cursor: pointer; font-size: 12.5px; font-weight: 600; }
  .cs-subtab.active { color: var(--text); border-color: var(--accent); }
  .cs-drop { border: 1.5px dashed var(--line); border-radius: 14px; padding: 26px 16px; text-align: center;
    color: var(--muted); font-size: 13px; cursor: pointer; }
  .cs-drop.hot { border-color: var(--accent); color: var(--text); background: rgba(139,111,232,.06); }
  .cs-hint { background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px;
    padding: 12px 13px; font-size: 12.5px; }
  .cs-hint h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
  .cs-hint ul { margin: 6px 0 0; padding-left: 18px; }
  .cs-hint li { margin: 3px 0; }
  .cs-preview { max-height: 210px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
  .cs-preview table { font-size: 12px; }
  .cs-preview th, .cs-preview td { white-space: nowrap; max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
  .cs-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .cs-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff; border-radius: 50%; animation: cs-spin .7s linear infinite; margin-right: 7px; }
  @keyframes cs-spin { to { transform: rotate(360deg) } }
  .cs-schema-card h3 { margin: 0; font-size: 14px; }
  .cs-schema-card .cs-meta { color: var(--muted); font-size: 12px; margin: 6px 0 12px; }
  .cs-schema-card td { vertical-align: top; }
  @media (max-width: 720px) {
    .cs-modal-host { padding: 10px 6px; }
    .cs-bulk { position: static; }
  }
`;

export const CONTENT_STUDIO_SECTIONS = `
    <!-- CONTENT STUDIO -->
    <section id="view-content" class="hidden">
      <div class="cs-tabs" id="cs-type-tabs"></div>
      <div class="card" style="margin-bottom:14px">
        <div class="row">
          <input id="cs-q" placeholder="Search…" style="min-width:190px">
          <select id="cs-level">
            <option value="">All levels</option>
            <option value="A1">A1</option><option value="A2">A2</option>
            <option value="B1">B1</option><option value="B2">B2</option>
          </select>
          <select id="cs-facet" class="hidden"></select>
          <div class="spacer"></div>
          <button class="btn primary" id="cs-add">+ Add Row</button>
          <button class="btn" id="cs-upload">Bulk Upload</button>
          <span class="cs-rel"><button class="btn" id="cs-export">Export &#9662;</button></span>
          <button class="btn" id="cs-refresh">Refresh</button>
        </div>
      </div>
      <div id="cs-bulk-host"></div>
      <div id="cs-banner"></div>
      <div class="card cs-wrap" style="padding:0">
        <table>
          <thead id="cs-thead"></thead>
          <tbody id="cs-tbody"></tbody>
        </table>
      </div>
      <div class="row" id="cs-pager" style="margin-top:12px"></div>
    </section>

    <!-- DATABASE SCHEMA -->
    <section id="view-schema" class="hidden">
      <div class="row" style="margin-bottom:14px">
        <div class="muted" style="font-size:12.5px" id="cs-schema-note"></div>
        <div class="spacer"></div>
        <button class="btn" id="cs-schema-download">Download schema.json</button>
        <button class="btn" id="cs-schema-refresh">Refresh</button>
      </div>
      <div id="cs-schema-cards" class="grid"></div>
    </section>
`;

export const CONTENT_STUDIO_UI_SCRIPT = `<script>
// The Content Studio's table, filters, single-row form and bulk field edit.
// Everything this half owns is exposed once, on window.KatzuContentStudio, for
// the tools half (bulk upload / export / Schema tab) and for the dashboard shell.
window.KatzuContentStudio = (function () {
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2"];
  // Curated table columns. The *form* and the *Schema tab* are generated from
  // DB_SCHEMA; the table is a reading choice, so it stays an explicit list.
  var TABLE_COLUMNS = {
    scenarios: ["id", "title_ar", "category", "ai_persona"],
    vocabulary: ["german", "translation_ar", "level", "topic"],
    grammar: ["id", "title_ar", "level"],
    starter_phrases: ["german", "translation_ar", "level", "scenario_id", "sort_order"]
  };
  var FACET = { scenarios: "category", vocabulary: "topic", starter_phrases: "scenario_id" };
  var PAGE_SIZES = [10, 25, 50, 100];

  var st = {
    type: "scenarios",
    schema: null,
    schemaGeneratedAt: "",
    counts: {},
    facets: {},
    rows: [],
    total: 0,
    limit: 25,
    offset: 0,
    q: "",
    level: "",
    facet: "",
    sort: null,
    dir: "asc",
    selected: {},
    loading: false,
    error: null
  };

  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // rawApi (the shell script) keeps the HTTP status, which this tab needs: a 400
  // carries the per-row validation report and a 409 means "already there".
  function studioApi(path, opts) { return rawApi(path, opts); }

  function loadSchema(force) {
    if (st.schema && !force) return Promise.resolve(st.schema);
    return studioApi("/admin/schema").then(function (res) {
      if (res.status !== 200) throw new Error("schema_" + res.status);
      st.schema = res.body.schema;
      st.counts = res.body.current_row_counts || {};
      st.schemaGeneratedAt = res.body.generated_at || "";
      return st.schema;
    });
  }

  function loadFacetValues() {
    var facet = FACET[st.type];
    if (!facet) return Promise.resolve([]);
    return studioApi("/admin/api/content-list?type=" + st.type + "&limit=200").then(function (res) {
      var seen = {};
      (res.body.rows || []).forEach(function (row) {
        var value = row[facet];
        if (value !== undefined && value !== null && String(value) !== "") seen[String(value)] = true;
      });
      return Object.keys(seen).sort();
    }).catch(function () { return []; });
  }

  // ---------- header and toolbar ----------

  function renderTabs() {
    var host = $("cs-type-tabs");
    clear(host);
    Object.keys(st.schema || {}).forEach(function (type) {
      var btn = el("button", "cs-tab" + (type === st.type ? " active" : ""), st.schema[type].label);
      btn.appendChild(el("span", "cs-count", "(" + (st.counts[type] === undefined ? "?" : st.counts[type]) + ")"));
      btn.onclick = function () { switchType(type); };
      host.appendChild(btn);
    });
  }

  function renderFacetOptions(values) {
    var select = $("cs-facet");
    var facet = FACET[st.type];
    if (!facet) { select.className = "hidden"; clear(select); return; }
    select.className = "";
    clear(select);
    var any = el("option", "", "All " + facet.replace("_", " ") + "s");
    any.value = "";
    select.appendChild(any);
    values.forEach(function (value) {
      var option = el("option", "", value);
      option.value = value;
      select.appendChild(option);
    });
    select.value = st.facet;
  }

  function switchType(type) {
    st.type = type;
    st.offset = 0;
    st.sort = null;
    st.selected = {};
    st.facet = "";
    st.error = null;
    renderTabs();
    loadFacetValues().then(function (values) {
      st.facets[type] = values;
      renderFacetOptions(values);
    });
    loadRows();
  }

  // ---------- table ----------

  function banner(message, ok, retry) {
    var host = $("cs-banner");
    clear(host);
    if (!message) return;
    var box = el("div", "cs-banner" + (ok ? " ok" : ""), message);
    if (retry) {
      var again = el("button", "btn", "Retry");
      again.onclick = retry;
      box.appendChild(again);
    }
    host.appendChild(box);
  }

  function skeletonRows() {
    var body = $("cs-tbody");
    clear(body);
    for (var i = 0; i < 5; i++) {
      var tr = el("tr");
      var td = el("td");
      td.colSpan = 99;
      var bar = el("div", "cs-skel");
      bar.style.width = (45 + i * 9) + "%";
      td.appendChild(bar);
      tr.appendChild(td);
      body.appendChild(tr);
    }
  }

  function label(column) {
    return column.replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function sortableTh(text, key) {
    var th = el("th", key ? "cs-sortable" : "", text);
    if (!key) return th;
    if (st.sort === key) th.appendChild(el("span", "muted", st.dir === "asc" ? " \\u25b2" : " \\u25bc"));
    th.onclick = function () {
      if (st.sort === key) st.dir = st.dir === "asc" ? "desc" : "asc";
      else { st.sort = key; st.dir = "asc"; }
      st.offset = 0;
      loadRows();
    };
    return th;
  }

  function renderTableHead() {
    var head = $("cs-thead");
    clear(head);
    var tr = el("tr");
    var checkAll = el("input");
    checkAll.type = "checkbox";
    checkAll.checked = pageIsFullySelected();
    checkAll.onchange = function () { selectAllOnPage(checkAll.checked); };
    var checkTh = el("th", "cs-tight");
    checkTh.appendChild(checkAll);
    tr.appendChild(checkTh);
    tr.appendChild(sortableTh("id", "id"));
    TABLE_COLUMNS[st.type].forEach(function (column) {
      if (column === st.schema[st.type].key.column) return;
      tr.appendChild(sortableTh(label(column), column));
    });
    tr.appendChild(el("th", "", ""));
    head.appendChild(tr);
  }

  function renderRows() {
    var body = $("cs-tbody");
    clear(body);
    renderTableHead();
    if (st.error) {
      var errTr = el("tr");
      var errTd = el("td", "muted", st.error);
      errTd.colSpan = 99;
      errTr.appendChild(errTd);
      body.appendChild(errTr);
      return;
    }
    if (!st.rows.length) {
      var emptyTr = el("tr");
      var emptyTd = el("td", "muted", "No rows match these filters.");
      emptyTd.colSpan = 99;
      emptyTr.appendChild(emptyTd);
      body.appendChild(emptyTr);
      return;
    }
    st.rows.forEach(function (row) {
      var tr = el("tr");
      var checkTd = el("td", "cs-tight");
      var check = el("input");
      check.type = "checkbox";
      check.checked = Boolean(st.selected[row.id]);
      check.onclick = function () { toggleSelect(row.id, check.checked); };
      checkTd.appendChild(check);
      tr.appendChild(checkTd);
      tr.appendChild(el("td", "mono cs-cell", row.id));
      TABLE_COLUMNS[st.type].forEach(function (column) {
        if (column === st.schema[st.type].key.column) return;
        var td = el("td", "cs-cell");
        if (column === "level") td.appendChild(el("span", "pill free", row[column] || "—"));
        else td.textContent = row[column] === null || row[column] === undefined ? "—" : String(row[column]);
        tr.appendChild(td);
      });
      var actions = el("td");
      actions.style.whiteSpace = "nowrap";
      var edit = el("button", "btn", "Edit");
      edit.onclick = function () { openRowModal(row); };
      var del = el("button", "btn danger", "Delete");
      del.style.marginLeft = "6px";
      del.onclick = function () { deleteRows([row.id], 1); };
      actions.appendChild(edit);
      actions.appendChild(del);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function renderPager() {
    var host = $("cs-pager");
    clear(host);
    var sizeSelect = el("select");
    PAGE_SIZES.forEach(function (size) {
      var option = el("option", "", String(size));
      option.value = String(size);
      if (size === st.limit) option.selected = true;
      sizeSelect.appendChild(option);
    });
    sizeSelect.onchange = function () { st.limit = Number(sizeSelect.value); st.offset = 0; loadRows(); };
    host.appendChild(sizeSelect);
    var prev = el("button", "btn", "Prev");
    prev.disabled = st.offset <= 0;
    prev.onclick = function () { st.offset = Math.max(0, st.offset - st.limit); loadRows(); };
    var next = el("button", "btn", "Next");
    next.disabled = st.offset + st.limit >= st.total;
    next.onclick = function () { st.offset = st.offset + st.limit; loadRows(); };
    host.appendChild(prev);
    host.appendChild(next);
    var from = st.total === 0 ? 0 : st.offset + 1;
    host.appendChild(el("span", "muted", "Showing " + from + "–" + (st.offset + st.rows.length) + " of " + st.total));
  }

  // ---------- selection ----------

  function pageIsFullySelected() {
    return st.rows.length > 0 && st.rows.every(function (row) { return st.selected[row.id]; });
  }
  function selectedIds() {
    return st.rows.map(function (row) { return row.id; }).filter(function (id) { return st.selected[id]; });
  }
  function toggleSelect(id, on) {
    if (on) st.selected[id] = true; else delete st.selected[id];
    renderBulkBar();
  }
  function selectAllOnPage(on) {
    st.rows.forEach(function (row) { if (on) st.selected[row.id] = true; else delete st.selected[row.id]; });
    renderRows();
    renderBulkBar();
  }
  function renderBulkBar() {
    var host = $("cs-bulk-host");
    clear(host);
    var ids = selectedIds();
    if (!ids.length) return;
    var bar = el("div", "cs-bulk");
    bar.appendChild(el("div", "", ids.length + " selected"));
    var edit = el("button", "btn", "Edit fields");
    edit.onclick = openBulkEditModal;
    var del = el("button", "btn danger", "Delete selected");
    del.onclick = function () { deleteRows(ids, ids.length); };
    var clearBtn = el("button", "btn", "Clear selection");
    clearBtn.onclick = function () { st.selected = {}; renderRows(); renderBulkBar(); };
    bar.appendChild(edit);
    bar.appendChild(del);
    bar.appendChild(clearBtn);
    host.appendChild(bar);
  }

  // ---------- loading ----------

  function loadRows() {
    st.loading = true;
    skeletonRows();
    var query = "/admin/api/content-list?type=" + encodeURIComponent(st.type) +
      "&limit=" + st.limit + "&offset=" + st.offset +
      (st.q ? "&q=" + encodeURIComponent(st.q) : "") +
      (st.level ? "&level=" + encodeURIComponent(st.level) : "") +
      (st.facet && FACET[st.type] ? "&" + FACET[st.type] + "=" + encodeURIComponent(st.facet) : "") +
      (st.sort ? "&sort=" + encodeURIComponent(st.sort) + "&dir=" + st.dir : "");
    return studioApi(query).then(function (res) {
      st.loading = false;
      if (res.status !== 200) {
        st.error = "Could not load " + st.type + " (HTTP " + res.status +
          (res.body && res.body.error ? " · " + res.body.error : "") + ").";
        st.rows = [];
        banner(st.error, false, function () { banner(""); loadRows(); });
      } else {
        st.error = null;
        st.rows = res.body.rows || [];
        st.total = Number(res.body.total || 0);
        st.counts[st.type] = st.total;
        banner("");
      }
      renderRows();
      renderPager();
      renderTabs();
      renderBulkBar();
    }).catch(function () {
      st.loading = false;
      st.error = "Content unavailable — the request did not complete.";
      renderRows();
    });
  }

  function refreshFacets() {
    if (!FACET[st.type]) return Promise.resolve();
    return loadFacetValues().then(function (values) {
      st.facets[st.type] = values;
      renderFacetOptions(values);
    });
  }

  // ---------- single row add / edit ----------

  function fieldControl(spec) {
    var control;
    if (spec.ui === "select" && spec.type === "level") {
      control = el("select");
      LEVELS.forEach(function (level) {
        var option = el("option", "", level);
        option.value = level;
        control.appendChild(option);
      });
    } else if (spec.ui === "select") {
      control = el("select");
      (spec.options || []).forEach(function (value) {
        var option = el("option", "", value === "" ? "(none)" : value);
        option.value = value;
        control.appendChild(option);
      });
    } else if (spec.ui === "textarea") {
      control = el("textarea");
    } else {
      control = el("input");
      if (spec.ui === "number") control.type = "number";
    }
    return control;
  }

  function openRowModal(row) {
    var meta = st.schema[st.type];
    var isEdit = Boolean(row);
    // On a text-id table the id is the row's address, not a field: it is shown
    // read-only and left out of the payload, because the server's column
    // allow-list excludes the key and would reject it rather than ignore it.
    var formColumns = meta.columns.filter(function (spec) {
      return !(isEdit && spec.name === meta.key.column);
    });

    var overlay = el("div", "cs-modal-host");
    var modal = el("div", "cs-modal");
    var head = el("div", "cs-modal-head");
    head.appendChild(el("h2", "", (isEdit ? "Edit " : "Add ") + st.type.replace(/_/g, " ")));
    head.appendChild(el("div", "spacer"));
    var close = el("button", "btn", "Close");
    close.onclick = function () { removeOverlay(overlay); };
    head.appendChild(close);
    modal.appendChild(head);

    var body = el("div", "cs-modal-body");
    if (isEdit) {
      var identity = el("div", "cs-field");
      identity.appendChild(el("label", "", (meta.key.column === "rowid" ? "rowid" : meta.key.column) + " (fixed)"));
      identity.appendChild(el("div", "mono", String(row.id)));
      body.appendChild(identity);
    }
    var controls = {};
    formColumns.forEach(function (spec) {
      var field = el("div", "cs-field");
      var lbl = el("label", "", label(spec.name));
      if (spec.required) lbl.appendChild(el("span", "cs-req", "*"));
      field.appendChild(lbl);
      var control = fieldControl(spec);
      var current = isEdit && row ? row[spec.name] : "";
      control.value = current === null || current === undefined ? "" : String(current);
      controls[spec.name] = control;
      field.appendChild(control);
      if (spec.note) field.appendChild(el("div", "cs-note", spec.note));
      body.appendChild(field);
    });
    modal.appendChild(body);

    var foot = el("div", "cs-modal-foot");
    var status = el("div", "muted", "");
    var save = el("button", "btn primary", isEdit ? "Save changes" : "Create row");
    var cancel = el("button", "btn", "Cancel");
    cancel.onclick = function () { removeOverlay(overlay); };
    foot.appendChild(status);
    foot.appendChild(el("div", "spacer"));
    foot.appendChild(cancel);
    foot.appendChild(save);
    modal.appendChild(foot);
    overlay.appendChild(modal);

    save.onclick = function () {
      var payload = {};
      var missing = [];
      formColumns.forEach(function (spec) {
        var value = controls[spec.name].value;
        if (spec.required && String(value).trim() === "") missing.push(spec.name);
        if (spec.ui === "number" && String(value).trim() !== "") payload[spec.name] = Number(value);
        else payload[spec.name] = value;
      });
      clear(status);
      if (missing.length) {
        // Fail fast on the obvious before spending a request; the server
        // re-validates everything regardless of what this sent.
        status.appendChild(el("span", "", "Required: " + missing.join(", ")));
        return;
      }
      save.disabled = true;
      status.appendChild(el("span", "cs-spin"));
      status.appendChild(el("span", "", "Saving…"));
      var request = isEdit
        ? studioApi("/admin/api/content-update", {
            method: "POST",
            body: JSON.stringify({ type: st.type, updates: [{ id: row.id, fields: payload }] })
          })
        : studioApi("/admin/api/content-create", { method: "POST", body: JSON.stringify({ type: st.type, row: payload }) });
      request.then(function (res) {
        save.disabled = false;
        if (res.status === 200 || res.status === 201) {
          removeOverlay(overlay);
          toast(isEdit ? "Row updated" : "Row created");
          refreshFacets();
          loadRows();
          return;
        }
        clear(status);
        var detail = (res.body && res.body.errors && res.body.errors.length) ? res.body.errors.join(" · ")
          : (res.body && (res.body.detail || res.body.error)) || ("HTTP " + res.status);
        status.appendChild(el("span", "", String(detail)));
      }).catch(function () {
        save.disabled = false;
        clear(status);
        status.appendChild(el("span", "", "Save failed — the request did not complete."));
      });
    };

    document.getElementById("drawer-host").appendChild(overlay);
  }

  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ---------- delete ----------

  function deleteRows(ids, count) {
    if (!ids.length) return;
    if (!window.confirm("Delete " + count + " row(s) from " + st.type + "? This cannot be undone.")) return;
    studioApi("/admin/api/content-delete", { method: "POST", body: JSON.stringify({ type: st.type, ids: ids }) })
      .then(function (res) {
        if (res.status !== 200) {
          toast("Delete failed — " + ((res.body && (res.body.detail || res.body.error)) || ("HTTP " + res.status)), true);
          return;
        }
        toast("Deleted " + res.body.deleted + " row(s)");
        st.selected = {};
        refreshFacets();
        loadRows();
      }).catch(function () { toast("Delete failed — the request did not complete.", true); });
  }

  // ---------- bulk field edit ----------

  function openBulkEditModal() {
    var ids = selectedIds();
    if (!ids.length) return;
    var facet = FACET[st.type];
    // Mass-editing every field to one value would be a data-loss footgun; these
    // are the columns where "same value for all selected" is actually a task.
    var editable = ["level"].concat(facet ? [facet] : []);

    var overlay = el("div", "cs-modal-host");
    var modal = el("div", "cs-modal");
    var head = el("div", "cs-modal-head");
    head.appendChild(el("h2", "", "Edit " + ids.length + " selected row(s)"));
    head.appendChild(el("div", "spacer"));
    var close = el("button", "btn", "Close");
    close.onclick = function () { removeOverlay(overlay); };
    head.appendChild(close);
    modal.appendChild(head);

    var body = el("div", "cs-modal-body");
    var controls = {};
    editable.forEach(function (column) {
      var field = el("div", "cs-field");
      field.appendChild(el("label", "", label(column)));
      var spec = st.schema[st.type].columns.filter(function (candidate) { return candidate.name === column; })[0];
      var control = fieldControl(spec || { name: column, ui: "text" });
      var any = el("option", "", "(no change)");
      any.value = "";
      control.insertBefore(any, control.firstChild);
      control.value = "";
      controls[column] = control;
      field.appendChild(control);
      body.appendChild(field);
    });
    body.appendChild(el("div", "muted", "Only these columns are mass-edited. For per-row values, use Edit on a row."));
    modal.appendChild(body);

    var foot = el("div", "cs-modal-foot");
    var status = el("div", "muted", "");
    var apply = el("button", "btn primary", "Apply");
    var cancel = el("button", "btn", "Cancel");
    cancel.onclick = function () { removeOverlay(overlay); };
    foot.appendChild(status);
    foot.appendChild(el("div", "spacer"));
    foot.appendChild(cancel);
    foot.appendChild(apply);
    modal.appendChild(foot);
    overlay.appendChild(modal);

    apply.onclick = function () {
      var fields = {};
      editable.forEach(function (column) {
        if (controls[column].value !== "") fields[column] = controls[column].value;
      });
      clear(status);
      if (!Object.keys(fields).length) {
        status.appendChild(el("span", "", "Pick at least one value to apply."));
        return;
      }
      apply.disabled = true;
      status.appendChild(el("span", "cs-spin"));
      status.appendChild(el("span", "", "Applying…"));
      studioApi("/admin/api/content-update", {
        method: "POST",
        body: JSON.stringify({
          type: st.type,
          updates: ids.map(function (id) { return { id: id, fields: fields }; })
        })
      }).then(function (res) {
        apply.disabled = false;
        if (res.status === 200) {
          removeOverlay(overlay);
          toast("Updated " + res.body.updated + " row(s)");
          st.selected = {};
          refreshFacets();
          loadRows();
          return;
        }
        clear(status);
        status.appendChild(el("span", "", String((res.body && (res.body.detail || res.body.error)) || ("HTTP " + res.status))));
      }).catch(function () {
        apply.disabled = false;
        clear(status);
        status.appendChild(el("span", "", "Update failed — the request did not complete."));
      });
    };

    document.getElementById("drawer-host").appendChild(overlay);
  }

  return {
    state: st,
    facetColumn: FACET,
    studioApi: studioApi,
    loadSchema: loadSchema,
    loadRows: loadRows,
    loadFacetValues: loadFacetValues,
    renderTabs: renderTabs,
    renderFacetOptions: renderFacetOptions,
    switchType: switchType,
    banner: banner,
    openRowModal: openRowModal,
    removeOverlay: removeOverlay,
    clear: clear
  };
})();
</script>`;
