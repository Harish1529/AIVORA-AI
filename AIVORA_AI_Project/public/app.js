
const $ = (selector) => document.querySelector(selector);

// ========================================
// HARVION AI - ELEMENTS
// ========================================

const themeSelect = $("#themeSelect");
const modelSelect = $("#modelSelect");

const form = $("#chatForm");
const input = $("#promptInput");
const messagesEl = $("#messages");
const welcome = $("#welcome");

const sendButton = $("#sendButton");
const stopButton = $("#stopButton");
const voiceButton = $("#voiceButton");

const historyList = $("#historyList");
const chatSearch = $("#chatSearch");
const toast = $("#toast");

const exportButton = $("#exportChat");

const imageInput = $("#imageInput");
const attachImageButton = $("#attachImageButton");
// PDF UPLOAD ELEMENTS
const pdfInput = $("#pdfInput");
const attachPdfButton = $("#attachPdfButton");

let selectedPDFs = [];
const webSearchButton = $("#webSearchButton");
const imagePreviewContainer = $("#imagePreviewContainer");
const imagePreviewList = $("#imagePreviewList");
const pdfPreviewContainer = $("#pdfPreviewContainer");
const pdfPreviewList = $("#pdfPreviewList");

// ========================================
// STATE
// ========================================

let chats = [];

try {
  const saved = JSON.parse(
    localStorage.getItem("harvion-chats") || "[]"
  );

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

let currentSpeechButton = null;

const selectedImages = [];
// ========================================
// WEB SEARCH STATE
// ========================================

let webSearchEnabled = false;

if (webSearchButton) {
  webSearchButton.addEventListener("click", () => {
    if (busy) {
      showToast("Wait until the current response finishes.");
      return;
    }

    webSearchEnabled = !webSearchEnabled;

    webSearchButton.classList.toggle(
      "active",
      webSearchEnabled
    );

    webSearchButton.setAttribute(
      "aria-pressed",
      String(webSearchEnabled)
    );

    webSearchButton.title = webSearchEnabled
      ? "Web Search enabled"
      : "Enable web search";

    showToast(
      webSearchEnabled
        ? "Web Search enabled"
        : "Web Search disabled"
    );
  });
}

// Stores image data for the current browser session.
// Blob URLs are used for displaying sent images.
const chatImages = {};
const chatImageData = {};

// ========================================
// THEME SETTINGS
// ========================================

function applyTheme(theme) {
  let activeTheme = theme;

  if (theme === "system") {
    activeTheme = window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches ? "light" : "dark";
  }

  document.documentElement.setAttribute(
    "data-theme",
    activeTheme
  );

  if (themeSelect) {
    themeSelect.value = theme;
  }

  localStorage.setItem("harvion-theme", theme);
}

const savedTheme =
  localStorage.getItem("harvion-theme") || "dark";

applyTheme(savedTheme);

if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });
}

const colorScheme = window.matchMedia(
  "(prefers-color-scheme: light)"
);

colorScheme.addEventListener?.("change", () => {
  if (localStorage.getItem("harvion-theme") === "system") {
    applyTheme("system");
  }
});

// ========================================
// TOAST
// ========================================

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// ========================================
// SAVE CHATS
// ========================================

function saveChats() {
  try {
    localStorage.setItem(
      "harvion-chats",
      JSON.stringify(chats)
    );
  } catch {
    showToast("Chat storage is full. Export important chats.");
  }

  renderHistory();
}

// ========================================
// GENERATING STATE
// ========================================

