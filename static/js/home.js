// home.js

// =============== PROFILE MENU =====================
document.addEventListener("DOMContentLoaded", () => {
  const usernameTrigger = document.getElementById("usernameTrigger");
  const profileIconLink = document.getElementById("profileIconLink");
  const profileMenu = document.getElementById("profileMenu");

  if (!profileMenu) return;

  const openMenu = () => {
    profileMenu.hidden = false;
    void profileMenu.offsetWidth; // reflow so transition runs
    profileMenu.classList.add("open");
  };

  const closeMenu = () => {
    profileMenu.classList.remove("open");
    setTimeout(() => {
      profileMenu.hidden = true;
    }, 150);
  };

  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    profileMenu.hidden ? openMenu() : closeMenu();
  };

  usernameTrigger?.addEventListener("click", toggleMenu);
  profileIconLink?.addEventListener("click", toggleMenu);

  document.addEventListener("click", (e) => {
    if (profileMenu.hidden) return;
    const clickedInside =
      profileMenu.contains(e.target) ||
      usernameTrigger?.contains(e.target) ||
      profileIconLink?.contains(e.target);
    if (!clickedInside) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !profileMenu.hidden) closeMenu();
  });
});

// =============== ONLY MY POSTS SWITCH =====================
document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("onlyMine");
  const feed = document.getElementById("feed_container");
  if (!cb || !feed) return;

  const uid = window.CURRENT_USER_ID || "anon";
  const KEY = `onlyMine:${uid}`;

  cb.checked = localStorage.getItem(KEY) === "1";

  const apply = () => {
    feed.classList.toggle("only-mine-filter", cb.checked);
    localStorage.setItem(KEY, cb.checked ? "1" : "0");
  };

  cb.addEventListener("change", apply);
  apply();
});

// =============== FILTER HEADER ICONS =====================
const h2 = document.querySelector("#filter_header h2");
const links = document.querySelectorAll("#icon_selection a");

links.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();

    if (link.classList.contains("selected")) {
      link.classList.remove("selected");
      if (h2) h2.textContent = "全員から";
    } else {
      links.forEach((l) => l.classList.remove("selected"));
      link.classList.add("selected");
      if (h2) h2.textContent = link.dataset.title || "全員から";
    }
  });
});

// =============== TAGS (SEARCH FILTER AREA) =====================
(function () {
  const form = document.getElementById("tag-form");
  const input = document.getElementById("tag-input");
  const tagsEl = document.getElementById("tags");
  const tags = [];
  const canon = new Set();

  if (!tagsEl) return;

  const canonicalize = (s) => s.normalize("NFKC").toLowerCase().trim();

  function render() {
    tagsEl.innerHTML = "";
    tags.forEach((t, i) => {
      const span = document.createElement("span");
      span.className = "tag";

      const label = document.createElement("span");
      label.textContent = `#${t}`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove";
      btn.textContent = "×";
      btn.addEventListener("click", () => removeAt(i));

      span.append(label, btn);
      tagsEl.append(span);
    });
  }

  function addTag(raw) {
    const val = raw.trim();
    if (!val) return;
    const c = canonicalize(val);
    if (canon.has(c)) {
      if (input) input.value = "";
      return;
    }
    tags.push(val);
    canon.add(c);
    if (input) input.value = "";
    render();
  }

  function removeAt(i) {
    const [removed] = tags.splice(i, 1);
    if (removed) canon.delete(canonicalize(removed));
    render();
  }

  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTag(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
        e.preventDefault();
        addTag(input.value);
      } else if (e.key === "Backspace" && !input.value && tags.length) {
        removeAt(tags.length - 1);
      }
    });
  }

  // Initial tags from server
  if (window.INIT_SEARCH_TAGS) {
    window.INIT_SEARCH_TAGS.split(",").forEach((t) => {
      if (t.trim()) addTag(t.trim());
    });
  }

  // expose helpers for Search/Clear
  window.getSearchTags = () => [...tags];
  window.clearSearchTags = () => {
    tags.length = 0;
    canon.clear();
    render();
  };
})();

