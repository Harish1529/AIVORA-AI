# AIVORA AI

A beginner-friendly AI chat website with a premium dark interface.

## Requirements
- Node.js 18 or newer
- A Gemini API key from Google AI Studio

## Run locally
1. Extract this ZIP.
2. Open the project folder in VS Code.
3. Open a terminal in that folder.
4. Run `npm install`.
5. Copy `.env.example` to a new file named `.env`.
6. Put your Gemini API key after `GEMINI_API_KEY=`.
7. Run `npm start`.
8. Open `http://localhost:3000` in your browser.

## Important security note
Never put your API key in `public/app.js`, `public/index.html`, or any frontend code. Keep it only in `.env`. Do not upload `.env` to GitHub or share it with anyone.

## What's included
- Responsive dark premium UI
- Chat with Gemini through a server-side API route
- Browser-local chat history
- New chat and clear chat controls
- Suggested prompts
- Basic input validation and useful error messages

## Current limitations
- Chat history is stored in this browser only; it is not synced between devices.
- This starter version does not yet include accounts, PDF uploads, web search, voice, or autonomous external actions.
- The Gemini free tier has usage limits and can change. Review current pricing and data terms before publishing for other users.
