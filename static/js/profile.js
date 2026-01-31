// profile.js

document.addEventListener("DOMContentLoaded", () => {
  const profileIconLink = document.getElementById("profileIconLink");
  const profileMenu = document.getElementById("profileMenu");
  if (!profileIconLink || !profileMenu) return;

  const openMenu = () => {
    profileMenu.hidden = false;
    void profileMenu.offsetWidth;
    profileMenu.classList.add("open");
  };

  const closeMenu = () => {
    profileMenu.classList.remove("open");
    setTimeout(() => { profileMenu.hidden = true; }, 150);
  };

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    profileMenu.hidden ? openMenu() : closeMenu();
  };

  profileIconLink.addEventListener("click", toggle);

  document.addEventListener("click", (e) => {
    if (profileMenu.hidden) return;
    if (!profileMenu.contains(e.target) && !profileIconLink.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !profileMenu.hidden) closeMenu();
  });
});


/* ================== SETTINGS MENU + EDIT POPUP + DELETE POPUP ================== */
document.addEventListener("DOMContentLoaded", () => {
  const settingsBtn = document.getElementById("settingsIconLink");
  const menu = document.getElementById("settingsMenu");

  const editPopup = document.getElementById("editPopup");
  const closeEditPopupBtn = document.getElementById("closePopup");
  const editBtn = document.getElementById("editAccountBtn");

  const iconInput = document.getElementById("iconInput");
  const currentIcon = document.getElementById("currentIcon");

  const deleteBtn = document.getElementById("deleteAccountBtn");
  const deletePopup = document.getElementById("deletePopup");
  const closeDeletePopupBtn = document.getElementById("closeDeletePopup");
  const cancelDeletePopupBtn = document.getElementById("cancelDeletePopup");
  const deleteForm = document.getElementById("deleteAccountForm");
  const deleteError = document.getElementById("deleteError");

  if (!settingsBtn || !menu) return;

  const openMenu = () => {
    menu.hidden = false;
    void menu.offsetWidth; // force reflow for transition
    menu.classList.add("open");
  };

  const closeMenu = () => {
    menu.classList.remove("open");
    setTimeout(() => { menu.hidden = true; }, 150);
  };

  // Toggle settings menu
  settingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });

  // Close menu on outside click
  document.addEventListener("click", (e) => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && !settingsBtn.contains(e.target)) closeMenu();
  });

  // Close menu on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) closeMenu();
  });

  // ---------------- EDIT POPUP ----------------
  editBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    if (editPopup) editPopup.hidden = false;
  });

  closeEditPopupBtn?.addEventListener("click", () => {
    if (editPopup) editPopup.hidden = true;
  });

  editPopup?.addEventListener("click", (e) => {
    if (e.target === editPopup) editPopup.hidden = true;
  });

  // icon preview
  iconInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentIcon) return;
    currentIcon.src = URL.createObjectURL(file);
  });

  // ---------------- DELETE POPUP ----------------
  const openDeletePopup = () => {
    if (!deletePopup) return;
    deletePopup.hidden = false;

    const pw = document.getElementById("deletePassword");
    if (pw) pw.value = "";

    if (deleteError) {
      deleteError.hidden = true;
      deleteError.textContent = "";
    }
  };

  const closeDeletePopup = () => {
    if (deletePopup) deletePopup.hidden = true;
  };

  deleteBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    openDeletePopup();
  });

  closeDeletePopupBtn?.addEventListener("click", closeDeletePopup);
  cancelDeletePopupBtn?.addEventListener("click", closeDeletePopup);

  deletePopup?.addEventListener("click", (e) => {
    if (e.target === deletePopup) closeDeletePopup();
  });

  deleteForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("deletePassword")?.value || "";

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (deleteError) {
          deleteError.textContent = data.error || "削除に失敗しました";
          deleteError.hidden = false;
        }
        return;
      }

      // success: redirect to login
      window.location.href = "/login";
    } catch (err) {
      if (deleteError) {
        deleteError.textContent = "通信エラーが発生しました";
        deleteError.hidden = false;
      }
      console.error(err);
    }
  });
});


