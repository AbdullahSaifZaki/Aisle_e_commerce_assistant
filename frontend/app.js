"use strict";

import { createChatApi } from './api.js';
import { AuthenticationRequiredError } from './auth.js';
import { bindMobileViewport } from './mobile-viewport.js';

export function startChat({ config, auth, user, onAuthenticationRequired }) {
  const root = document.getElementById("aisle-app");
  bindMobileViewport(root);
  const find = (selector) => root.querySelector(selector);
  const storageKey = `aisle.conversations.v1.${config.demoMode ? "demo" : "live"}.${encodeURIComponent(user.sub)}`;
  const chatApi = createChatApi(auth, config);
  const input = find("textarea");
  const log = find(".messages");
  const history = find(".history-list");
  const scroll = find(".chat-scroll");
  const pending = new Set();
  const failures = new Map();
  const drafts = new Map();
  let chatMenu = null;
  let streamSeq = 0;
  const icons = {
    "shopping-bag": '<path d="M6 7h12l2 13H4L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2M9 11a3 3 0 0 0 6 0"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1Z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    "message-circle": '<path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.9A9 9 0 1 1 21 11.5Z"/>',
    "panel-left": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
    "arrow-up": '<path d="m6 11 6-6 6 6M12 5v14"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    package: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };

  function icon(name) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) node.setAttribute(key, value);
    node.innerHTML = icons[name];
    return node;
  }
  root.querySelectorAll("[data-lucide]").forEach(node => node.replaceWith(icon(node.dataset.lucide)));

  // Reveal hero product widgets only once their image files exist.
  root.querySelectorAll(".hero-products").forEach(aside => {    const show = img => {
      img.closest("figure")?.classList.add("ready");
      aside.classList.add("has-images");
    };
    aside.querySelectorAll("img").forEach(img => {
      if (img.complete && img.naturalWidth > 0) show(img);
      else {
        img.addEventListener("load", () => show(img), { once: true });
        img.addEventListener("error", () => img.closest("figure")?.remove(), { once: true });
      }
    });
  });

  // Swap the text brand for the logo image once its file exists.
  const brandLogo = root.querySelector(".brand-logo");
  if (brandLogo) {
    const showLogo = () => {
      brandLogo.classList.add("ready");
      brandLogo.closest(".brand")?.classList.add("has-logo");
    };
    if (brandLogo.complete && brandLogo.naturalWidth > 0) showLogo();
    else {
      brandLogo.addEventListener("load", showLogo, { once: true });
      brandLogo.addEventListener("error", () => brandLogo.remove(), { once: true });
    }
  }

  function notice(text) {
    find(".storage-notice").textContent = text;
    find(".storage-notice").hidden = false;
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { conversations: [], activeId: null };
      const data = JSON.parse(raw);
      if (!Array.isArray(data.conversations)) throw new Error("Invalid history");
      const valid = data.conversations.every(c => typeof c.id === "string" && typeof c.title === "string" && Number.isFinite(c.updatedAt) && Array.isArray(c.messages) && c.messages.every(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && (m.elapsedMs === undefined || (Number.isFinite(m.elapsedMs) && m.elapsedMs >= 0))));
      if (!valid) throw new Error("Invalid history");
      return { conversations: data.conversations, activeId: data.activeId };
    } catch {
      notice("Saved history couldn’t be opened. New conversations will still work in this tab.");
      return { conversations: [], activeId: null };
    }
  }

  const state = load();
  let current = state.conversations.find(c => c.id === state.activeId) || null;

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ conversations: state.conversations, activeId: current?.id || null }));
    } catch {
      notice("This browser couldn’t save your history. Keep this tab open to retain your conversations.");
    }
  }

  function group(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatWorked(ms) {
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
    return `${Math.round(seconds)}s`;
  }

  function renderHistory() {
    closeChatMenu();
    history.replaceChildren();
    find(".empty-history").hidden = state.conversations.length > 0;
    let previous = "";
    [...state.conversations].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || b.updatedAt - a.updatedAt).forEach(conversation => {
      const period = conversation.pinned === true ? "Pinned" : group(conversation.updatedAt);
      if (period !== previous) {
        const label = document.createElement("p");
        label.className = "period";
        label.textContent = period;
        history.append(label);
        previous = period;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.dataset.conversationId = conversation.id;
      button.setAttribute("aria-current", String(current === conversation));
      button.title = conversation.title;
      const title = document.createElement("span");
      title.className = "clip";
      const slide = document.createElement("span");
      slide.className = "slide";
      slide.textContent = conversation.title;
      title.append(slide);
      button.append(icon("message-circle"), title);
      button.addEventListener("click", event => {
        // A macOS Control-click is a secondary click, not chat selection.
        if (event.ctrlKey || event.button !== 0) return;
        select(conversation);
      });
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const row = document.createElement("div");
      row.className = "history-row";
      row.classList.toggle("active", current === conversation);
      row.addEventListener("contextmenu", event => {
        event.preventDefault();
        openChatMenu(conversation, button, event.clientX, event.clientY);
      });
      row.addEventListener("keydown", event => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = button.getBoundingClientRect();
          openChatMenu(conversation, button, rect.left, rect.bottom);
        }
      });
      const pinButton = document.createElement("button");
      pinButton.type = "button";
      pinButton.className = "history-action pin-chat";
      pinButton.title = conversation.pinned === true ? "Unpin chat" : "Pin chat";
      pinButton.setAttribute("aria-label", `${pinButton.title}: ${conversation.title}`);
      pinButton.setAttribute("aria-pressed", String(conversation.pinned === true));
      pinButton.append(icon("pin"));
      pinButton.addEventListener("click", event => {
        if (!event.ctrlKey && event.button === 0) togglePin(conversation);
      });
      const more = document.createElement("button");
      more.type = "button";
      more.className = "history-action chat-options";
      more.title = "Chat options";
      more.setAttribute("aria-label", `Options for ${conversation.title}`);
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      more.append(icon("more"));
      more.addEventListener("click", event => {
        if (event.ctrlKey || event.button !== 0) return;
        if (chatMenu?.trigger === more) return closeChatMenu(true);
        const rect = more.getBoundingClientRect();
        openChatMenu(conversation, more, rect.left, rect.bottom);
      });
      row.append(button, pinButton, more);
      history.append(row);
    });
  }

  // Long row titles stay one fixed size; on hover/focus the text slides
  // to reveal the hidden end, then holds (ChatGPT-style).
  function startTitleSlide(row) {
    if (row.classList.contains("sliding")) return;
    const clip = row.querySelector(".history-item .clip");
    const slide = row.querySelector(".history-item .slide");
    if (!clip || !slide) return;
    slide.classList.add("measure");
    const overflow = slide.scrollWidth - clip.clientWidth;
    if (overflow <= 4) {
      slide.classList.remove("measure");
      return;
    }
    slide.style.setProperty("--slide-x", `${-overflow}px`);
    slide.style.setProperty("--slide-dur", `${Math.min(3.5, Math.max(1, overflow / 65))}s`);
    row.classList.add("sliding");
  }

  function stopTitleSlide(row) {
    if (!row.classList.contains("sliding")) return;
    row.classList.remove("sliding");
    const slide = row.querySelector(".history-item .slide");
    slide?.classList.remove("measure");
    slide?.style.removeProperty("--slide-x");
    slide?.style.removeProperty("--slide-dur");
  }

  function closeChatMenu(restoreFocus = false) {
    if (!chatMenu) return;
    const { element, trigger } = chatMenu;
    element.remove();
    trigger.setAttribute("aria-expanded", "false");
    chatMenu = null;
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function openChatMenu(conversation, trigger, x, y) {
    closeChatMenu();
    const element = document.createElement("div");
    element.className = "aisle-chat-menu";
    element.setAttribute("role", "menu");
    element.setAttribute("aria-label", "Chat options");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.setAttribute("role", "menuitem");
    rename.textContent = "Rename chat";
    rename.addEventListener("click", () => {
      closeChatMenu();
      renameConversation(conversation);
    });
    const pin = document.createElement("button");
    pin.type = "button";
    pin.setAttribute("role", "menuitem");
    pin.textContent = conversation.pinned === true ? "Unpin chat" : "Pin chat";
    pin.addEventListener("click", () => togglePin(conversation));
    const remove = document.createElement("button");
    remove.className = "destructive";
    remove.type = "button";
    remove.setAttribute("role", "menuitem");
    remove.setAttribute("aria-disabled", String(pending.has(conversation.id)));
    remove.textContent = "Delete chat";
    remove.title = pending.has(conversation.id) ? "Wait for the reply to finish" : "Delete from browser history";
    remove.addEventListener("click", () => {
      if (pending.has(conversation.id)) return;
      closeChatMenu();
      deleteConversation(conversation);
    });
    element.addEventListener("keydown", event => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.stopPropagation();
        if (event.key === "Escape") event.preventDefault();
        closeChatMenu(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [rename, pin, remove];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus({ preventScroll: true });
      }
    });
    element.append(rename, pin, remove);
    // Position before insertion so the menu cannot briefly expand the page
    // and trigger the scroll listener that dismisses it.
    element.style.left = "0px";
    element.style.top = "0px";
    document.body.append(element);
    element.style.left = `${Math.max(8, Math.min(x, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, innerHeight - element.offsetHeight - 8))}px`;
    chatMenu = { element, trigger };
    trigger.setAttribute("aria-expanded", "true");
    rename.focus({ preventScroll: true });
  }

  document.addEventListener("pointerdown", event => {
    if (chatMenu && !chatMenu.element.contains(event.target) && !chatMenu.trigger.contains(event.target)) closeChatMenu();
  });
  document.addEventListener("scroll", () => closeChatMenu(), true);
  window.addEventListener("resize", () => closeChatMenu());

  function togglePin(conversation) {
    conversation.pinned = conversation.pinned !== true;
    persist();
    renderHistory();
    focusConversation(conversation);
  }

  function focusConversation(conversation) {
    const button = [...history.querySelectorAll(".history-item")].find(
      item => item.dataset.conversationId === conversation.id
    );
    button?.focus({ preventScroll: true });
  }

  function renameConversation(conversation) {
    const dialog = document.createElement("dialog");
    dialog.className = "aisle-rename-dialog";
    dialog.setAttribute("aria-labelledby", "rename-chat-label");
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.id = "rename-chat-label";
    label.htmlFor = "rename-chat-input";
    label.textContent = "Rename chat";
    const field = document.createElement("input");
    field.id = "rename-chat-input";
    field.type = "text";
    field.maxLength = 60;
    field.value = conversation.title;
    field.required = true;
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dialog.close());
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    field.addEventListener("input", () => { save.disabled = !field.value.trim(); });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const title = field.value.trim();
      if (!title) return;
      conversation.title = title;
      conversation.manuallyRenamed = true;
      persist();
      render(false);
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      focusConversation(conversation);
    });
    actions.append(cancel, save);
    form.append(label, field, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    field.select();
  }

  function deleteConversation(conversation) {
    if (pending.has(conversation.id)) return;
    state.conversations = state.conversations.filter(chat => chat.id !== conversation.id);
    failures.delete(conversation.id);
    if (current === conversation) {
      select(null);
    } else {
      persist();
      renderHistory();
      find(".new-chat").focus();
    }
    drafts.delete(conversation.id);
  }

  function renderStatus() {
    closeChatMenu();
    const busy = !!current && pending.has(current.id);
    const failure = current && failures.get(current.id);
    find(".send").disabled = !input.value.trim() || busy || !!failure;
    find(".chat-error").hidden = !failure;
    find(".chat-error p").textContent = failure || "";
    log.setAttribute("aria-busy", String(busy));
  }

  function render(scrollToBottom = true, animateLatest = false) {
    // Any full re-render cancels an in-flight streaming reveal; the model
    // already holds the complete text so the fresh DOM shows it instantly.
    streamSeq++;
    find(".welcome").hidden = !!current;
    log.hidden = !current;
    log.replaceChildren();
    find(".top-title").textContent = current?.title || "Shopping assistant";
    document.title = `${current?.title || "Shopping assistant"} — aisle`;
    if (current) {
      const date = document.createElement("div");
      date.className = "day-divider";
      date.textContent = group(current.updatedAt);
      log.append(date);
      const lastIndex = current.messages.length - 1;
      for (let index = 0; index < current.messages.length; index++) {
        const message = current.messages[index];
        const article = document.createElement("article");
        article.className = `message ${message.role}`;
        if (animateLatest && message.role === "assistant" && index === lastIndex) {
          article.classList.add("is-new");
        }
        article.setAttribute("aria-label", message.role === "user" ? "You" : "aisle");
        if (message.role === "assistant") {
          if (Number.isFinite(message.elapsedMs)) {
            const worked = document.createElement("div");
            worked.className = "work-time";
            worked.title = `Response took ${(message.elapsedMs / 1000).toFixed(2)}s`;
            const workedText = document.createElement("span");
            workedText.textContent = `Worked for ${formatWorked(message.elapsedMs)}`;
            worked.append(workedText);
            worked.setAttribute("aria-label", workedText.textContent);
            article.append(worked);
          }
        }
        const paragraph = document.createElement("p");
        paragraph.textContent = message.content;
        article.append(paragraph);
        log.append(article);
      }
      // Thinking indicator sits in the flow, right after the latest message.
      if (pending.has(current.id)) {
        const thinking = document.createElement("div");
        thinking.className = "typing";
        thinking.setAttribute("role", "status");
        thinking.append(
          "aisle is thinking ",
          ...["·", "·", "·"].map(dot => {
            const dotSpan = document.createElement("span");
            dotSpan.textContent = dot;
            return dotSpan;
          })
        );
        log.append(thinking);
      }
    }
    renderHistory();
    renderStatus();
    if (scrollToBottom) requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  }

  function select(conversation) {
    drafts.set(current?.id || "new", input.value);
    current = conversation;
    input.value = drafts.get(current?.id || "new") || "";
    resizeInput();
    closeHistory();
    persist();
    render();
    input.focus();
  }

  function demoReply(text) {
    if (/\b(order|delivery|tracking|shipment)\b/i.test(text)) return "I can help you check on an order. What’s your order number?";
    if (/\b(return|refund|shipping|policy|payment)\b/i.test(text)) return "What would you like to know about the store’s policy? You can ask about shipping, payments, or returns.";
    if (/\b(shoe|sneaker|jacket|dress|bag|jeans|hoodie|watch|shirt)s?\b/i.test(text)) return "Let’s narrow it down together. What style, size, and budget do you have in mind?";
    if (/^(hi|hey|hello)[!. ]*$/i.test(text)) return "Hi! Tell me what you’re looking for. I can help with products, shopping advice, order updates, or store questions.";
    return "This is a demo conversation. Once the shopping assistant is connected, its answer will appear here.";
  }

  function prefersReducedMotion() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isNearBottom() {
    return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
  }

  // Gradually reveal the latest assistant message word by word, ChatGPT-style.
  // The full text is already in the model; this only animates the DOM.
  function streamLatestAssistant(conversation, fullText, autoFollow) {
    const articles = log.querySelectorAll("article.message.assistant");
    const article = articles[articles.length - 1];
    const paragraph = article?.querySelector("p");
    if (!article || !paragraph) {
      render(true, false);
      return;
    }
    const chunks = fullText.match(/\S+\s*/g) || [fullText];
    const total = chunks.length;
    // ~20 words/sec short replies, faster for long ones; ~0.5s min, ~5s max.
    const totalDuration = Math.min(5000, Math.max(1200, 600 + total * 50));
    const intervalMs = 50;
    const perTick = Math.max(1, Math.ceil(total / (totalDuration / intervalMs)));
    const caret = document.createElement("span");
    caret.className = "stream-caret";
    caret.setAttribute("aria-hidden", "true");
    let shown = 0;
    let follow = autoFollow;
    const mySeq = ++streamSeq;
    log.setAttribute("aria-busy", "true");
    paragraph.textContent = "";
    paragraph.append(caret);
    if (follow) requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    const onScroll = () => { follow = isNearBottom(); };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    const timer = setInterval(() => {
      if (mySeq !== streamSeq || current !== conversation) {
        clearInterval(timer);
        scroll.removeEventListener("scroll", onScroll);
        return;
      }
      shown = Math.min(total, shown + perTick);
      paragraph.textContent = chunks.slice(0, shown).join("");
      paragraph.append(caret);
      if (follow) scroll.scrollTop = scroll.scrollHeight;
      if (shown >= total) {
        clearInterval(timer);
        scroll.removeEventListener("scroll", onScroll);
        paragraph.textContent = fullText;
        log.setAttribute("aria-busy", "false");
        if (current === conversation && follow) scroll.scrollTop = scroll.scrollHeight;
        renderHistory();
      }
    }, intervalMs);
  }

  async function requestReply(conversation) {
    const isFirstReply = !conversation.messages.some(message => message.role === "assistant");
    pending.add(conversation.id);
    failures.delete(conversation.id);
    renderStatus();
    if (current === conversation) render(isNearBottom());
    let replied = false;
    let finishedReply = "";
    let elapsedMs = 0;
    const startedAt = Date.now();
    try {
      let reply;
      if (config.demoMode) {
        await new Promise(resolve => setTimeout(resolve, 650));
        reply = demoReply(conversation.messages.at(-1).content);
      } else {
        const data = await chatApi({
          message: conversation.messages.at(-1).content,
          thread_id: conversation.threadId || conversation.id,
          generate_title: isFirstReply,
        });
        conversation.threadId = data.thread_id;
        reply = data.response;
        if (isFirstReply && !conversation.manuallyRenamed && typeof data.title === "string" && data.title.trim()) {
          conversation.title = data.title.trim();
        }
      }
      elapsedMs = Date.now() - startedAt;
      conversation.messages.push({ role: "assistant", content: reply, elapsedMs });
      conversation.updatedAt = Date.now();
      replied = true;
      finishedReply = reply;
      persist();
    } catch (error) {
      failures.set(conversation.id, error instanceof AuthenticationRequiredError
        ? error.message
        : "The assistant couldn’t reply. Your message is saved. Please try again.");
      if (error instanceof AuthenticationRequiredError) onAuthenticationRequired(error.message);
    } finally {
      pending.delete(conversation.id);
      const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
      if (current !== conversation) {
        renderHistory();
      } else if (replied && finishedReply && !prefersReducedMotion()) {
        // Render synchronously then stream the text in the same task so the
        // full reply never flashes before the reveal starts.
        render(nearBottom, true);
        streamLatestAssistant(conversation, finishedReply, nearBottom);
      } else {
        render(nearBottom, replied);
      }
    }
  }

  function sendMessage(event) {
    event?.preventDefault();
    const text = input.value.trim();
    if (!text || text.length > 3000 || (current && (pending.has(current.id) || failures.has(current.id)))) return;
    if (!current) {
      current = { id: crypto.randomUUID(), title: text.length > 60 ? text.slice(0, 60) + "…" : text, updatedAt: Date.now(), messages: [] };
      state.conversations.unshift(current);
      drafts.delete("new");
    }
    current.messages.push({ role: "user", content: text });
    current.updatedAt = Date.now();
    drafts.delete(current.id);
    input.value = "";
    resizeInput();
    persist();
    render();
    requestReply(current);
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  function closeHistory() {
    closeChatMenu();
    root.classList.remove("history-open");
    find(".side").inert = matchMedia("(max-width:560px)").matches || root.classList.contains("sidebar-collapsed");
    find(".backdrop").hidden = true;
    find(".main").inert = false;
    find(".mobile-toggle").setAttribute("aria-expanded", "false");
  }

  function openHistory() {
    find(".side").inert = false;
    if (!matchMedia("(max-width:560px)").matches) {
      root.classList.remove("sidebar-collapsed");
      find(".mobile-toggle").setAttribute("aria-expanded", "true");
      find(".close-history").focus();
      return;
    }
    root.classList.add("history-open");
    find(".backdrop").hidden = false;
    find(".main").inert = true;
    find(".mobile-toggle").setAttribute("aria-expanded", "true");
    find(".close-history").focus();
  }

  // A "Try asking" suggestion starts a fresh conversation and sends it.
  function submitSuggestion(text) {
    const message = (text || "").trim();
    if (!message || (current && pending.has(current.id))) return;
    drafts.set(current?.id || "new", input.value);
    current = null;
    input.value = message;
    resizeInput();
    closeHistory();
    sendMessage();
    input.focus();
  }

  find(".composer").addEventListener("submit", sendMessage);
  find(".welcome").addEventListener("click", event => {
    const suggestion = event.target.closest("[data-suggest]");
    if (suggestion) submitSuggestion(suggestion.dataset.suggest);
  });
  input.addEventListener("input", () => { resizeInput(); renderStatus(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) sendMessage(event);
  });
  find(".new-chat").addEventListener("click", () => select(null));
  history.addEventListener("pointerover", event => {
    const row = event.target.closest(".history-row");
    if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) startTitleSlide(row);
  });
  history.addEventListener("pointerout", event => {
    const row = event.target.closest(".history-row");
    if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) stopTitleSlide(row);
  });
  history.addEventListener("focusin", event => {
    const row = event.target.closest(".history-row");
    if (row) startTitleSlide(row);
  });
  history.addEventListener("focusout", event => {
    const row = event.target.closest(".history-row");
    if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) stopTitleSlide(row);
  });
  find(".retry").addEventListener("click", () => { if (current && !pending.has(current.id)) requestReply(current); });
  find(".mobile-toggle").addEventListener("click", openHistory);
  find(".close-history").addEventListener("click", () => {
    closeHistory();
    if (!matchMedia("(max-width:560px)").matches) {
      root.classList.add("sidebar-collapsed");
      find(".side").inert = true;
    }
    find(".mobile-toggle").focus();
  });
  find(".backdrop").addEventListener("click", () => {
    closeHistory();
    find(".mobile-toggle").focus();
  });
  root.addEventListener("keydown", event => {
    if (!root.classList.contains("history-open")) return;
    if (event.key === "Escape") { closeHistory(); find(".mobile-toggle").focus(); }
    if (event.key === "Tab") {
      const buttons = [...find(".side").querySelectorAll("button")];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  matchMedia("(max-width:560px)").addEventListener("change", closeHistory);
  if (!config.demoMode) {
    find(".preview-label").hidden = true;
    find(".below").textContent = "Conversation history saved in this browser.";
  }
  // An unanswered saved message can be retried after a reload without duplication.
  for (const conversation of state.conversations) {
    if (conversation.messages.at(-1)?.role === "user") failures.set(conversation.id, "This message hasn’t received a reply. Try again to continue.");
  }
  closeHistory();
  render();
}
