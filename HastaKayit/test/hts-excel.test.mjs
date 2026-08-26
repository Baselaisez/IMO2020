import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { isHtsWorkbook, parseHtsWorkbook, parseBirthOrAge, toDate } from '../src/js/hts-excel.js';
import { htsReadNote } from '../src/js/ui-settings.js';

// Doktorun defteri yıllar içinde başlıklarını değiştirmiş. 2026 dosyası
// "TANI"/"FİYAT" kullanıyor; eski kural "DURUM"+"TL/MISIR" aradığı için dosyayı
// HTS saymıyordu ve 53.096 satır sessizce 15.727 kayda iniyordu. Aşağıdaki
// testler o üç şemayı da sabitliyor.

function wb(sheets) {
  const b = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return b;
}

const D = (iso) => new Date(iso + 'T00:00:00Z');

test('isHtsWorkbook: TANI/FİYAT başlıklı 2026 defteri de tanınır', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'DOĞUM TARİHİ', 'İKAMET', 'TANI', 'FİYAT', 'TARİH', 'TELEFON'],
    ['ali veli', 'ayşe', 37, 'KARTAL', 'nazar', 12, D('2024-05-05'), '532 111 22 33'],
  ] });
  assert.equal(isHtsWorkbook(book), true);
});

test('isHtsWorkbook: eski DURUM/TL şeması hâlâ tanınır', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['İSİM SOYİSİM', 'ANNE ADI', 'DURUM', 'TL', 'TARİH'],
    ['ali veli', 'ayşe', 'nazar', 100, D('2013-01-01')],
  ] });
  assert.equal(isHtsWorkbook(book), true);
});

test('isHtsWorkbook: ÖN KAYIT sayfası olmayan dosya HTS değildir', () => {
  assert.equal(isHtsWorkbook(wb({ Hastalar: [['Ad Soyad'], ['ali']] })), false);
});

test('parseHtsWorkbook: İKAMET, TELEFON ve yaş artık kaydediliyor', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'DOĞUM TARİHİ', 'İKAMET', 'TANI', 'FİYAT', 'TARİH', 'TELEFON'],
    ['ali veli', 'ayşe', 37, 'KARTAL', 'nazar', 12, D('2024-05-05'), '532 111 22 33'],
  ] });
  const { patients, payments } = parseHtsWorkbook(book, '2026-08-26');
  assert.equal(patients.length, 1);
  const p = patients[0];
  assert.equal(p.residence, 'KARTAL');
  assert.equal(p.phone, '5321112233');
  assert.equal(p.diagnosis, 'nazar');
  assert.equal(p.start_date, '2024-05-05');
  assert.equal(p.birth_date, null, 'yaş doğum tarihi DEĞİLDİR');
  assert.match(p.notes, /Yaş: 37/);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 12);
});

test('parseBirthOrAge: yaş ile doğum tarihini ayırır', () => {
  assert.deepEqual(parseBirthOrAge(D('1988-03-04')), { birth_date: '1988-03-04', age: null });
  assert.deepEqual(parseBirthOrAge(37), { birth_date: null, age: 37 });
  assert.deepEqual(parseBirthOrAge('52"'), { birth_date: null, age: 52 });
  assert.deepEqual(parseBirthOrAge(''), { birth_date: null, age: null });
  assert.deepEqual(parseBirthOrAge('abc'), { birth_date: null, age: null });
  // Excel'in 1899 "sadece saat" hücresi ne yaştır ne doğum tarihi.
  assert.deepEqual(parseBirthOrAge(new Date('1899-12-30T07:12:00Z')), { birth_date: null, age: null });
  // 1900'den büyük bir sayı yaş olamaz.
  assert.deepEqual(parseBirthOrAge(1988), { birth_date: null, age: null });
});

test('parseHtsWorkbook: "İSİM SOYİSİM" yer tutucusu tek hastada birleşmez', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH'],
    ['İSİM SOYİSİM', '', 'nazar', '', D('2013-01-01')],
    ['İSİM SOYİSİM', '', 'büyü', '', D('2013-01-02')],
    ['İSİM SOYİSİM', '', 'sıkıntı', '', D('2013-01-03')],
  ] });
  const { patients, stats } = parseHtsWorkbook(book, '2026-08-26');
  assert.equal(patients.length, 3, 'her anonim ziyaret kendi kaydı olarak durur');
  assert.equal(stats.anonymous, 3);
  assert.equal(stats.named, 0);
  assert.deepEqual(patients.map(p => p.diagnosis), ['nazar', 'büyü', 'sıkıntı']);
});

