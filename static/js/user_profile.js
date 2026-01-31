// user_profile.js

// ================== HEADER PROFILE MENU ==================
document.addEventListener("DOMContentLoaded", () => {
  const profileIconLink = document.getElementById("profileIconLink");
  const profileMenu = document.getElementById("profileMenu");

  if (!profileMenu) return;

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

  profileIconLink?.addEventListener("click", toggle);

  document.addEventListener("click", (e) => {
    if (profileMenu.hidden) return;
    if (!profileMenu.contains(e.target) && !profileIconLink?.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !profileMenu.hidden) closeMenu();
  });
});


// ================== FOLLOW / UNFOLLOW ==================
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("followBtn");
  if (!btn) return;

  const userId = Number(btn.dataset.userId);

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("follow api error", data);
      throw new Error("follow api error");
    }
    return data;
  }

  function setUI(isFollowing) {
    btn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
    btn.textContent = isFollowing ? "フォロー中" : "フォローする";

    if (isFollowing) {
      btn.style.background = "#000";
      btn.style.color = "#fff";
      btn.style.borderColor = "#000";
    } else {
      btn.style.background = "#fff";
      btn.style.color = "#000";
      btn.style.borderColor = "#000";
    }
  }

  // init
  setUI(btn.getAttribute("aria-pressed") === "true");

  btn.addEventListener("click", async () => {
    try {
      // ✅ send key that backend definitely accepts
      const data = await postJSON("/api/follow/toggle", { other_user_id: userId });
      setUI(!!data.is_following);

      if (typeof data.follower_count === "number") {
        const el = document.querySelector(".follower-count");
        if (el) el.textContent = String(data.follower_count);
      }
    } catch (err) {
      console.error(err);
    }
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

  // conversation select-delete mode
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

  // header kebab + delete bar
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

    const hasUnread = (convs || []).some(c => c.unread);
    ensureLauncherDot(hasUnread);

    if (!convs || !convs.length) {
      convList.innerHTML = `<li style="padding:16px;color:#666;">まだメッセージがありません</li>`;
      return;
    }

    convList.innerHTML = convs.map(c => {
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
    }).join("");
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

    // opening marks read, refresh list
    loadConversations().catch(console.error);
  }

  async function sendMessage(body) {
    const res = await fetch("/api/messages", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: currentConvId, body })
    });
    if (!res.ok) throw new Error("Failed to send message");
    const msg = await res.json();
    appendMessage(msg);
    loadConversations().catch(console.error);
  }

  // events
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

  // kebab + delete bar wiring
  const kebabBtn = ensureHeaderKebab();
  ensureDeleteBar();

  kebabBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConvSelectMode(!convSelectMode);
  });

  // delete selected conversations
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
        body: JSON.stringify({ conversation_ids: ids })
      });
      if (!res.ok) throw new Error("Failed to delete conversations");

      await loadConversations();
      setConvSelectMode(false);
    } catch (err) {
      console.error(err);
    }
  });

  // conversation list click: open vs select
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
    try { await sendMessage(text); } catch (err) { console.error(err); }
  });

  // unread dot on load
  (async function bootstrapUnreadDot() {
    try {
      const res = await fetch("/api/conversations", { credentials: "same-origin" });
      if (!res.ok) return;
      const convs = await res.json();
      ensureLauncherDot(convs.some(c => c.unread));
    } catch (e) {
      console.error(e);
    }
  })();

  // ✅ UPDATED: Message button on user profile (opens chat directly with that user)
  const messageBtn = document.getElementById("messageBtn");
  if (messageBtn) {
    messageBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const otherUserId = Number(messageBtn.dataset.userId);
      if (!otherUserId) return;

      try {
        // open modal
        modal.hidden = false;
        document.body.style.overflow = "hidden";

        // start/open conversation
        const res = await fetch("/api/conversations/start", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ other_user_id: otherUserId }),
        });
        if (!res.ok) throw new Error("Failed to start conversation");
        const data = await res.json();

        // go directly to thread
        currentConvId = data.conversation_id;
        threadTitle.textContent = data.other_username || "Chat";
        renderMessages(data.messages || []);
        showThread();

        // refresh list
        loadConversations().catch(console.error);
      } catch (err) {
        console.error(err);
      }
    });
  }
  // ✅ UPDATED END
});
