/* Menekşe İlim – site betikleri (bağımlılık yok) */
(function () {
  "use strict";

  // Yıl
  document.querySelectorAll("[data-yil]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Kaydırınca başlığa gölge
  var baslik = document.querySelector(".ana-baslik");
  if (baslik) {
    var golge = function () { baslik.classList.toggle("golgeli", window.scrollY > 8); };
    golge();
    window.addEventListener("scroll", golge, { passive: true });
  }

  // Mobil menü
  var menu = document.getElementById("ana-menu");
  var ac = document.querySelector(".menu-ac");
  var kapat = document.querySelector(".menu-kapat");
  var perde = document.querySelector(".perde");
  function menuDurum(acikMi) {
    if (!menu) return;
    menu.classList.toggle("acik", acikMi);
    if (perde) perde.classList.toggle("acik", acikMi);
    if (ac) ac.setAttribute("aria-expanded", acikMi ? "true" : "false");
    document.body.style.overflow = acikMi ? "hidden" : "";
    if (acikMi && kapat) kapat.focus();
    if (!acikMi && ac) ac.focus();
  }
  if (ac) ac.addEventListener("click", function () { menuDurum(true); });
  if (kapat) kapat.addEventListener("click", function () { menuDurum(false); });
  if (perde) perde.addEventListener("click", function () { menuDurum(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { menuDurum(false); isikKapat(); }
  });

  // Aktif menü bağlantısı
  var dosya = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".ana-menu a[href]").forEach(function (a) {
    var hedef = a.getAttribute("href").split("#")[0].toLowerCase();
    if (hedef === dosya) { a.classList.add("aktif"); a.setAttribute("aria-current", "page"); }
  });

  // Galeri ışık kutusu
  var kutu = document.querySelector(".isik-kutusu");
  var kutuImg = kutu ? kutu.querySelector("img") : null;
  var kutuCap = kutu ? kutu.querySelector("figcaption") : null;
  function isikKapat() { if (kutu) { kutu.hidden = true; } }
  document.querySelectorAll(".galeri a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (!kutu || !kutuImg) return;
      e.preventDefault();
      var img = a.querySelector("img");
      kutuImg.src = a.getAttribute("href");
      kutuImg.alt = img ? img.alt : "";
      if (kutuCap) kutuCap.textContent = (a.querySelector("figcaption") || {}).textContent || "";
      kutu.hidden = false;
      kutu.querySelector("button").focus();
    });
  });
  if (kutu) {
    kutu.querySelector("button").addEventListener("click", isikKapat);
    kutu.addEventListener("click", function (e) { if (e.target === kutu) isikKapat(); });
  }

  // IBAN kopyala
  document.querySelectorAll("[data-kopyala]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hedef = document.querySelector(btn.getAttribute("data-kopyala"));
      if (!hedef) return;
      var metin = hedef.textContent.trim();
      var bitti = function () {
        var eski = btn.textContent;
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

  // İletişim formu (JS açıkken sayfa yenilenmeden gönderir)
  var form = document.getElementById("iletisim-formu");
  if (form) {
    var sonuc = form.querySelector(".form-sonuc");
    var gonder = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sonuc.className = "form-sonuc";
      if (!form.checkValidity()) { form.reportValidity(); return; }
      gonder.disabled = true;
      var eskiYazi = gonder.textContent;
      gonder.textContent = "Gönderiliyor…";
      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { "Accept": "application/json" }
      }).then(function (r) { return r.json(); }).then(function (veri) {
        if (veri && veri.ok) {
          sonuc.textContent = veri.mesaj || "Mesajınız alındı. En kısa sürede size dönüş yapacağız.";
          sonuc.className = "form-sonuc basari";
          form.reset();
        } else {
          sonuc.textContent = (veri && veri.mesaj) || "Mesaj gönderilemedi. Lütfen e-posta ile ulaşın.";
          sonuc.className = "form-sonuc hata";
        }
      }).catch(function () {
        sonuc.textContent = "Mesaj şu an gönderilemiyor. Lütfen e-posta adresimize yazın: " + (form.getAttribute("data-eposta") || "");
        sonuc.className = "form-sonuc hata";
      }).finally(function () {
        gonder.disabled = false;
        gonder.textContent = eskiYazi;
      });
    });
  }

  // Formdan dönüşte (JS kapalı senaryosu) durum mesajı
  var p = new URLSearchParams(location.search).get("durum");
  var sonucKutu = document.querySelector("#iletisim-formu .form-sonuc");
  if (p && sonucKutu) {
    sonucKutu.textContent = p === "ok" ? "Mesajınız alındı. En kısa sürede size dönüş yapacağız." : "Mesaj gönderilemedi. Lütfen tekrar deneyin veya e-posta ile ulaşın.";
    sonucKutu.className = "form-sonuc " + (p === "ok" ? "basari" : "hata");
  }
})();