test('parseHtsWorkbook: tamamen boş satır (yalnız tarihli) atlanır', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH'],
    ['ali veli', 'ayşe', 'nazar', '', D('2024-01-01')],
    ['', '', '', '', D('2026-08-26')],
  ] });
  const { patients, stats } = parseHtsWorkbook(book, '2026-08-26');
  assert.equal(patients.length, 1);
  assert.equal(stats.emptyRows, 1);
});

test('parseHtsWorkbook: okunamayan tarih bugüne değil, önceki satırın tarihine yazılır', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH'],
    ['a bir', '', 'x', '', D('2013-05-01')],
    ['b iki', '', 'y', '', 'perşembe'],
    ['c üç', '', 'z', '', D('2013-05-03')],
  ] });
  const { patients, stats } = parseHtsWorkbook(book, '2026-08-26');
  const byName = Object.fromEntries(patients.map(p => [p.name, p]));
  assert.equal(byName['b iki'].start_date, '2013-05-01');
  assert.match(byName['b iki'].diagnosis, /\[tarih: perşembe\]/, 'tahmin gizlenmez, ham metin durur');
  assert.equal(stats.dateCarried, 1);
  assert.equal(stats.undated, 0);
});

test('parseHtsWorkbook: telefonu aynı olan iki satır tek hastada birleşir', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH', 'TELEFON'],
    ['ali veli', '', 'nazar', '', D('2020-01-01'), '0532 111 22 33'],
    ['ALİ VELİ', '', 'büyü', '', D('2024-01-01'), '532 111 22 33'],
  ] });
  const { patients, stats } = parseHtsWorkbook(book, '2026-08-26');
  assert.equal(patients.length, 1);
  assert.equal(stats.merged, 1);
  assert.equal(patients[0].start_date, '2020-01-01', 'en erken tarih başlangıç olur');
  assert.match(patients[0].diagnosis, /nazar/);
  assert.match(patients[0].diagnosis, /büyü/, 'ikinci ziyaretin tanısı kaybolmaz');
});

test('parseHtsWorkbook: telefonu ve anne adı olmayan aynı isim BİRLEŞMEZ', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH'],
    ['ayşe yılmaz', '', 'nazar', '', D('2020-01-01')],
    ['ayşe yılmaz', '', 'büyü', '', D('2024-01-01')],
  ] });
  const { patients } = parseHtsWorkbook(book, '2026-08-26');
  assert.equal(patients.length, 2, 'yaygın bir ad tek başına aynı kişi kanıtı değildir');
});

test('htsReadNote: atılan sütunları ve tahminleri açıkça yazar', () => {
  const html = htsReadNote({
    totalRows: 53096, emptyRows: 6833, merged: 798, dateCarried: 13922, undated: 5, skipped: 25,
    ignoredColumns: ['NOT'], columns: { isim: 'ADI SOYADI', tani: 'TANI', tarih: 'TARİH' },
  });
  assert.match(html, /53096/);
  assert.match(html, /6833/);
  assert.match(html, /13922/);
  assert.match(html, /Okunmayan sütun/);
  assert.match(html, /NOT/);
  assert.match(html, /ADI SOYADI/);
});

test('toDate: Excel ham gün sayısı da tarihe çevrilir (cellDates kapalıysa)', () => {
  // 45524 = 2024-08-20. Uygulama defterleri cellDates olmadan okuduğu için
  // tarihler tam olarak bu biçimde geliyordu ve hiçbiri okunamıyordu.
  assert.equal(toDate(45524).toISOString().slice(0, 10), '2024-08-20');
  assert.equal(toDate(37), null, 'yaş bir tarih değildir');
  assert.equal(toDate('perşembe'), null);
  assert.equal(toDate(''), null);
});

test('parseHtsWorkbook: saçma yıllara düşen tarihler kabul edilmez', () => {
  const book = wb({ 'ÖN KAYIT': [
    ['ADI SOYADI', 'ANNE ADI', 'TANI', 'FİYAT', 'TARİH'],
    ['a bir', '', 'x', '', D('2013-05-01')],
    ['b iki', '', 'y', '', D('7113-01-01')], // defterde gerçekten var: 574 satır
    ['c üç', '', 'z', '', D('1899-12-30')],
  ] });
  const { patients, stats } = parseHtsWorkbook(book, '2026-08-26');
  const byName = Object.fromEntries(patients.map(p => [p.name, p]));
  assert.equal(byName['b iki'].start_date, '2013-05-01');
  assert.equal(byName['c üç'].start_date, '2013-05-01');
  assert.equal(stats.dated, 1);
  assert.equal(stats.dateCarried, 2);
});
