// sync-merge.js — Drive sync icin saf (pure) birlestirme motoru.
//
// Kurallar (TR ozet):
// - Kimlik `uuid` alanidir. Ayni uuid iki tarafta da varsa, `updated_at`
//   (ISO string, sozluksel karsilastirma) daha yeni olan kazanir (LWW —
//   Last-Write-Wins). Esitlikte LOCAL kazanir (deterministik).
// - Silme kayitlari (tombstone) `uuid -> en yeni deleted_at` haritasina
//   toplanir (iki taraftan da). Bir kaydin `updated_at`'i, kendi tombstone'unun
//   `deleted_at`'inden KUCUK YA DA ESIT ise kayit silinmis sayilir ve
//   birlestirilmis listeden dusurulur.
// - Diriltme (resurrection) korumasi: bir kayit, kendi tombstone'undan SONRA
//   duzenlenmisse (`updated_at > deleted_at`) bu, kaydin yeniden olusturuldugu
//   anlamina gelir ve kayit HAYATTA KALIR (dusurulmez).
// - Tombstone'lar YAS'a gore BUDANMAZ (asla silinmez). 90 gunluk yas budamasi
//   kaldirildi: 90 gunden uzun sure offline kalan (veya sadece yedek olarak
//   duran ucuncu) bir cihaz silme islemini hic gormemis olabilir; tombstone
//   budanirsa o cihazin bayat kaydi bir sonraki senkronizasyonda DIRILIR. Bu
//   hasta kayitlari icin kabul edilemez. Tombstone satirlari kucuktur (tek
//   hekim), sinirsiz saklama pratikte maliyetsizdir; dogruluk kazanir.
// - `uuid`'i olmayan kayitlar kimlikle eslestirilemez; veri kaybini onlemek
//   icin OLDUKLARI GIBI (hangi taraftaysa) korunur, tombstone'lanamazlar.
// - Fonksiyon SAF'tir: girdileri asla mutasyona ugratmaz, Date.now() cagirmaz
//   (zaman disaridan `nowMs` olarak verilir), ayni girdiler icin her zaman
//   ayni (deterministik) sonucu uretir.

function buildTombstoneMap(localDeletions, remoteDeletions) {
  const map = new Map();
  for (const d of [...(localDeletions || []), ...(remoteDeletions || [])]) {
    if (!d || !d.uuid) continue;
    const existing = map.get(d.uuid);
    if (!existing || d.deleted_at > existing.deleted_at) {
      map.set(d.uuid, { ...d });
    }
  }
  return map;
}

function mergeList(localList, remoteList, tombstones) {
  const byUuid = new Map();
  const noUuid = [];

  for (const rec of localList || []) {
    if (!rec) continue;
    if (!rec.uuid) {
      noUuid.push({ ...rec });
      continue;
    }
    byUuid.set(rec.uuid, { ...rec });
  }

  for (const rec of remoteList || []) {
    if (!rec) continue;
    if (!rec.uuid) {
      noUuid.push({ ...rec });
      continue;
    }
    const existing = byUuid.get(rec.uuid);
    if (!existing) {
      byUuid.set(rec.uuid, { ...rec });
    } else if (rec.updated_at > existing.updated_at) {
      // remote strictly newer -> remote wins
      byUuid.set(rec.uuid, { ...rec });
    }
    // else: existing (local) wins — covers "remote older" and "tie" (local-wins-on-tie)
  }

  const survivors = [];
  for (const [uuid, rec] of byUuid) {
    const tomb = tombstones.get(uuid);
    if (tomb && rec.updated_at <= tomb.deleted_at) {
      continue; // deleted at/after last edit -> stays deleted
    }
    survivors.push(rec);
  }

  survivors.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
  return [...survivors, ...noUuid];
}

function mergeDeletions(tombstones) {
  const result = [];
  for (const [, tomb] of tombstones) {
    result.push({ ...tomb });
  }
  result.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
  return result;
}

// nowMs: reserved (age-based tombstone pruning removed to prevent resurrection)
export function mergeStates(local, remote, nowMs) {
  const tombstones = buildTombstoneMap(local.deletions, remote.deletions);

  const patients = mergeList(local.patients, remote.patients, tombstones);
  const payments = mergeList(local.payments, remote.payments, tombstones);
  const deliveries = mergeList(local.deliveries, remote.deliveries, tombstones);

  const deletions = mergeDeletions(tombstones);

  return { patients, payments, deliveries, deletions };
}
