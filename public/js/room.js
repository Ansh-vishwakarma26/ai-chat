/* StudyHub room: WebRTC mesh (max 8), chat sidebar, AI tutor sidebar */
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('id') || '').trim().toUpperCase();
  if (!roomId) { window.location.href = '/'; return; }

  const profile = JSON.parse(localStorage.getItem('studyhub-profile') || '{}');
  if (!profile.name) {
    profile.name = 'Guest';
    profile.language = 'Any';
    profile.country = 'Any';
  }

  const MAX_PARTICIPANTS = 8;
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  const socket = io();
  const pcs = new Map();          // peer socketId -> RTCPeerConnection
  const remoteStreams = new Map();// peer socketId -> MediaStream
  const mutedByMe = new Set();    // peers whose audio I silenced locally
  const peerMeta = new Map();     // peer socketId -> { name, language, country }
  let myId = null;
  let localStream = null;
  let micOn = true;
  let camOn = true;
  let allOthersMuted = false;

  /* ================= UI helpers ================= */
  function toast(msg, ms = 2500) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function addMessage(container, { who, text, cls }) {
    const div = document.createElement('div');
    div.className = 'msg' + (cls ? ' ' + cls : '');
    if (who) {
      const w = document.createElement('div');
      w.className = 'who';
      w.textContent = who;
      div.appendChild(w);
    }
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    div.appendChild(b);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* ================= Media ================= */
  async function initMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      toast('Camera/mic unavailable — joining in view-only mode.');
      localStream = new MediaStream();
      micOn = false;
      camOn = false;
      $('mic-btn').textContent = '🎤 Mic off';
      $('mic-btn').classList.remove('on');
      $('cam-btn').textContent = '📷 Cam off';
      $('cam-btn').classList.remove('on');
    }
    addTile(myId, profile.name, profile.language, true);
    attachStream(myId, localStream);
    setTileCam(myId, camOn);
    setTileMic(myId, micOn);
  }

  /* ================= Tiles ================= */
  function addTile(id, name, language, isMe) {
    if (document.getElementById('tile-' + id)) return;
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.id = 'tile-' + id;

    const video = document.createElement('video');
    video.id = 'video-' + id;
    video.autoplay = true;
    video.playsInline = true;
    if (isMe) video.muted = true;

    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<span class="nm"></span>` + (language && language !== 'Any' ? `<span class="lang"></span>` : '');
    label.querySelector('.nm').textContent = name + (isMe ? ' (you)' : '');
    const langEl = label.querySelector('.lang');
    if (langEl) langEl.textContent = language;

    tile.appendChild(video);
    tile.appendChild(label);

    if (!isMe) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const muteBtn = document.createElement('button');
      muteBtn.textContent = '🔇';
      muteBtn.title = 'Mute this person for you only (they can still hear others)';
      muteBtn.addEventListener('click', () => toggleMuteForMe(id, muteBtn));
      actions.appendChild(muteBtn);
      tile.appendChild(actions);
    }

    $('video-grid').appendChild(tile);
    updateGridCount();
  }

  function removeTile(id) {
    const pc = pcs.get(id);
    if (pc) { pc.close(); pcs.delete(id); }
    remoteStreams.delete(id);
    mutedByMe.delete(id);
    peerMeta.delete(id);
    const tile = document.getElementById('tile-' + id);
    if (tile) tile.remove();
    updateGridCount();
  }

  function updateGridCount() {
    const grid = $('video-grid');
    grid.setAttribute('data-count', String(grid.children.length));
    $('participant-count').textContent = `${grid.children.length}/${MAX_PARTICIPANTS} studying`;
  }

  function attachStream(id, stream) {
    const video = $('video-' + id);
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    applyMyMuteState(id);
  }

  function setTileCam(id, on) {
    const tile = $('tile-' + id);
    if (tile) tile.classList.toggle('cam-off', !on);
  }

  function setTileMic(id, on) {
    const tile = $('tile-' + id);
    if (tile) tile.classList.toggle('mic-off', !on);
  }

  /* ================= Per-peer mute (local only) ================= */
  function toggleMuteForMe(id, btn) {
    if (mutedByMe.has(id)) {
      mutedByMe.delete(id);
      btn.classList.remove('muted-for-me');
      btn.title = 'Mute this person for you only';
      toast('Audio unmuted for this person.');
    } else {
      mutedByMe.add(id);
      btn.classList.add('muted-for-me');
      btn.title = 'Unmute this person for you';
      toast('You muted this person for yourself only.');
    }
    applyMyMuteState(id);
  }

  function applyMyMuteState(id) {
    const video = $('video-' + id);
    if (!video || !video.srcObject) return;
    video.srcObject.getAudioTracks().forEach((t) => { t.enabled = !mutedByMe.has(id); });
  }

  $('mute-all-btn').addEventListener('click', () => {
    allOthersMuted = !allOthersMuted;
    for (const id of remoteStreams.keys()) {
      if (allOthersMuted) mutedByMe.add(id); else mutedByMe.delete(id);
      applyMyMuteState(id);
      const btn = document.querySelector('#tile-' + id + ' .actions button');
      if (btn) btn.classList.toggle('muted-for-me', allOthersMuted);
    }
    $('mute-all-btn').textContent = allOthersMuted ? '🔊 Unmute all others' : '🔇 Mute all others';
    toast(allOthersMuted ? 'All other participants muted for you.' : 'All participants unmuted for you.');
  });

  /* ================= Own mic/cam ================= */
  $('mic-btn').addEventListener('click', () => {
    if (!localStream || !localStream.getAudioTracks().length) { toast('No microphone available.'); return; }
    micOn = !micOn;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    $('mic-btn').textContent = micOn ? '🎤 Mic on' : '🎤 Mic off';
    $('mic-btn').classList.toggle('on', micOn);
    setTileMic(myId, micOn);
    socket.emit('media-state', { micOn, camOn });
  });

  $('cam-btn').addEventListener('click', () => {
    if (!localStream || !localStream.getVideoTracks().length) { toast('No camera available.'); return; }
    camOn = !camOn;
    localStream.getVideoTracks().forEach((t) => { t.enabled = camOn; });
    $('cam-btn').textContent = camOn ? '📷 Cam on' : '📷 Cam off';
    $('cam-btn').classList.toggle('on', camOn);
    setTileCam(myId, camOn);
    socket.emit('media-state', { micOn, camOn });
  });

  /* ================= WebRTC mesh ================= */
  function createPeer(peerId) {
    if (pcs.has(peerId)) return pcs.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcs.set(peerId, pc);

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('relay', { to: peerId, type: 'ice', data: e.candidate });
    };
    pc.ontrack = (e) => {
      remoteStreams.set(peerId, e.streams[0]);
      attachStream(peerId, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // keep tile; ICE may restart. Only clean up on peer-left.
      }
    };
    return pc;
  }

  async function makeOffer(peerId) {
    const pc = createPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('relay', { to: peerId, type: 'offer', data: pc.localDescription });
  }

  socket.on('relay', async ({ from, type, data }) => {
    if (!localStream) return;
    if (type === 'offer') {
      const pc = createPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('relay', { to: from, type: 'answer', data: pc.localDescription });
    } else if (type === 'answer') {
      const pc = pcs.get(from);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      }
    } else if (type === 'ice') {
      const pc = pcs.get(from);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
    }
  });

  /* ================= Room lifecycle ================= */
  socket.on('connect', () => {
    myId = socket.id;
    initMedia().then(() => {
      socket.emit('join-room', { roomId, profile }, (res) => {
        if (!res || !res.ok) {
          alert((res && res.error) || 'Could not join room.');
          window.location.href = '/';
          return;
        }
        $('room-code').textContent = roomId;
        $('room-title').textContent = res.room.name || 'Study room';
        document.title = `StudyHub — ${res.room.name || roomId}`;
        for (const p of res.peers) {
          peerMeta.set(p.id, p);
          addTile(p.id, p.name, p.language, false);
          setTileMic(p.id, p.micOn);
          setTileCam(p.id, p.camOn);
          makeOffer(p.id);
        }
        addMessage($('chat-messages'), { text: `You joined "${res.room.name}". Share ID ${roomId} to invite friends.`, cls: 'system' });
      });
    });
  });

  socket.on('peer-joined', (p) => {
    peerMeta.set(p.id, p);
    addTile(p.id, p.name, p.language, false);
    addMessage($('chat-messages'), { text: `${p.name} joined the room.`, cls: 'system' });
  });

  socket.on('peer-left', ({ id }) => {
    const meta = peerMeta.get(id);
    addMessage($('chat-messages'), { text: `${meta ? meta.name : 'A participant'} left the room.`, cls: 'system' });
    removeTile(id);
  });

  socket.on('peer-state', ({ id, micOn: m, camOn: c }) => {
    if (typeof m === 'boolean') setTileMic(id, m);
    if (typeof c === 'boolean') setTileCam(id, c);
  });

  window.addEventListener('beforeunload', () => {
    pcs.forEach((pc) => pc.close());
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
  });

  /* ================= Chat ================= */
  $('toggle-chat').addEventListener('click', () => {
    $('chat-panel').classList.toggle('hidden');
    $('ai-panel').classList.add('hidden');
  });
  $('toggle-ai').addEventListener('click', () => {
    $('ai-panel').classList.toggle('hidden');
    $('chat-panel').classList.add('hidden');
    if (!$('ai-panel').classList.contains('hidden')) $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
  });
  document.querySelectorAll('.close-panel').forEach((btn) =>
    btn.addEventListener('click', () => $(btn.dataset.panel === 'chat' ? 'chat-panel' : 'ai-panel').classList.add('hidden'))
  );

  socket.on('chat-message', (msg) => {
    const mine = msg.from === myId;
    addMessage($('chat-messages'), {
      who: mine ? 'You' : msg.name,
      text: msg.text,
      cls: mine ? 'mine' : ''
    });
  });

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text) return;
    socket.emit('chat-message', { text });
    $('chat-input').value = '';
  });

  /* ================= AI tutor ================= */
  const aiHistory = [
    {
      role: 'system',
      content:
        'You are a friendly study tutor inside a group video study app. Answer questions clearly and concisely, ' +
        'give hints before full solutions, and keep responses short enough to read while studying.'
    }
  ];
  let aiConfigured = null; // null = unknown yet

  addMessage($('ai-messages'), {
    who: 'AI Tutor',
    text: 'Hi! Ask me anything about what you are studying — math, science, languages, exam prep. (The AI backend is not connected yet; the app owner will add their API key.)',
    cls: 'ai'
  });

  $('ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('ai-input').value.trim();
    if (!text) return;
    $('ai-input').value = '';
    addMessage($('ai-messages'), { who: 'You', text, cls: 'mine' });
    aiHistory.push({ role: 'user', content: text });
    $('ai-send').disabled = true;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: aiHistory })
      });
      const data = await res.json();
      if (aiConfigured === null) aiConfigured = !!data.configured;
      const reply = data.reply || data.error || 'Sorry, I could not answer that.';
      aiHistory.push({ role: 'assistant', content: reply });
      addMessage($('ai-messages'), { who: 'AI Tutor', text: reply, cls: 'ai' });
    } catch {
      addMessage($('ai-messages'), { who: 'AI Tutor', text: 'Network error — could not reach the AI tutor.', cls: 'ai' });
    } finally {
      $('ai-send').disabled = false;
    }
  });

  /* ================= Misc ================= */
  $('room-code').addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => toast('Room ID copied!')).catch(() => {});
  });
  $('leave-btn').addEventListener('click', () => { window.location.href = '/'; });
})();
