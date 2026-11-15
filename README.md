# 📚 StudyHub

Group study rooms with live video calls for up to **8 people**.

🌐 **[Live Website](https://studyhublive.vercel.app/)**

## Features

- **Login page** — pick a name, avatar, study language, and country (stored only in your browser)
- **Home page** — join by ID, random join, create a room, browse live rooms
- **Create a room** — generates a 6-character room ID you can share
- **Join by ID** — enter a friend's code to hop into their room
- **Random join** — searches live public rooms for an open seat (your language/country first, then anywhere); if everything is full, it pairs you with the next person who hits "Random join"
- **Search public rooms** — filter by language, country, or keyword
- **Settings drawer** — change your name, avatar, language, country, and default mic/cam state
- **Video + audio calls** — WebRTC mesh, up to 8 participants per room
- **Per-person mute** — 🔇 button on every video tile silences that person *for you only* (they keep talking to everyone else), plus a global "mute all others" button
- **Chat sidebar** — popup chat panel on the side of the call
- **AI study tutor sidebar** — ask questions while you study

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000 → you land on the **login page**, then the **home page**. For cameras to work, serve over `https://` in production (or `localhost` for testing).

## Connect the AI tutor

Create or edit your `.env` file in the project root:

```env
AI_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
AI_API_KEY=your_api_key_here
AI_MODEL=gemini-3.8-flash
```

Any **OpenAI-compatible** chat completions endpoint works (Google AI Studio / Gemini API, Groq, Mistral, OpenAI, OpenRouter, or a local LLM). The default lightweight model `gemini-3.8-flash` delivers ultra-fast answers with minimal token consumption. Until configured, the AI panel replies with a friendly guidance message.

## Tech

- Node.js + Express + Socket.IO (signaling + lobby + matchmaking)
- Vanilla JS WebRTC (mesh topology, Google/Cloudflare STUN)
- No database — rooms live in memory; restart clears them

## Notes

- Mesh video scales well to 8 participants; for larger rooms you'd add an SFU.
- Quick match pairs 2 people into a private room; more can join via its ID.
