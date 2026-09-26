// ============================================================================
// CONTENT STUDIO — tools half of the dashboard script
// ============================================================================
//
// This is the other half of `cloudflare-content-studio-ui.js` (see its header for
// why the browser script is split): the spreadsheet codec, the bulk upload /
// manage modal, the export menu, and the Database Schema tab. It reads the
// table/form half through `window.KatzuContentStudio`; nothing is shared
// implicitly between the two.
//
// The spreadsheet codec is hand-written rather than loaded from a CDN, and that is
// a deliberate trade. The dashboard holds the admin bearer token in
// sessionStorage, and its Content-Security-Policy is `default-src 'none'` with
// only `'unsafe-inline'` permitted — pulling in an external script would mean
// widening `script-src` to a third-party host, which is exactly the regression the
// admin hardening (cloudflare-admin.js, "Never weaken this gate") was written to
// prevent. The stack can already do the job without it: a store-only ZIP writer
// plus `DecompressionStream('deflate-raw')` for reading Excel's deflate, and a
// minimal OOXML writer using inline strings (so no sharedStrings part is needed).
// Generation is client-side, so no extra bytes reach the Worker bundle.
//
// Readers: plain `.xlsx`. The legacy binary `.xls` format is NOT supported and is
// refused with a clear message rather than mis-parsed.

