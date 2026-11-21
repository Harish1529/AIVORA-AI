
import dotenv from "dotenv";
dotenv.config();

const response = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models",
  {
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY
    }
  }
);

const data = await response.json();

console.log("STATUS:", response.status);

if (!response.ok) {
  console.log(data);
} else {
  console.log(
    data.models
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name)
  );
}