/* ================== FOLLOWERS / FOLLOWING POPUP ================== */
document.addEventListener("DOMContentLoaded", () => {
  const userId = window.PAGE_USER_ID;

  const followersBtn = document.getElementById("followersBtn");
  const followingBtn = document.getElementById("followingBtn");

  const modal = document.getElementById("followModal");
  const closeBtn = document.getElementById("closeFollowModal");
  const titleEl = document.getElementById("followModalTitle");
  const listEl = document.getElementById("followList");
  const emptyEl = document.getElementById("followEmpty");

  if (!userId || !modal || !listEl || !titleEl || !emptyEl) return;

  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; };

  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  async function load(type) {
    titleEl.textContent = type === "followers" ? "フォロワー" : "フォロー";
    listEl.innerHTML = "";
    emptyEl.hidden = true;

    const url = type === "followers"
      ? `/api/users/${userId}/followers`
      : `/api/users/${userId}/following`;

    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = "0";
      return;
    }

    listEl.innerHTML = data.map(u => `
      <li class="follow-item">
        <a class="follow-link" href="/user/${u.id}">
          <img class="follow-avatar" src="${u.avatar || window.DEFAULT_AVATAR}" alt="">
          <span class="follow-name">${escapeHtml(u.username)}</span>
        </a>
      </li>
    `).join("");
  }

  followersBtn?.addEventListener("click", async () => {
    open();
    try { await load("followers"); } catch (e) { console.error(e); }
  });

  followingBtn?.addEventListener("click", async () => {
    open();
    try { await load("following"); } catch (e) { console.error(e); }
  });

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
});


