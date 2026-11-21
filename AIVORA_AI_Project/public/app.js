
const $ = (selector) => document.querySelector(selector);
// HARVION AI - THEME SETTINGS

const themeSelect = $("#themeSelect");

function applyTheme(theme) {
  let activeTheme = theme;

  if (theme === "system") {
    activeTheme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  document.documentElement.setAttribute("data-theme", activeTheme);

  if (themeSelect) {
    themeSelect.value = theme;
  }

  localStorage.setItem("harvion-theme", theme);
}

// Load saved theme
const savedTheme = localStorage.getItem("harvion-theme") || "dark";
applyTheme(savedTheme);

// Change theme when selected
if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });
}

// Update automatically when system theme changes
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (localStorage.getItem("harvion-theme") === "system") {
    applyTheme("system");
  }
});
const modelSelect = $("#modelSelect");

const form = $("#chatForm");
const input = $("#promptInput");
const messagesEl = $("#messages");
const welcome = $("#welcome");
const sendButton = $("#sendButton");
const stopButton = $("#stopButton");
const historyList = $("#historyList");
const chatSearch = $("#chatSearch");
const toast = $("#toast");
const exportButton = $("#exportChat");
const voiceButton = $("#voiceButton");

let chats = [];

try {
  const saved = JSON.parse(localStorage.getItem("harvion-chats") || "[]");
  chats = Array.isArray(saved) ? saved : [];
} catch {
  chats = [];
}

let activeChatId = null;
let busy = false;
let editingMessageIndex = null;
let activeController = null;

let recognition = null;
let isRecording = false;

// ========================================
// HARVION AI - VOICE OUTPUT
// ========================================

let currentUtterance = null;
let currentSpeechButton = null;

function stopVoiceOutput() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  currentUtterance = null;

  if (currentSpeechButton) {
    currentSpeechButton.textContent = "🔊 Listen";
    currentSpeechButton = null;
  }
}

function speakResponse(text, button) {
  if (!("speechSynthesis" in window)) {
    showToast("Voice output is not supported in this browser.");
    return;
  }

  // Stop previous speech.
  stopVoiceOutput();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  currentUtterance = utterance;
  currentSpeechButton = button;

  button.textContent = "⏸ Pause";

  utterance.onend = () => {
    button.textContent = "🔊 Listen";
    currentUtterance = null;
    currentSpeechButton = null;
  };

  utterance.onerror = () => {
    button.textContent = "🔊 Listen";
    currentUtterance = null;
    currentSpeechButton = null;
    showToast("Unable to play voice output.");
  };

  window.speechSynthesis.speak(utterance);
}

function toggleVoiceOutput(text, button) {
  if (!("speechSynthesis" in window)) {
    showToast("Voice output is not supported in this browser.");
    return;
  }

  if (
    currentSpeechButton === button &&
    window.speechSynthesis.speaking
  ) {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      button.textContent = "⏸ Pause";
    } else {
      window.speechSynthesis.pause();
      button.textContent = "▶ Resume";
    }

    return;
  }

  speakResponse(text, button);
}



// ========================================
// SAVE CHATS
// ========================================

function saveChats() {
  localStorage.setItem("harvion-chats", JSON.stringify(chats));
  renderHistory();
}

function setGeneratingState(isGenerating) {
  busy = isGenerating;

  sendButton.disabled = isGenerating;
  sendButton.style.display = isGenerating ? "none" : "";

  if (stopButton) {
    stopButton.hidden = !isGenerating;
  }

  renderHistory();
}

function stopGeneration() {
  if (!busy || !activeController) return;

  activeController.abort();
  showToast("Generation stopped.");
}

function cancelEditing() {
  editingMessageIndex = null;
  input.placeholder = "Message HARVION AI...";
}


// ========================================
// NEW CHAT
// ========================================

function newChat() {
  if (busy) return;

  cancelEditing();
  activeChatId = null;
  messagesEl.innerHTML = "";
  welcome.hidden = false;
  input.value = "";

  resizeInput();
  renderHistory();
  input.focus();
}

