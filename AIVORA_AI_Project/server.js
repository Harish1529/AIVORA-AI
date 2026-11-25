

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import { randomBytes } from "node:crypto";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error("Firebase service account path is missing.");
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const firebaseAuth = getAuth();

async function verifyFirebaseUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Please sign in first."
      });
    }

    const idToken = authHeader.split(" ")[1];
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    req.user = decodedToken;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      error: "Authentication failed. Please sign in again."
    });
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));


// ========================================
// AVAILABLE GEMINI MODELS
// ========================================

const AVAILABLE_MODELS = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Advanced responses"
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    description: "Balanced performance"
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    description: "Lightweight and fast"
  }
];

const DEFAULT_MODEL = "gemini-3.6-flash";

// ========================================
// CHECK API CONFIGURATION
// ========================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// ========================================
// GET AVAILABLE MODELS
// ========================================

app.get("/api/models", (_req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL
  });
});

// ========================================
// GEMINI CHAT API
// ========================================

app.post("/api/chat", async (req, res) => {
  const controller = new AbortController();

  // Cancel Gemini request if browser disconnects.
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
      console.log("Client disconnected. Gemini request cancelled.");
    }
  });

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Gemini API key is missing. Check your .env file."
      });
    }

    const messages = req.body?.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return res.status(400).json({
        error: "Please send between 1 and 30 chat messages."
      });
    }

    // Validate the selected model.
    const requestedModel = req.body?.model || DEFAULT_MODEL;

    const selectedModel = AVAILABLE_MODELS.find(
      (item) => item.id === requestedModel
    );

    if (!selectedModel) {
      return res.status(400).json({
        error: "Invalid model selection."
      });
    }

    const model = selectedModel.id;

    const contents = messages.map((message) => {
      const role =
        message.role === "assistant" ? "model" : "user";

      const text = String(message.content || "").slice(0, 12000);

      return {
        role,
        parts: [{ text }]
      };
    });

    if (
      contents.some((item) => !item.parts[0].text.trim())
    ) {
      return res.status(400).json({
        error: "Messages cannot be empty."
      });
    }

    let response;
    let data;

    // Retry temporary 503 errors.
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are HARVION AI, a helpful, clear, friendly AI assistant. Give accurate and useful answers."
              }]
            },

            contents,

            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          }),

          signal: controller.signal
        }
      );

      data = await response.json();

      if (response.status !== 503 || attempt === 2) {
        break;
      }

      console.log(
        `Gemini busy. Retrying... ${attempt + 1}/2`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (2 ** attempt))
      );
    }

    // Stop if browser disconnected.
    if (controller.signal.aborted || res.destroyed) {
      return;
    }

    console.log("Gemini HTTP Status:", response.status);
    console.log("Selected model:", model);

    if (!response.ok) {
      console.error(
        "Gemini Error:",
        JSON.stringify(data, null, 2)
      );

      const message =
        data?.error?.message ||
        "The AI provider returned an error.";

      return res.status(response.status).json({
        error: message
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return res.status(502).json({
        error: "HARVION AI did not receive a text response. Please try again."
      });
    }

    return res.json({
      reply: answer,
      model: model
    });

  } catch (error) {
    if (
      controller.signal.aborted ||
      error.name === "AbortError"
    ) {
      console.log("Gemini generation stopped.");
      return;
    }

    console.error("Chat error:", error);

    if (!res.destroyed) {
      return res.status(500).json({
        error: "Something went wrong on the server. Please try again."
      });
    }
  }
});
// ========================================
// REAL-TIME GEMINI STREAMING API
// ========================================


app.post("/api/chat/stream", async (req, res) => {
  const controller = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
      console.log("Streaming client disconnected.");
    }
  });

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Gemini API key is missing."
      });
    }

    const messages = req.body?.messages;
    const images = req.body?.images || [];
    const pdfs = req.body?.pdfs || [];
    const webSearchResults = req.body?.webSearchResults || [];

if (
  !Array.isArray(webSearchResults) ||
  webSearchResults.length > 5
) {
  return res.status(400).json({
    error: "Invalid web search results."
  });
}

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return res.status(400).json({
        error: "Please send between 1 and 30 chat messages."
      });
    }

    if (!Array.isArray(images) || images.length > 4) {
      return res.status(400).json({
        error: "You can upload a maximum of 4 images."
      });
    }

    // Validate uploaded images.
    const imageParts = [];

    for (const image of images) {
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (
        !image ||
        !allowedTypes.includes(image.mimeType) ||
        typeof image.data !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      ) {
        return res.status(400).json({
          error: "Invalid image format."
        });
      }

      const imageBuffer = Buffer.from(image.data, "base64");

      if (
        imageBuffer.length === 0 ||
        imageBuffer.length > 5 * 1024 * 1024
      ) {
        return res.status(400).json({
          error: "Each image must be smaller than 5 MB."
        });
      }

      imageParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }
    // ========================================
// VALIDATE UPLOADED PDF FILES
// ========================================

if (!Array.isArray(pdfs) || pdfs.length > 1) {
  return res.status(400).json({
    error: "You can upload only 1 PDF at a time."
  });
}

