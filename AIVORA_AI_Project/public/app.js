const $ = (selector) => document.querySelector(selector);
const form = $("#chatForm");
const input = $("#promptInput");
const messagesEl = $("#messages");
const welcome = $("#welcome");
const sendButton = $("#sendButton");
const historyList = $("#historyList");
const toast = $("#toast");

let chats = JSON.parse(localStorage.getItem("aivora-chats") || "[]");
let activeChatId = null;
let busy = false;

function saveChats() {
  localStorage.setItem("aivora-chats", JSON.stringify(chats));
  renderHistory();
}
function newChat() {
  activeChatId = null;
  messagesEl.innerHTML = "";
  welcome.hidden = false;
  renderHistory();
  input.focus();
}
function currentChat() {
  return chats.find((chat) => chat.id === activeChatId);
}
function renderHistory() {
  historyList.innerHTML = "";
  [...chats].reverse().forEach((chat) => {
    const button = document.createElement("button");
    button.className = "history-item" + (chat.id === activeChatId ? " active" : "");
    button.textContent = "◦  " + (chat.title || "New conversation");
    button.title = chat.title || "New conversation";
    button.addEventListener("click", () => openChat(chat.id));
    historyList.appendChild(button);
  });
}
function openChat(id) {
  activeChatId = id;
  const chat = currentChat();
  messagesEl.innerHTML = "";
  welcome.hidden = true;
  chat.messages.forEach((message) => addMessage(message.role, message.content));
  renderHistory();
  $("#sidebar").classList.remove("open");
}
function addMessage(role, content) {
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
    label.textContent = "AIVORA AI";
    body.appendChild(label);
  }
  const text = document.createElement("div");
  text.textContent = content;
  body.appendChild(text);
  row.append(avatar, body);
  messagesEl.appendChild(row);
  row.scrollIntoView({ behavior: "smooth", block: "end" });
  return row;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}
async function sendMessage(rawText) {
  const text = rawText.trim();
  if (!text || busy) return;
  busy = true;
  sendButton.disabled = true;
  input.value = "";
  resizeInput();

  if (!activeChatId) {
    activeChatId = crypto.randomUUID();
    chats.push({ id: activeChatId, title: text.slice(0, 34), messages: [] });
  }
  const chat = currentChat();
  chat.messages.push({ role: "user", content: text });
  addMessage("user", text);
  saveChats();

  const typingRow = document.createElement("div");
  typingRow.className = "message assistant";
  typingRow.innerHTML = '<div class="message-avatar">✦</div><div class="message-content"><div class="message-label">AIVORA AI</div><div class="typing"><i></i><i></i><i></i></div></div>';
  messagesEl.appendChild(typingRow);
  typingRow.scrollIntoView({ behavior: "smooth", block: "end" });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages.slice(-20) })
    });
    const data = await response.json();
    typingRow.remove();
    if (!response.ok) throw new Error(data.error || "Unable to get a response.");
    chat.messages.push({ role: "assistant", content: data.reply });
    addMessage("assistant", data.reply);
    saveChats();
  } catch (error) {
    typingRow.remove();
    const message = error.message || "Something went wrong.";
    addMessage("assistant", "Sorry, I couldn't complete that request. " + message);
    showToast(message);
  } finally {
    busy = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});
input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
$("#newChat").addEventListener("click", newChat);
$("#clearChat").addEventListener("click", () => {
  if (!activeChatId) return newChat();
  chats = chats.filter((chat) => chat.id !== activeChatId);
  saveChats();
  newChat();
});
$("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
renderHistory();