function setGeneratingState(isGenerating) {
  busy = isGenerating;

  if (sendButton) {
    sendButton.disabled = isGenerating;
    sendButton.style.display = isGenerating ? "none" : "";
  }

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

// ========================================
// EDITING
// ========================================

function cancelEditing() {
  editingMessageIndex = null;

  if (input) {
    input.placeholder = "Message HARVION AI...";
  }
}

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

// ========================================
// CHAT HELPERS
// ========================================

function currentChat() {
  return chats.find(
    (chat) => chat.id === activeChatId
  );
}

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

function renameChat(id) {
  if (busy) return;

  const chat = chats.find(
    (item) => item.id === id
  );

  if (!chat) return;

  const title = prompt(
    "Enter a new chat title:",
    chat.title || ""
  );

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

function deleteChat(id) {
  if (busy) return;

  const chat = chats.find(
    (item) => item.id === id
  );

  if (!chat) return;

  if (!confirm(
    `Delete "${chat.title || "New conversation"}"?`
  )) return;

  chats = chats.filter(
    (item) => item.id !== id
  );

  delete chatImages[id];
  delete chatImageData[id];

  if (activeChatId === id) {
    activeChatId = null;

    cancelEditing();

    messagesEl.innerHTML = "";
    welcome.hidden = false;

    input.value = "";
    resizeInput();
  }

  saveChats();

  showToast("Chat deleted.");
}

// ========================================
// CHAT HISTORY
// ========================================

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  const searchTerm = chatSearch
    ? chatSearch.value.trim().toLowerCase()
    : "";

  const filteredChats = [...chats]
    .reverse()
    .filter((chat) => {
      if (!searchTerm) return true;

      const titleMatches = String(
        chat.title || ""
      ).toLowerCase().includes(searchTerm);

      const messageMatches = (
        chat.messages || []
      ).some((message) =>
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
      "history-item" +
      (chat.id === activeChatId ? " active" : "");

    titleButton.textContent =
      chat.title || "New conversation";

    titleButton.title = titleButton.textContent;
    titleButton.disabled = busy;

    titleButton.addEventListener("click", () => {
      openChat(chat.id);
    });

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const renameButton = document.createElement("button");

    renameButton.className = "history-action";
    renameButton.textContent = "✎";
    renameButton.title = "Rename chat";
    renameButton.disabled = busy;

    renameButton.addEventListener("click", () => {
      renameChat(chat.id);
    });

    const deleteButton = document.createElement("button");

    deleteButton.className =
      "history-action delete";

    deleteButton.textContent = "×";
    deleteButton.title = "Delete chat";
    deleteButton.disabled = busy;

    deleteButton.addEventListener("click", () => {
      deleteChat(chat.id);
    });

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

  const chat = chats.find(
    (item) => item.id === id
  );

  if (!chat) return;

  cancelEditing();

  activeChatId = id;

  input.value = "";
  resizeInput();

  messagesEl.innerHTML = "";
  welcome.hidden = true;

  (chat.messages || []).forEach((message, index) => {
    addMessage(
      message.role,
      message.content,
      index
    );
  });

  renderHistory();

  $("#sidebar")?.classList.remove("open");
}

// ========================================
// INPUT RESIZE
// ========================================

function resizeInput() {
  if (!input) return;

  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
}

// ========================================
// VOICE OUTPUT
// ========================================

function stopVoiceOutput() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (currentSpeechButton) {
    currentSpeechButton.textContent = "🔊 Listen";
  }

  currentSpeechButton = null;
}

function toggleVoiceOutput(text, button) {
  if (!("speechSynthesis" in window)) {
    showToast("Voice output is not supported.");
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

  stopVoiceOutput();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  currentSpeechButton = button;

  button.textContent = "⏸ Pause";

  utterance.onend = () => {
    button.textContent = "🔊 Listen";
    currentSpeechButton = null;
  };

  utterance.onerror = () => {
    button.textContent = "🔊 Listen";
    currentSpeechButton = null;

    showToast("Unable to play voice output.");
  };

  window.speechSynthesis.speak(utterance);
}

// ========================================
// VOICE INPUT
// ========================================

function resetVoiceButton() {
  isRecording = false;

  if (!voiceButton) return;

  voiceButton.classList.remove("recording");
  voiceButton.textContent = "🎙️";
  voiceButton.title = "Speak your message";
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
    showToast("Voice input is not supported. Try Chrome.");
    return;
  }

  if (busy) {
    showToast("Wait until the current response finishes.");
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

    voiceButton?.classList.add("recording");

    if (voiceButton) {
      voiceButton.textContent = "⏹";
      voiceButton.title = "Stop voice input";
    }

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
      input.value = (
        input.value.trim() + " " + transcript.trim()
      ).trim();

      resizeInput();
      input.focus();
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted") return;

    showToast(
      event.error === "not-allowed"
        ? "Please allow microphone access."
        : "Voice recognition failed."
    );
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

    showToast("Unable to start voice input.");
  }
}

// ========================================
// MESSAGE ANIMATION
// ========================================

function animateMessageText(element) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT
  );

  const nodes = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!node.textContent.trim()) continue;

    if (node.parentElement.closest("pre, code")) {
      continue;
    }

    nodes.push(node);
  }

  let wordIndex = 0;

  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();

    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;

      if (/^\s+$/.test(part)) {
        fragment.appendChild(
          document.createTextNode(part)
        );

        return;
      }

      const span = document.createElement("span");

      span.className = "typing-word";
      span.textContent = part;

      span.style.animationDelay =
        Math.min(wordIndex * 20, 900) + "ms";

      wordIndex++;

      fragment.appendChild(span);
    });

    node.parentNode.replaceChild(fragment, node);
  });
}