export const CONTENT_STUDIO_TOOLS_SCRIPT = `<script>
(function () {
  "use strict";

  var CS = window.KatzuContentStudio;
  var XLSX_SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  var MAX_ROWS = 2000;

  function $(id) { return document.getElementById(id); }

  // ---------- spreadsheet codec: CRC32 + store-only ZIP ----------

  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function xmlUnescape(value) {
    return String(value)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\\d+);/g, function (match, digits) { return String.fromCharCode(Number(digits)); })
      .replace(/&amp;/g, "&");
  }

  function colName(index) {
    var name = "";
    var n = index;
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return name;
  }

  function colIndex(ref) {
    var letters = String(ref).replace(/[^A-Za-z]/g, "").toUpperCase();
    var value = 0;
    for (var i = 0; i < letters.length; i++) value = value * 26 + (letters.charCodeAt(i) - 64);
    return value - 1;
  }

  function u16(value) { return [value & 0xFF, (value >> 8) & 0xFF]; }
  function u32(value) { return [value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF]; }

  function zipWrite(files) {
    var chunks = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var nameBytes = utf8(file.name);
      var data = file.data;
      var crc = crc32(data);
      var local = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0));
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset });
      offset += local.length + nameBytes.length + data.length;
    });
    var centralChunks = [];
    var centralSize = 0;
    central.forEach(function (entry) {
      var header = [].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(entry.crc), u32(entry.size), u32(entry.size), u16(entry.nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(entry.offset));
      centralChunks.push(new Uint8Array(header), entry.nameBytes);
      centralSize += header.length + entry.nameBytes.length;
    });
    var end = [].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(central.length), u16(central.length),
      u32(centralSize), u32(offset), u16(0));
    var all = chunks.concat(centralChunks, [new Uint8Array(end)]);
    var total = all.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var cursor = 0;
    all.forEach(function (part) { out.set(part, cursor); cursor += part.length; });
    return out;
  }

  function readU16(bytes, at) { return bytes[at] | (bytes[at + 1] << 8); }
  function readU32(bytes, at) {
    return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  }

  function findEocd(bytes) {
    var floor = Math.max(0, bytes.length - 66000);
    for (var i = bytes.length - 22; i >= floor; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("this browser cannot decompress a .xlsx — use the JSON tab instead"));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
  }

  function zipRead(bytes) {
    var eocd = findEocd(bytes);
    if (eocd < 0) return Promise.reject(new Error("that file is not a .xlsx workbook (no zip directory found)"));
    var count = readU16(bytes, eocd + 10);
    var cursor = readU32(bytes, eocd + 16);
    var entries = [];
    for (var i = 0; i < count; i++) {
      var nameLength = readU16(bytes, cursor + 28);
      var extraLength = readU16(bytes, cursor + 30);
      var commentLength = readU16(bytes, cursor + 32);
      var method = readU16(bytes, cursor + 10);
      var compressedSize = readU32(bytes, cursor + 20);
      var localOffset = readU32(bytes, cursor + 42);
      var name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      var localNameLength = readU16(bytes, localOffset + 26);
      var localExtraLength = readU16(bytes, localOffset + 28);
      entries.push({ name: name, method: method, size: compressedSize, dataStart: localOffset + 30 + localNameLength + localExtraLength });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return Promise.all(entries.map(function (entry) {
      var raw = bytes.subarray(entry.dataStart, entry.dataStart + entry.size);
      if (entry.method === 0) return Promise.resolve({ name: entry.name, data: raw });
      if (entry.method === 8) return inflateRaw(raw).then(function (data) { return { name: entry.name, data: data }; });
      return Promise.reject(new Error("unsupported zip compression " + entry.method));
    }));
  }

  // ---------- xlsx writer ----------

  function sheetXml(rows) {
    var parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
    rows.forEach(function (row, rowIndex) {
      parts.push('<row r="' + (rowIndex + 1) + '">');
      row.forEach(function (value, columnIndex) {
        if (value === null || value === undefined || value === "") return;
        var ref = colName(columnIndex) + (rowIndex + 1);
        if (typeof value === "number" && isFinite(value)) {
          parts.push('<c r="' + ref + '"><v>' + value + '</v></c>');
        } else {
          parts.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>');
        }
      });
      parts.push('</row>');
    });
    parts.push('</sheetData></worksheet>');
    return parts.join("");
  }

  function xlsxWrite(sheets) {
    var safe = sheets.map(function (sheet, index) {
      var name = String(sheet.name).replace(/[^A-Za-z0-9 _-]/g, "_").slice(0, 31) || ("Sheet" + (index + 1));
      return { name: name, rows: sheet.rows };
    });
    var files = [];
    files.push({ name: "[Content_Types].xml", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      safe.map(function (sheet, index) {
        return '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join("") +
      '</Types>') });
    files.push({ name: "_rels/.rels", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') });
    files.push({ name: "xl/workbook.xml", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      safe.map(function (sheet, index) {
        return '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
      }).join("") +
      '</sheets></workbook>') });
    files.push({ name: "xl/_rels/workbook.xml.rels", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      safe.map(function (sheet, index) {
        return '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>';
      }).join("") +
      '</Relationships>') });
    safe.forEach(function (sheet, index) {
      files.push({ name: "xl/worksheets/sheet" + (index + 1) + ".xml", data: utf8(sheetXml(sheet.rows)) });
    });
    return zipWrite(files);
  }

  // ---------- xlsx reader ----------

  function cellText(xml, shared) {
    var type = (xml.match(/\\st="([^"]+)"/) || [])[1] || "n";
    if (type === "inlineStr") {
      var inline = xml.match(/<is>[\\s\\S]*?<t[^>]*>([\\s\\S]*?)<\\/t>/);
      return inline ? xmlUnescape(inline[1]) : "";
    }
    var value = xml.match(/<v>([\\s\\S]*?)<\\/v>/);
    if (!value) return "";
    if (type === "s") {
      var index = Number(value[1]);
      return shared[index] === undefined ? "" : shared[index];
    }
    return xmlUnescape(value[1]);
  }

  function parseSheet(xml, shared) {
    var rows = [];
    xml.split(/<row[ >]/).slice(1).forEach(function (block) {
      var cells = [];
      // Two alternatives, self-closing first. The first cannot match an opening tag
      // that merely ends in '>', so an inline-string cell's body is captured by the
      // second alternative instead of being skipped.
      var pattern = /<c[^>]*\\/>|<c[^>]*>[\\s\\S]*?<\\/c>/g;
      var match;
      var fallback = 0;
      while ((match = pattern.exec(block)) !== null) {
        var ref = (match[0].match(/\\sr="([A-Z]+\\d+)"/) || [])[1];
        var index = ref ? colIndex(ref) : fallback;
        fallback = index + 1;
        cells[index] = cellText(match[0], shared);
      }
      rows.push(cells);
    });
    return rows;
  }

  function parseSharedStrings(xml) {
    var strings = [];
    xml.split(/<si>/).slice(1).forEach(function (item) {
      var text = "";
      var pattern = /<t[^>]*>([\\s\\S]*?)<\\/t>/g;
      var match;
      while ((match = pattern.exec(item)) !== null) text += xmlUnescape(match[1]);
      strings.push(text);
    });
    return strings;
  }

  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buffer) {
      return zipRead(new Uint8Array(buffer));
    }).then(function (entries) {
      var byName = {};
      entries.forEach(function (entry) { byName[entry.name] = entry.data; });
      var decoder = new TextDecoder();
      var workbook = byName["xl/workbook.xml"] ? decoder.decode(byName["xl/workbook.xml"]) : "";
      if (!workbook) throw new Error("that file has no xl/workbook.xml — it is not a .xlsx workbook");
      var rels = byName["xl/_rels/workbook.xml.rels"] ? decoder.decode(byName["xl/_rels/workbook.xml.rels"]) : "";
      var shared = byName["xl/sharedStrings.xml"] ? parseSharedStrings(decoder.decode(byName["xl/sharedStrings.xml"])) : [];

      var targets = {};
      var relPattern = /<Relationship\\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      var relMatch;
      while ((relMatch = relPattern.exec(rels)) !== null) targets[relMatch[1]] = relMatch[2];

      var sheets = [];
      var sheetPattern = /<sheet\\s[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g;
      var sheetMatch;
      while ((sheetMatch = sheetPattern.exec(workbook)) !== null) {
        var target = targets[sheetMatch[2]] || "";
        var path = target.indexOf("/") === 0 ? target.slice(1) : ("xl/" + target.replace(/^\\.\\//, ""));
        var data = byName[path];
        sheets.push({ name: xmlUnescape(sheetMatch[1]), rows: data ? parseSheet(decoder.decode(data), shared) : [] });
      }
      if (!sheets.length) throw new Error("no worksheets found in that workbook");
      return sheets;
    });
  }

  /** Header row becomes the keys; blank rows are dropped rather than inserted. */
  function sheetToObjects(sheet) {
    var grid = sheet.rows || [];
    if (!grid.length) return { rows: [], headers: [] };
    var headers = (grid[0] || []).map(function (value) { return String(value === undefined ? "" : value).trim(); });
    var rows = [];
    for (var i = 1; i < grid.length; i++) {
      var cells = grid[i] || [];
      if (cells.every(function (value) { return value === undefined || String(value).trim() === ""; })) continue;
      var row = {};
      headers.forEach(function (header, index) {
        if (!header) return;
        var value = cells[index];
        row[header] = value === undefined ? "" : value;
      });
      rows.push(row);
    }
    return { rows: rows, headers: headers };
  }

  // ---------- download / export ----------

  function download(name, blob) {
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }

  /** Export column order comes from the schema, so it matches the Schema tab. */
  function toMatrix(type, rows) {
    var columns = CS.state.schema[type].columns.map(function (spec) { return spec.name; });
    var matrix = [["id"].concat(columns)];
    rows.forEach(function (row) {
      matrix.push([row.id].concat(columns.map(function (column) {
        var value = row[column];
        return value === null || value === undefined ? "" : value;
      })));
    });
    return matrix;
  }

  function exportFull(format) {
    CS.studioApi("/admin/export-all").then(function (res) {
      if (res.status !== 200) throw new Error("export_" + res.status);
      var payload = res.body;
      if (format === "json") {
        download("katzu-database-" + timestamp() + ".json",
          new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
        toast("Exported the full database as JSON");
        return;
      }
      var sheets = Object.keys(payload.data).map(function (type) {
        return { name: type, rows: toMatrix(type, payload.data[type]) };
      });
      download("katzu-database-" + timestamp() + ".xlsx",
        new Blob([xlsxWrite(sheets)], { type: XLSX_SHEET }));
      toast("Exported the full database as Excel");
    }).catch(function (err) {
      toast("Export failed — " + ((err && err.message) || "the request did not complete"), true);
    });
  }

  function exportTable(format) {
    CS.studioApi("/admin/api/content-list?type=" + CS.state.type + "&limit=200&offset=0").then(function (res) {
      if (res.status !== 200) throw new Error("list_" + res.status);
      var rows = res.body.rows || [];
      // Honest about the cap instead of shipping a file that looks complete.
      if (res.body.total > rows.length) {
        toast("This table has " + res.body.total + " rows; the single-table export covers the first 200. Use \\"Excel — full database\\".", true);
      }
      if (format === "json") {
        download("katzu-" + CS.state.type + "-" + timestamp() + ".json",
          new Blob([JSON.stringify({ type: CS.state.type, rows: rows }, null, 2)], { type: "application/json" }));
      } else {
        download("katzu-" + CS.state.type + "-" + timestamp() + ".xlsx",
          new Blob([xlsxWrite([{ name: CS.state.type, rows: toMatrix(CS.state.type, rows) }])], { type: XLSX_SHEET }));
      }
      toast("Exported " + CS.state.type);
    }).catch(function () { toast("Export failed — the request did not complete", true); });
  }

  function closeExportMenu() {
    var existing = document.getElementById("cs-export-menu");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function openExportMenu() {
    closeExportMenu();
    var anchor = $("cs-export").parentNode;
    var menu = el("div", "cs-menu");
    menu.id = "cs-export-menu";
    [["Excel — full database", function () { exportFull("xlsx"); }],
     ["JSON — full database", function () { exportFull("json"); }],
     ["Excel — this table only", function () { exportTable("xlsx"); }],
     ["JSON — this table only", function () { exportTable("json"); }]
    ].forEach(function (entry) {
      var button = el("button", "", entry[0]);
      button.onclick = function () { closeExportMenu(); entry[1](); };
      menu.appendChild(button);
    });
    anchor.appendChild(menu);
  }

  // ---------- bulk upload ----------

  var upload = { parsed: { rows: [], headers: [] }, sheets: [] };

  function schemaHint() {
    var meta = CS.state.schema[CS.state.type];
    var box = el("div", "cs-hint");
    box.appendChild(el("h3", "", "columns for " + meta.table));
    var required = meta.columns.filter(function (spec) { return spec.required; }).map(function (spec) { return spec.name; });
    var optional = meta.columns.filter(function (spec) { return !spec.required; }).map(function (spec) { return spec.name; });
    var list = el("ul");
    list.appendChild(el("li", "", "required: " + required.join(", ")));
    if (optional.length) list.appendChild(el("li", "", "optional: " + optional.join(", ")));
    list.appendChild(el("li", "", meta.dedupeNote));
    if (CS.state.type === "starter_phrases") list.appendChild(el("li", "", "scenario_id must exist in scenarios."));
    list.appendChild(el("li", "", "the first row must be the header row; an exported table can be re-uploaded unchanged."));
    box.appendChild(list);
    return box;
  }

  function renderPreview(host) {
    CS.clear(host);
    var headers = upload.parsed.headers;
    var rows = upload.parsed.rows;
    if (!rows.length) return;

    var meta = CS.state.schema[CS.state.type];
    var known = meta.columns.map(function (spec) { return spec.name; });
    var missing = meta.columns
      .filter(function (spec) { return spec.required; })
      .map(function (spec) { return spec.name; })
      .filter(function (name) { return headers.indexOf(name) === -1; });
    var unknown = headers.filter(function (header) { return header && known.indexOf(header) === -1; });

    if (missing.length) {
      host.appendChild(el("div", "cs-banner",
        "Missing required column(s): " + missing.join(", ") + " — that upload would skip every row."));
    }
    if (unknown.length) {
      host.appendChild(el("div", "cs-banner", "Ignored column(s) not in the schema: " + unknown.join(", ")));
    }

    var wrap = el("div", "cs-preview");
    var table = el("table");
    var thead = el("thead");
    var headRow = el("tr");
    ["id"].concat(headers).forEach(function (header) { headRow.appendChild(el("th", "", header)); });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el("tbody");
    rows.slice(0, 8).forEach(function (row) {
      var tr = el("tr");
      tr.appendChild(el("td", "muted", row.id === undefined ? "" : row.id));
      headers.forEach(function (header) {
        var value = row[header];
        tr.appendChild(el("td", "", value === undefined || value === null ? "" : String(value)));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
    host.appendChild(el("div", "muted",
      rows.length + " data row(s) parsed" + (rows.length > 8 ? " — showing the first 8" : "") + "."));
  }

  function sendUpload(rows, sync, syncConfirmed) {
    return CS.studioApi("/admin/upload", {
      method: "POST",
      body: JSON.stringify({ contentType: CS.state.type, rows: rows, sync: sync, syncConfirmed: syncConfirmed })
    });
  }

  function reportUpload(res, status, resultHost, overlay) {
    CS.clear(status);
    CS.clear(resultHost);
    if (res.status !== 200 || res.body.success !== true) {
      var detail = (res.body && res.body.errors && res.body.errors.length) ? res.body.errors.join(" · ")
        : (res.body && (res.body.detail || res.body.error)) || ("HTTP " + res.status);
      status.appendChild(el("span", "", "Upload rejected: " + detail));
      return;
    }
    resultHost.appendChild(el("div", "cs-banner ok",
      res.body.inserted + " inserted · " + res.body.updated + " updated · " + res.body.deleted + " deleted · " +
      res.body.skippedDuplicates + " duplicate(s) skipped · " + res.body.skippedInvalid + " invalid skipped"));
    if (res.body.errors && res.body.errors.length) {
      var list = el("ul");
      res.body.errors.forEach(function (message) { list.appendChild(el("li", "", message)); });
      if (res.body.errorsTruncated) list.appendChild(el("li", "muted", "+" + res.body.errorsTruncated + " more"));
      var box = el("div", "cs-hint");
      box.appendChild(el("h3", "", "row problems"));
      box.appendChild(list);
      resultHost.appendChild(box);
    }
    toast("Uploaded: " + res.body.count + " row(s) written");
    CS.removeOverlay(overlay);
    CS.loadSchema(true).then(function () { CS.renderTabs(); });
    CS.loadRows();
  }

  function handleFile(file, previewHost, sheetRow, sheetPicker) {
    if (!/\\.xlsx$/i.test(file.name)) {
      toast("Please choose a .xlsx workbook — the older .xls format is not supported.", true);
      return;
    }
    readWorkbook(file).then(function (sheets) {
      upload.sheets = sheets;
      CS.clear(sheetPicker);
      sheets.forEach(function (sheet, index) {
        var option = el("option", "", sheet.name + " (" + Math.max(0, sheet.rows.length - 1) + " rows)");
        option.value = String(index);
        sheetPicker.appendChild(option);
      });
      sheetRow.className = sheets.length > 1 ? "cs-bar" : "cs-bar hidden";
      upload.parsed = sheetToObjects(sheets[0]);
      renderPreview(previewHost);
      if (!upload.parsed.rows.length) toast("No data rows found in that workbook.", true);
    }).catch(function (err) {
      upload.parsed = { rows: [], headers: [] };
      renderPreview(previewHost);
      toast((err && err.message) ? err.message : "Could not read that workbook.", true);
    });
  }

  function openUploadModal() {
    upload = { parsed: { rows: [], headers: [] }, sheets: [] };
    var overlay = el("div", "cs-modal-host");
    var modal = el("div", "cs-modal wide");
    var head = el("div", "cs-modal-head");
    head.appendChild(el("h2", "", "Bulk upload into " + CS.state.type));
    head.appendChild(el("div", "spacer"));
    var close = el("button", "btn", "Close");
    close.onclick = function () { CS.removeOverlay(overlay); };
    head.appendChild(close);
    modal.appendChild(head);

    var body = el("div", "cs-modal-body");
    var previewHost = el("div");
    previewHost.style.marginTop = "14px";

    var subtabs = el("div", "cs-subtabs");
    var excelTab = el("button", "cs-subtab active", "Excel (.xlsx)");
    var jsonTab = el("button", "cs-subtab", "Paste JSON");
    subtabs.appendChild(excelTab);
    subtabs.appendChild(jsonTab);
    body.appendChild(subtabs);

    var excelPane = el("div");
    var sheetRow = el("div", "cs-bar hidden");
    var sheetPicker = el("select");
    sheetPicker.onchange = function () {
      var sheet = upload.sheets[Number(sheetPicker.value)];
      if (sheet) { upload.parsed = sheetToObjects(sheet); renderPreview(previewHost); }
    };
    sheetRow.appendChild(el("span", "muted", "Sheet:"));
    sheetRow.appendChild(sheetPicker);
    var drop = el("div", "cs-drop", "Drag an .xlsx file here, or click to choose one");
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".xlsx";
    fileInput.style.display = "none";
    drop.onclick = function () { fileInput.click(); };
    drop.ondragover = function (ev) { ev.preventDefault(); drop.className = "cs-drop hot"; };
    drop.ondragleave = function () { drop.className = "cs-drop"; };
    drop.ondrop = function (ev) {
      ev.preventDefault();
      drop.className = "cs-drop";
      if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]) {
        handleFile(ev.dataTransfer.files[0], previewHost, sheetRow, sheetPicker);
      }
    };
    fileInput.onchange = function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0], previewHost, sheetRow, sheetPicker);
    };
    excelPane.appendChild(drop);
    excelPane.appendChild(fileInput);
    excelPane.appendChild(sheetRow);
    body.appendChild(excelPane);

    var jsonPane = el("div", "hidden");
    var textarea = el("textarea");
    textarea.style.width = "100%";
    textarea.style.minHeight = "170px";
    textarea.placeholder = '[{ "german": "…", "level": "A1", "topic": "documents" }]';
    var parseJson = el("button", "btn", "Preview JSON");
    parseJson.onclick = function () {
      try {
        var parsed = JSON.parse(textarea.value);
        var rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.rows) ? parsed.rows : null);
        if (!rows) throw new Error("expected a JSON array of row objects");
        upload.parsed = { rows: rows, headers: Object.keys(rows[0] || {}) };
        renderPreview(previewHost);
      } catch (err) {
        upload.parsed = { rows: [], headers: [] };
        renderPreview(previewHost);
        toast("JSON: " + ((err && err.message) || "could not parse"), true);
      }
    };
    jsonPane.appendChild(textarea);
    jsonPane.appendChild(el("div", "muted", "Paste an array of row objects — a full-database JSON export also works."));
    jsonPane.appendChild(parseJson);
    body.appendChild(jsonPane);

    excelTab.onclick = function () {
      excelTab.className = "cs-subtab active";
      jsonTab.className = "cs-subtab";
      excelPane.className = "";
      jsonPane.className = "hidden";
    };
    jsonTab.onclick = function () {
      jsonTab.className = "cs-subtab active";
      excelTab.className = "cs-subtab";
      jsonPane.className = "";
      excelPane.className = "hidden";
    };

    body.appendChild(previewHost);
    var hintWrap = el("div");
    hintWrap.style.marginTop = "14px";
    hintWrap.appendChild(schemaHint());
    body.appendChild(hintWrap);

    var syncRow = el("label", "cs-bar");
    syncRow.style.marginTop = "14px";
    var syncCheck = el("input");
    syncCheck.type = "checkbox";
    syncRow.appendChild(syncCheck);
    syncRow.appendChild(el("span", "",
      "Sync mode — also deletes rows not present in this upload (only safe with a full table export)."));
    body.appendChild(syncRow);

    var resultHost = el("div");
    resultHost.style.marginTop = "12px";
    body.appendChild(resultHost);
    modal.appendChild(body);

    var foot = el("div", "cs-modal-foot");
    var status = el("div", "muted", "");
    var send = el("button", "btn primary", "Upload");
    var cancel = el("button", "btn", "Cancel");
    cancel.onclick = function () { CS.removeOverlay(overlay); };
    foot.appendChild(status);
    foot.appendChild(el("div", "spacer"));
    foot.appendChild(cancel);
    foot.appendChild(send);
    modal.appendChild(foot);
    overlay.appendChild(modal);

    send.onclick = function () {
      if (!upload.parsed.rows.length) {
        toast("Nothing parsed yet — choose a file or preview the JSON first.", true);
        return;
      }
      if (upload.parsed.rows.length > MAX_ROWS) {
        toast("That is " + upload.parsed.rows.length + " rows; the limit is " + MAX_ROWS + ". Split it.", true);
        return;
      }
      send.disabled = true;
      CS.clear(status);
      status.appendChild(el("span", "cs-spin"));
      status.appendChild(el("span", "", "Uploading…"));
      sendUpload(upload.parsed.rows, syncCheck.checked, false).then(function (res) {
        // Sync mode's first call never deletes: the worker answers with the count
        // and a sample, and only an explicit confirmation writes.
        if (res.status === 200 && res.body.requiresSyncConfirmation) {
          var confirmed = window.confirm(
            "Sync mode would delete " + res.body.wouldDelete + " existing row(s) from " + CS.state.type + ".\\n\\n" +
            "Sample: " + (res.body.sampleDeleteIds || []).join(", ") + "\\n\\nDelete them and continue?"
          );
          if (!confirmed) {
            send.disabled = false;
            CS.clear(status);
            status.appendChild(el("span", "", "Sync cancelled — nothing was written."));
            return;
          }
          CS.clear(status);
          status.appendChild(el("span", "cs-spin"));
          status.appendChild(el("span", "", "Applying with deletions…"));
          sendUpload(upload.parsed.rows, true, true).then(function (second) {
            send.disabled = false;
            reportUpload(second, status, resultHost, overlay);
          }).catch(function () {
            send.disabled = false;
            CS.clear(status);
            status.appendChild(el("span", "", "Upload failed — the request did not complete."));
          });
          return;
        }
        send.disabled = false;
        reportUpload(res, status, resultHost, overlay);
      }).catch(function () {
        send.disabled = false;
        CS.clear(status);
        status.appendChild(el("span", "", "Upload failed — the request did not complete."));
      });
    };

    document.getElementById("drawer-host").appendChild(overlay);
    renderPreview(previewHost);
  }

  // ---------- Schema tab ----------

  function renderSchemaTab() {
    var host = $("cs-schema-cards");
    CS.clear(host);
    var schema = CS.state.schema;
    if (!schema) return;
    $("cs-schema-note").textContent =
      "Generated " + (CS.state.schemaGeneratedAt || "just now") +
      ". This is the same object the upload validator uses — download it to hand an AI agent the exact column contract.";
    Object.keys(schema).forEach(function (type) {
      var meta = schema[type];
      var card = el("div", "card cs-schema-card");
      card.appendChild(el("h3", "", meta.label + " · " + meta.table));
      card.appendChild(el("div", "cs-meta",
        meta.columns.length + " columns · " + (CS.state.counts[type] === undefined ? "?" : CS.state.counts[type]) +
        " rows live · keyed by " + meta.key.column + " (" + meta.dedupe + ")"));
      var table = el("table");
      var thead = el("thead");
      var headRow = el("tr");
      ["Column", "Type", "Required", "Note"].forEach(function (text) { headRow.appendChild(el("th", "", text)); });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = el("tbody");
      meta.columns.forEach(function (spec) {
        var tr = el("tr");
        tr.appendChild(el("td", "mono", spec.name));
        tr.appendChild(el("td", "muted", spec.type));
        var required = el("td", "muted");
        required.appendChild(spec.required ? el("span", "", "yes") : el("span", "pill free", "optional"));
        tr.appendChild(required);
        var note = el("td", "muted", spec.note || "");
        note.style.whiteSpace = "normal";
        tr.appendChild(note);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      card.appendChild(table);
      card.appendChild(el("div", "muted", meta.dedupeNote));
      host.appendChild(card);
    });
  }

  function loadSchemaTab() {
    CS.loadSchema(true).then(function () {
      renderSchemaTab();
    }).catch(function () {
      $("cs-schema-note").textContent = "Schema unavailable — check the admin secret.";
    });
  }

  function downloadSchema() {
    CS.loadSchema().then(function (schema) {
      download("katzu-schema.json", new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" }));
      toast("Downloaded schema.json");
    }).catch(function () { toast("Could not load the schema", true); });
  }

  // ---------- tab entry points and wiring ----------

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function studioShowContent() {
    CS.loadSchema().then(function () {
      CS.renderTabs();
      var type = CS.state.type;
      if (!CS.facetColumn[type]) {
        CS.renderFacetOptions([]);
      } else if (!CS.state.facets[type]) {
        CS.loadFacetValues().then(function (values) {
          CS.state.facets[type] = values;
          CS.renderFacetOptions(values);
        });
      } else {
        CS.renderFacetOptions(CS.state.facets[type]);
      }
      CS.loadRows();
    }).catch(function () {
      CS.banner("Could not load the content schema — check the admin secret.", false, studioShowContent);
    });
  }

  function refreshFor(tab) {
    if (tab === "content") studioShowContent();
    else if (tab === "schema") loadSchemaTab();
  }

  // The dashboard shell calls this from refreshTab(); one hook, so the shell does
  // not need to know anything about the studio's internals.
  window.studioRefresh = refreshFor;

  // ---------- registering with the dashboard shell ----------

  var TABS = ["overview", "users", "activity", "errors", "licenses", "content", "schema"];
  var TITLES = {
    content: ["Content Studio", "Add, edit, bulk-upload and export the curriculum stored in D1."],
    schema: ["Database Schema", "The D1 column contract every upload is validated against."]
  };

  function activateView(tab, setTitle) {
    TABS.forEach(function (id) {
      var view = $("view-" + id);
      var navBtn = $("nav-" + id);
      if (view) view.className = id === tab ? "" : "hidden";
      if (navBtn) navBtn.className = id === tab ? "active" : "";
    });
    var meta = TITLES[tab];
    if (!setTitle || !meta) return;
    $("page-title").textContent = meta[0];
    $("page-sub").textContent = meta[1];
  }

  /**
   * Teach the dashboard shell about the studio's two tabs.
   *
   * The shell keeps a hardcoded tab list and a hardcoded refresh dispatch, and it
   * now sits past the byte offset this repo's edit tooling can reach (AGENTS.md
   * section 8), so the list cannot simply be extended there. Duplicating it would
   * drift, so instead the studio wraps the two shell entry points it has to
   * extend. Overriding a top-level function declaration through the window object
   * works because classic-script declarations live on the global object — which is
   * also where the shell's inline onclick handlers look them up.
   */
  function installShellHooks() {
    var shellShowTab = window.showTab;
    var shellRefreshTab = window.refreshTab;

    window.showTab = function (tab) {
      if (tab === "content" || tab === "schema") {
        state.tab = tab;
        activateView(tab, true);
        refreshFor(tab);
        return;
      }
      shellShowTab(tab);
      // The shell's own list does not know about the studio's views, so they are
      // hidden here whenever another tab is chosen.
      activateView(tab, false);
    };

    window.refreshTab = function () {
      if (state.tab === "content" || state.tab === "schema") {
        refreshFor(state.tab);
        return;
      }
      shellRefreshTab();
    };

    // The read-only JSON dump that used to be the Content tab is gone; its only
    // handler read #content-type / #content-out, which no longer exist, so it
    // is neutralised rather than left to throw if anything still calls it.
    window.loadContent = function () {};
  }

  function init() {
    installShellHooks();
    $("cs-add").onclick = function () { CS.openRowModal(null); };
    $("cs-upload").onclick = openUploadModal;
    $("cs-export").onclick = function (ev) { ev.stopPropagation(); openExportMenu(); };
    $("cs-refresh").onclick = function () {
      CS.loadSchema(true).then(function () { CS.renderTabs(); });
      CS.loadRows();
    };
    $("cs-schema-download").onclick = downloadSchema;
    $("cs-schema-refresh").onclick = loadSchemaTab;
    $("cs-q").oninput = debounce(function () {
      CS.state.q = $("cs-q").value.trim();
      CS.state.offset = 0;
      CS.loadRows();
    }, 320);
    $("cs-level").onchange = function () {
      CS.state.level = $("cs-level").value;
      CS.state.offset = 0;
      CS.loadRows();
    };
    $("cs-facet").onchange = function () {
      CS.state.facet = $("cs-facet").value;
      CS.state.offset = 0;
      CS.loadRows();
    };
    document.addEventListener("click", function (ev) {
      var menu = document.getElementById("cs-export-menu");
      if (!menu) return;
      var anchor = $("cs-export");
      if (anchor && (anchor.contains(ev.target) || menu.contains(ev.target))) return;
      closeExportMenu();
    });
  }

  // Exposed so the spreadsheet codec can be round-trip tested without a browser
  // (tests/contentStudioXlsx.test.ts) — it is hand-written OOXML + ZIP, which is
  // exactly the kind of code that needs a test rather than a hopeful deploy.
  window.KatzuSpreadsheet = {
    write: function (sheets) { return xlsxWrite(sheets); },
    read: function (file) { return readWorkbook(file); },
    toObjects: sheetToObjects
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
</script>`;