// =============== TAGS (CREATE/EDIT POST MODAL) =====================
(function () {
  const container = document.getElementById("tag-form-post");
  const input = document.getElementById("tag-input-post");
  const addBtn = document.getElementById("tag-add-post-btn");
  const tagsEl = document.getElementById("tags-post");
  const hiddenInput = document.getElementById("tags-hidden");
  const postForm = document.getElementById("create-post-form");

  if (!container || !input || !addBtn || !tagsEl || !hiddenInput || !postForm) return;

  const tags = [];
  const canon = new Set();
  const canonicalize = (s) => s.normalize("NFKC").toLowerCase().trim();

  function render() {
    tagsEl.innerHTML = "";
    tags.forEach((t, i) => {
      const span = document.createElement("span");
      span.className = "tag";

      const label = document.createElement("span");
      label.textContent = `#${t}`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove";
      btn.textContent = "×";
      btn.addEventListener("click", () => removeAt(i));

      span.append(label, btn);
      tagsEl.append(span);
    });
  }

  function addTag(raw) {
    const val = raw.trim();
    if (!val) return;
    const c = canonicalize(val);
    if (canon.has(c)) {
      input.value = "";
      return;
    }
    tags.push(val);
    canon.add(c);
    input.value = "";
    render();
  }

  function removeAt(i) {
    const [removed] = tags.splice(i, 1);
    if (removed) canon.delete(canonicalize(removed));
    render();
  }

  addBtn.addEventListener("click", () => {
    addTag(input.value);
  });

  input.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault();
      addTag(input.value);
    } else if (e.key === "Backspace" && !input.value && tags.length) {
      removeAt(tags.length - 1);
    }
  });

  postForm.addEventListener("submit", () => {
    hiddenInput.value = tags.join(",");
  });

  // expose helpers for Create/Edit switching
  window.setPostTags = (arr) => {
    tags.length = 0;
    canon.clear();
    (arr || []).forEach((t) => addTag(String(t).trim()));
    render();
  };

  window.clearPostTags = () => {
    tags.length = 0;
    canon.clear();
    render();
  };
})();

// =============== FILTERS (SEARCH / CLEAR) =====================
const genreSelect = document.getElementById("genre_filter");
const instrumentSelect = document.getElementById("instrument_filter");
const myInstrumentSelect = document.getElementById("my_instrument_filter");

const mainSearch = document.getElementById("mainSearch");

const searchBtn = document.getElementById("search-btn");
const clearBtn = document.getElementById("clear-btn");

// Search: build URL /home?genre_filter=...&instrument_filter=...&...&tags=...&q=...
searchBtn?.addEventListener("click", () => {
  const params = new URLSearchParams();

  // ① 役割フィルター（個人 / バンド）
  const selectedIcon = document.querySelector("#icon_selection a.selected");
  if (selectedIcon) {
    const role = selectedIcon.dataset.role; // "individual" or "band"
    if (role) params.set("role", role);
  }

  // ② ジャンル
  if (genreSelect?.value) params.set("genre_filter", genreSelect.value);

  // ③ 相手の楽器
  if (instrumentSelect?.value) params.set("instrument_filter", instrumentSelect.value);

  // ④ 自分の楽器
  if (myInstrumentSelect?.value) params.set("my_instrument_filter", myInstrumentSelect.value);

  // ⑤ タグ
  const tags = window.getSearchTags ? window.getSearchTags() : [];
  if (tags.length) params.set("tags", tags.join(","));

  // ⑥ フリーテキスト検索
  if (mainSearch && mainSearch.value.trim()) params.set("q", mainSearch.value.trim());

  const qs = params.toString();
  window.location.href = qs ? `/home?${qs}` : "/home";
});

// Clear: reset UI + go back to /home (no filters)
clearBtn?.addEventListener("click", () => {
  if (genreSelect) genreSelect.value = "";
  if (instrumentSelect) instrumentSelect.value = "";
  if (myInstrumentSelect) myInstrumentSelect.value = "";

  if (window.clearSearchTags) window.clearSearchTags();
  const tagInput = document.getElementById("tag-input");
  if (tagInput) tagInput.value = "";

  if (mainSearch) mainSearch.value = "";

  // clear icon selection ("個人のみ" / "バンドのみ")
  document.querySelectorAll("#icon_selection a.selected").forEach((el) => el.classList.remove("selected"));
  if (h2) h2.textContent = "全員から";

  window.location.href = "/home";
});

// Enter in mainSearch triggers the same as Apply button
mainSearch?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchBtn?.click();
  }
});