// ========================================
// DISPLAY MESSAGE
// ========================================

function addMessage(
  role,
  content,
  messageIndex = null,
  animate = false
) {
  welcome.hidden = true;

  const row = document.createElement("div");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";

  avatar.textContent =
    role === "assistant" ? "✦" : "Y";

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

  if (
    role === "assistant" &&
    window.marked &&
    window.DOMPurify
  ) {
    const html = window.marked.parse(content || "", {
      gfm: true,
      breaks: true
    });

    text.innerHTML =
      window.DOMPurify.sanitize(html);

    text.querySelectorAll("pre code").forEach((block) => {
      if (window.hljs) {
        window.hljs.highlightElement(block);
      }

      const pre = block.closest("pre");

      if (!pre) return;

      pre.classList.add("code-block");

      const copyCodeButton =
        document.createElement("button");

      copyCodeButton.type = "button";
      copyCodeButton.className = "code-copy-button";
      copyCodeButton.textContent = "Copy code";

      copyCodeButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(
            block.textContent
          );

          copyCodeButton.textContent = "Copied!";

          setTimeout(() => {
            copyCodeButton.textContent = "Copy code";
          }, 1500);
        } catch {
          showToast("Unable to copy code.");
        }
      });

      pre.appendChild(copyCodeButton);
    });
  } else {
    text.textContent = content || "";
  }

  // Display uploaded images
  if (role === "user" && messageIndex !== null) {
    const imageKey =
      `${activeChatId}:${messageIndex}`;

    const images = chatImages[imageKey] || [];

    if (images.length > 0) {
      const container = document.createElement("div");

      container.className = "sent-image-container";

      images.forEach((imageUrl) => {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = "Uploaded image";
        image.className = "sent-message-image";

        container.appendChild(image);
      });

      body.appendChild(container);
    }
  }

  body.appendChild(text);

// Display web search sources
if (role === "assistant" && messageIndex !== null) {
  const savedMessage =
    currentChat()?.messages?.[messageIndex];

  const sources = Array.isArray(savedMessage?.sources)
    ? savedMessage.sources
    : [];

  if (sources.length > 0) {
    const sourcesContainer = document.createElement("div");
    sourcesContainer.className = "web-sources";

    const sourcesTitle = document.createElement("div");
    sourcesTitle.className = "web-sources-title";
    sourcesTitle.textContent = "🌐 Sources";

    sourcesContainer.appendChild(sourcesTitle);

    sources.forEach((source) => {
      if (!source.url || !source.title) return;

      let sourceUrl;

      try {
        sourceUrl = new URL(source.url);

        if (sourceUrl.protocol !== "https:") return;
      } catch {
        return;
      }

      const card = document.createElement("a");

      card.className = "web-source-card";
      card.href = sourceUrl.href;
      card.target = "_blank";
      card.rel = "noopener noreferrer";

      const title = document.createElement("div");
      title.className = "web-source-title";
      title.textContent = source.title;

      const url = document.createElement("div");
      url.className = "web-source-url";
      url.textContent = sourceUrl.hostname;

      card.append(title, url);
      sourcesContainer.appendChild(card);
    });

    if (sourcesContainer.querySelector(".web-source-card")) {
      body.appendChild(sourcesContainer);
    }
  }
}

  if (role === "assistant" && animate) {
    animateMessageText(text);
  }

  // User message actions
  if (role === "user") {
    const actions = document.createElement("div");

    actions.className = "message-actions";

    const editButton = document.createElement("button");

    editButton.className = "message-action";
    editButton.textContent = "✎ Edit";

    editButton.addEventListener("click", () => {
      editMessage(messageIndex);
    });

    actions.appendChild(editButton);
    body.appendChild(actions);
  }

  // Assistant message actions
  if (role === "assistant") {
    const actions = document.createElement("div");

    actions.className = "message-actions";

    const copyButton = document.createElement("button");

    copyButton.className = "message-action";
    copyButton.textContent = "Copy";

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          content || ""
        );

        copyButton.textContent = "Copied!";

        showToast("Response copied!");

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1500);
      } catch {
        showToast("Unable to copy.");
      }
    });

    const listenButton = document.createElement("button");

    listenButton.className = "message-action";
    listenButton.textContent = "🔊 Listen";

    listenButton.addEventListener("click", () => {
      toggleVoiceOutput(
        text.innerText || content,
        listenButton
      );
    });

    const stopSpeechButton =
      document.createElement("button");

    stopSpeechButton.className = "message-action";
    stopSpeechButton.textContent = "⏹ Stop";

    stopSpeechButton.addEventListener("click", () => {
      stopVoiceOutput();
      showToast("Voice output stopped.");
    });

    const regenerateButton =
      document.createElement("button");

    regenerateButton.className = "message-action";
    regenerateButton.textContent = "↻ Regenerate";

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
// IMAGE UPLOAD
// ========================================

