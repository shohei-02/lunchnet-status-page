// ランチネット 本日の出店状況ページ
// status.json（Heroku 側の generate_status_json が毎朝8時ごろに更新して push）を読んで描画する。
// データの生成・判定はサーバ側。ここは「読みやすく見せる」だけ。

(function () {
  "use strict";

  var WEEKDAY = "日月火水木金土"; // JS の getDay() は 0=日
  var CLOSE_HHMM = "13:30";       // 平日のランチネット販売終了時刻（JST）。これ以降は全店「営業終了」表示

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

  function renderList(locations) {
    var node = tpl("tpl-list");
    var ul = node.querySelector(".loc-list");
    locations.forEach(function (loc) {
      var isOpen = loc.status === "open";
      var row = tpl("tpl-loc-row");
      var li = row.querySelector(".loc-row");
      li.classList.add(isOpen ? "is-open" : "is-closed");
      row.querySelector(".loc-name").textContent = loc.name + "店";
      row.querySelector(".loc-status-text").textContent = isOpen ? "出店予定" : "本日お休み";
      ul.appendChild(row);
    });
    replaceBoard(node);
  }

  function renderListClosedToday(locations) {
    // 13:30 以降。リストは見せるが、全店「営業終了」表示＋上に「本日終了しました」バナー。
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

    var node = tpl("tpl-list");
    var ul = node.querySelector(".loc-list");
    var legend = node.querySelector(".legend");
    if (legend) legend.remove(); // 全店「営業終了」なので凡例は意味がない
    locations.forEach(function (loc) {
      var row = tpl("tpl-loc-row");
      var li = row.querySelector(".loc-row");
      li.classList.add("is-closed-today");
      row.querySelector(".loc-name").textContent = loc.name + "店";
      row.querySelector(".loc-status-text").textContent = "営業終了";
      ul.appendChild(row);
    });
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
    if (data.generated_at) {
      var t = new Date(data.generated_at);
      var hh = String(t.getHours()).padStart(2, "0");
      var mm = String(t.getMinutes()).padStart(2, "0");
      line += "　最終更新 " + hh + ":" + mm;
    }
    setDatebar(line);

    // 平日の 13:30 を過ぎたら全店「営業終了」表示に切り替える（クライアント判定・JST固定）。
    if (isAfterCloseJst()) {
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

  // キャッシュを確実に避けて取得（毎朝の更新を取りこぼさない）
  fetch("status.json?_=" + Date.now(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(applyShow)
    .catch(showLoadError);
})();
