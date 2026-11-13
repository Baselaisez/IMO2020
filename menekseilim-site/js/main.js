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

  // ---------------------------------------------------------------- IBAN kopyala
  document.querySelectorAll("[data-kopyala]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hedef = document.querySelector(btn.getAttribute("data-kopyala"));
      if (!hedef) return;
      var metin = hedef.textContent.replace(/\s+/g, " ").trim();
      var eski = btn.textContent;
      var bitti = function () {
        btn.textContent = "Kopyalandı";
        setTimeout(function () { btn.textContent = eski; }, 1800);
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