if (attachImageButton && imageInput) {
  attachImageButton.addEventListener("click", () => {
    if (busy) {
      showToast("Wait until the response finishes.");
      return;
    }

    imageInput.click();
  });
}

if (imageInput) {
  imageInput.addEventListener("change", () => {
    const files = Array.from(imageInput.files || []);

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp"
    ];

    for (const file of files) {
      if (selectedImages.length >= 4) {
        showToast("You can upload up to 4 images.");
        break;
      }

      if (!allowedTypes.includes(file.type)) {
        showToast("Only PNG, JPEG and WebP are supported.");
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast("Each image must be smaller than 5 MB.");
        continue;
      }

      selectedImages.push({
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }

    renderImagePreviews();

    imageInput.value = "";
  });
}

function renderImagePreviews() {
  if (!imagePreviewList || !imagePreviewContainer) {
    return;
  }

  imagePreviewList.innerHTML = "";

  imagePreviewContainer.hidden =
    selectedImages.length === 0;

  selectedImages.forEach((image, index) => {
    const item = document.createElement("div");

    item.className = "image-preview-item";

    const preview = document.createElement("img");

    preview.src = image.previewUrl;
    preview.alt = "Selected image";

    const removeButton = document.createElement("button");

    removeButton.type = "button";
    removeButton.className = "image-preview-remove";
    removeButton.textContent = "×";
    removeButton.title = "Remove image";

    removeButton.addEventListener("click", () => {
      URL.revokeObjectURL(image.previewUrl);

      selectedImages.splice(index, 1);

      renderImagePreviews();
    });

    item.append(preview, removeButton);

    imagePreviewList.appendChild(item);
  });
}

// ========================================
// PDF UPLOAD
// ========================================

if (attachPdfButton && pdfInput) {
  attachPdfButton.addEventListener("click", () => {
    if (busy) {
      showToast("Wait until the response finishes.");
      return;
    }

    pdfInput.click();
  });
}

if (pdfInput) {
  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files?.[0];

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      showToast("Please select a PDF file.");
      pdfInput.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("PDF must be smaller than 10 MB.");
      pdfInput.value = "";
      return;
    }

    selectedPDFs = [{
      file,
      name: file.name
    }];

    renderPDFPreviews();

    pdfInput.value = "";
  });
}

// ========================================
// RENDER PDF PREVIEWS
// ========================================