const pdfParts = [];

for (const pdf of pdfs) {
  if (
    !pdf ||
    pdf.mimeType !== "application/pdf" ||
    typeof pdf.data !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf.data)
  ) {
    return res.status(400).json({
      error: "Invalid PDF format."
    });
  }

  const pdfBuffer = Buffer.from(pdf.data, "base64");

  if (
    pdfBuffer.length === 0 ||
    pdfBuffer.length > 10 * 1024 * 1024 ||
    pdfBuffer.subarray(0, 5).toString() !== "%PDF-"
  ) {
    return res.status(400).json({
      error: "PDF must be valid and smaller than 10 MB."
    });
  }

  pdfParts.push({
    inlineData: {
      mimeType: "application/pdf",
      data: pdf.data
    }
  });
}

    const requestedModel = req.body?.model || DEFAULT_MODEL;

    const selectedModel = AVAILABLE_MODELS.find(
      (item) => item.id === requestedModel
    );

    if (!selectedModel) {
      return res.status(400).json({
        error: "Invalid model selection."
      });
    }

    const model = selectedModel.id;

    // Find the latest user message to attach images to it.
    let lastUserIndex = -1;

    messages.forEach((message, index) => {
      if (message.role !== "assistant") {
        lastUserIndex = index;
      }
    });

    if (lastUserIndex === -1) {
      return res.status(400).json({
        error: "A user message is required."
      });
    }

    const contents = messages.map((message, index) => {
      const role =
        message.role === "assistant" ? "model" : "user";

      const messageText = String(
        message.content || ""
      ).slice(0, 12000);

      const parts = [];

      if (messageText.trim()) {
        parts.push({ text: messageText });
      }

      // Attach uploaded images and PDFs to the latest user message.
if (index === lastUserIndex) {
  parts.push(...imageParts);
  parts.push(...pdfParts);
}

      return { role, parts };
    });
    // Prepare web search context for Gemini.
let webSearchContext = "";

if (webSearchResults.length > 0) {
  webSearchContext =
    "\n\nWEB SEARCH RESULTS:\n" +
    webSearchResults.map((item, index) => {
      return (
        `Source ${index + 1}: ${String(item.title || "").slice(0, 300)}\n` +
        `URL: ${String(item.url || "").slice(0, 1000)}\n` +
        `Information: ${String(item.snippet || "").slice(0, 1500)}`
      );
    }).join("\n\n") +
    "\n\nUse these sources to answer the user's question. " +
    "Do not invent facts or URLs. Cite relevant sources using Markdown links.";
}

    if (
      contents.some(
        (item) => item.parts.length === 0
      )
    ) {
      return res.status(400).json({
        error: "Messages cannot be empty."
      });
    }

    const requestBody = {
      systemInstruction: {
  parts: [{
    text:
      "You are HARVION AI, a helpful, clear, friendly AI assistant. " +

      "Automatically detect the language and writing style of the user's latest message. " +

      "Always respond in the same language used by the user. " +

      "If the user writes in Tamil, respond in Tamil. " +
      "If the user writes in English, respond in English. " +
      "If the user writes in Hindi, respond in Hindi. " +
      "If the user writes in Malayalam, respond in Malayalam. " +
      "If the user writes in Telugu, respond in Telugu. " +

      "If the user writes in Tanglish or mixes Tamil and English, " +
      "respond naturally in the same mixed style. " +

      "Do not unnecessarily translate the user's message. " +
      "Do not switch languages unless the user requests it. " +

      "You can understand uploaded images. Analyze image details carefully " +
      "and answer questions accurately in the user's language."
  }]
},

      contents: contents.map((item, index) => {
  if (
    index === lastUserIndex &&
    webSearchContext
  ) {
    return {
      ...item,
      parts: [
        ...item.parts,
        { text: webSearchContext }
      ]
    };
  }

  return item;
}),

      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    let response;
    let errorData;

    // Retry temporary 503 errors before starting the stream.
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );

      if (response.ok) break;

      errorData = await response.json().catch(() => ({}));

      if (response.status !== 503 || attempt === 2) break;

      console.log(`Gemini busy. Retrying ${attempt + 1}/2...`);

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (2 ** attempt))
      );

      if (controller.signal.aborted) return;
    }

    if (controller.signal.aborted || res.destroyed) return;

    if (!response.ok) {
      console.error("Gemini streaming error:", errorData);

      return res.status(response.status).json({
        error:
          errorData?.error?.message ||
          "Gemini streaming request failed."
      });
    }

    console.log("Streaming model:", model);
    console.log("Images received:", images.length);
