// pdf-form.js — fillable client intake PDF for the Hasta Kayıt app.
//
// generateBlankForm() builds an AcroForm PDF the psychiatrist's clients fill in
// their own PDF reader and send back. parseForm() reads a returned PDF back into
// the app's patient fields.
//
// Font note: pdf-lib's StandardFonts (Helvetica) cannot encode Turkish-only
// glyphs (ş, ğ, ı, İ) in drawn text / appearance streams. Embedding a Unicode
// TTF needs @pdf-lib/fontkit + a real .ttf, neither of which ships here, and a
// base64 font blob in bundled source is not worth it. So visible LABELS are
// ASCII-folded (İsim→Isim, Şikayet→Sikayet) via `fold()` below. This is purely
// cosmetic: FIELD NAMES are ASCII by design, and field VALUES the client types
// round-trip as Unicode through the field value (/V) — so parsing Turkish input
// is unaffected.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { emptyResult, normalizeBirthDate } from './form-fields.js';

// App-field mapping: the ASCII AcroForm field name -> the app's patient field.
// `mother` is deliberately renamed to `mother_name` to match repo.js columns,
// and `birthdate` to `birth_date` for the same reason.
const FIELD_MAP = [
  { pdf: 'name', app: 'name' },
  { pdf: 'mother', app: 'mother_name' },
  { pdf: 'birthdate', app: 'birth_date' },
  { pdf: 'residence', app: 'residence' },
  { pdf: 'phone', app: 'phone' },
  { pdf: 'diagnosis', app: 'diagnosis' },
];

// Trim + collapse internal whitespace on a returned field value.
function cleanValue(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// Fold Turkish-only glyphs to ASCII so Helvetica can draw them. WinAnsi already
// handles ç/ö/ü, but ş/ğ/ı/İ are not encodable — fold the whole set for safety.
const FOLD = {
  ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
  ç: 'c', Ç: 'C', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U',
};
function fold(s) {
  return s.replace(/[şŞğĞıİçÇöÖüÜ]/g, (c) => FOLD[c] || c);
}

// Type sizes, in POINTS. The doctor's clients skew elderly and print this form,
// so labels and the text they type are deliberately large; the layout below is
// sized around these numbers and asserted to still fit A4 by the tests.
const SIZE_TITLE = 20;
const SIZE_INTRO = 12;
const SIZE_LABEL = 13;
const SIZE_VALUE = 13;
const SIZE_PHOTO_CAPTION = 10;
const SIZE_PHOTO_NOTE = 11;

// Vesikalık (passport photo) proportions: 3.5cm × 4.5cm in points.
const PHOTO_W = 99;
const PHOTO_H = 128;

/**
 * generateBlankForm() -> Uint8Array
 * A fillable AcroForm PDF titled "Danışan Kayıt Formu" with six text fields
 * (ASCII names, Turkish-intent labels) plus a bordered vesikalık photo box.
 */
export async function generateBlankForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait, points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const { width, height } = page.getSize();
  const marginX = 50;
  const fieldWidth = width - marginX * 2;
  const ink = rgb(0.1, 0.1, 0.1);
  const border = rgb(0.55, 0.55, 0.55);
  const hint = rgb(0.45, 0.45, 0.45);

  // Title
  page.drawText(fold('Danışan Kayıt Formu'), {
    x: marginX, y: height - 60, size: SIZE_TITLE, font: fontBold, color: ink,
  });
  page.drawText(fold('Lütfen aşağıdaki bilgileri doldurup geri gönderiniz.'), {
    x: marginX, y: height - 84, size: SIZE_INTRO, font, color: hint,
  });

  // Field definitions: [pdf field name, visible Turkish label, taller?/multiline?]
  // Order mirrors FORM_FIELDS (the DOCX form) so the two look like one document.
  const rows = [
    { name: 'name', label: 'İsim Soyisim', multiline: false },
    { name: 'mother', label: 'Anne Adı', multiline: false },
    { name: 'birthdate', label: 'Doğum Tarihi (GG.AA.YYYY)', multiline: false },
    { name: 'residence', label: 'İkametgah (Yaşadığı yer)', multiline: false },
    { name: 'phone', label: 'Telefon', multiline: false },
    { name: 'diagnosis', label: 'Şikayet / Hastalık', multiline: true },
  ];

  // Vertical budget on A4 (841.89pt): 130 header + 5×64 single rows + 114 for
  // the diagnosis block + ~148 for the photo box and its caption = ~712, which
  // leaves a ~110pt bottom margin. The diagnosis box is the shock absorber: if a
  // 7th field is ever added, shrink IT rather than the type.
  let y = height - 130;
  const rowGap = 16; // space below each field box
  const labelGap = 18; // label baseline -> top of its box

  for (const row of rows) {
    const boxHeight = row.multiline ? 80 : 30;
    // Label
    page.drawText(fold(row.label), {
      x: marginX, y, size: SIZE_LABEL, font, color: ink,
    });
    y -= labelGap;
    // Field
    const field = form.createTextField(row.name);
    if (row.multiline) field.enableMultiline();
    field.addToPage(page, {
      x: marginX,
      y: y - boxHeight + 12,
      width: fieldWidth,
      height: boxHeight,
      font,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: rgb(1, 1, 1),
    });
    field.setFontSize(SIZE_VALUE); // requires DA, which addToPage establishes
    y -= boxHeight + rowGap;
  }

  // Photo area — best effort: a bordered vesikalık-proportioned (3.5×4.5cm)
  // rectangle + instruction note. Not an AcroForm image field (unreliable across
  // readers); the client pastes a photo here or sends it separately.
  const photoX = marginX;
  const photoY = y - 20 - PHOTO_H;
  page.drawRectangle({
    x: photoX, y: photoY, width: PHOTO_W, height: PHOTO_H,
    borderWidth: 1, borderColor: border, color: rgb(0.97, 0.97, 0.97),
  });
  const caption = fold('Fotoğraf');
  page.drawText(caption, {
    x: photoX + (PHOTO_W - font.widthOfTextAtSize(caption, SIZE_PHOTO_CAPTION)) / 2,
    y: photoY + PHOTO_H / 2,
    size: SIZE_PHOTO_CAPTION,
    font,
    color: hint,
  });
  page.drawText(fold('Fotoğrafınızı bu alana yapıştırın veya ayrıca gönderin.'), {
    x: photoX, y: photoY - 20, size: SIZE_PHOTO_NOTE, font, color: ink,
  });

  const bytes = await doc.save();
  return bytes; // Uint8Array
}

/**
 * parseForm(bytes) -> { name, mother_name, birth_date, residence, phone, diagnosis }
 * Reads text field values from a returned PDF. Never throws: a malformed or
 * non-form PDF yields all-empty fields for the caller to handle.
 */
export async function parseForm(bytes) {
  const out = emptyResult();
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const form = doc.getForm();
    for (const { pdf, app } of FIELD_MAP) {
      try {
        const text = cleanValue(form.getTextField(pdf).getText());
        // birth_date is the one field the DB constrains (repo.js/backup.js want
        // YYYY-MM-DD), so it is normalized here — or dropped, never guessed.
        out[app] = app === 'birth_date' ? normalizeBirthDate(text) : text;
      } catch {
        // Field missing / not a text field -> leave empty.
        out[app] = '';
      }
    }
  } catch {
    // Not a PDF, not a form, or otherwise unreadable -> all-empty.
    return emptyResult();
  }
  // Photo extraction: pdf-lib has no trivial embedded-image extraction API, so
  // we intentionally omit `photo` (best-effort, per spec).
  return out;
}