function renderPDFPreviews() {
  if (!pdfPreviewContainer || !pdfPreviewList) return;

  pdfPreviewList.innerHTML = "";

  pdfPreviewContainer.hidden = selectedPDFs.length === 0;

  selectedPDFs.forEach((pdf, index) => {
    const item = document.createElement("div");
    item.className = "pdf-preview-item";

    const name = document.createElement("span");
    name.className = "pdf-preview-name";
    name.textContent = `📄 ${pdf.name}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "pdf-preview-remove";
    removeButton.textContent = "×";
    removeButton.title = "Remove PDF";

    removeButton.addEventListener("click", () => {
      selectedPDFs.splice(index, 1);
      renderPDFPreviews();
    });

    item.append(name, removeButton);
    pdfPreviewList.appendChild(item);
  });
}


// ========================================
// IMAGE CONVERSION
// ========================================

function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      const base64 = result.split(",")[1];

      if (!base64) {
        reject(new Error("Unable to process image."));
        return;
      }

      resolve({
        mimeType: file.type,
        data: base64
      });
    };

    reader.onerror = () => {
      reject(
        new Error("Unable to read the selected image.")
      );
    };

    reader.readAsDataURL(file);
  });
}
// ========================================
// PDF CONVERSION
// ========================================

function pdfFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1];

      if (!base64) {
        reject(new Error("Unable to process PDF."));
        return;
      }

      resolve({
        mimeType: "application/pdf",
        data: base64
      });
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the PDF file."));
    };

    reader.readAsDataURL(file);
  });
}

// ========================================
// TYPING INDICATOR
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
// STREAM READER
// ========================================

async function readEventStream(response, onText) {
  if (!response.body) {
    throw new Error(
      "Streaming is not supported by this browser."
    );
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  let buffer = "";

  function processEvent(eventText) {
    const lines = eventText.split(/\r?\n/);

    let eventName = "message";

    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;

    const data = JSON.parse(dataLines.join("\n"));

    if (eventName === "error") {
      throw new Error(
        data.error || "Streaming failed."
      );
    }

    if (eventName === "message" && data.text) {
      onText(data.text);
    }
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, {
      stream: true
    });

    const events = buffer.split(/\r?\n\r?\n/);

    buffer = events.pop() || "";

    for (const eventText of events) {
      if (eventText.trim()) {
        processEvent(eventText);
      }
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    processEvent(buffer);
  }
}


// ========================================
// AI REQUEST
// ========================================

async function requestAIResponse(
  chat,
  errorMessage,
  imagesToSend = [],
  pdfsToSend = []
) {
  if (busy) return;

  const controller = new AbortController();
  activeController = controller;

  setGeneratingState(true);

  let typingRow = createTypingRow();
  let streamingRow = null;
  let generatedText = "";

  messagesEl.appendChild(typingRow);

  typingRow.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });

  try {
    // IMAGE CONVERSION
    const images = await Promise.all(
      imagesToSend.map(image =>
        imageFileToBase64(image.file)
      )
    );

    // PDF CONVERSION
    const pdfs = await Promise.all(
      pdfsToSend.map(pdf =>
        pdfFileToBase64(pdf.file)
      )
    );

    // ========================================
    // WEB SEARCH
    // ========================================

    let webSearchResults = [];

    if (webSearchEnabled) {
      showToast("🌐 Searching the web...");

      const latestUserMessage = [...chat.messages]
        .reverse()
        .find(message => message.role === "user");

      if (latestUserMessage) {
        const searchResponse = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: latestUserMessage.content.slice(0, 300)
          }),
          signal: controller.signal
        });

        const searchData = await searchResponse.json();

        if (!searchResponse.ok) {
          throw new Error(
            searchData.error || "Web search failed."
          );
        }

        webSearchResults = searchData.results || [];
      }
    }

    // ========================================
    // GEMINI API REQUEST
    // ========================================

    const response = await fetch("/api/chat/stream", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: chat.messages.slice(-20),
        model: modelSelect
          ? modelSelect.value
          : "gemini-3.6-flash",
        images,
        pdfs,
        webSearchResults
      }),

      signal: controller.signal
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.error || errorMessage
      );
    }

    // ========================================
    // STREAMING RESPONSE
    // ========================================

    typingRow.remove();
    typingRow = null;

    streamingRow = addMessage("assistant", "");

    const messageText =
      streamingRow.querySelector(".message-text");

    await readEventStream(response, chunk => {
      generatedText += chunk;

      messageText.textContent = generatedText;

      streamingRow.scrollIntoView({
        behavior: "auto",
        block: "end"
      });
    });

    if (controller.signal.aborted) return;

    if (!generatedText.trim()) {
      throw new Error(
        "HARVION AI returned an empty response."
      );
    }

    // ========================================
    // SAVE ASSISTANT MESSAGE
    // ========================================

    chat.messages.push({
      role: "assistant",
      content: generatedText,
      sources: webSearchResults
    });

    streamingRow.remove();
    streamingRow = null;

    addMessage(
      "assistant",
      generatedText,
      chat.messages.length - 1
    );

    saveChats();

  } catch (error) {

    // ========================================
    // HANDLE STOP GENERATION
    // ========================================

    if (error.name === "AbortError") {
      if (generatedText.trim()) {
        chat.messages.push({
          role: "assistant",
          content: generatedText
        });

        saveChats();
      }

      streamingRow?.remove();

      if (generatedText.trim()) {
        addMessage(
          "assistant",
          generatedText,
          chat.messages.length - 1
        );
      }

      return;
    }

    // ========================================
    // HANDLE ERRORS
    // ========================================

    const message =
      error.message || errorMessage;

    showToast(message);

    streamingRow?.remove();

    if (generatedText.trim()) {
      chat.messages.push({
        role: "assistant",
        content: generatedText
      });

      addMessage(
        "assistant",
        generatedText,
        chat.messages.length - 1
      );

      saveChats();

    } else {
      addMessage(
        "assistant",
        "Sorry, I couldn't complete that request. " + message
      );
    }

  } finally {

    // ========================================
    // CLEANUP
    // ========================================

    typingRow?.remove();

    if (activeController === controller) {
      activeController = null;
    }

    setGeneratingState(false);

    input?.focus();
  }
}

// ========================================
// SEND MESSAGE
// ========================================

async function sendMessage(rawText) {
  const text = rawText.trim();

  const hasImages = selectedImages.length > 0;
const hasPDFs = selectedPDFs.length > 0;

  if ((!text && !hasImages && !hasPDFs) || busy) return;
  stopVoiceInput();

  const messageText = text || (
  hasImages && hasPDFs
    ? "Please analyze the uploaded images and PDF."
    : hasPDFs
      ? "Please analyze the uploaded PDF document."
      : "Please analyze the uploaded image."
);

  let chat;
  let messageIndex;

  const imagesForRequest = [...selectedImages];
  const pdfsForRequest = [...selectedPDFs];

  const previewUrls = imagesForRequest.map(
    (image) => image.previewUrl
  );

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
      content: messageText
    });

    messageIndex = chat.messages.length - 1;

    cancelEditing();

    messagesEl.innerHTML = "";

    const imageKey =
      `${activeChatId}:${messageIndex}`;

    chatImages[imageKey] = previewUrls;
    chatImageData[imageKey] = imagesForRequest;

    chat.messages.forEach((message, index) => {
      addMessage(
        message.role,
        message.content,
        index
      );
    });

  } else {
    if (!activeChatId) {
      activeChatId = crypto.randomUUID();

      chats.push({
        id: activeChatId,
        title: messageText.slice(0, 34),
        messages: []
      });
    }

    chat = currentChat();

    chat.messages.push({
      role: "user",
      content: messageText
    });

    messageIndex = chat.messages.length - 1;

    const imageKey =
      `${activeChatId}:${messageIndex}`;

    chatImages[imageKey] = previewUrls;
    chatImageData[imageKey] = imagesForRequest;

    addMessage(
      "user",
      messageText,
      messageIndex
    );
  }

  input.value = "";

  resizeInput();

  saveChats();

  try {
    await requestAIResponse(
  chat,
  "Unable to get a response.",
  imagesForRequest,
  pdfsForRequest
);
  } finally {
    selectedImages.forEach((image) => {
      URL.revokeObjectURL(image.previewUrl);
    });

    selectedImages.length = 0;

    renderImagePreviews();
    selectedPDFs = [];
renderPDFPreviews();
  }
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

  const lastUserIndex = chat.messages.length - 1;

  const imageKey =
    `${activeChatId}:${lastUserIndex}`;

  const previousImages =
    chatImageData[imageKey] || [];

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
    "Regeneration failed.",
    previousImages
  );
}

// ========================================
// EXPORT CHAT
// ========================================

function exportChat() {
  if (busy) {
    showToast("Wait until the response finishes.");
    return;
  }

  const chat = currentChat();

  if (
    !chat ||
    !chat.messages ||
    chat.messages.length === 0
  ) {
    showToast("No conversation available to export.");
    return;
  }

  const title =
    chat.title || "HARVION Conversation";

  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "HARVION_Conversation";

  let content = "";

  content += "========================================\n";
  content += "              HARVION AI\n";
  content += "========================================\n\n";

  content += "Conversation: " + title + "\n";
  content += "Exported: " + new Date().toLocaleString() + "\n\n";

  chat.messages.forEach((message) => {
    const speaker =
      message.role === "assistant"
        ? "HARVION AI"
        : "You";

    content += speaker + ":\n";
    content += String(message.content || "") + "\n\n";
    content += "----------------------------------------\n\n";
  });

  const blob = new Blob(
    ["\uFEFF", content],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = safeTitle + ".txt";

  document.body.appendChild(link);

  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast("Conversation exported successfully!");
}

// ========================================
// FORM SUBMISSION
// ========================================

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    sendMessage(input.value);
  });
}

// ========================================
// INPUT EVENTS
// ========================================

if (input) {
  input.addEventListener("input", resizeInput);

  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
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
}

// ========================================
// BUTTON EVENTS
// ========================================

if (stopButton) {
  stopButton.addEventListener(
    "click",
    stopGeneration
  );
}

if (exportButton) {
  exportButton.addEventListener(
    "click",
    exportChat
  );
}

if (voiceButton) {
  voiceButton.addEventListener(
    "click",
    startVoiceInput
  );
}

$("#newChat")?.addEventListener("click", newChat);

$("#clearChat")?.addEventListener("click", () => {
  if (busy) return;

  if (!activeChatId) {
    newChat();
    return;
  }

  if (!confirm("Delete the current conversation?")) {
    return;
  }

  const oldId = activeChatId;

  chats = chats.filter(
    (chat) => chat.id !== oldId
  );

  delete chatImages[oldId];
  delete chatImageData[oldId];

  activeChatId = null;

  cancelEditing();

  messagesEl.innerHTML = "";
  welcome.hidden = false;

  input.value = "";

  resizeInput();
  saveChats();

  showToast("Current conversation deleted.");
});

// ========================================
// SIDEBAR TOGGLE
// ========================================

const menuToggle = $("#menuToggle");
const sidebar = $("#sidebar");

if (menuToggle && sidebar) {

  // Open sidebar when hamburger is clicked
  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("open");
  });

  // Close sidebar when clicking outside
  document.addEventListener("click", (event) => {

    if (
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }

  });

}

// ========================================
// SUGGESTION BUTTONS
// ========================================

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt || "");
  });
});

// ========================================
// CHAT SEARCH
// ========================================

if (chatSearch) {
  chatSearch.addEventListener(
    "input",
    renderHistory
  );
}

// ========================================
// CUSTOM DROPDOWNS
// ========================================

document.querySelectorAll(".custom-dropdown").forEach((dropdown) => {
  const trigger =
    dropdown.querySelector(".dropdown-trigger");

  const valueDisplay =
    dropdown.querySelector(".dropdown-value");

  const options =
    dropdown.querySelectorAll(".dropdown-option");

  const isModelDropdown =
    dropdown.id === "modelDropdown";

  const linkedSelect = document.getElementById(
    isModelDropdown ? "modelSelect" : "themeSelect"
  );

  if (!trigger || !valueDisplay || !linkedSelect) {
    return;
  }

  function syncDropdown() {
    const selectedOption = Array.from(options).find(
      (option) =>
        option.dataset.value === linkedSelect.value
    );

    if (!selectedOption) return;

    const label = selectedOption.querySelector("span");

    valueDisplay.textContent = label
      ? label.textContent
      : selectedOption.textContent.trim();

    options.forEach((option) => {
      const selected =
        option.dataset.value === linkedSelect.value;

      option.classList.toggle("selected", selected);

      const check =
        option.querySelector(".option-check");

      if (check) {
        check.textContent = selected ? "✓" : "";
      }
    });
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();

    const shouldOpen =
      !dropdown.classList.contains("open");

    document.querySelectorAll(
      ".custom-dropdown.open"
    ).forEach((item) => {
      item.classList.remove("open");

      item.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });

    if (shouldOpen) {
      dropdown.classList.add("open");

      trigger.setAttribute("aria-expanded", "true");
    }
  });

  options.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();

      linkedSelect.value = option.dataset.value;

      linkedSelect.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      syncDropdown();

      dropdown.classList.remove("open");

      trigger.setAttribute("aria-expanded", "false");
    });
  });

  linkedSelect.addEventListener(
    "change",
    syncDropdown
  );

  syncDropdown();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".custom-dropdown")) {
    document.querySelectorAll(
      ".custom-dropdown.open"
    ).forEach((dropdown) => {
      dropdown.classList.remove("open");

      dropdown.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(
      ".custom-dropdown.open"
    ).forEach((dropdown) => {
      dropdown.classList.remove("open");

      dropdown.querySelector(".dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });
  }
});

// ========================================
// INITIALIZE HARVION AI
// ========================================

renderHistory();
resizeInput();

console.log("HARVION AI initialized successfully.");