// =============== MOBILE FILTER TOGGLE =====================
const filterIcon = document.getElementById("filterIcon");
const filterPanel = document.getElementById("filter_container");

filterIcon?.addEventListener("click", () => {
  filterPanel?.classList.toggle("is-open");
});

// =============== CREATE/EDIT POST POPUP =====================
const trigger = document.getElementById("create-post");
const overlay = document.getElementById("overlay");
const modal = document.getElementById("modal");
const closeBtn = document.getElementById("modal-close");
const modalTitle = document.querySelector("#post_or_close .modal-title");

function openPostModal() {
  if (!overlay || !modal) return;
  overlay.hidden = false;
  modal.hidden = false;
}

function closePostModal() {
  if (!overlay || !modal) return;
  overlay.hidden = true;
  modal.hidden = true;
}

// buttons/inputs in modal
const submitBtn = document.querySelector("#modal-footer .post-submit-btn");
const editIdInput = document.getElementById("edit_post_id");

// ✅ ONE delete button (the footer one)
const deleteBtn = document.getElementById("delete-post-btn");
const deleteForm = document.getElementById("delete-post-form");

function setCreateMode() {
  if (submitBtn) submitBtn.textContent = "投稿";
  if (modalTitle) modalTitle.textContent = "投稿";
  if (editIdInput) editIdInput.value = "";

  // NEW: reset remove flag
  if (removeMediaInput) removeMediaInput.value = "0";

  // clear fields
  const cap = document.getElementById("caption");
  if (cap) {
    cap.value = "";
    cap.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const genre = document.getElementById("genre_filter_post");
  const myInst = document.getElementById("instrument_filter_post");
  const targetInst = document.getElementById("my_instrument_filter_post");
  if (genre) genre.value = "";
  if (myInst) myInst.value = "";
  if (targetInst) targetInst.value = "";

  if (window.clearPostTags) window.clearPostTags();

  const preview = document.getElementById("preview");
  if (preview) preview.innerHTML = "";
  const media = document.getElementById("media");
  if (media) media.value = "";

  // ✅ hide delete in create mode
  if (deleteBtn) deleteBtn.hidden = true;
}

function setEditMode(post) {
  if (submitBtn) submitBtn.textContent = "更新";
  if (modalTitle) modalTitle.textContent = "更新";
  if (editIdInput) editIdInput.value = post.id;

  // NEW: reset remove flag when opening edit
  if (removeMediaInput) removeMediaInput.value = "0";

  const cap = document.getElementById("caption");
  if (cap) {
    cap.value = post.caption || "";
    cap.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const genre = document.getElementById("genre_filter_post");
  const myInst = document.getElementById("instrument_filter_post");
  const targetInst = document.getElementById("my_instrument_filter_post");
  if (genre) genre.value = post.genre || "";
  if (myInst) myInst.value = post.my_instrument || "";
  if (targetInst) targetInst.value = post.target_instrument || "";

  const tagArr = (post.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  if (window.setPostTags) window.setPostTags(tagArr);

  const preview = document.getElementById("preview");
  if (preview) {
    preview.innerHTML = "";
    if (post.media_path) {
      if (/\.(mp4|mov)$/i.test(post.media_path)) {
        const v = document.createElement("video");
        v.src = post.media_path;
        v.controls = true;
        // NEW: use helper so X overlay appears
        showPreviewNode(v);
      } else {
        const img = document.createElement("img");
        img.src = post.media_path;
        img.alt = "Existing media";
        // NEW: use helper so X overlay appears
        showPreviewNode(img);
      }
    }
  }

  const media = document.getElementById("media");
  if (media) media.value = "";

  // ✅ show delete only in edit mode
  if (deleteBtn) deleteBtn.hidden = false;

  // wire delete
  if (deleteBtn && deleteForm) {
    deleteBtn.onclick = (e) => {
      e.preventDefault();
      if (!confirm("この投稿を削除しますか？")) return;
      deleteForm.action = `/posts/${post.id}/delete`;
      deleteForm.submit();
    };
  }
}

// New post
trigger?.addEventListener("click", (e) => {
  e.preventDefault();
  setCreateMode();
  openPostModal();
});

overlay?.addEventListener("click", closePostModal);
closeBtn?.addEventListener("click", closePostModal);

// Edit (⚙)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".settings-btn");
  if (!btn) return;

  e.preventDefault();
  const postEl = btn.closest(".post");
  if (!postEl) return;

  const post = {
    id: postEl.dataset.postId,
    caption: JSON.parse(postEl.dataset.caption || '""') || "",
    genre: JSON.parse(postEl.dataset.genre || '""') || "",
    my_instrument: JSON.parse(postEl.dataset.myInstrument || '""') || "",
    target_instrument: JSON.parse(postEl.dataset.targetInstrument || '""') || "",
    tags: JSON.parse(postEl.dataset.tags || '""') || "",
    media_path: JSON.parse(postEl.dataset.mediaPath || '""') || "",
  };

  setEditMode(post);
  openPostModal();
});

overlay?.addEventListener("click", closePostModal);
closeBtn?.addEventListener("click", closePostModal);

// ⚙ settings button = edit mode (prefill)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".settings-btn");
  if (!btn) return;

  e.preventDefault();

  const postEl = btn.closest(".post");
  if (!postEl) return;

  const post = {
    id: postEl.dataset.postId,
    caption: JSON.parse(postEl.dataset.caption || '""') || "",
    genre: JSON.parse(postEl.dataset.genre || '""') || "",
    my_instrument: JSON.parse(postEl.dataset.myInstrument || '""') || "",
    target_instrument: JSON.parse(postEl.dataset.targetInstrument || '""') || "",
    tags: JSON.parse(postEl.dataset.tags || '""') || "",
    media_path: JSON.parse(postEl.dataset.mediaPath || '""') || "",
  };

  setEditMode(post);
  openPostModal();
});