function currentChat() {
  return chats.find((chat) => chat.id === activeChatId);
}


// ========================================
// RENAME CHAT
// ========================================

function renameChat(id) {
  if (busy) return;

  const chat = chats.find((item) => item.id === id);
  if (!chat) return;

  const title = prompt("Enter a new chat title:", chat.title || "");

  if (title === null) return;

  const cleanTitle = title.trim();

  if (!cleanTitle) {
    showToast("Chat title cannot be empty.");
    return;
  }

  chat.title = cleanTitle.slice(0, 60);

  saveChats();
  showToast("Chat renamed.");
}


// ========================================
// DELETE CHAT
// ========================================

function deleteChat(id) {
  if (busy) return;

  const chat = chats.find((item) => item.id === id);
  if (!chat) return;

  if (!confirm(`Delete "${chat.title || "New conversation"}"?`)) return;

  chats = chats.filter((item) => item.id !== id);

  if (activeChatId === id) {
    cancelEditing();

    activeChatId = null;
    messagesEl.innerHTML = "";
    welcome.hidden = false;
    input.value = "";

    resizeInput();
  }

  saveChats();
  showToast("Chat deleted.");
}


// ========================================
// RENDER CHAT HISTORY
// ========================================

function renderHistory() {
  historyList.innerHTML = "";

  const searchTerm = chatSearch
    ? chatSearch.value.trim().toLowerCase()
    : "";

  const filteredChats = [...chats].reverse().filter((chat) => {
    if (!searchTerm) return true;

    const titleMatches = (chat.title || "")
      .toLowerCase()
      .includes(searchTerm);

    const messageMatches = (chat.messages || []).some((message) =>
      String(message.content || "")
        .toLowerCase()
        .includes(searchTerm)
    );

    return titleMatches || messageMatches;
  });

  if (filteredChats.length === 0) {
    const empty = document.createElement("div");

    empty.className = "search-empty";
    empty.textContent = searchTerm
      ? "No matching conversations."
      : "No conversations yet.";

    historyList.appendChild(empty);
    return;
  }

  filteredChats.forEach((chat) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const titleButton = document.createElement("button");

    titleButton.className =
      "history-item" + (chat.id === activeChatId ? " active" : "");

    titleButton.textContent = chat.title || "New conversation";
    titleButton.title = chat.title || "New conversation";
    titleButton.disabled = busy;

    titleButton.addEventListener("click", () => openChat(chat.id));

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const renameButton = document.createElement("button");

    renameButton.className = "history-action";
    renameButton.textContent = "✎";
    renameButton.title = "Rename chat";
    renameButton.setAttribute("aria-label", "Rename chat");
    renameButton.disabled = busy;

    renameButton.addEventListener("click", () => renameChat(chat.id));

    const deleteButton = document.createElement("button");

    deleteButton.className = "history-action delete";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete chat";
    deleteButton.setAttribute("aria-label", "Delete chat");
    deleteButton.disabled = busy;

    deleteButton.addEventListener("click", () => deleteChat(chat.id));

    actions.append(renameButton, deleteButton);
    row.append(titleButton, actions);

    historyList.appendChild(row);
  });
}


// ========================================
// OPEN CHAT
// ========================================

function openChat(id) {
  if (busy) return;

  const chat = chats.find((item) => item.id === id);
  if (!chat) return;

  cancelEditing();

  input.value = "";
  resizeInput();

  activeChatId = id;
  messagesEl.innerHTML = "";
  welcome.hidden = true;

  chat.messages.forEach((message, index) => {
    addMessage(message.role, message.content, index);
  });

  renderHistory();

  $("#sidebar").classList.remove("open");
}


// ========================================
// EDIT USER MESSAGE
// ========================================

function editMessage(index) {
  if (busy) return;

  const chat = currentChat();
  if (!chat) return;

  const message = chat.messages[index];

  if (!message || message.role !== "user") return;

  editingMessageIndex = index;

  input.value = message.content;
  input.placeholder = "Edit your message...";

  resizeInput();
  input.focus();

  showToast("Edit your message and press Send.");
}

