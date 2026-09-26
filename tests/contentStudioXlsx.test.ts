import { describe, expect, it, beforeAll } from 'vitest';
import { crc32 as nodeCrc32, deflateRawSync } from 'node:zlib';
import { CONTENT_STUDIO_TOOLS_SCRIPT } from '../cloudflare-content-studio-tools';

/**
 * The Content Studio's spreadsheet codec.
 *
 * It is hand-written (OOXML + ZIP, store-only on the way out, inflate on the way
 * in) rather than loaded from a CDN, because the dashboard holds the admin bearer
 * token and its CSP is `default-src 'none'`. That trade only holds if the codec
 * actually produces files Excel can open and can read the files Excel produces —
 * so this file asserts both, and checks the CRC fields against Node's own
 * implementation rather than against the writer's opinion of them.
 */

type Sheet = { name: string; rows: unknown[][] };
type Codec = {
  write: (sheets: Sheet[]) => Uint8Array;
  read: (file: { arrayBuffer: () => Promise<ArrayBuffer> }) => Promise<Sheet[]>;
  toObjects: (sheet: Sheet) => { rows: Record<string, unknown>[]; headers: string[] };
};

const SHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeElement(): Record<string, unknown> {
  return {
    onclick: null,
    oninput: null,
    onchange: null,
    style: {},
    className: "",
    value: "",
    type: "",
    checked: false,
    appendChild() {},
    insertBefore() {},
    removeChild() {},
    contains: () => false,
    click() {},
  };
}

/** Runs the studio's tools script in a stub DOM and returns the codec it exposes. */
function loadCodec(): Codec {
  const windowStub: Record<string, unknown> = { KatzuContentStudio: {} };
  const documentStub = {
    readyState: "complete",
    getElementById: () => makeElement(),
    createElement: () => makeElement(),
    addEventListener() {},
    body: { appendChild() {}, removeChild() {} },
  };
  const source = CONTENT_STUDIO_TOOLS_SCRIPT.replace(/^<script>\n/, "").replace(/<\/script>$/, "");
  const factory = new Function(
    "window",
    "document",
    "URL",
    "Blob",
    "Response",
    "TextEncoder",
    "TextDecoder",
    "DecompressionStream",
    "el",
    "toast",
    "state",
    `${source}\n;return window.KatzuSpreadsheet;`,
  );
  return factory(
    windowStub,
    documentStub,
    URL,
    Blob,
    Response,
    TextEncoder,
    TextDecoder,
    DecompressionStream,
    () => ({}),
    () => {},
    { tab: "overview" },
  ) as Codec;
}

/** Reads a ZIP back with an independent parser, so the writer is checked, not trusted. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("no end-of-central-directory record");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries: Array<{ name: string; crc: number; method: number; data: Uint8Array }> = [];
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, crc, method, data: bytes.subarray(start, start + size) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const encoder = new TextEncoder();

/** Builds a deflated ZIP by hand — the shape Excel actually emits. */
function deflatedZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const deflated = new Uint8Array(deflateRawSync(Buffer.from(file.data)));
    const crc = nodeCrc32(file.data);
    const header = new Uint8Array(30);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x04034b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(8, 8, true); // deflate
    headerView.setUint32(14, crc, true);
    headerView.setUint32(18, deflated.length, true);
    headerView.setUint32(22, file.data.length, true);
    headerView.setUint16(26, nameBytes.length, true);
    chunks.push(header, nameBytes, deflated);

    const record = new Uint8Array(46);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true);
    recordView.setUint16(6, 20, true);
    recordView.setUint16(10, 8, true);
    recordView.setUint32(16, crc, true);
    recordView.setUint32(20, deflated.length, true);
    recordView.setUint32(24, file.data.length, true);
    recordView.setUint16(28, nameBytes.length, true);
    recordView.setUint32(42, offset, true);
    central.push(record, nameBytes);
    offset += header.length + nameBytes.length + deflated.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of all) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

let codec: Codec;
beforeAll(() => {
  codec = loadCodec();
});