/* ================== SHOWCASE EDITOR (upload multiple picks, delete-mode) ================== */
document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("showcaseEditTrigger");
  const popup = document.getElementById("showcasePopup");
  const closeBtn = document.getElementById("closeShowcasePopup");

  const editorGrid = document.getElementById("editorGrid");
  const addTile = document.getElementById("addTile");
  const uploadInputs = document.getElementById("uploadInputs");

  const preview = document.getElementById("showcasePreview"); // optional (only if you have it)

  const enterDelete = document.getElementById("enterDelete");
  const cancelDelete = document.getElementById("cancelDelete");
  const confirmDelete = document.getElementById("confirmDelete");
  const deleteModeActions = document.querySelector(".delete-mode-actions");
  const deleteInputs = document.getElementById("deleteInputs");

  if (!trigger || !popup || !editorGrid || !addTile) return;

  let previewUrls = [];

  const openPopup = () => {
    popup.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => popup.classList.add("is-open"));
  };

  const closePopup = () => {
    popup.classList.remove("is-open");
    document.body.classList.remove("modal-open");

    // exit delete mode on close
    editorGrid.classList.remove("delete-mode");
    if (deleteModeActions) deleteModeActions.hidden = true;
    if (enterDelete) enterDelete.hidden = false;
    if (deleteInputs) deleteInputs.innerHTML = "";
    editorGrid.querySelectorAll(".tile.selected").forEach(t => t.classList.remove("selected"));

    // hide preview
    if (preview) {
      preview.innerHTML = "";
      preview.hidden = true;
    }

    // cleanup pending uploads + object URLs
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    if (uploadInputs) uploadInputs.innerHTML = "";
    editorGrid.querySelectorAll(".tile.upload").forEach(n => n.remove());

    setTimeout(() => { popup.hidden = true; }, 150);
  };

  trigger.addEventListener("click", (e) => { e.preventDefault(); openPopup(); });
  closeBtn?.addEventListener("click", closePopup);
  popup.addEventListener("click", (e) => { if (e.target === popup) closePopup(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popup.hidden) closePopup();
  });

  // Ensure "+" tile is first
  if (editorGrid.firstElementChild !== addTile) {
    editorGrid.prepend(addTile);
  }

  function renderPreview(src, type) {
    if (!preview) return;
    preview.hidden = false;
    preview.innerHTML = "";

    if (type === "video") {
      const v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.playsInline = true;
      v.autoplay = true;
      preview.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = src;
      preview.appendChild(img);
    }
  }

  function addUploadInputAndPick() {
    if (!uploadInputs) {
      console.error("Missing #uploadInputs in HTML. Add: <div id='uploadInputs' hidden></div>");
      return;
    }

    const inp = document.createElement("input");
    inp.type = "file";
    inp.name = "files[]";            // Flask: request.files.getlist("files[]")
    inp.accept = "image/*,video/*";
    inp.multiple = true;
    inp.hidden = true;

    uploadInputs.appendChild(inp);

    inp.addEventListener("change", () => {
      const files = Array.from(inp.files || []);
      if (!files.length) {
        inp.remove(); // user canceled
        return;
      }

      let insertAfter = addTile;

      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        previewUrls.push(url);

        const tile = document.createElement("div");
        tile.className = "tile upload";
        tile.dataset.previewUrl = url;
        tile.dataset.previewType = file.type.startsWith("video/") ? "video" : "image";
        tile.innerHTML = `
          <span class="check" aria-hidden="true"></span>
          <div class="thumb"></div>
        `;

        const thumb = tile.querySelector(".thumb");
        if (file.type.startsWith("video/")) {
          const v = document.createElement("video");
          v.src = url;
          v.muted = true;
          v.playsInline = true;
          thumb.appendChild(v);
        } else {
          const img = document.createElement("img");
          img.src = url;
          thumb.appendChild(img);
        }

        insertAfter.after(tile);
        insertAfter = tile;
      });

      // preview last picked
      const lastTileUrl = insertAfter.dataset.previewUrl;
      const lastTileType = insertAfter.dataset.previewType;
      if (lastTileUrl && lastTileType) renderPreview(lastTileUrl, lastTileType);
    });

    inp.click();
  }

  addTile.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (editorGrid.classList.contains("delete-mode")) return;
    addUploadInputAndPick();
  });

  // Delete mode controls
  enterDelete?.addEventListener("click", () => {
    editorGrid.classList.add("delete-mode");
    enterDelete.hidden = true;
    if (deleteModeActions) deleteModeActions.hidden = false;
  });

  cancelDelete?.addEventListener("click", () => {
    editorGrid.classList.remove("delete-mode");
    if (deleteModeActions) deleteModeActions.hidden = true;
    if (enterDelete) enterDelete.hidden = false;
    if (deleteInputs) deleteInputs.innerHTML = "";
    editorGrid.querySelectorAll(".tile.selected").forEach(t => t.classList.remove("selected"));
  });

  // Click behavior
  editorGrid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    if (tile.classList.contains("add")) return;

    if (editorGrid.classList.contains("delete-mode")) {
      tile.classList.toggle("selected");
      return;
    }

    const existingPath = tile.dataset.path;
    if (existingPath) {
      const isVideo = !!tile.querySelector("video");
      renderPreview(existingPath, isVideo ? "video" : "image");
      return;
    }

    const u = tile.dataset.previewUrl;
    const t = tile.dataset.previewType;
    if (u && t) renderPreview(u, t);
  });

  // Confirm delete -> submit form
  confirmDelete?.addEventListener("click", () => {
    if (!deleteInputs) return;

    deleteInputs.innerHTML = "";
    const selected = Array.from(editorGrid.querySelectorAll(".tile.selected"));

    selected.forEach(tile => {
      const id = tile.dataset.id;
      if (!id) return;
      const inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = "delete_ids";
      inp.value = id;
      deleteInputs.appendChild(inp);
    });

    document.getElementById("showcaseForm")?.submit();
  });
});


/* ================== CHAT MODAL (shared: home/profile/user_profile) ================== */
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

  // ---- NEW: conversation delete "select mode"
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

    // exit select mode
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

  // ---- NEW: header kebab + delete bar
  function ensureHeaderKebab() {
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

  // ---- kebab + delete bar wiring
  const kebabBtn = ensureHeaderKebab();
  ensureDeleteBar();

  kebabBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConvSelectMode(!convSelectMode);
  });

  // ---- delete selected conversations
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

  // ✅ FIXED: conversation list click (normal open vs select mode)
  convList.addEventListener("click", (e) => {
    if (convSelectMode) {
      const item = e.target.closest(".chat-item");
      if (!item) return;

      const cb = item.querySelector(".chat-select-cb");
      if (!cb) return;

      const clickedCheckbox = e.target.closest(".chat-select-cb");
      if (!clickedCheckbox) cb.checked = !cb.checked;

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
});