function animateMessageText(element) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node.parentElement.closest("pre, code")) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  let wordIndex = 0;

  textNodes.forEach((node) => {
    const parts = node.textContent.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    parts.forEach((part) => {
      if (!part) return;

      if (/^\s+$/.test(part)) {
        fragment.appendChild(
          document.createTextNode(part)
        );
      } else {
        const word = document.createElement("span");

        word.className = "typing-word";
        word.textContent = part;

        word.style.animationDelay =
          Math.min(wordIndex * 20, 900) + "ms";

        wordIndex++;

        fragment.appendChild(word);
      }
    });

    node.parentNode.replaceChild(fragment, node);
  });
}


// ========================================
// DISPLAY MESSAGE
// ========================================

function addMessage(role, content, messageIndex = null, animate = false) {
  welcome.hidden = true;

  const row = document.createElement("div");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "assistant" ? "✦" : "Y";

  const body = document.createElement("div");
  body.className = "message-content";

  if (role === "assistant") {
    const label = document.createElement("div");

    label.className = "message-label";
    label.textContent = "HARVION AI";

    body.appendChild(label);
  }

  const text = document.createElement("div");
  text.className = "message-text";

  if (role === "assistant" && window.marked && window.DOMPurify) {
    const html = window.marked.parse(content, {
      gfm: true,
      breaks: true
    });

    text.innerHTML = window.DOMPurify.sanitize(html);

    text.querySelectorAll("pre code").forEach((block) => {
  if (window.hljs) {
    window.hljs.highlightElement(block);
  }

  const pre = block.closest("pre");
  if (!pre) return;

  pre.classList.add("code-block");

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "code-copy-button";
  copyButton.textContent = "Copy code";

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(block.textContent);
      copyButton.textContent = "Copied!";

      setTimeout(() => {
        copyButton.textContent = "Copy code";
      }, 1500);
    } catch (error) {
      showToast("Unable to copy code");
    }
  });

  pre.appendChild(copyButton);
});
  } else {
    text.textContent = content;
  }
if (role === "assistant" && animate) {
  animateMessageText(text);
}
  body.appendChild(text);


  // EDIT BUTTON

  if (role === "user") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const editButton = document.createElement("button");

    editButton.className = "message-action";
    editButton.textContent = "✎ Edit";
    editButton.title = "Edit your message";

    editButton.addEventListener("click", () => {
      editMessage(messageIndex);
    });

    actions.appendChild(editButton);
    body.appendChild(actions);
  }


  // COPY AND REGENERATE BUTTONS

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");

    copyButton.className = "message-action";
    copyButton.textContent = "Copy";
    copyButton.title = "Copy response";

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);

        copyButton.textContent = "Copied!";
        showToast("Response copied!");

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1500);

      } catch {
        showToast("Unable to copy. Please try again.");
      }
    });

const listenButton = document.createElement("button");

listenButton.className = "message-action";
listenButton.textContent = "🔊 Listen";
listenButton.title = "Listen to AI response";

listenButton.addEventListener("click", () => {
  toggleVoiceOutput(text.innerText || content, listenButton);
});

const stopSpeechButton = document.createElement("button");

stopSpeechButton.className = "message-action";
stopSpeechButton.textContent = "⏹ Stop";
stopSpeechButton.title = "Stop voice output";

stopSpeechButton.addEventListener("click", () => {
  stopVoiceOutput();
  showToast("Voice output stopped.");
});

    const regenerateButton = document.createElement("button");

    regenerateButton.className = "message-action";
    regenerateButton.textContent = "↻ Regenerate";
    regenerateButton.title = "Generate another response";

    regenerateButton.addEventListener("click", () => {
      regenerateResponse(regenerateButton);
    });

    actions.append(
  copyButton,
  listenButton,
  stopSpeechButton,
  regenerateButton
);
    body.appendChild(actions);
  }

  row.append(avatar, body);

  messagesEl.appendChild(row);

  row.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });

  return row;
}


