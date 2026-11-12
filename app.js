// 書籍搜尋：依書名、作者、ISBN、分類查詢 Google Books API
(function () {
  "use strict";

  var API = "https://www.googleapis.com/books/v1/volumes";
  var PAGE_SIZE = 20;
  // （可選）Google Books API 金鑰。少量使用可以留空；
  // 若要填，請在 Google Cloud 限制「只允許這個網站的網址」與「只允許 Books API」。
  var API_KEY = "";

  var $ = function (id) { return document.getElementById(id); };
  var form = $("search-form");
  var fields = { title: $("title"), author: $("author"), isbn: $("isbn"), subject: $("subject"), lang: $("lang") };
  var searchBtn = $("search-btn");
  var statusEl = $("status");
  var resultsEl = $("results");
  var pager = $("pager");
  var prevBtn = $("prev-btn");
  var nextBtn = $("next-btn");
  var pageInfo = $("page-info");

  var current = null; // { criteria, page, total }
  var requestSeq = 0;

  function show(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "message " + kind;
    statusEl.hidden = false;
  }

  function readCriteria() {
    return {
      title: fields.title.value.trim(),
      author: fields.author.value.trim(),
      isbn: fields.isbn.value.replace(/[\s-]/g, "").toUpperCase(),
      subject: fields.subject.value.trim(),
      lang: fields.lang.value,
    };
  }

  function validIsbn(s) {
    return /^\d{9}[\dX]$/.test(s) || /^\d{13}$/.test(s);
  }

  // 去掉會干擾查詢語法的引號
  function clean(s) { return s.replace(/"/g, " ").trim(); }

  function phrase(prefix, s) {
    s = clean(s);
    return /\s/.test(s) ? prefix + ':"' + s + '"' : prefix + ":" + s;
  }

  function buildQuery(c) {
    var parts = [];
    if (c.isbn) parts.push("isbn:" + c.isbn);
    if (c.title) parts.push(phrase("intitle", c.title));
    if (c.author) parts.push(phrase("inauthor", c.author));
    if (c.subject) parts.push(phrase("subject", c.subject));
    return parts.join(" ");
  }

  function buildUrl(c, page) {
    var p = new URLSearchParams({
      q: buildQuery(c),
      startIndex: String(page * PAGE_SIZE),
      maxResults: String(PAGE_SIZE),
      printType: "books",
    });
    if (c.lang) p.set("langRestrict", c.lang);
    if (API_KEY) p.set("key", API_KEY);
    return API + "?" + p.toString();
  }

  // 把搜尋條件放進網址，方便分享或重新整理後保留
  function syncAddress(c, page) {
    var p = new URLSearchParams();
    ["title", "author", "isbn", "subject", "lang"].forEach(function (k) { if (c[k]) p.set(k, c[k]); });
    if (page > 0) p.set("page", String(page + 1));
    var qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text; // 一律純文字
    return n;
  }

  // Google 回傳的摘要含 HTML 標記與實體字元，轉成純文字
  function toPlainText(html) {
    return new DOMParser().parseFromString(html || "", "text/html").body.textContent || "";
  }

  function safeHttps(url, allowedHosts) {
    try {
      var u = new URL(url);
      if (u.protocol === "http:") u.protocol = "https:";
      if (u.protocol !== "https:") return "";
      var ok = allowedHosts.some(function (h) { return u.hostname === h || u.hostname.endsWith("." + h); });
      return ok ? u.toString() : "";
    } catch (e) {
      return "";
    }
  }

  function renderBook(item) {
    var v = item.volumeInfo || {};
    var li = el("li", "book");

    var coverUrl = safeHttps((v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || "",
      ["books.google.com", "googleusercontent.com"]);
    if (coverUrl) {
      var img = el("img", "cover");
      img.src = coverUrl;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      li.appendChild(img);
    } else {
      li.appendChild(el("div", "cover empty", "無封面"));
    }

    var body = el("div");
    var h3 = el("h3");
    var title = (v.title || "（無書名）") + (v.subtitle ? "：" + v.subtitle : "");
    var link = safeHttps(v.infoLink || v.canonicalVolumeLink || "", ["google.com", "google.com.tw"]);
    if (link) {
      var a = el("a", null, title);
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      h3.appendChild(a);
    } else {
      h3.textContent = title;
    }
    body.appendChild(h3);

    if (v.authors && v.authors.length) body.appendChild(el("p", "meta", "作者：" + v.authors.join("、")));
    var pub = [v.publisher, v.publishedDate].filter(Boolean).join("，");
    if (pub) body.appendChild(el("p", "meta", "出版：" + pub));

    var ids = (v.industryIdentifiers || [])
      .filter(function (x) { return x.type === "ISBN_13" || x.type === "ISBN_10"; })
      .map(function (x) { return x.identifier; });
    if (ids.length) body.appendChild(el("p", "meta", "ISBN：" + ids.join(" / ")));

    var snippet = toPlainText(item.searchInfo && item.searchInfo.textSnippet);
    if (snippet) body.appendChild(el("p", "snippet", snippet));

    var tags = (v.categories || []).concat(v.pageCount ? [v.pageCount + " 頁"] : []);
    if (tags.length) {
      var t = el("div", "tags");
      tags.forEach(function (x) { t.appendChild(el("span", "tag", x)); });
      body.appendChild(t);
    }

    li.appendChild(body);
    return li;
  }

  function friendlyError(status) {
    if (status === 429 || status === 403) return "今天的查詢次數已達上限，請稍後再試。";
    if (status >= 500) return "Google Books 暫時無法回應，請稍後再試。";
    if (status === 0) return "網路連線失敗，請確認網路後再試一次。";
    return "搜尋失敗，請稍後再試。（錯誤代碼 " + status + "）";
  }

  async function search(c, page) {
    var seq = ++requestSeq;
    searchBtn.disabled = true;
    show("搜尋中…", "info");
    syncAddress(c, page);

    var res;
    try {
      res = await fetch(buildUrl(c, page));
    } catch (e) {
      if (seq !== requestSeq) return;
      show(friendlyError(0), "error");
      searchBtn.disabled = false;
      return;
    }
    if (seq !== requestSeq) return; // 已有更新的搜尋，丟掉舊結果
    searchBtn.disabled = false;

    if (!res.ok) {
      show(friendlyError(res.status), "error");
      return;
    }
    var data = await res.json().catch(function () { return {}; });
    var items = data.items || [];
    var total = data.totalItems || 0;

    resultsEl.replaceChildren();
    if (items.length === 0) {
      pager.hidden = true;
      show(page === 0 ? "找不到符合的書，試試看減少條件或換個關鍵字。" : "沒有更多結果了。", "info");
      current = { criteria: c, page: page, total: page * PAGE_SIZE };
      prevBtn.disabled = page === 0;
      nextBtn.disabled = true;
      if (page > 0) pager.hidden = false;
      return;
    }

    items.forEach(function (it) { resultsEl.appendChild(renderBook(it)); });
    current = { criteria: c, page: page, total: total };
    // Google 回傳的總數是估計值，只當作參考
    show("約 " + total.toLocaleString("zh-TW") + " 筆結果", "info");
    prevBtn.disabled = page === 0;
    nextBtn.disabled = items.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total;
    pageInfo.textContent = "第 " + (page + 1) + " 頁";
    pager.hidden = false;
    // 手機上表單較長，搜尋後直接捲到結果
    statusEl.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var c = readCriteria();
    if (!c.title && !c.author && !c.isbn && !c.subject) {
      show("請至少填一個條件：書名、作者、ISBN 或分類。", "error");
      return;
    }
    if (c.isbn && !validIsbn(c.isbn)) {
      show("ISBN 格式不正確，請輸入 10 碼或 13 碼（可含連字號）。", "error");
      return;
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 手機收起鍵盤
    search(c, 0);
  });

  $("clear-btn").addEventListener("click", function () {
    form.reset();
    resultsEl.replaceChildren();
    statusEl.hidden = true;
    pager.hidden = true;
    current = null;
    history.replaceState(null, "", location.pathname);
    fields.title.focus();
  });

  prevBtn.addEventListener("click", function () { if (current && current.page > 0) search(current.criteria, current.page - 1); });
  nextBtn.addEventListener("click", function () { if (current) search(current.criteria, current.page + 1); });

  // 網址帶有搜尋條件時（分享連結），自動帶入並搜尋
  var qp = new URLSearchParams(location.search);
  var preset = false;
  ["title", "author", "isbn", "subject", "lang"].forEach(function (k) {
    var v = qp.get(k);
    if (v) { fields[k].value = v; preset = true; }
  });
  if (preset) {
    var c = readCriteria();
    var page = Math.max(0, (parseInt(qp.get("page"), 10) || 1) - 1);
    if ((c.title || c.author || c.subject || (c.isbn && validIsbn(c.isbn)))) search(c, page);
  }
})();
