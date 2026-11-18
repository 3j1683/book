// 書籍搜尋：依書名、作者、ISBN、分類查詢 Google Books API
(function () {
  "use strict";

  var API = "https://www.googleapis.com/books/v1/volumes";
  var PAGE_SIZE = 20;
  // Google Books API 金鑰（會出現在網頁原始碼，已在 Google Cloud 限制只允許本網站網址與 Books API）
  var API_KEY = "AIzaSyAZMrHKKAaT5r8MNENK9w_OpiYgpG8w45s";

  var $ = function (id) { return document.getElementById(id); };
  var form = $("search-form");
  var fields = { title: $("title"), author: $("author"), isbn: $("isbn"), subject: $("subject"), lang: $("lang") };
  var category = $("category");
  var recentBtn = $("recent-btn");
  var customField = $("custom-field");
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
      subject: categorySubject(),
      lang: fields.lang.value,
      recent: recentBtn.getAttribute("aria-pressed") === "true",
    };
  }

  // 分類選單的值就是 Google Books 的英文分類；「全部」「熱門推薦」不限分類，「自訂」用輸入框的文字
  function categorySubject() {
    var v = category.value;
    if (v === "custom") return fields.subject.value.trim();
    if (v === "hot") return "";
    return v;
  }

  function updateCustomField() {
    customField.hidden = category.value !== "custom";
  }

  // 從網址還原分類：符合選單就選它，否則當作自訂
  function setCategoryFromSubject(v) {
    var match = Array.prototype.some.call(category.options, function (o) {
      return o.value === v && v !== "custom" && v !== "hot";
    });
    if (match) {
      category.value = v;
    } else {
      category.value = "custom";
      fields.subject.value = v;
    }
    updateCustomField();
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

  // ── 語言篩選 ──
  // Google Books 的 langRestrict 實際上常被忽略，而且中文書幾乎都標成 zh-CN，
  // 所以抓回來後由網站自己判斷：英文、日文看書籍標的語言；繁體／簡體用書名等文字裡的字來判斷。
  var LANG_FETCH = 40;      // 有語言篩選時，每次向 Google 拿 40 筆再篩
  var LANG_MAX_CALLS = 3;   // 每換一頁最多查 3 次，避免耗掉太多查詢額度
  var LANG_NAMES = { "zh-TW": "繁體中文", "zh-CN": "簡體中文", en: "英文", ja: "日文" };
  var simpChars = new Set(Array.from((window.ZH_SCRIPT && window.ZH_SCRIPT.simplified) || ""));
  var tradChars = new Set(Array.from((window.ZH_SCRIPT && window.ZH_SCRIPT.traditional) || ""));
  var KANA = /[\u3040-\u30ff]/;

  // 回傳 "trad"、"simp"，或分不出來時 ""
  function zhScript(text) {
    var t = 0, s = 0;
    Array.from(text).forEach(function (ch) {
      if (tradChars.has(ch)) t++;
      else if (simpChars.has(ch)) s++;
    });
    if (t > s) return "trad";
    if (s > t) return "simp";
    return "";
  }

  function matchesLang(item, lang) {
    var v = item.volumeInfo || {};
    var code = (v.language || "").toLowerCase();
    var title = (v.title || "") + (v.subtitle || "");
    if (lang === "en") return code === "en";
    if (lang === "ja") return code === "ja" || KANA.test(title);
    // 中文：Google 標成 zh 開頭，且書名沒有日文假名
    if (code.indexOf("zh") !== 0 || KANA.test(title)) return false;
    var text = title + (v.publisher || "") + (v.description || "").slice(0, 300);
    var script = zhScript(text);
    // 分不出繁簡（書名的字兩邊寫法相同）時兩邊都顯示
    return lang === "zh-TW" ? script !== "simp" : script !== "trad";
  }

  // ── 近一年上架 ──
  // Google Books 沒有「上架日期」，用出版日期代替。出版日期可能只有年或年月，
  // 這時用那一年（月）的最後一天判斷，寧可多列也不漏掉。
  function oneYearAgo() {
    var d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  // 回傳出版日期可能的最晚一天；沒有日期時回傳 null
  function latestPublishDate(v) {
    var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(v.publishedDate || "");
    if (!m) return null;
    var y = +m[1];
    if (m[3]) return new Date(y, +m[2] - 1, +m[3]);
    if (m[2]) return new Date(y, +m[2], 0); // 該月最後一天
    return new Date(y, 11, 31);
  }

  function isRecent(item, cutoff) {
    var d = latestPublishDate(item.volumeInfo || {});
    return d != null && d >= cutoff && d <= new Date(Date.now() + 366 * 864e5); // 排除日期明顯填錯的
  }

  function matches(item, c, cutoff) {
    if (c.lang && !matchesLang(item, c.lang)) return false;
    if (c.recent && !isRecent(item, cutoff)) return false;
    return true;
  }

  function filterLabel(c) {
    return [c.lang ? LANG_NAMES[c.lang] : "", c.recent ? "近一年上架" : ""].filter(Boolean).join("、");
  }

  function buildUrl(c, start, size) {
    var p = new URLSearchParams({
      q: buildQuery(c),
      startIndex: String(start),
      maxResults: String(size),
      printType: "books",
      country: "TW", // 沒帶這個時，Google 判斷不出使用者所在地區（例如用 VPN）會拒絕查詢
    });
    if (c.lang) p.set("langRestrict", c.lang.slice(0, 2)); // Google 只認 zh／en／ja，而且常常不理會，所以下面還會自己篩
    if (API_KEY) p.set("key", API_KEY);
    return API + "?" + p.toString();
  }

  // 把搜尋條件放進網址，方便分享或重新整理後保留
  function syncAddress(c, page) {
    var p = new URLSearchParams();
    ["title", "author", "isbn", "subject", "lang"].forEach(function (k) { if (c[k]) p.set(k, c[k]); });
    if (c.recent) p.set("recent", "1");
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

  // 呼叫 Google；失敗時回傳 { error: 狀態碼 }
  async function fetchPage(c, start, size) {
    var res;
    try {
      res = await fetch(buildUrl(c, start, size));
    } catch (e) {
      return { error: 0 };
    }
    if (!res.ok) return { error: res.status };
    var data = await res.json().catch(function () { return {}; });
    return { items: data.items || [], total: data.totalItems || 0 };
  }

  // starts：有語言或近一年篩選時，每一頁從 Google 的第幾筆開始抓（因為篩掉的筆數不固定）
  async function search(c, page, starts) {
    var seq = ++requestSeq;
    starts = starts || [0];
    searchBtn.disabled = true;
    show("搜尋中…", "info");
    syncAddress(c, page);

    var items = [], total = 0, hasMore = false, scanned = 0, r;
    var filtered = !!(c.lang || c.recent);
    if (!filtered) {
      r = await fetchPage(c, page * PAGE_SIZE, PAGE_SIZE);
      if (seq !== requestSeq) return; // 已有更新的搜尋，丟掉舊結果
      if (r.error != null) return fail(r.error);
      items = r.items;
      total = r.total;
      hasMore = items.length === PAGE_SIZE && (page + 1) * PAGE_SIZE < total;
    } else {
      var start = starts[page] || 0;
      var cutoff = oneYearAgo();
      for (var call = 0; call < LANG_MAX_CALLS; call++) {
        r = await fetchPage(c, start, LANG_FETCH);
        if (seq !== requestSeq) return;
        if (r.error != null) return fail(r.error);
        total = r.total;
        scanned += r.items.length;
        r.items.forEach(function (it) { if (matches(it, c, cutoff)) items.push(it); });
        start += LANG_FETCH;
        hasMore = r.items.length > 0 && start < total;
        // 不用 Google 的 orderBy=newest：實測搭配書名條件會回傳 0 筆，排序也不準
        if (!hasMore || items.length >= PAGE_SIZE) break;
      }
      starts[page + 1] = start;
    }
    searchBtn.disabled = false;

    resultsEl.replaceChildren();
    items.forEach(function (it) { resultsEl.appendChild(renderBook(it)); });
    current = { criteria: c, page: page, starts: starts };
    prevBtn.disabled = page === 0;
    nextBtn.disabled = !hasMore;
    pageInfo.textContent = "第 " + (page + 1) + " 頁";
    pager.hidden = !(page > 0 || hasMore);

    if (items.length === 0) {
      if (hasMore) show("這一段結果裡沒有符合「" + filterLabel(c) + "」的書，可以按「下一頁」繼續找。", "info");
      else if (page === 0) show(filtered
        ? "找不到符合「" + filterLabel(c) + "」的書，試試看換個關鍵字，或取消語言、近一年上架的限制。"
        : "找不到符合的書，試試看減少條件或換個關鍵字。", "info");
      else show("沒有更多結果了。", "info");
      return;
    }
    if (filtered) {
      // 篩選後無法估計總數，只說明這一頁
      var notes = [];
      if (c.lang && c.lang.indexOf("zh") === 0) notes.push("繁簡依書名用字判斷，可能有少數誤判");
      if (c.recent) notes.push("依出版日期判斷");
      show("本頁 " + items.length + " 本符合「" + filterLabel(c) + "」（從 " + scanned + " 筆結果中篩選" +
        (notes.length ? "；" + notes.join("；") : "") + "）", "info");
    } else {
      // Google 回傳的總數是估計值，只當作參考
      show("約 " + total.toLocaleString("zh-TW") + " 筆結果", "info");
    }
    // 手機上表單較長，搜尋後直接捲到結果
    statusEl.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function fail(status) {
    searchBtn.disabled = false;
    show(friendlyError(status), "error");
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

  category.addEventListener("change", function () {
    updateCustomField();
    if (category.value === "custom") fields.subject.focus();
  });

  recentBtn.addEventListener("click", function () {
    var on = recentBtn.getAttribute("aria-pressed") !== "true";
    recentBtn.setAttribute("aria-pressed", String(on));
    // 已經有搜尋結果時，按下就直接用新條件重查
    if (current) form.requestSubmit();
  });

  $("clear-btn").addEventListener("click", function () {
    form.reset();
    recentBtn.setAttribute("aria-pressed", "false");
    updateCustomField();
    resultsEl.replaceChildren();
    statusEl.hidden = true;
    pager.hidden = true;
    current = null;
    history.replaceState(null, "", location.pathname);
    fields.title.focus();
  });

  prevBtn.addEventListener("click", function () { if (current && current.page > 0) search(current.criteria, current.page - 1, current.starts); });
  nextBtn.addEventListener("click", function () { if (current) search(current.criteria, current.page + 1, current.starts); });

  // 網址帶有搜尋條件時（分享連結），自動帶入並搜尋
  var qp = new URLSearchParams(location.search);
  var preset = false;
  ["title", "author", "isbn", "subject", "lang"].forEach(function (k) {
    var v = qp.get(k);
    if (!v) return;
    if (k === "subject") setCategoryFromSubject(v);
    else fields[k].value = v;
    preset = true;
  });
  if (qp.get("recent") === "1") recentBtn.setAttribute("aria-pressed", "true");
  if (preset) {
    var c = readCriteria();
    // 有篩選時每頁的起點要從第一頁算起，所以分享連結一律從第一頁開始
    var page = (c.lang || c.recent) ? 0 : Math.max(0, (parseInt(qp.get("page"), 10) || 1) - 1);
    if ((c.title || c.author || c.subject || (c.isbn && validIsbn(c.isbn)))) search(c, page);
  }
})();