// =============== MEDIA PREVIEW =====================
const mediaInput = document.getElementById("media");
const previewBox = document.getElementById("preview");

// NEW: hidden input to tell backend "remove existing media" (edit mode)
const removeMediaInput = document.getElementById("remove_media");

// NEW: helper to add an X button on top of preview
function ensureRemoveBtn() {
  if (!previewBox) return null;

  let btn = previewBox.querySelector(".preview-remove");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-remove";
  btn.setAttribute("aria-label", "メディアを削除");
  btn.textContent = "×";

  btn.addEventListener("click", () => {
    // clear preview UI
    previewBox.innerHTML = "";

    // clear chosen file (create mode + edit mode new selection)
    if (mediaInput) mediaInput.value = "";

    // tell backend to remove existing media (edit mode)
    if (removeMediaInput) removeMediaInput.value = "1";
  });

  previewBox.appendChild(btn);
  return btn;
}

// NEW: helper to show media + attach the X button
function showPreviewNode(node) {
  if (!previewBox) return;
  previewBox.innerHTML = "";
  previewBox.appendChild(node);
  ensureRemoveBtn();
}

if (mediaInput && previewBox) {
  mediaInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];

    // NEW: user selected a file => not removing
    if (removeMediaInput) removeMediaInput.value = "0";

    previewBox.innerHTML = "";
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Selected image preview";
      // NEW: use helper so X overlay appears
      showPreviewNode(img);
    } else if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      // NEW: use helper so X overlay appears
      showPreviewNode(video);
    }
  });
}

// =============== AUTOGROW TEXTAREA =====================
const caption = document.getElementById("caption");
if (caption) {
  const autogrow = () => {
    caption.style.height = "auto";
    caption.style.height = caption.scrollHeight + "px";
  };
  caption.addEventListener("input", autogrow);
  autogrow();
}

// =============== POST TIME → JST =====================
function formatPostTimeJST(ts) {
  if (!ts) return "";
  const base = new Date(ts.replace(" ", "T") + "Z");
  if (isNaN(base.getTime())) return ts;

  const j = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => (n < 10 ? "0" + n : "" + n);

  const yyyy = j.getUTCFullYear();
  const mm = pad(j.getUTCMonth() + 1);
  const dd = pad(j.getUTCDate());
  const hh = pad(j.getUTCHours());
  const mi = pad(j.getUTCMinutes());

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".post-time[data-utc]").forEach((el) => {
    const ts = el.dataset.utc;
    el.textContent = formatPostTimeJST(ts);
  });
});

