// ランチネット 本日の出店状況ページ
// status.json（Heroku 側の generate_status_json が毎朝8時ごろに更新して push）を読んで描画する。
// データの生成・判定はサーバ側。ここは「読みやすく見せる」だけ。

(function () {
  "use strict";

  var WEEKDAY = "日月火水木金土"; // JS の getDay() は 0=日

  function todayLocalISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
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
      row.querySelector(".loc-name").textContent = loc.name;
      row.querySelector(".loc-status-text").textContent = isOpen ? "出店予定" : "本日はお休み";
      ul.appendChild(row);
    });
    replaceBoard(node);
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
    renderList(data.locations || []);
  }

  function showLoadError() {
    setDatebar(formatDate(todayLocalISO()));
    renderMessage(
      "is-error",
      "出店状況を読み込めませんでした",
      "お手数ですが、公式LINEの最新メッセージをご確認ください。"
    );
  }

  // キャッシュを確実に避けて取得（毎朝の更新を取りこぼさない）
  fetch("status.json?_=" + Date.now(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(show)
    .catch(showLoadError);
})();
