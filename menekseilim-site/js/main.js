/* Menekşe Medreseleri – site betikleri (bağımlılık yok) */
(function () {
  "use strict";
  var kok = document.documentElement;

  // Yıl
  document.querySelectorAll("[data-yil]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // ---------------------------------------------------------------- Açılış ekranı
  // Görünürlüğü <head> içindeki küçük betik belirler (oturumda bir kez).
  // Burada yalnızca erken kapatma ve güvenli kapanış yapılır.
  var acilis = document.querySelector(".acilis");
  function acilisKapat() {
    if (!kok.classList.contains("acilis-goster")) return;
    kok.classList.add("acilis-kapandi");
  }
  if (acilis && kok.classList.contains("acilis-goster")) {
    acilis.addEventListener("click", acilisKapat);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") acilisKapat();
    }, { once: true });
    setTimeout(acilisKapat, 3600);
  }

  // ---------------------------------------------------------------- Mobil menü
  var menu = document.getElementById("ana-menu");
  var ac = document.querySelector(".menu-ac");
  var kapat = document.querySelector(".menu-kapat");
  var perde = document.querySelector(".perde");
  function menuDurum(acikMi, odakla) {
    if (!menu) return;
    var oncekiAcik = menu.classList.contains("acik");
    menu.classList.toggle("acik", acikMi);
    if (perde) perde.classList.toggle("acik", acikMi);
    if (ac) ac.setAttribute("aria-expanded", acikMi ? "true" : "false");
    document.body.style.overflow = acikMi ? "hidden" : "";
    if (odakla === false) return;
    if (acikMi && kapat) kapat.focus();
    if (!acikMi && oncekiAcik && ac) ac.focus();
  }
  if (ac) ac.addEventListener("click", function () { menuDurum(true); });
  if (kapat) kapat.addEventListener("click", function () { menuDurum(false); });
  if (perde) perde.addEventListener("click", function () { menuDurum(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") menuDurum(false); });
  if (menu) menu.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { menuDurum(false, false); });
  });

  // ---------------------------------------------------------------- Aktif menü (çok sayfalı site)
  var spa = document.body.hasAttribute("data-spa");
  if (!spa) {
    var dosya = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".ana-menu a[href]").forEach(function (a) {
      var href = a.getAttribute("href").toLowerCase();
      if (href.indexOf("#") !== -1) return;
      if (href === dosya) { a.classList.add("aktif"); a.setAttribute("aria-current", "page"); }
    });
  }

  // ---------------------------------------------------------------- Tek dosyalık önizleme: sayfa geçişleri
  if (spa) {
    var sayfalar = Array.prototype.slice.call(document.querySelectorAll(".spa-sayfa"));
    var anaBaslik = document.title;
    function goster(hash, ilk) {
      var ad = (hash || "").replace(/^#/, "") || "anasayfa";
      var sayfa = document.getElementById("sayfa-" + ad);
      var hedef = null;
      if (!sayfa) {
        hedef = document.getElementById(ad);
        sayfa = hedef ? hedef.closest(".spa-sayfa") : null;
      }
      if (!sayfa) { sayfa = document.getElementById("sayfa-anasayfa"); hedef = null; }
      sayfalar.forEach(function (s) { s.hidden = s !== sayfa; });
      var sayfaAdi = sayfa.id.replace("sayfa-", "");
      document.querySelectorAll(".ana-menu a[href^='#']").forEach(function (a) {
        var aktif = a.getAttribute("href") === "#" + sayfaAdi;
        a.classList.toggle("aktif", aktif);
        if (aktif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      document.title = sayfa.getAttribute("data-baslik") || anaBaslik;
      if (hedef) { hedef.scrollIntoView(); }
      else if (!ilk) { window.scrollTo(0, 0); }
    }
    window.addEventListener("hashchange", function () { goster(location.hash); });
    goster(location.hash, true);
  }

  // ---------------------------------------------------------------- Bağış sihirbazı
  var bagis = document.querySelector("[data-bagis]");
  if (bagis) {
    var bicim = function (n) { return n.toLocaleString("tr-TR") + " TL"; };
    var dar = function () { return window.matchMedia("(max-width: 900px)").matches; };
    var paneller = Array.prototype.slice.call(bagis.querySelectorAll(".bagis-panel"));
    var secimler = Array.prototype.slice.call(bagis.querySelectorAll("input[name=bagis-alani]"));
    bagis.classList.add("hazir");

    var sec = function (id, kaydir) {
      var panel = document.getElementById("bagis-" + id);
      if (!panel || paneller.indexOf(panel) === -1) return false;
      paneller.forEach(function (p) { p.hidden = p !== panel; });
      secimler.forEach(function (r) {
        r.checked = r.value === id;
        r.closest(".alan-secim").classList.toggle("secili", r.checked);
      });
      if (kaydir) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };
    secimler.forEach(function (r) {
      r.addEventListener("change", function () { sec(r.value, dar()); });
    });
    var hashten = function () {
      var m = /^#bagis-([a-z0-9-]+)$/.exec(location.hash);
      return m ? sec(m[1], true) : false;
    };
    if (!hashten()) {
      var ilk = secimler.filter(function (r) { return r.checked; })[0] || secimler[0];
      if (ilk) sec(ilk.value, false);
    }
    window.addEventListener("hashchange", hashten);

    paneller.forEach(function (p) {
      var tur = p.getAttribute("data-tur");
      var adet = p.querySelector("input.adet");
      var tutarGir = p.querySelector("input.tutar-gir");
      var adGir = p.querySelector("input.ad");
      var wa = p.querySelector("a.whatsapp");
      var waTaban = wa ? wa.getAttribute("href").split("?")[0] : "";
      var secilenTutar = 0;
      var ilkTutar = p.querySelector(".tutar-btn.secili");
      if (ilkTutar) secilenTutar = +ilkTutar.getAttribute("data-tutar");
      var sinirla = function (v) { return Math.max(1, Math.min(999, parseInt(v, 10) || 1)); };

      var guncelle = function () {
        var toplam, metin;
        if (tur === "adet") {
          var n = sinirla(adet.value);
          var secenek = p.querySelector(".secenek input:checked");
          var fiyat = secenek ? +secenek.getAttribute("data-fiyat") : +p.getAttribute("data-fiyat");
          var birim = secenek ? secenek.value.toLocaleLowerCase("tr-TR") : p.getAttribute("data-birim");
          toplam = n * fiyat;
          metin = p.getAttribute("data-kisa") + " " + n + " " + birim;
          p.querySelectorAll(".hizli-btn").forEach(function (b) {
            b.setAttribute("aria-pressed", +b.getAttribute("data-adet") === n ? "true" : "false");
          });
        } else {
          var serbest = parseInt(tutarGir.value, 10);
          toplam = serbest > 0 ? serbest : secilenTutar;
          metin = p.getAttribute("data-kisa");
        }
        if (p.hasAttribute("data-vekalet")) metin += " (vekâlet)";
        var ad = adGir ? adGir.value.trim() : "";
        if (ad) metin = ad + " - " + metin;
        p.querySelectorAll(".toplam-tutar").forEach(function (el) { el.textContent = bicim(toplam); });
        var aciklama = p.querySelector(".aciklama-yaz");
        if (aciklama) aciklama.textContent = metin;
        if (wa) {
          wa.href = waTaban + "?text=" + encodeURIComponent("Selamün aleyküm. " + p.getAttribute("data-baslik") +
            " için " + bicim(toplam) + " bağış gönderdim, dekontum ekte." + (ad ? " " + ad : ""));
        }
      };

      if (adet) {
        p.querySelectorAll(".adet-btn").forEach(function (b) {
          b.addEventListener("click", function () {
            adet.value = sinirla(sinirla(adet.value) + +b.getAttribute("data-adim"));
            guncelle();
          });
        });
        adet.addEventListener("input", guncelle);
        adet.addEventListener("change", function () { adet.value = sinirla(adet.value); guncelle(); });
        p.querySelectorAll(".hizli-btn").forEach(function (b) {
          b.addEventListener("click", function () { adet.value = b.getAttribute("data-adet"); guncelle(); });
        });
        p.querySelectorAll(".secenek input").forEach(function (r) { r.addEventListener("change", guncelle); });
      }
      if (tutarGir) {
        var tutarIsaretle = function () {
          var serbestVar = parseInt(tutarGir.value, 10) > 0;
          p.querySelectorAll(".tutar-btn").forEach(function (x) {
            var secili = !serbestVar && +x.getAttribute("data-tutar") === secilenTutar;
            x.classList.toggle("secili", secili);
            x.setAttribute("aria-pressed", secili ? "true" : "false");
          });
        };
        p.querySelectorAll(".tutar-btn").forEach(function (b) {
          b.addEventListener("click", function () {
            secilenTutar = +b.getAttribute("data-tutar");
            tutarGir.value = "";
            tutarIsaretle();
            guncelle();
          });
        });
        tutarGir.addEventListener("input", function () { tutarIsaretle(); guncelle(); });
      }
      if (adGir) adGir.addEventListener("input", guncelle);
      guncelle();
    });
  }

  // ---------------------------------------------------------------- Kopyala (IBAN, alıcı, açıklama)
  document.querySelectorAll("[data-kopyala]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hedef = document.querySelector(btn.getAttribute("data-kopyala"));
      if (!hedef) return;
      var metin = hedef.textContent.replace(/\s+/g, " ").trim();
      if (btn.hasAttribute("data-bosluksuz")) metin = metin.replace(/\s+/g, "");
      var yazi = btn.querySelector("span") || btn;
      var eski = yazi.getAttribute("data-eski") || yazi.textContent;
      yazi.setAttribute("data-eski", eski);
      var bitti = function () {
        yazi.textContent = "Kopyalandı";
        btn.classList.add("kopyalandi");
        clearTimeout(btn._zaman);
        btn._zaman = setTimeout(function () { yazi.textContent = eski; btn.classList.remove("kopyalandi"); }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(metin).then(bitti, function () { secVeKopyala(hedef); bitti(); });
      } else { secVeKopyala(hedef); bitti(); }
    });
  });
  function secVeKopyala(el) {
    var aralik = document.createRange();
    aralik.selectNodeContents(el);
    var sec = window.getSelection();
    sec.removeAllRanges(); sec.addRange(aralik);
    try { document.execCommand("copy"); } catch (err) { /* yoksay */ }
  }

  // ---------------------------------------------------------------- İletişim formu
  var form = document.getElementById("iletisim-formu");
  if (form) {
    var sonuc = form.querySelector(".form-sonuc");
    var gonder = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sonuc.className = "form-sonuc";
      if (!form.checkValidity()) { form.reportValidity(); return; }
      gonder.disabled = true;
      var eskiYazi = gonder.innerHTML;
      gonder.textContent = "Gönderiliyor…";
      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { "Accept": "application/json" }
      }).then(function (r) {
        var tur = r.headers.get("content-type") || "";
        if (tur.indexOf("application/json") !== -1) { return r.json(); }
        return { ok: r.ok };
      }).then(function (veri) {
        if (veri && veri.ok) {
          sonuc.textContent = veri.mesaj || "Mesajınız bize ulaştı. En kısa sürede size dönüş yapacağız.";
          sonuc.className = "form-sonuc basari";
          form.reset();
        } else {
          sonuc.textContent = (veri && veri.mesaj) || "Mesaj gönderilemedi. Lütfen bizi telefonla arayın.";
          sonuc.className = "form-sonuc hata";
        }
      }).catch(function () {
        sonuc.textContent = "Mesaj şu an gönderilemiyor. Lütfen bizi arayın ya da e-posta gönderin: " + (form.getAttribute("data-eposta") || "");
        sonuc.className = "form-sonuc hata";
      }).finally(function () {
        gonder.disabled = false;
        gonder.innerHTML = eskiYazi;
      });
    });
  }

  // JS kapalıyken formdan dönüş mesajı
  var p = new URLSearchParams(location.search).get("durum");
  var sonucKutu = document.querySelector("#iletisim-formu .form-sonuc");
  if (p && sonucKutu) {
    sonucKutu.textContent = p === "ok" ? "Mesajınız bize ulaştı. En kısa sürede size dönüş yapacağız." : "Mesaj gönderilemedi. Lütfen bizi telefonla arayın.";
    sonucKutu.className = "form-sonuc " + (p === "ok" ? "basari" : "hata");
  }
})();