/* ================== CHAT MODAL ================== */
document.addEventListener("DOMContentLoaded", () => {
  const launcher = document.getElementById("chatLauncher");
  const modal = document.getElementById("chatModal");

  const listView = document.getElementById("chatListView");
  const threadView = document.getElementById("chatThreadView");

  const convList = document.getElementById("chatConversations");
  const msgList = document.getElementById("chatMessages");
  const threadTitle = document.getElementById("chatThreadTitle");

  const closeBtnList = document.getElementById("chatCloseBtnList");
  const closeBtnThread = document.getElementById("chatCloseBtnThread");
  const backBtn = document.getElementById("chatBackBtn");

  const form = document.getElementById("chatSendForm");
  const input = document.getElementById("chatInput");

  if (!launcher || !modal || !listView || !threadView || !convList || !msgList) return;

  let currentConvId = null;

  // NEW: conversation delete "select mode"
  let convSelectMode = false;
  const selectedConvIds = new Set();
  let lastRenderedConvs = [];

  function ensureLauncherDot(show) {
    let dot = launcher.querySelector(".chat-unread-dot");
    if (show && !dot) {
      dot = document.createElement("span");
      dot.className = "chat-unread-dot";
      launcher.appendChild(dot);
    } else if (!show && dot) {
      dot.remove();
    }
  }

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    showList();
    loadConversations().catch(console.error);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    currentConvId = null;
    msgList.innerHTML = "";
    // NEW: exit select mode when closing
    convSelectMode = false;
    selectedConvIds.clear();
  }

  function showList() {
    listView.hidden = false;
    threadView.hidden = true;
  }

  function showThread() {
    listView.hidden = true;
    threadView.hidden = false;
  }

  // ===== UPDATED: CHAT TIME → OSAKA (Asia/Tokyo) =====
  function parseServerTimestamp(ts) {
    if (!ts) return null;
    const s = String(ts).trim();

    // If it's already ISO-like with timezone (Z or ±hh:mm), Date can parse it
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);

    // If it's "YYYY-MM-DD HH:MM:SS" (common from SQL), assume UTC like your posts do
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
      return new Date(s.replace(" ", "T") + "Z");
    }

    // Fallback: try parsing as-is
    return new Date(s);
  }

  function formatOsaka(ts) {
    const d = parseServerTimestamp(ts);
    if (!d || isNaN(d.getTime())) return ts || "";

    // Osaka = Asia/Tokyo
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  // ================================================

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      const last = msgList.lastElementChild;
      if (last) last.scrollIntoView({ block: "end" });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // NEW: header kebab + delete bar
  function ensureHeaderKebab() {
    // Try to find an existing header in listView; fall back to listView itself
    const header =
      listView.querySelector(".chat-head") ||
      listView.querySelector(".chat-list-head") ||
      listView;

    let btn = header.querySelector("#chatKebabBtn");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "chatKebabBtn";
    btn.className = "chat-kebab-btn";
    btn.textContent = "⋯";
    btn.setAttribute("aria-label", "会話を編集");

    header.prepend(btn);
    return btn;
  }

  function ensureDeleteBar() {
    let bar = listView.querySelector("#chatDeleteBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "chatDeleteBar";
    bar.className = "chat-delete-bar";
    bar.hidden = true;
    bar.innerHTML = `
      <button type="button" id="chatDeleteSelectedBtn" class="chat-delete-selected" disabled>
        削除
      </button>
    `;
    listView.appendChild(bar);
    return bar;
  }

  function updateDeleteButtonState() {
    const bar = ensureDeleteBar();
    const delBtn = bar.querySelector("#chatDeleteSelectedBtn");
    delBtn.disabled = selectedConvIds.size === 0;
  }

  function setConvSelectMode(on) {
    convSelectMode = on;
    selectedConvIds.clear();

    const bar = ensureDeleteBar();
    const delBtn = bar.querySelector("#chatDeleteSelectedBtn");
    bar.hidden = !on;
    delBtn.disabled = true;

    renderConversations(lastRenderedConvs);
  }

  function renderConversations(convs) {
    lastRenderedConvs = convs || [];
    convList.innerHTML = "";

    const hasUnread = (convs || []).some((c) => c.unread);
    ensureLauncherDot(hasUnread);

    if (!convs || !convs.length) {
      convList.innerHTML = `<li style="padding:16px;color:#666;">まだメッセージがありません</li>`;
      return;
    }

    convList.innerHTML = convs
      .map((c) => {
        const checked = selectedConvIds.has(String(c.id)) ? "checked" : "";
        return `
      <li class="chat-item" data-id="${c.id}" data-name="${escapeHtml(c.other_username)}">
        <img class="chat-avatar" src="${c.other_avatar}" alt="">
        <div class="chat-main">
          <div class="chat-name">${escapeHtml(c.other_username)}</div>
          <div class="chat-snippet">${escapeHtml(c.last_message || "")}</div>
        </div>
        <div class="chat-meta">
          ${
            convSelectMode
              ? `<input type="checkbox" class="chat-select-cb" data-id="${c.id}" aria-label="選択" ${checked}>`
              : `<div class="chat-time">${formatOsaka(c.last_created_at)}</div>
                 ${c.unread ? `<span class="chat-unread" aria-hidden="true"></span>` : ``}`
          }
        </div>
      </li>
    `;
      })
      .join("");
  }

  function renderMessages(messages) {
    msgList.innerHTML = (messages || [])
      .map((m) => {
        const who = m.from_me ? `<div class="who">You</div>` : ``;
  
        return `
          <li class="msg ${m.from_me ? "you" : ""}" data-msg-id="${m.id}">
            <div>
              <div class="bubble">
                ${who}
                <div class="body">${escapeHtml(m.body)}</div>
              </div>
            </div>
          </li>
        `;
      })
      .join("");
  
    scrollMessagesToBottom();
  }

  function appendMessage(m) {
    const li = document.createElement("li");
    li.className = `msg ${m.from_me ? "you" : ""}`;
    li.dataset.msgId = m.id;
  
    const who = m.from_me ? `<div class="who">You</div>` : ``;
  
    li.innerHTML = `
      <div>
        <div class="bubble">
          ${who}
          <div class="body">${escapeHtml(m.body)}</div>
        </div>
      </div>
    `;
  
    msgList.appendChild(li);
    scrollMessagesToBottom();
  }

  async function loadConversations() {
    const res = await fetch("/api/conversations", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load conversations");
    const convs = await res.json();
    renderConversations(convs);
  }

  async function openConversation(convId, otherName) {
    const res = await fetch(`/api/conversations/${convId}/messages`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load messages");
    const data = await res.json();

    currentConvId = data.conversation_id;
    threadTitle.textContent = otherName || data.other_username || "Chat";

    renderMessages(data.messages || []);
    showThread();

    // opening marks read in backend, so refresh list
    loadConversations().catch(console.error);
  }

  async function sendMessage(body) {
    const res = await fetch("/api/messages", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: currentConvId, body }),
    });
    if (!res.ok) throw new Error("Failed to send message");
    const msg = await res.json();
    appendMessage(msg);
    loadConversations().catch(console.error);
  }

  // Events
  launcher.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal();
  });

  closeBtnList?.addEventListener("click", closeModal);
  closeBtnThread?.addEventListener("click", closeModal);

  backBtn?.addEventListener("click", () => showList());

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // NEW: kebab + delete bar wiring
  const kebabBtn = ensureHeaderKebab();
  ensureDeleteBar();

  kebabBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConvSelectMode(!convSelectMode);
  });

  // NEW: delete selected conversations
  listView.addEventListener("click", async (e) => {
    const btn = e.target.closest("#chatDeleteSelectedBtn");
    if (!btn) return;
    if (!selectedConvIds.size) return;

    if (!confirm("選択した会話を削除しますか？")) return;

    const ids = [...selectedConvIds];

    try {
      const res = await fetch("/api/conversations/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_ids: ids }),
      });

      if (!res.ok) throw new Error("Failed to delete conversations");

      await loadConversations();
      setConvSelectMode(false);
    } catch (err) {
      console.error(err);
    }
  });

  // ✅ FIXED: conversation list click (normal open vs select mode checkbox)
  convList.addEventListener("click", (e) => {
    if (convSelectMode) {
      const item = e.target.closest(".chat-item");
      if (!item) return;

      const cb = item.querySelector(".chat-select-cb");
      if (!cb) return;

      const clickedCheckbox = e.target.closest(".chat-select-cb");

      // If they clicked the row (not the checkbox), toggle manually.
      // If they clicked the checkbox, DO NOT preventDefault (or it won't toggle).
      if (!clickedCheckbox) {
        cb.checked = !cb.checked;
      }

      const id = String(cb.dataset.id || "");
      if (!id) return;

      if (cb.checked) selectedConvIds.add(id);
      else selectedConvIds.delete(id);

      updateDeleteButtonState();
      e.stopPropagation();
      return;
    }

    const item = e.target.closest(".chat-item");
    if (!item) return;
    const id = item.dataset.id;
    const name = item.dataset.name;
    if (!id) return;
    openConversation(id, name).catch(console.error);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (input?.value || "").trim();
    if (!text || !currentConvId) return;
    input.value = "";
    try {
      await sendMessage(text);
    } catch (err) {
      console.error(err);
    }
  });

  // Bootstrap unread dot on page load
  (async function bootstrapUnreadDot() {
    try {
      const res = await fetch("/api/conversations", { credentials: "same-origin" });
      if (!res.ok) return;
      const convs = await res.json();
      ensureLauncherDot(convs.some((c) => c.unread));
    } catch (e) {
      console.error(e);
    }
  })();

  // ---- NEW: click "メッセージ" on a post => start/open conversation and jump to thread ----
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".message-btn");
    if (!btn) return;

    e.preventDefault();

    const otherUserId = btn.dataset.userId;
    const otherUsername = btn.dataset.username;

    try {
      const res = await fetch("/api/conversations/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ other_user_id: otherUserId }),
      });

      if (!res.ok) throw new Error("Failed to start conversation");
      const data = await res.json();

      // open modal UI and jump to thread
      modal.hidden = false;
      document.body.style.overflow = "hidden";

      currentConvId = data.conversation_id;
      threadTitle.textContent = otherUsername || data.other_username || "Chat";
      renderMessages(data.messages || []);
      showThread();

      // NEW: make sure selection mode is off when jumping in
      setConvSelectMode(false);

      loadConversations().catch(console.error);
    } catch (err) {
      console.error(err);
    }
  });
});