console.log("PDFs received:", pdfs.length);
console.log(
  "PDF size (bytes):",
  pdfs.map(pdf => Buffer.from(pdf.data, "base64").length)
);
    // Start sending events to the browser.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    function processLine(line) {
      if (!line.startsWith("data:")) return;

      const rawData = line.slice(5).trim();

      if (!rawData || rawData === "[DONE]") return;

      try {
        const chunk = JSON.parse(rawData);

        const text = chunk?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");

        if (text && !res.destroyed) {
          res.write(
            `data: ${JSON.stringify({ text })}\n\n`
          );
        }
      } catch (error) {
        console.error("Could not parse Gemini stream chunk:", error);
      }
    }

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line.trimEnd());
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processLine(buffer.trimEnd());
    }

    if (!res.destroyed) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    }

  } catch (error) {
    if (
      controller.signal.aborted ||
      error.name === "AbortError"
    ) {
      console.log("Gemini streaming stopped.");
      return;
    }

    console.error("Streaming error:", error);

    if (!res.destroyed) {
      if (res.headersSent) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: "Streaming failed. Please try again."
          })}\n\n`
        );

        res.end();
      } else {
        res.status(500).json({
          error: "Something went wrong with streaming."
        });
      }
    }
  }
});

// ========================================
// LANGSEARCH WEB SEARCH API
// ========================================

app.post("/api/search", async (req, res) => {
  try {
    const apiKey = process.env.LANGSEARCH_API_KEY;
    const query = req.body?.query;

    if (!apiKey) {
      return res.status(503).json({
        error: "LangSearch API key is missing. Check your .env file."
      });
    }

    if (
      typeof query !== "string" ||
      !query.trim() ||
      query.length > 300
    ) {
      return res.status(400).json({
        error: "Please enter a search query (maximum 300 characters)."
      });
    }
console.log("HARVION: Chat request received");
    const response = await fetch(
      "https://api.langsearch.com/v1/web-search",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: query.trim(),
          count: 5
        }),
        signal: AbortSignal.timeout(20000)
      }
    );

    const data = await response.json();

    if (!response.ok || String(data?.code) !== "200") {
      console.error("LangSearch error:", data);

      return res.status(502).json({
        error: "Web search failed. Please try again."
      });
    }

    const results = data?.data?.webPages?.value || [];

    return res.json({
      query: query.trim(),
      results: results.map((item) => ({
        title: item.name || "Untitled result",
        url: item.url || "",
        snippet: item.snippet || item.text || "",
        date: item.datePublished || null
      }))
    });

  } catch (error) {
    console.error("LangSearch request error:", error);

    return res.status(500).json({
      error: "Unable to connect to web search right now."
    });
  }
});

// ========================================
// CREATE PUBLIC CHAT SHARE LINK
// ========================================

app.post("/api/share", verifyFirebaseUser, async (req, res) => {
  try {
    const { title, messages } = req.body;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return res.status(400).json({
        error: "Invalid conversation."
      });
    }

    const safeMessages = [];

    for (const message of messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        !message.content.trim() ||
        message.content.length > 12000
      ) {
        return res.status(400).json({
          error: "Invalid message content."
        });
      }

      safeMessages.push({
        role: message.role,
        content: message.content
      });
    }

    const shareToken = randomBytes(24).toString("hex");

    await db.collection("shares").doc(shareToken).set({
      ownerUid: req.user.uid,
      title: typeof title === "string"
        ? title.slice(0, 100)
        : "Shared conversation",
      messages: safeMessages,
      active: true,
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      shareId: shareToken,
      shareUrl: `${req.protocol}://${req.get("host")}/share/${shareToken}`
    });

  } catch (error) {
    console.error("Share creation error:", error);

    return res.status(500).json({
      error: "Unable to create share link."
    });
  }
});
// ========================================
// OPEN PUBLIC SHARED CONVERSATION
// ========================================

app.get("/api/share/:token", async (req, res) => {
  try {
    const token = req.params.token;

    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(400).json({
        error: "Invalid share link."
      });
    }

    const shareDoc = await db
      .collection("shares")
      .doc(token)
      .get();

    if (!shareDoc.exists) {
      return res.status(404).json({
        error: "Shared conversation not found."
      });
    }

    const share = shareDoc.data();

    if (!share.active) {
      return res.status(410).json({
        error: "This share link has been revoked."
      });
    }

    return res.json({
      title: share.title,
      messages: share.messages
    });

  } catch (error) {
    console.error("Share retrieval error:", error);

    return res.status(500).json({
      error: "Unable to open shared conversation."
    });
  }
});
// ========================================
// REVOKE PUBLIC SHARE LINK
// ========================================

app.delete("/api/share/:token", verifyFirebaseUser, async (req, res) => {
  try {
    const token = req.params.token;

    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(400).json({
        error: "Invalid share link."
      });
    }

    const shareRef = db.collection("shares").doc(token);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      return res.status(404).json({
        error: "Shared conversation not found."
      });
    }

    const share = shareDoc.data();

    if (share.ownerUid !== req.user.uid) {
      return res.status(403).json({
        error: "You cannot revoke someone else's share link."
      });
    }

    await shareRef.update({
      active: false,
      revokedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Share link revoked successfully."
    });

  } catch (error) {
    console.error("Share revocation error:", error);

    return res.status(500).json({
      error: "Unable to revoke share link."
    });
  }
});
// ========================================
// SERVE PUBLIC SHARING PAGE
// ========================================

app.get("/share/:token", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "share.html")
  );
});
// ========================================
// SERVE FRONTEND
// ========================================

app.get("*", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(
    `HARVION AI is running at http://localhost:${PORT}`
  );
});
