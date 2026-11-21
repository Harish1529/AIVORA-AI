import dotenv from "dotenv";

dotenv.config();

const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

if (!key) {
  console.log("API key not found in .env");
  process.exit(1);
}

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: "Reply with: AIVORA connected!" }]
      }],
      generationConfig: {
        maxOutputTokens: 100
      }
    })
  }
);

const data = await response.json();

console.log("HTTP STATUS:", response.status);
console.log(JSON.stringify(data, null, 2));