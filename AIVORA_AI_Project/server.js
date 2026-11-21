

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
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

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return res.status(400).json({
        error: "Please send between 1 and 30 chat messages."
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

    const contents = messages.map((message) => {
      const role =
        message.role === "assistant" ? "model" : "user";

      const text = String(message.content || "").slice(0, 12000);

      return {
        role,
        parts: [{ text }]
      };
    });

    if (contents.some((item) => !item.parts[0].text.trim())) {
      return res.status(400).json({
        error: "Messages cannot be empty."
      });
    }

    const requestBody = {
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

    // Start sending events to the browser.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const rawData = line.slice(5).trim();

        if (!rawData || rawData === "[DONE]") continue;

        try {
          const chunk = JSON.parse(rawData);

          const text = chunk?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("");

          if (text && !res.destroyed) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch (error) {
          console.error("Could not parse Gemini stream chunk:", error);
        }
      }
    }

    // Process any remaining buffered data.
    const remaining = buffer.trim();

    if (remaining.startsWith("data:")) {
      try {
        const chunk = JSON.parse(remaining.slice(5).trim());

        const text = chunk?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");

        if (text && !res.destroyed) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      } catch {
        // Ignore incomplete final chunks.
      }
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
        res.write(`event: error\ndata: ${JSON.stringify({
          error: "Streaming failed. Please try again."
        })}\n\n`);

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
