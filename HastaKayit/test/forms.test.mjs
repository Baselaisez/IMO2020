// Hasta formlarının (PDF + Word) gerçekten doldurulabilir olduğunu doğrular.
//
// Bu testler kâğıt üzerinde değil, ÜRETİLEN DOSYA üzerinde çalışır: form
// oluşturulur, içine Türkçe değerler yazılır, geri okunur. Doktorun hastalarına
// gönderdiği tek şey bu dosya olduğu için, bozulduğunda sessizce bozulur —
// kimse fark etmeden hastalar formu dolduramaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';
import { generateBlankForm, parseForm } from '../src/js/pdf-form.js';
import { generateBlankDocx, parseDocx } from '../src/js/docx-form.js';

const TURKCE = {
  name: 'Ayşe Işıl Yılmaz',
  mother: 'Fatma Güneş',
  birthdate: '05.03.1948',
  residence: 'İstanbul, Şişli',
  phone: '0555 111 22 33',
  diagnosis: 'Uyku sorunu, kaygı; göğüs sıkışması',
};

test('PDF: altı alanın hepsi var, tanı çok satırlı, hiçbiri salt-okunur değil', async () => {
  const doc = await PDFDocument.load(await generateBlankForm());
  const fields = doc.getForm().getFields();
  assert.deepEqual(fields.map(f => f.getName()),
    ['name', 'mother', 'birthdate', 'residence', 'phone', 'diagnosis']);
  for (const f of fields) assert.equal(f.isReadOnly(), false, `${f.getName()} salt-okunur olmamalı`);
  assert.equal(doc.getForm().getTextField('diagnosis').isMultiline(), true);
});

test('PDF: NeedAppearances açık — okuyucu yazılan metni gösterebilsin', async () => {
  // Bu bayrak olmadan Önizleme (Preview) ve bazı telefon okuyucularında hasta
  // yazar ama ekranda hiçbir şey görünmez.
  const doc = await PDFDocument.load(await generateBlankForm());
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'));
  assert.equal(String(acro.get(PDFName.of('NeedAppearances'))), 'true');
});

test('PDF: alanlar Unicode yazı tipini gösterir, Helvetica DEĞİL', async () => {
  // REGRESYON: pdf-lib'in varsayılan save()'i alan görünümlerini yeniden
  // üretirken /DA'yı Helvetica'ya geri yazıyordu. Helvetica ş/ğ/ı/İ harflerini
  // kodlayamaz — yani hasta kendi adını yazamaz.
  const doc = await PDFDocument.load(await generateBlankForm());
  for (const f of doc.getForm().getFields()) {
    const da = f.acroField.getDefaultAppearance() ?? '';
    assert.match(da, /LiberationSans/, `${f.getName()} alanının yazı tipi yanlış: ${da}`);
    assert.doesNotMatch(da, /Helvetica/);
  }
});

test('PDF: her alan A4 sayfasının içinde kalır', async () => {
  // Punto büyütmek yerleşimi taşırabilir; sessizce taşmasın diye ölçülüyor.
  const doc = await PDFDocument.load(await generateBlankForm());
  const { width, height } = doc.getPage(0).getSize();
  for (const f of doc.getForm().getFields()) {
    const r = f.acroField.getWidgets()[0].getRectangle();
    assert.ok(r.x >= 0 && r.y >= 0, `${f.getName()} sayfanın dışına taşmış`);
    assert.ok(r.x + r.width <= width, `${f.getName()} sağdan taşmış`);
    assert.ok(r.y + r.height <= height, `${f.getName()} yukarıdan taşmış`);
  }
});

test('PDF: Türkçe değerler yazılıp geri okunabiliyor', async () => {
  const doc = await PDFDocument.load(await generateBlankForm());
  const form = doc.getForm();
  for (const [k, v] of Object.entries(TURKCE)) form.getTextField(k).setText(v);
  // updateFieldAppearances: false — hastanın okuyucusunun yaptığının aynısı:
  // değeri yazar, görünümü okuyucu üretir (NeedAppearances).
  const filled = await doc.save({ updateFieldAppearances: false });

  const out = await parseForm(filled);
  assert.equal(out.name, TURKCE.name);
  assert.equal(out.mother_name, TURKCE.mother);
  assert.equal(out.residence, TURKCE.residence);
  assert.equal(out.phone, TURKCE.phone);
  assert.equal(out.diagnosis, TURKCE.diagnosis);
  // Doğum tarihi veritabanının istediği biçime çevrilir.
  assert.equal(out.birth_date, '1948-03-05');
});

test('PDF: form olmayan bir dosya çökertmez, boş sonuç verir', async () => {
  const out = await parseForm(new Uint8Array([1, 2, 3]));
  assert.equal(out.name, '');
  assert.equal(out.birth_date, '');
});

test('Word: boş form üretilir ve alanları boş okunur', async () => {
  const out = await parseDocx(await generateBlankDocx());
  assert.equal(out.name, '');
  assert.equal(out.diagnosis, '');
});

test('Word: doldurulmuş form Türkçesiyle geri okunur', async () => {
  // DİKKAT: generateBlankDocx UYGULAMA alan adlarıyla anahtarlanır
  // (mother_name, birth_date), form anahtarlarıyla (mother, birthdate) değil.
  const filled = await generateBlankDocx({
    name: TURKCE.name, mother_name: TURKCE.mother, birth_date: TURKCE.birthdate,
    residence: TURKCE.residence, phone: TURKCE.phone, diagnosis: TURKCE.diagnosis,
  });
  const out = await parseDocx(filled);
  assert.equal(out.name, TURKCE.name);
  assert.equal(out.mother_name, TURKCE.mother);
  assert.equal(out.residence, TURKCE.residence);
  assert.equal(out.birth_date, '1948-03-05');
});