// ========================================
// TOAST
// ========================================

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}


// ========================================
// RESIZE INPUT
// ========================================

function resizeInput() {
  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
}


// ========================================
// HARVION AI - VOICE INPUT
// ========================================

function resetVoiceButton() {
  isRecording = false;

  if (voiceButton) {
    voiceButton.classList.remove("recording");
    voiceButton.textContent = "🎙️";
    voiceButton.title = "Speak your message";

    voiceButton.setAttribute(
      "aria-label",
      "Start voice input"
    );
  }
}

function stopVoiceInput() {
  if (recognition && isRecording) {
    recognition.stop();
  }
}

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast(
      "Voice input is not supported in this browser. Try Chrome."
    );
    return;
  }

  if (busy) {
    showToast(
      "Please wait until the current response finishes."
    );
    return;
  }

  if (isRecording) {
    stopVoiceInput();
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isRecording = true;

    voiceButton.classList.add("recording");
    voiceButton.textContent = "⏹";
    voiceButton.title = "Stop voice input";

    voiceButton.setAttribute(
      "aria-label",
      "Stop voice input"
    );

    showToast("Listening... Speak now.");
  };

  recognition.onresult = (event) => {
    let transcript = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      if (event.results[i].isFinal) {
        transcript += event.results[i][0].transcript;
      }
    }

    if (transcript.trim()) {
      const existingText = input.value.trim();

      input.value = existingText
        ? existingText + " " + transcript.trim()
        : transcript.trim();

      resizeInput();
      input.focus();
    }
  };

  recognition.onerror = (event) => {
    const errors = {
      "not-allowed":
        "Please allow microphone access in your browser.",

      "no-speech":
        "No speech detected. Please try again.",

      "network":
        "Voice recognition needs an internet connection.",

      "audio-capture":
        "No microphone was detected.",

      "service-not-allowed":
        "Voice recognition permission was denied."
    };

    if (event.error !== "aborted") {
      showToast(
        errors[event.error] || "Voice recognition failed."
      );
    }
  };

  recognition.onend = () => {
    resetVoiceButton();
    recognition = null;
  };

  try {
    recognition.start();

  } catch {
    recognition = null;
    resetVoiceButton();

    showToast(
      "Unable to start voice input. Please try again."
    );
  }
}


// ========================================
// EXPORT CHAT FEATURE
// ========================================

