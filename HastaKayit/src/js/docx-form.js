// docx-form.js — Word (.docx) version of the client intake form.
//
// Unlike the PDF (whose Helvetica appearance font can't draw ş/ğ/ı/İ, forcing
// ASCII-folded labels), DOCX stores text as Unicode XML, so Turkish labels
// render perfectly. generateBlankDocx() builds a 2-column label/value table the
// client fills in Word; parseDocx() reads a returned .docx back into app fields.
//
// Generation uses the `docx` library; parsing unzips the .docx (a zip) with
// fflate and reads word/document.xml directly — no heavy XML dependency.

import {
  Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun,
  WidthType, HeadingLevel, AlignmentType, BorderStyle, VerticalAlign,
} from 'docx';
import { unzipSync } from 'fflate';
import {
  FORM_FIELDS, labelToKey, emptyResult, normalizeBirthDate,
} from './form-fields.js';

const NOTE = 'Fotoğrafınızı bu alana yapıştırın veya ayrıca gönderin.';

// Font sizes, in HALF-POINTS (docx's unit): 40 = 20pt, 28 = 14pt, 24 = 12pt.
// The doctor's clients skew elderly, so nothing on this form is small — every
// run below sets its size explicitly rather than inheriting a ~10pt default.
const SIZE_TITLE = 40;   // 20pt
const SIZE_LABEL = 28;   // 14pt, bold
const SIZE_VALUE = 28;   // 14pt — what the client types must be just as legible
const SIZE_INTRO = 24;   // 12pt
const SIZE_NOTE = 24;    // 12pt
const SIZE_PHOTO_CAPTION = 20; // 10pt, inside the box

// Row heights in TWIPS (1cm ≈ 567 twips). A tall, empty value cell is an
// invitation to write; a one-line cell is not.
const ROW_HEIGHT = 850;         // ~1.5cm for a normal answer
const ROW_HEIGHT_TALL = 1800;   // ~3.2cm for "Şikayet / Hastalık"

// Vesikalık (passport photo) proportions: 3.5cm × 4.5cm.
const PHOTO_W = 1985; // 3.5cm in DXA twips
const PHOTO_H = 2551; // 4.5cm in DXA twips

// Build a label/value table row. `value` is empty for the blank form; the
// filled-DOCX test helper passes real values so the same builder round-trips.
function fieldRow(label, value, tall) {
  return new TableRow({
    height: { value: tall ? ROW_HEIGHT_TALL : ROW_HEIGHT, rule: 'atLeast' },
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: SIZE_LABEL })],
        })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({ text: value || '', size: SIZE_VALUE })],
        })],
      }),
    ],
  });
}

// The photo area: a real bordered box of vesikalık proportions, not a note.
// Deliberately a ONE-cell table — parseDocx skips any row with fewer than two
// cells, so this can never be mistaken for a label/value data row.
function photoBox() {
  const edge = { style: BorderStyle.SINGLE, size: 8, color: '888888' };
  return new Table({
    width: { size: PHOTO_W, type: WidthType.DXA },
    columnWidths: [PHOTO_W],
    rows: [new TableRow({
      height: { value: PHOTO_H, rule: 'exact' },
      children: [new TableCell({
        width: { size: PHOTO_W, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: { top: edge, bottom: edge, left: edge, right: edge },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Fotoğraf', size: SIZE_PHOTO_CAPTION, color: '888888' })],
        })],
      })],
    })],
  });
}

/**
 * generateBlankDocx([values]) -> Uint8Array
 * A .docx titled "Danışan Kayıt Formu" with a 2-column table (Turkish label |
 * empty cell) built from FORM_FIELDS, a bordered photo box and its instruction
 * below. `values` (optional, keyed by app field name) pre-fills the value cells
 * — used by tests to build a filled document with the SAME layout parseDocx
 * expects.
 */
export async function generateBlankDocx(values) {
  const v = values || {};
  const rows = FORM_FIELDS.map((f) =>
    fieldRow(f.label, v[f.app], f.key === 'diagnosis'));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: 'Danışan Kayıt Formu', bold: true, size: SIZE_TITLE })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Lütfen aşağıdaki bilgileri doldurup geri gönderiniz.',
            italics: true,
            size: SIZE_INTRO,
          })],
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        }),
        new Paragraph({ text: '' }),
        photoBox(),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: NOTE, size: SIZE_NOTE })],
        }),
      ],
    }],
  });

  // toArrayBuffer (not toBuffer): toBuffer packs jszip as "nodebuffer" ->
  // Buffer.concat, and Buffer is undefined in the Android WebView / browser
  // (esbuild does not polyfill it). toArrayBuffer packs as "arraybuffer",
  // which works in node AND the browser. Wrap in a plain Uint8Array.
  const ab = await Packer.toArrayBuffer(doc);
  return new Uint8Array(ab);
}

// --- Parsing helpers -------------------------------------------------------

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function unescapeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

// Concatenate every <w:t>…</w:t> run inside an XML fragment (one cell / one
// paragraph). Handles self-closing/attr'd tags and preserves inner text.
function runsText(xml) {
  let out = '';
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1];
  return unescapeXml(out);
}

// Split a fragment into top-level matches of a tag, non-nested (docx tables are
// not nested here, and cells/paragraphs don't self-nest in our own output). A
// simple non-greedy scan is sufficient and never throws.
function matchAll(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const res = [];
  let m;
  while ((m = re.exec(xml))) res.push(m[1]);
  return res;
}

// Store a parsed value under its app field name. birth_date is the one field
// the DB constrains (repo.js/backup.js demand YYYY-MM-DD), so whatever spelling
// the client used is normalized here — or dropped, never guessed.
function assign(out, field, value) {
  out[field] = field === 'birth_date' ? normalizeBirthDate(value) : value;
}

/**
 * parseDocx(bytes) -> { name, mother_name, birth_date, residence, phone, diagnosis }
 * Reads a returned intake .docx. Strategy:
 *   1) Table rows: for each <w:tr> with >=2 cells, labelToKey(cell0) -> field,
 *      value = joined text of remaining cells.
 *   2) Fallback: "label: value" paragraphs (client retyped the form as lines).
 * Never throws — malformed / non-docx bytes yield emptyResult().
 */
export async function parseDocx(bytes) {
  const out = emptyResult();
  try {
    const files = unzipSync(new Uint8Array(bytes));
    const docXmlBytes = files['word/document.xml'];
    if (!docXmlBytes) return emptyResult();
    const xml = new TextDecoder('utf-8').decode(docXmlBytes);

    let matched = false;

    // 1) Table extraction.
    for (const rowXml of matchAll(xml, 'w:tr')) {
      const cells = matchAll(rowXml, 'w:tc').map((c) => runsText(c).trim());
      if (cells.length < 2) continue;
      const field = labelToKey(cells[0]);
      if (!field) continue;
      const value = cells.slice(1).join(' ').trim();
      assign(out, field, value);
      matched = true;
    }

    // 2) Paragraph "label: value" fallback (only if the table gave us nothing).
    if (!matched) {
      for (const pXml of matchAll(xml, 'w:p')) {
        const text = runsText(pXml).trim();
        const m = text.match(/^(.+?)\s*[:：]\s*(.+)$/);
        if (!m) continue;
        const field = labelToKey(m[1]);
        if (!field) continue;
        assign(out, field, m[2].trim());
      }
    }
  } catch {
    return emptyResult();
  }
  return out;
}