// =============== USER SEARCH DROPDOWN (CLICK ONLY, ENTER DOES NOTHING) =====================
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("mainSearch");
  const dropdown = document.getElementById("searchDropdown");
  if (!input || !dropdown) return;

  let debounceTimer = null;
  let aborter = null;

  const hide = () => {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
  };

  const show = () => {
    dropdown.hidden = false;
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const render = (users) => {
    if (!users || users.length === 0) {
      dropdown.innerHTML = `<div style="padding:10px 12px;color:#666;">No users found</div>`;
      show();
      return;
    }

    dropdown.innerHTML = users
      .map((u) => {
        const url = `/user/${u.id}`; // only used on click
        const avatar = u.avatar || "/static/img/profile_icon.png";
        return `
          <button type="button" class="search-item" data-url="${escapeHtml(url)}">
            <img class="search-item-avatar" src="${escapeHtml(avatar)}" alt="">
            <span class="search-item-name">${escapeHtml(u.username || "")}</span>
          </button>
        `;
      })
      .join("");

    show();
  };

  const fetchUsers = async (q) => {
    if (aborter) aborter.abort();
    aborter = new AbortController();

    const res = await fetch(`/api/user_search?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
      signal: aborter.signal,
    });

    if (!res.ok) throw new Error("User search failed");
    return res.json();
  };

  // typing updates dropdown only
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!q) {
      hide();
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const users = await fetchUsers(q);
        render(users);
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);
        hide();
      }
    }, 180);
  });

  // click only navigates
  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".search-item");
    if (!item) return;
    const url = item.dataset.url;
    if (url) window.location.href = url;
  });

  // HARD BLOCK: Enter should do NOTHING (keep popup), and must NOT trigger filters/feed.
  // Capture phase + stopImmediatePropagation prevents your other mainSearch keydown listeners.
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // do nothing else — keep dropdown open
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        hide();
      }
    },
    true
  );

  // keep popup open when clicking inside; close when clicking outside
  document.addEventListener("click", (e) => {
    const inside = dropdown.contains(e.target) || input.contains(e.target);
    if (!inside) hide();
  });

  // when the X (search cancel) is pressed in <input type="search">
  input.addEventListener("search", () => {
    if (!input.value.trim()) hide();
  });
});
