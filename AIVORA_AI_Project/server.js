
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

// Check API configuration
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Gemini chat API
app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Gemini API key is missing. Check your .env file."
      });
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
      return res.status(400).json({
        error: "Please send between 1 and 30 chat messages."
      });
    }

    const contents = messages.map((message) => {
      const role = message.role === "assistant" ? "model" : "user";
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

    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

    let response;
    let data;

    // Retry temporary 503 errors
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
                text: "You are AIVORA AI, a helpful, clear, friendly AI assistant. Give accurate and useful answers."
              }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        }
      );

      data = await response.json();

      if (response.status !== 503 || attempt === 2) {
        break;
      }

      console.log(`Gemini busy. Retrying... ${attempt + 1}/2`);

      await new Promise(resolve =>
        setTimeout(resolve, 1000 * (2 ** attempt))
      );
    }

    console.log("Gemini HTTP Status:", response.status);

    if (!response.ok) {
      console.error("Gemini Error:", JSON.stringify(data, null, 2));

      const message = data?.error?.message ||
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
        error: "AIVORA AI did not receive a text response. Please try again."
      });
    }

    return res.json({ reply: answer });

  } catch (error) {
    console.error("Chat error:", error);

    return res.status(500).json({
      error: "Something went wrong on the server. Please try again."
    });
  }
});

// Serve frontend
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`AIVORA AI is running at http://localhost:${PORT}`);
});
