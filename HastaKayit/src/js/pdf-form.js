// pdf-form.js — fillable client intake PDF for the Hasta Kayıt app.
//
// generateBlankForm() builds an AcroForm PDF the psychiatrist's clients fill in
// their own PDF reader and send back. parseForm() reads a returned PDF back into
// the app's patient fields.
//
// YAZI TİPİ — Türkçe harfler
// pdf-lib'in yerleşik Helvetica'sı (WinAnsi) ş, ğ, ı, İ harflerini KODLAYAMAZ.
// Eskiden bu yüzden etiketler ASCII'ye katlanıyordu: hastanın eline "İsim
// Soyisim" yerine "Isim Soyisim", "Şikayet" yerine "Sikayet" yazan bir form
// gidiyordu. Dahası, alanların varsayılan görünümü (DA) Helvetica'yı
// gösterdiğinden, hasta "Ayşe" yazdığında bazı okuyucular harfi çizemiyordu.
//
// Artık forma indirgenmiş bir Unicode yazı tipi gömülüyor (Liberation Sans,
// SIL OFL 1.1, ~17 KB — bkz. pdf-font.js) ve etiketler olduğu gibi yazılıyor.
// Ayrıca NeedAppearances açılıyor: okuyucu, hastanın yazdığı metnin görünümünü
// kendisi üretir — Önizleme (Preview) ve telefon okuyucularında "yazdım ama
// görünmüyor" sorununu bitiren ayar budur.

import { PDFDocument, PDFName, PDFBool, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { emptyResult, normalizeBirthDate } from './form-fields.js';
import { PDF_FONT_REGULAR_B64, PDF_FONT_BOLD_B64, fontBytes } from './pdf-font.js';

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

// Punto (POINT). Doktorun danışanları yaşlı ve bu formu basıp elle ya da
// ekranda dolduruyorlar, bu yüzden hiçbir şey küçük değil. Yerleşim bu
// sayılara göre hesaplanmıştır ve testler her alanın A4 sayfasının içinde
// kaldığını doğrular — punto büyütülürse test önce kırılır, sessizce taşmaz.
const SIZE_TITLE = 24;
const SIZE_INTRO = 14;
const SIZE_LABEL = 16;
const SIZE_VALUE = 16;
const SIZE_PHOTO_CAPTION = 12;
const SIZE_PHOTO_NOTE = 13;

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
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595.28, 841.89]); // A4 portrait, points
  // subset: false — alanların DA'sı bu yazı tipini gösterir ve hasta HENÜZ
  // yazmadığı için hangi harfleri kullanacağını bilemeyiz; alt küme almak,
  // yazdığı harfin gömülü olmaması riskini doğurur. Zaten indirgenmiş (~17 KB).
  const font = await doc.embedFont(fontBytes(PDF_FONT_REGULAR_B64), { subset: false });
  const fontBold = await doc.embedFont(fontBytes(PDF_FONT_BOLD_B64), { subset: false });
  const form = doc.getForm();
  // Okuyucu, hastanın yazdığı metnin görünümünü kendisi üretsin.
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);

  const { width, height } = page.getSize();
  const marginX = 50;
  const fieldWidth = width - marginX * 2;
  const ink = rgb(0.1, 0.1, 0.1);
  const border = rgb(0.55, 0.55, 0.55);
  const hint = rgb(0.45, 0.45, 0.45);

  // Title
  page.drawText(('Danışan Kayıt Formu'), {
    x: marginX, y: height - 60, size: SIZE_TITLE, font: fontBold, color: ink,
  });
  page.drawText(('Lütfen aşağıdaki bilgileri doldurup geri gönderiniz.'), {
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
  let y = height - 132;
  const rowGap = 14; // space below each field box
  const labelGap = 20; // label baseline -> top of its box

  for (const row of rows) {
    const boxHeight = row.multiline ? 88 : 34;
    // Label
    page.drawText(row.label, {
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
  const caption = 'Fotoğraf';
  page.drawText(caption, {
    x: photoX + (PHOTO_W - font.widthOfTextAtSize(caption, SIZE_PHOTO_CAPTION)) / 2,
    y: photoY + PHOTO_H / 2,
    size: SIZE_PHOTO_CAPTION,
    font,
    color: hint,
  });
  page.drawText(('Fotoğrafınızı bu alana yapıştırın veya ayrıca gönderin.'), {
    x: photoX, y: photoY - 20, size: SIZE_PHOTO_NOTE, font, color: ink,
  });

  // updateFieldAppearances: false — KRİTİK. Varsayılan save(), alanların
  // görünümünü yeniden üretirken pdf-lib'in VARSAYILAN yazı tipini (Helvetica)
  // kullanır ve az önce kurduğumuz /DA satırını ezer: alanlar yeniden
  // "/Helvetica" gösterir, yani hastanın yazdığı ş/ğ/ı/İ harfleri gene
  // çizilemez. Görünümler addToPage'de zaten doğru yazı tipiyle kuruldu;
  // üstelik NeedAppearances açık olduğu için okuyucu da kendi üretir.
  const bytes = await doc.save({ updateFieldAppearances: false });
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