describe('content studio spreadsheet codec — writing', () => {
  it('writes a workbook Excel can open: every required OOXML part, with correct CRCs', () => {
    const headers = ["id", "german", "level"];
    const bytes = codec.write([
      { name: "vocabulary", rows: [headers, [1, "einreichen", "B1"]] },
      { name: "grammar", rows: [["id", "level"], ["akkusativ_articles", "A1"]] },
    ]);

    const entries = readZip(bytes);
    const names = entries.map((entry) => entry.name);
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      expect(names).toContain(part);
    }

    // The CRCs must match an independent implementation, or Excel rejects the file
    // as corrupt even though our own reader is happy.
    for (const entry of entries) {
      expect(entry.method, entry.name).toBe(0);
      expect(nodeCrc32(entry.data), entry.name).toBe(entry.crc);
    }

    // Multi-sheet ordering and naming come from the sheet list, not from row data.
    const workbook = new TextDecoder().decode(entries.find((entry) => entry.name === "xl/workbook.xml")!.data);
    expect(workbook).toContain('<sheet name="vocabulary" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="grammar" sheetId="2" r:id="rId2"/>');
  });

  it('sanitises a sheet name the OOXML spec does not allow', () => {
    const bytes = codec.write([{ name: "starter/phrases:v2", rows: [["a"], ["b"]] }]);
    const workbook = new TextDecoder().decode(
      readZip(bytes).find((entry) => entry.name === "xl/workbook.xml")!.data,
    );
    expect(workbook).toContain('name="starter_phrases_v2"');
  });

  it('marks the part as an xlsx workbook', () => {
    expect(SHEET_MIME).toContain("spreadsheetml");
    const bytes = codec.write([{ name: "s", rows: [["a"]] }]);
    const types = new TextDecoder().decode(
      readZip(bytes).find((entry) => entry.name === "[Content_Types].xml")!.data,
    );
    expect(types).toContain("spreadsheetml.sheet.main+xml");
  });
});

describe('content studio spreadsheet codec — reading', () => {
  it('round-trips its own output, including Arabic and XML-hostile characters', async () => {
    const rows = [
      ["id", "german", "translation_ar", "note"],
      [7, "einreichen", "يقدّم", 'a & b < c "d"'],
      [8, "Termin", "موعد", ""],
    ];
    const bytes = codec.write([{ name: "vocabulary", rows }]);
    const sheets = await codec.read({ arrayBuffer: async () => new Uint8Array(bytes).buffer });

    expect(sheets.map((sheet) => sheet.name)).toEqual(["vocabulary"]);
    const { headers, rows: objects } = codec.toObjects(sheets[0]);
    expect(headers).toEqual(["id", "german", "translation_ar", "note"]);
    expect(objects).toEqual([
      { id: "7", german: "einreichen", translation_ar: "يقدّم", note: 'a & b < c "d"' },
      { id: "8", german: "Termin", translation_ar: "موعد", note: "" },
    ]);
  });

  it('reads a deflated workbook with a shared-strings table, the shape Excel writes', async () => {
    const shared = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">',
      "<si><t>id</t></si><si><t>german</t></si><si><t>Termin</t></si>",
      "</sst>",
    ].join("");
    const sheet = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      '<row r="2"><c r="A2"><v>12</v></c><c r="B2" t="s"><v>2</v></c></row>',
      "</sheetData></worksheet>",
    ].join("");
    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="vocabulary" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
      'Target="worksheets/sheet1.xml"/></Relationships>';

    const bytes = deflatedZip([
      { name: "xl/workbook.xml", data: encoder.encode(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(rels) },
      { name: "xl/sharedStrings.xml", data: encoder.encode(shared) },
      { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheet) },
    ]);

    const sheets = await codec.read({ arrayBuffer: async () => new Uint8Array(bytes).buffer });
    const parsed = codec.toObjects(sheets[0]);
    expect(parsed.headers).toEqual(["id", "german"]);
    expect(parsed.rows).toEqual([{ id: "12", german: "Termin" }]);
  });

  it('drops blank rows instead of inserting empty ones', () => {
    const parsed = codec.toObjects({
      name: "s",
      rows: [["id", "german"], ["1", "Termin"], ["", ""]],
    });
    expect(parsed.rows).toEqual([{ id: "1", german: "Termin" }]);
  });

  it('says so plainly when the file is not a workbook', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(codec.read({ arrayBuffer: async () => bytes.buffer })).rejects.toThrow(/not a \.xlsx workbook/);
  });
});
