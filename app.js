// ランチネット 本日の出店状況ページ
// status.json（Heroku 側の generate_status_json が毎朝8時ごろに更新して push）を読んで描画する。
// データの生成・判定はサーバ側。ここは「読みやすく見せる」だけ。

(function () {
  "use strict";

  var WEEKDAY = "日月火水木金土"; // JS の getDay() は 0=日
  var CLOSE_HHMM = "13:30";       // 平日のランチネット販売終了時刻（JST）。これ以降は全店「営業終了」表示
  var FAV_KEY = "lunchnet_favorites_v1"; // LocalStorage キー（v1=拠点no配列）

  // お気に入りは「拠点 no」配列で管理する。name は将来変わる可能性があるが no は固定。
  function loadFavorites() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === "number"; }) : [];
    } catch (e) { return []; }
  }
  function saveFavorites(favs) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) { /* QuotaExceeded等は黙殺 */ }
  }
  function toggleFavorite(no) {
    var favs = loadFavorites();
    var idx = favs.indexOf(no);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(no);
    saveFavorites(favs);
    return favs;
  }
  function partitionByFavorite(locations, favs) {
    var favSet = new Set(favs);
    var fav = [];
    var rest = [];
    locations.forEach(function (loc) {
      (favSet.has(loc.no) ? fav : rest).push(loc);
    });
    // それぞれ no 順を維持（locations は build_status で no 順保証されているが念のため）
    fav.sort(function (a, b) { return a.no - b.no; });
    rest.sort(function (a, b) { return a.no - b.no; });
    return { fav: fav, rest: rest };
  }

  function todayLocalISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function isAfterCloseJst() {
    // お客様の端末タイムゾーンに依らず、JSTで 13:30 を過ぎているか判定。
    // 端末時計がずれていれば誤判定するが、スマホの時計はほぼ自動同期されている前提。
    var hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo", hour12: false, hour: "2-digit", minute: "2-digit"
    }).format(new Date());
    return hhmm >= CLOSE_HHMM;
  }

  function formatDate(iso, weekday) {
    // iso = "2026-05-12" → "2026年5月12日（火）"
    var parts = (iso || "").split("-");
    if (parts.length !== 3) return iso || "";
    var w = weekday || WEEKDAY[new Date(iso + "T00:00:00").getDay()] || "";
    return Number(parts[0]) + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日（" + w + "）";
  }

  function tpl(id) {
    return document.getElementById(id).content.cloneNode(true);
  }

  function setDatebar(text) {
    document.getElementById("datebar").textContent = text;
  }

  function renderMessage(kind, head, body) {
    var node = tpl("tpl-message");
    var box = node.querySelector(".message");
    box.classList.add(kind); // is-rest / is-pending / is-error
    node.querySelector(".message-head").textContent = head;
    node.querySelector(".message-body").textContent = body;
    replaceBoard(node);
  }

  function buildRow(loc, isFav) {
    var row = tpl("tpl-loc-row");
    var li = row.querySelector(".loc-row");
    var cls, label;
    if (loc.status === "open") {
      cls = "is-open"; label = "出店予定";
    } else if (loc.status === "sold_out") {
      // 拠点別QRから即時切替えされた「完売」表示。お休みと別の第3状態として目で見分けられる。
      cls = "is-sold-out"; label = "完売";
    } else {
      cls = "is-closed"; label = "本日お休み";
    }
    li.classList.add(cls);
    if (isFav) li.classList.add("is-fav");
    li.dataset.no = String(loc.no);
    row.querySelector(".loc-name").textContent = loc.name + "店";
    row.querySelector(".loc-status-text").textContent = label;
    var btn = row.querySelector(".fav-btn");
    btn.setAttribute("aria-pressed", isFav ? "true" : "false");
    btn.setAttribute("aria-label", (isFav ? "お気に入りから外す: " : "お気に入りに追加: ") + loc.name + "店");
    return row;
  }

  function renderList(locations) {
    var node = tpl("tpl-list");
    var ul = node.querySelector(".loc-list");
    var legend = node.querySelector(".legend");

    var groups = partitionByFavorite(locations, loadFavorites());
    var frag = document.createDocumentFragment();

    if (groups.fav.length) {
      var favLabel = document.createElement("p");
      favLabel.className = "fav-section-label";
      favLabel.textContent = "お気に入り";
      frag.appendChild(favLabel);
      var favUl = document.createElement("ul");
      favUl.className = "loc-list loc-list--fav";
      groups.fav.forEach(function (loc) { favUl.appendChild(buildRow(loc, true)); });
      frag.appendChild(favUl);

      var restLabel = document.createElement("p");
      restLabel.className = "fav-section-label";
      restLabel.textContent = "そのほかの店舗";
      frag.appendChild(restLabel);
    }

    groups.rest.forEach(function (loc) { ul.appendChild(buildRow(loc, false)); });
    if (groups.fav.length) ul.classList.add("loc-list--rest");
    frag.appendChild(ul);
    if (legend) frag.appendChild(legend); // 凡例は最下部

    var board = document.getElementById("board");
    board.innerHTML = "";
    board.appendChild(frag);
  }

  function buildClosedTodayRow(loc, isFav) {
    var row = tpl("tpl-loc-row");
    var li = row.querySelector(".loc-row");
    li.classList.add("is-closed-today");
    if (isFav) li.classList.add("is-fav");
    li.dataset.no = String(loc.no);
    row.querySelector(".loc-name").textContent = loc.name + "店";
    row.querySelector(".loc-status-text").textContent = "営業終了";
    var btn = row.querySelector(".fav-btn");
    btn.setAttribute("aria-pressed", isFav ? "true" : "false");
    btn.setAttribute("aria-label", (isFav ? "お気に入りから外す: " : "お気に入りに追加: ") + loc.name + "店");
    return row;
  }

  function renderListClosedToday(locations) {
    // 13:30 以降。リストは見せるが、全店「営業終了」表示＋上に「本日終了しました」バナー。
    // お気に入りはここでも先頭に集めて表示する（視認性のため）。
    var frag = document.createDocumentFragment();

    var banner = document.createElement("div");
    banner.className = "banner-closed-today";
    var head = document.createElement("p");
    head.className = "banner-head";
    head.textContent = "本日の営業は全店終了しました";
    var body = document.createElement("p");
    body.className = "banner-body";
    body.textContent = "またのご来店をお待ちしております。";
    banner.appendChild(head);
    banner.appendChild(body);
    frag.appendChild(banner);

    var groups = partitionByFavorite(locations, loadFavorites());

    if (groups.fav.length) {
      var favLabel = document.createElement("p");
      favLabel.className = "fav-section-label";
      favLabel.textContent = "お気に入り";
      frag.appendChild(favLabel);
      var favUl = document.createElement("ul");
      favUl.className = "loc-list loc-list--fav";
      groups.fav.forEach(function (loc) { favUl.appendChild(buildClosedTodayRow(loc, true)); });
      frag.appendChild(favUl);

      var restLabel = document.createElement("p");
      restLabel.className = "fav-section-label";
      restLabel.textContent = "そのほかの店舗";
      frag.appendChild(restLabel);
    }

    var node = tpl("tpl-list");
    var ul = node.querySelector(".loc-list");
    var legend = node.querySelector(".legend");
    if (legend) legend.remove(); // 全店「営業終了」なので凡例は意味がない
    groups.rest.forEach(function (loc) { ul.appendChild(buildClosedTodayRow(loc, false)); });
    if (groups.fav.length) ul.classList.add("loc-list--rest");
    frag.appendChild(node);

    replaceBoard(frag);
  }

  function replaceBoard(node) {
    var board = document.getElementById("board");
    board.innerHTML = "";
    board.appendChild(node);
  }

  function show(data) {
    var today = todayLocalISO();

    // status.json が今日の分でない＝まだ朝の更新が走っていない / 更新に失敗している。
    // 古い情報を断定表示せず「準備中」にする。
    var stale = !data.date || data.date !== today;

    if (data.business_day === false && !stale) {
      setDatebar(formatDate(data.date, data.weekday));
      renderMessage(
        "is-rest",
        "本日はランチネット全店お休みです",
        "土日祝はお休みをいただいています。次の営業日にまたお会いしましょう。"
      );
      return;
    }

    if (stale || data.all_unregistered) {
      setDatebar(formatDate(today));
      renderMessage(
        "is-pending",
        "本日の出店情報は準備中です",
        "毎朝8時ごろに更新されます。少し時間をおいてもう一度ご覧ください。"
      );
      return;
    }

    var line = formatDate(data.date, data.weekday);
    var afterClose = isAfterCloseJst();
    if (afterClose) {
      // 13:30以降は全店「営業終了」に切り替わるので、最終更新時刻も 13:30 に揃える（朝の生成時刻を出し続けると「13:30に状態が変わったのに更新時刻は8:00のまま」になり違和感が出る）
      line += "　最終更新 " + CLOSE_HHMM;
    } else if (data.generated_at) {
      var t = new Date(data.generated_at);
      var hh = String(t.getHours()).padStart(2, "0");
      var mm = String(t.getMinutes()).padStart(2, "0");
      line += "　最終更新 " + hh + ":" + mm;
    }
    setDatebar(line);

    // 平日の 13:30 を過ぎたら全店「営業終了」表示に切り替える（クライアント判定・JST固定）。
    if (afterClose) {
      renderListClosedToday(data.locations || []);
    } else {
      renderList(data.locations || []);
    }
  }

  function showLoadError() {
    setDatebar(formatDate(todayLocalISO()));
    renderMessage(
      "is-error",
      "出店状況を読み込めませんでした",
      "お手数ですが、公式LINEの最新メッセージをご確認ください。"
    );
  }

  // ページを開いたまま 13:30 をまたいだ場合に、再フェッチせず再描画だけして表示を切り替える。
  // 60秒ごとに「営業終了状態」が変わったかだけ見る。変わったときだけ描画を作り直す。
  var lastData = null;
  var lastAfterClose = null;
  function applyShow(data) {
    lastData = data;
    lastAfterClose = isAfterCloseJst();
    show(data);
  }
  setInterval(function () {
    if (!lastData) return;
    var nowAfter = isAfterCloseJst();
    if (nowAfter !== lastAfterClose) {
      lastAfterClose = nowAfter;
      show(lastData);
    }
  }, 60 * 1000);

  // 操作結果のフィードバック（画面下に短いメッセージを出す）。
  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("show");
    void toast.offsetWidth; // CSS の遷移を初期化するための reflow
    toast.classList.add("show");
    if (toast._t) clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 2400);
  }

  // ♥ボタンの委譲ハンドラ。board は同じ要素で再利用されるので一度だけ登録すればよい。
  document.getElementById("board").addEventListener("click", function (e) {
    var btn = e.target.closest(".fav-btn");
    if (!btn) return;
    var row = btn.closest(".loc-row");
    if (!row || !row.dataset.no) return;
    var no = Number(row.dataset.no);
    if (Number.isNaN(no)) return;

    // 状態取得（toggle 前）
    var wasFav = btn.getAttribute("aria-pressed") === "true";

    // ハートをポンと弾ませる（古いDOM上で・180ms後の再描画で入れ替わるが、その間に視認できる）
    var icon = btn.querySelector(".fav-icon");
    if (icon) {
      icon.classList.remove("is-popping");
      void icon.offsetWidth;
      icon.classList.add("is-popping");
    }

    // 状態切替＋トースト表示は即時。再描画は短いウェイトを挟んでアニメと共存させる。
    toggleFavorite(no);
    showToast(wasFav ? "お気に入りから外しました" : "お気に入りに登録しました");
    setTimeout(function () {
      if (lastData) show(lastData);
      // 並べ替え後の状態を確認してもらうため、上部のお気に入りセクションへ自動スクロール
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 180);
  });

  // キャッシュを確実に避けて取得（毎朝の更新を取りこぼさない）
  fetch("status.json?_=" + Date.now(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(applyShow)
    .catch(showLoadError);
})();
