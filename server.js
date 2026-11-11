/*
 * StudyHub server
 * - Static frontend + REST endpoints
 * - Socket.IO signaling for WebRTC mesh video calls (max 8 participants)
 * - Public room lobby with language/country search
 * - Quick-match queue (random or preference-based)
 * - AI tutor proxy: fill in AI_API_URL / AI_API_KEY below to enable
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

/* ============================================================
 * AI TUTOR CONFIGURATION
 *
 * Read from environment variables so keys never live in the repo.
 * Any OpenAI-compatible chat completions endpoint works.
 *
 * Google AI Studio (Gemini) example:
 *   AI_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 *   AI_API_KEY=your-google-ai-studio-key
 *   AI_MODEL=gemini-2.0-flash
 *
 * Mistral example:
 *   AI_API_URL=https://api.mistral.ai/v1/chat/completions
 *   AI_API_KEY=your-key
 *   AI_MODEL=mistral-small-latest
 *
 * Locally: put them in a `.env` file (gitignored) and `npm start`
 * loads it automatically. Deployed: set them in the app's settings.
 * ============================================================ */
const AI_API_URL = process.env.AI_API_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || '';

const MAX_PARTICIPANTS = 8;
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- Room registry ---------------- */
// roomId -> { id, name, language, country, isPublic, createdAt,
//             participants: Map<socketId, { name, language, country, micOn, camOn }> }
const rooms = new Map();

// Quick-match queue: [{ socketId, profile, wantedLanguage, wantedCountry, joinedAt }]
const matchQueue = [];

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomId() {
  let id;
  do {
    id = Array.from({ length: 6 }, () => ROOM_ID_ALPHABET[crypto.randomInt(ROOM_ID_ALPHABET.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function publicRoomInfo(room) {
  return {
    id: room.id,
    name: room.name,
    language: room.language,
    country: room.country,
    participantCount: room.participants.size,
    maxParticipants: MAX_PARTICIPANTS,
    createdAt: room.createdAt
  };
}

function sanitizeProfile(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  return {
    name: String(p.name || 'Guest').slice(0, 30),
    avatar: String(p.avatar || '🧑‍🎓').slice(0, 8),
    language: String(p.language || 'Any').slice(0, 30),
    country: String(p.country || 'Any').slice(0, 30)
  };
}

/* Find a public room with an open seat, preferring language/country matches.
 * Returns { roomId, roomName } or { roomId: null }. */
app.get('/api/random-room', (req, res) => {
  const norm = (v) => String(v || '').trim().toLowerCase();
  const language = norm(req.query.language);
  const country = norm(req.query.country);
  let best = null;
  let bestScore = -1;
  for (const room of rooms.values()) {
    if (!room.isPublic) continue;
    if (room.participants.size >= MAX_PARTICIPANTS) continue;
    const rl = norm(room.language);
    const rc = norm(room.country);
    let score;
    if (language && language !== 'any' && rl === language && country && country !== 'any' && rc === country) score = 3;
    else if (language && language !== 'any' && rl === language) score = 2;
    else if (country && country !== 'any' && rc === country) score = 1;
    else score = 0;
    if (score > bestScore || (score === bestScore && best && room.participants.size < best.participants.size)) {
      best = room;
      bestScore = score;
    }
  }
  if (best) return res.json({ roomId: best.id, roomName: best.name });
  res.json({ roomId: null });
});

/* ---------------- REST API ---------------- */
// Random join: /api/random-room?language=English&country=India
// Lobby search: /api/rooms?language=Hindi&country=India&q=math
app.get('/api/rooms', (req, res) => {
  const { language, country, q } = req.query;
  const norm = (v) => String(v || '').trim().toLowerCase();
  const list = [];
  for (const room of rooms.values()) {
    if (!room.isPublic) continue;
    if (norm(language) && norm(room.language) !== norm(language)) continue;
    if (norm(country) && norm(room.country) !== norm(country)) continue;
    if (norm(q)) {
      const haystack = `${room.name} ${room.language} ${room.country}`.toLowerCase();
      if (!haystack.includes(norm(q))) continue;
    }
    list.push(publicRoomInfo(room));
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ rooms: list, maxParticipants: MAX_PARTICIPANTS });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(String(req.params.id).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room: publicRoomInfo(room) });
});

/* ---------------- AI tutor proxy ----------------
 * The frontend POSTs { messages: [{ role, content }, ...] } here.
 * While AI_API_URL / AI_API_KEY are empty the client gets
 * configured:false and shows a friendly placeholder message.
 */
app.post('/api/ai/chat', async (req, res) => {
  if (!AI_API_URL || !AI_API_KEY) {
    return res.json({
      configured: false,
      reply: 'AI tutor is not connected yet. Add your API URL and key in server.js (AI_API_URL / AI_API_KEY) and restart the server.'
    });
  }
  try {
    const messages = Array.isArray(req.body && req.body.messages) ? req.body.messages.slice(-20) : [];
    if (!messages.length) return res.status(400).json({ error: 'messages array required' });

    const body = { messages };
    if (AI_MODEL) body.model = AI_MODEL;

    const r = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ configured: true, error: `AI provider responded ${r.status}: ${text.slice(0, 300)}` });
    }
    const data = await r.json();
    const reply =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data.content && data.content[0] && data.content[0].text) ||
      (typeof data.reply === 'string' ? data.reply : null) ||
      'AI provider returned no reply content.';
    res.json({ configured: true, reply });
  } catch (err) {
    res.status(502).json({ configured: true, error: String((err && err.message) || err) });
  }
});