function exportChat() {
  if (busy) {
    showToast("Please wait until the response finishes.");
    return;
  }

  const chat = currentChat();

  if (!chat || !chat.messages || chat.messages.length === 0) {
    showToast("No conversation available to export.");
    return;
  }

  const title = chat.title || "HARVION Conversation";

  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "HARVION_Conversation";

  const date = new Date().toLocaleString();

  let content = "";

  content += "========================================\n";
  content += "              HARVION AI\n";
  content += "========================================\n\n";

  content += "Conversation: " + title + "\n";
  content += "Exported: " + date + "\n\n";

  content += "----------------------------------------\n\n";

  chat.messages.forEach((message) => {
    const speaker =
      message.role === "assistant"
        ? "HARVION AI"
        : "You";

    content += speaker + ":\n";
    content += String(message.content || "") + "\n\n";

    content += "----------------------------------------\n\n";
  });

  content += "End of conversation\n";
  content += "Generated by HARVION AI\n";

  const blob = new Blob(
    ["\uFEFF", content],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement("a");

  downloadLink.href = url;
  downloadLink.download = safeTitle + ".txt";

  document.body.appendChild(downloadLink);

  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(url);

  showToast("Conversation exported successfully!");
}


// ========================================
// SEND MESSAGE
// ========================================

async function sendMessage(rawText) {
  const text = rawText.trim();

  if (!text || busy) return;

  // Stop voice recognition before sending.

  stopVoiceInput();

  let chat;


  // HANDLE EDITED MESSAGE

  if (editingMessageIndex !== null) {
    chat = currentChat();

    if (
      !chat ||
      !chat.messages[editingMessageIndex] ||
      chat.messages[editingMessageIndex].role !== "user"
    ) {
      cancelEditing();

      showToast("Unable to edit this message.");
      return;
    }

    chat.messages = chat.messages.slice(
      0,
      editingMessageIndex
    );

    chat.messages.push({
      role: "user",
      content: text
    });

    cancelEditing();

    messagesEl.innerHTML = "";

    chat.messages.forEach((message, index) => {
      addMessage(
        message.role,
        message.content,
        index
      );
    });

  } else {

    // NORMAL NEW MESSAGE

    if (!activeChatId) {
      activeChatId = crypto.randomUUID();

      chats.push({
        id: activeChatId,
        title: text.slice(0, 34),
        messages: []
      });
    }

    chat = currentChat();

    chat.messages.push({
      role: "user",
      content: text
    });

    addMessage(
      "user",
      text,
      chat.messages.length - 1
    );
  }

  input.value = "";

  resizeInput();
  saveChats();

  await requestAIResponse(
    chat,
    "Unable to get a response."
  );
}


// ========================================
// API REQUEST
// ========================================


async function requestAIResponse(chat, errorMessage) {
  if (busy) return;

  const controller = new AbortController();

  activeController = controller;

  setGeneratingState(true);

  const typingRow = createTypingRow();

  messagesEl.appendChild(typingRow);

  typingRow.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: chat.messages.slice(-20),
        model: modelSelect ? modelSelect.value : "gemini-3.6-flash"
      }),

      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || errorMessage);
    }

    if (controller.signal.aborted) return;

    chat.messages.push({
      role: "assistant",
      content: data.reply
    });

    typingRow.remove();

    addMessage(
  "assistant",
  data.reply,
  chat.messages.length - 1,
  true
);

    saveChats();

  } catch (error) {
    typingRow.remove();

    if (error.name === "AbortError") {
      return;
    }

    const message = error.message || errorMessage;

    showToast(message);

    if (errorMessage === "Unable to get a response.") {
      addMessage(
        "assistant",
        "Sorry, I couldn't complete that request. " + message
      );
    }

  } finally {
    if (activeController === controller) {
      activeController = null;
    }

    setGeneratingState(false);
    input.focus();
  }
}


// ========================================
// TYPING ANIMATION
// ========================================

function createTypingRow() {
  const row = document.createElement("div");

  row.className = "message assistant";

  row.innerHTML =
    '<div class="message-avatar">✦</div>' +
    '<div class="message-content">' +
    '<div class="message-label">HARVION AI</div>' +
    '<div class="typing"><i></i><i></i><i></i></div>' +
    '</div>';

  return row;
}


// ========================================
// REGENERATE RESPONSE
// ========================================

async function regenerateResponse(button) {
  if (busy) return;

  const row = button.closest(".message");

  if (!row) return;

  const assistantRows = [
    ...messagesEl.querySelectorAll(".message.assistant")
  ];

  if (assistantRows[assistantRows.length - 1] !== row) {
    showToast(
      "Regenerate is available for the latest response."
    );
    return;
  }

  const chat = currentChat();

  if (!chat || chat.messages.length < 2) return;

  if (
    chat.messages[chat.messages.length - 1].role !== "assistant"
  ) {
    return;
  }

  chat.messages.pop();

  messagesEl.innerHTML = "";

  chat.messages.forEach((message, index) => {
    addMessage(
      message.role,
      message.content,
      index
    );
  });

  saveChats();

  await requestAIResponse(
    chat,
    "Regeneration failed."
  );
}


// ========================================
// FORM SUBMISSION
// ========================================

form.addEventListener("submit", (event) => {
  event.preventDefault();

  sendMessage(input.value);
});


// ========================================
// STOP BUTTON
// ========================================

if (stopButton) {
  stopButton.addEventListener("click", stopGeneration);
}