/* ---------------- Socket.IO signaling ---------------- */
io.on('connection', (socket) => {
  let joinedRoomId = null;

  const leaveCurrentRoom = () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room) {
      room.participants.delete(socket.id);
      socket.to(joinedRoomId).emit('peer-left', { id: socket.id });
      if (room.participants.size === 0) rooms.delete(joinedRoomId);
    }
    joinedRoomId = null;
  };

  socket.on('create-room', (payload, cb) => {
    const p = payload || {};
    const profile = sanitizeProfile(p.profile);
    const id = generateRoomId();
    const room = {
      id,
      name: String(p.name || `${profile.name}'s room`).slice(0, 50),
      language: profile.language,
      country: profile.country,
      isPublic: p.isPublic !== false,
      createdAt: Date.now(),
      participants: new Map()
    };
    rooms.set(id, room);
    if (typeof cb === 'function') cb({ ok: true, roomId: id });
  });

  socket.on('join-room', (payload, cb) => {
    const p = payload || {};
    const roomId = String(p.roomId || '').trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found. Check the ID.' });
      return;
    }
    if (room.participants.size >= MAX_PARTICIPANTS) {
      if (typeof cb === 'function') cb({ ok: false, error: `Room is full (${MAX_PARTICIPANTS} participants max).` });
      return;
    }
    leaveCurrentRoom();
    const profile = sanitizeProfile(p.profile);
    room.participants.set(socket.id, { ...profile, micOn: true, camOn: true });
    joinedRoomId = roomId;
    socket.join(roomId);

    const peers = [];
    for (const [id, meta] of room.participants) {
      if (id === socket.id) continue;
      peers.push({ id, name: meta.name, avatar: meta.avatar, language: meta.language, country: meta.country, micOn: meta.micOn, camOn: meta.camOn });
    }
    if (typeof cb === 'function') cb({ ok: true, roomId, room: publicRoomInfo(room), you: { id: socket.id, ...profile }, peers });

    socket.to(roomId).emit('peer-joined', { id: socket.id, ...profile });
  });

  socket.on('quick-match', (payload, cb) => {
    const p = payload || {};
    const profile = sanitizeProfile(p.profile);
    const wantedLanguage = String(p.language || profile.language || '').trim().toLowerCase();
    const wantedCountry = String(p.country || profile.country || '').trim().toLowerCase();

    // Remove any stale entry for this socket
    const staleIdx = matchQueue.findIndex((e) => e.socketId === socket.id);
    if (staleIdx !== -1) matchQueue.splice(staleIdx, 1);

    // Preference match first (same language, then same country), then anyone
    let idx = -1;
    if (wantedLanguage && wantedLanguage !== 'any') {
      idx = matchQueue.findIndex((e) => (e.profile.language || '').toLowerCase() === wantedLanguage);
    }
    if (idx === -1 && wantedCountry && wantedCountry !== 'any') {
      idx = matchQueue.findIndex((e) => (e.profile.country || '').toLowerCase() === wantedCountry);
    }
    if (idx === -1 && matchQueue.length > 0) idx = 0;

    if (idx === -1) {
      matchQueue.push({ socketId: socket.id, profile, joinedAt: Date.now() });
      if (typeof cb === 'function') cb({ ok: true, queued: true });
      return;
    }

    const partner = matchQueue.splice(idx, 1)[0];
    const partnerSocket = io.sockets.sockets.get(partner.socketId);
    if (!partnerSocket) {
      if (typeof cb === 'function') cb({ ok: true, queued: true });
      return;
    }

    const id = generateRoomId();
    const room = {
      id,
      name: 'Quick match',
      language: profile.language,
      country: profile.country,
      isPublic: false,
      createdAt: Date.now(),
      participants: new Map()
    };
    rooms.set(id, room);
    const matchInfo = { ok: true, queued: false, roomId: id };
    if (typeof cb === 'function') cb(matchInfo);
    partnerSocket.emit('matched', { roomId: id, partner: profile });
  });

  socket.on('cancel-match', (_, cb) => {
    const idx = matchQueue.findIndex((e) => e.socketId === socket.id);
    if (idx !== -1) matchQueue.splice(idx, 1);
    if (typeof cb === 'function') cb({ ok: true });
  });

  /* --- WebRTC relay --- */
  socket.on('relay', (payload) => {
    if (!payload || !payload.to) return;
    const { to, type, data } = payload;
    if (!['offer', 'answer', 'ice'].includes(type)) return;
    io.to(to).emit('relay', { from: socket.id, type, data });
  });

  socket.on('media-state', (payload) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const me = room.participants.get(socket.id);
    if (!me) return;
    if (typeof (payload && payload.micOn) === 'boolean') me.micOn = payload.micOn;
    if (typeof (payload && payload.camOn) === 'boolean') me.camOn = payload.camOn;
    io.to(joinedRoomId).emit('peer-state', {
      id: socket.id,
      micOn: me.micOn,
      camOn: me.camOn
    });
  });

  /* --- Chat --- */
  socket.on('chat-message', (payload) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const me = room.participants.get(socket.id);
    if (!me) return;
    const text = String((payload && payload.text) || '').trim().slice(0, 1000);
    if (!text) return;
    io.to(joinedRoomId).emit('chat-message', {
      from: socket.id,
      name: me.name,
      avatar: me.avatar,
      text,
      ts: Date.now()
    });
  });

  socket.on('disconnect', () => {
    const qi = matchQueue.findIndex((e) => e.socketId === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
    leaveCurrentRoom();
  });
});

server.listen(PORT, () => {
  console.log(`StudyHub running on http://localhost:${PORT}`);
});