// ========================================
// EXPORT BUTTON
// ========================================

if (exportButton) {
  exportButton.addEventListener("click", exportChat);
}


// ========================================
// VOICE INPUT BUTTON
// ========================================

if (voiceButton) {
  voiceButton.addEventListener(
    "click",
    startVoiceInput
  );
}


// ========================================
// INPUT EVENTS
// ========================================

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", (event) => {

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    form.requestSubmit();
  }

  if (
    event.key === "Escape" &&
    editingMessageIndex !== null
  ) {
    cancelEditing();

    input.value = "";
    resizeInput();

    showToast("Message editing cancelled.");
  }
});


// ========================================
// NEW CHAT
// ========================================

$("#newChat").addEventListener("click", newChat);


// ========================================
// CLEAR CURRENT CHAT
// ========================================

$("#clearChat").addEventListener("click", () => {
  if (busy) return;

  if (!activeChatId) {
    return newChat();
  }

  if (!confirm("Delete the current conversation?")) return;

  chats = chats.filter(
    (chat) => chat.id !== activeChatId
  );

  cancelEditing();

  activeChatId = null;
  messagesEl.innerHTML = "";
  welcome.hidden = false;
  input.value = "";

  resizeInput();
  saveChats();

  showToast("Current conversation deleted.");
});


// ========================================
// MOBILE MENU
// ========================================

$("#menuToggle").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
});


// ========================================
// SUGGESTION BUTTONS
// ========================================

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt);
  });
});


// ========================================
// CHAT SEARCH
// ========================================

if (chatSearch) {
  chatSearch.addEventListener("input", renderHistory);
}


// ========================================
// INITIALIZE
// ========================================

renderHistory();

/* =========================================
   HARVION AI - CUSTOM DROPDOWN FUNCTIONALITY
========================================= */

document.querySelectorAll(".custom-dropdown").forEach((dropdown) => {
  const trigger = dropdown.querySelector(".dropdown-trigger");
  const valueDisplay = dropdown.querySelector(".dropdown-value");
  const options = dropdown.querySelectorAll(".dropdown-option");

  const isModelDropdown = dropdown.id === "modelDropdown";
  const linkedSelect = document.getElementById(
    isModelDropdown ? "modelSelect" : "themeSelect"
  );

  if (!trigger || !valueDisplay || !linkedSelect) return;

  // Set the displayed option from the existing select value
  function syncDropdown() {
    const selectedOption = Array.from(options).find(
      (option) => option.dataset.value === linkedSelect.value
    );

    if (!selectedOption) return;

    valueDisplay.textContent = selectedOption.querySelector("span").textContent;

    options.forEach((option) => {
      const selected = option.dataset.value === linkedSelect.value;

      option.classList.toggle("selected", selected);

      const check = option.querySelector(".option-check");
      if (check) check.textContent = selected ? "✓" : "";
    });
  }

  // Open and close menu
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();

    const shouldOpen = !dropdown.classList.contains("open");

    document.querySelectorAll(".custom-dropdown.open").forEach((item) => {
      item.classList.remove("open");
      item.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });

    if (shouldOpen) {
      dropdown.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  // Select an option
  options.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();

      const selectedValue = option.dataset.value;

      linkedSelect.value = selectedValue;

      // Trigger existing theme change functionality
      linkedSelect.dispatchEvent(new Event("change", { bubbles: true }));

      syncDropdown();

      dropdown.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
  });

  // Sync initial selection
  syncDropdown();

  // Keep custom menu updated if existing code changes the select
  linkedSelect.addEventListener("change", syncDropdown);
});

// Close dropdowns when clicking outside
document.addEventListener("click", (event) => {
  if (!event.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".custom-dropdown.open").forEach((dropdown) => {
      dropdown.classList.remove("open");

      dropdown.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });
  }
});

// Close dropdowns using Escape
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".custom-dropdown.open").forEach((dropdown) => {
      dropdown.classList.remove("open");

      dropdown.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });
  }
});

