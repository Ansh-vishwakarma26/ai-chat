/* StudyHub room: WebRTC mesh (max 8), chat sidebar, AI tutor sidebar */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('id') || '').trim().toUpperCase();
  if (!roomId) { window.location.href = '/'; return; }

  const profile = JSON.parse(localStorage.getItem('studyhub-profile') || 'null');
  if (!profile || !profile.name) { window.location.href = '/'; return; }

  // Stable per-tab identity so a reconnect (new socket id) replaces the old
  // session instead of showing up as a second participant.
  const clientId = (() => {
    let id = sessionStorage.getItem('studyhub-client-id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('studyhub-client-id', id);
    }
    return id;
  })();

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
  const peerMeta = new Map();     // peer socketId -> { name, language, country, avatar }
  const LOCAL_ID = 'local';       // stable id for my own tile (survives reconnects)
  let myId = null;
  let localStream = null;
  let micOn = profile.defaultMic !== 'off';
  let camOn = profile.defaultCam !== false;
  let allOthersMuted = false;
  let unreadChatCount = 0;

  /* ================= UI helpers ================= */
  function toast(msg, ms = 2500) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function hideLoader() {
    const loader = $('room-loader');
    if (loader && !loader.classList.contains('fade-out')) {
      loader.classList.add('fade-out');
      setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
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

  /* ================= In-room Chat Notifications ================= */
  function showChatNotification(msg) {
    const container = $('chat-notify-container');
    if (!container) return;

    // Increment badge if chat is hidden
    const chatPanel = $('chat-panel');
    if (chatPanel && chatPanel.classList.contains('hidden')) {
      unreadChatCount++;
      updateChatBadge();
    }

    // Floating notification pill
    const pill = document.createElement('div');
    pill.className = 'chat-notify-pill';

    const av = (window.getStudyAvatar && window.getStudyAvatar(msg.avatar)) || { svg: '💬' };
    pill.innerHTML = `
      <div class="chat-notify-av">${av.svg}</div>
      <div class="chat-notify-content">
        <span class="chat-notify-name">${escapeHtml(msg.name)}</span>
        <span class="chat-notify-msg">${escapeHtml(msg.text)}</span>
      </div>
    `;

    pill.addEventListener('click', () => {
      openChat();
      pill.remove();
    });

    container.appendChild(pill);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      pill.style.opacity = '0';
      pill.style.transform = 'translateY(-8px) scale(0.95)';
      setTimeout(() => pill.remove(), 250);
    }, 4000);
  }

  function updateChatBadge() {
    const btn = $('toggle-chat');
    if (!btn) return;
    const existing = btn.querySelector('.chat-unread-badge');
    if (unreadChatCount > 0) {
      if (existing) {
        existing.textContent = unreadChatCount > 9 ? '9+' : unreadChatCount;
      } else {
        const badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        badge.textContent = unreadChatCount > 9 ? '9+' : unreadChatCount;
        btn.appendChild(badge);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function openChat() {
    const cp = $('chat-panel');
    if (cp) cp.classList.remove('hidden');
    $('ai-panel').classList.add('hidden');
    unreadChatCount = 0;
    updateChatBadge();
    const msgs = $('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const inp = $('chat-input');
    if (inp) inp.focus();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ================= Media with Anti-Echo & Noise Suppression ================= */
  let mediaPromise = null;

  function initMedia() {
    // Only request camera/mic once per page load, even if 'connect' fires again
    if (!mediaPromise) mediaPromise = setupMedia();
    return mediaPromise;
  }

  async function setupMedia() {
    if (localStream) { hideLoader(); return; }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: camOn ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 }
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      });
    } catch (err) {
      // If combined request fails (e.g. no camera attached), fallback gracefully
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        camOn = false;
        toast('Camera not detected — joining with audio only.');
      } catch (audioErr) {
        toast('Camera/mic unavailable — joining in spectator mode.');
        localStream = new MediaStream();
        micOn = false;
        camOn = false;
      }
    }

    if (localStream.getAudioTracks().length) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    }
    if (localStream.getVideoTracks().length) {
      localStream.getVideoTracks().forEach((t) => { t.enabled = camOn; });
    }

    // Add local tile with muted audio to eliminate echo loopback
    addTile(LOCAL_ID, profile.name, profile.language, true, profile.avatar);
    attachStream(LOCAL_ID, localStream);
    setTileCam(LOCAL_ID, camOn);
    setTileMic(LOCAL_ID, micOn);

    $('mic-btn').innerHTML = micOn ? '🎤 Mic on' : '🎤 Mic off';
    $('mic-btn').classList.toggle('on', micOn);
    $('cam-btn').innerHTML = camOn ? '📷 Cam on' : '📷 Cam off';
    $('cam-btn').classList.toggle('on', camOn);

    // Fade out the connecting loader
    hideLoader();

    // Attach tracks to existing peer connections if any arrived first
    pcs.forEach((pc) => {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    });
  }

  /* ================= Tiles ================= */
  function addTile(id, name, language, isMe, avatar) {
    if (document.getElementById('tile-' + id)) return;
    // Never allow more than one local "you" tile
    if (isMe && document.getElementById('tile-' + LOCAL_ID)) return;
    const avId = avatar || (isMe ? profile.avatar : 'alex');
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.id = 'tile-' + id;

    const video = document.createElement('video');
    video.id = 'video-' + id;
    video.autoplay = true;
    video.playsInline = true;

    // Strict echo prevention: local video MUST be muted!
    if (isMe) {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
    }

    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<span class="av"></span><span class="nm"></span>` + (language && language !== 'Any' ? `<span class="lang"></span>` : '');
    const avEl = label.querySelector('.av');
    avEl.style.cssText = 'width:20px;height:20px;display:inline-flex;border-radius:6px;overflow:hidden;vertical-align:middle;margin-right:6px;flex-shrink:0;';
    if (window.getStudyAvatarSvg) {
      avEl.innerHTML = window.getStudyAvatarSvg(avId);
    } else {
      avEl.textContent = '🧑‍🎓';
    }
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
      muteBtn.title = 'Mute this person for you only';
      muteBtn.addEventListener('click', () => toggleMuteForMe(id, muteBtn));
      actions.appendChild(muteBtn);
      tile.appendChild(actions);
    }

    $('video-grid').appendChild(tile);
    updateGridCount();
  }

  function removeTile(id) {
    const pc = pcs.get(id);
    if (pc) {
      pc.close();
      pcs.delete(id);
    }
    remoteStreams.delete(id);
    mutedByMe.delete(id);
    peerMeta.delete(id);
    const tile = document.getElementById('tile-' + id);
    if (tile) tile.remove();
    updateGridCount();
  }

  function updateGridCount() {
    const grid = $('video-grid');
    if (!grid) return;
    grid.setAttribute('data-count', String(grid.children.length));
    $('participant-count').textContent = `${grid.children.length}/${MAX_PARTICIPANTS} studying`;
  }

  function attachStream(id, stream) {
    const video = $('video-' + id);
    if (!video) return;
    video.srcObject = stream;

    // Strict echo prevention: local audio never outputs to speakers
    if (id === LOCAL_ID) {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
    } else {
      video.muted = false;
      video.volume = 1;
    }

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

  /* ================= Own mic/cam toggles ================= */
  $('mic-btn').addEventListener('click', () => {
    if (!localStream || !localStream.getAudioTracks().length) { toast('No microphone available.'); return; }
    micOn = !micOn;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    $('mic-btn').innerHTML = micOn ? '🎤 Mic on' : '🎤 Mic off';
    $('mic-btn').classList.toggle('on', micOn);
    setTileMic(LOCAL_ID, micOn);
    socket.emit('media-state', { micOn, camOn });
  });

  $('cam-btn').addEventListener('click', async () => {
    if (!localStream) { toast('Camera not initialized.'); return; }

    camOn = !camOn;
    if (camOn && !localStream.getVideoTracks().length) {
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        const vTrack = vStream.getVideoTracks()[0];
        localStream.addTrack(vTrack);
        pcs.forEach(pc => pc.addTrack(vTrack, localStream));
      } catch {
        camOn = false;
        toast('Could not access camera.');
      }
    } else {
      localStream.getVideoTracks().forEach((t) => { t.enabled = camOn; });
    }

    $('cam-btn').innerHTML = camOn ? '📷 Cam on' : '📷 Cam off';
    $('cam-btn').classList.toggle('on', camOn);
    setTileCam(LOCAL_ID, camOn);
    socket.emit('media-state', { micOn, camOn });
  });

  /* ================= WebRTC mesh ================= */
  function createPeer(peerId) {
    if (pcs.has(peerId)) return pcs.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcs.set(peerId, pc);

    if (localStream) {
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('relay', { to: peerId, type: 'ice', data: e.candidate });
    };
    pc.ontrack = (e) => {
      if (!document.getElementById('tile-' + peerId)) {
        const meta = peerMeta.get(peerId) || {};
        addTile(peerId, meta.name || 'Participant', meta.language, false, meta.avatar);
      }
      remoteStreams.set(peerId, e.streams[0]);
      attachStream(peerId, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // ICE will restart or peer-left will clean up
      }
    };
    return pc;
  }

  async function makeOffer(peerId) {
    try {
      const pc = createPeer(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('relay', { to: peerId, type: 'offer', data: pc.localDescription });
    } catch (_) {}
  }

  socket.on('relay', async ({ from, type, data }) => {
    try {
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
    } catch (_) {}
  });

  /* ================= Room lifecycle: Fast & Non-Blocking ================= */
  // Socket.IO reconnects (network blip, phone backgrounded, tab restored) give
  // us a brand-new socket id. Without this cleanup every reconnect would add
  // another copy of my own video tile and stale peer tiles.
  function resetPeerState() {
    const grid = $('video-grid');
    if (grid) {
      Array.from(grid.children).forEach((tile) => {
        if (tile.id !== 'tile-' + LOCAL_ID) tile.remove();
      });
    }
    pcs.forEach((pc) => { try { pc.close(); } catch (_) {} });
    pcs.clear();
    remoteStreams.clear();
    mutedByMe.clear();
    peerMeta.clear();
    updateGridCount();
  }

  let joinedOnce = false;
  let joinAttempt = 0;
  let joinTimer = null;
  let leaving = false;

  function onJoined(res) {
    $('room-code').textContent = roomId;
    $('room-title').textContent = res.room.name || 'Study room';
    document.title = `StudyHub — ${res.room.name || roomId}`;

    // Populate peers
    for (const p of res.peers) {
      peerMeta.set(p.id, p);
      addTile(p.id, p.name, p.language, false, p.avatar);
      setTileMic(p.id, p.micOn);
      setTileCam(p.id, p.camOn);
      makeOffer(p.id);
    }
    addMessage($('chat-messages'), { text: `You joined "${res.room.name}". Invite friends using ID: ${roomId}`, cls: 'system' });
  }

  // Leave without a blocking alert: stop hardware, then go home.
  function leaveGracefully(message) {
    if (leaving) return;
    leaving = true;
    clearTimeout(joinTimer);
    toast(message + ' Returning to home…', 3000);
    if (localStream) {
      localStream.getTracks().forEach((t) => { try { t.stop(); t.enabled = false; } catch (_) {} });
    }
    pcs.forEach((pc) => { try { pc.close(); } catch (_) {} });
    pcs.clear();
    try { socket.disconnect(); } catch (_) {}
    setTimeout(() => window.location.replace('/home.html'), 1400);
  }

  function joinRoom() {
    clearTimeout(joinTimer);
    if (leaving) return;
    socket.emit('join-room', { roomId, profile, clientId }, (res) => {
      if (res && res.ok) {
        joinedOnce = true;
        joinAttempt = 0;
        onJoined(res);
        return;
      }
      // On a reconnect the room may briefly be unavailable (or the host
      // restarted). Retry a few times before giving up, and never block the
      // page with a modal alert.
      if (joinedOnce && joinAttempt < 6) {
        joinAttempt++;
        toast('Connection dropped — rejoining the study room…', 3000);
        joinTimer = setTimeout(joinRoom, Math.min(1000 * joinAttempt, 5000));
        return;
      }
      leaveGracefully((res && res.error) || 'Could not join room.');
    });
  }

  socket.on('connect', () => {
    myId = socket.id;

    // Drop everything from the previous connection before rejoining
    resetPeerState();

    // Join room via socket immediately in parallel with camera warm-up
    joinRoom();

    // Start media acquisition in parallel
    initMedia();
  });

  socket.on('disconnect', (reason) => {
    if (leaving) return;
    // Socket.IO reconnects automatically; keep the local tile visible and tell
    // the user instead of dropping them out of the room.
    if (reason !== 'io client disconnect') toast('Connection lost — reconnecting…', 4000);
  });

  socket.io.on('reconnect_attempt', () => {
    if (!leaving) toast('Reconnecting to the study room…', 3000);
  });

  socket.on('peer-joined', (p) => {
    peerMeta.set(p.id, p);
    addTile(p.id, p.name, p.language, false, p.avatar);
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

  socket.on('room-deleted', () => {
    leaveGracefully('This study room was closed or deleted.');
  });

  /* Instant hardware release on leave */
  function fastLeave() {
    const btn = $('leave-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Leaving…';
    }
    leaving = true;
    clearTimeout(joinTimer);

    // 1. Instantly stop all hardware tracks to unblock page unload
    if (localStream) {
      localStream.getTracks().forEach((t) => {
        try { t.stop(); t.enabled = false; } catch (_) {}
      });
    }

    // 2. Tear down peer connections
    pcs.forEach((pc) => {
      try { pc.close(); } catch (_) {}
    });
    pcs.clear();

    // 3. Notify socket server
    try {
      socket.emit('leave-room');
      socket.disconnect();
    } catch (_) {}

    // 4. Instant navigation without browser hang
    window.location.replace('/home.html');
  }

  $('leave-btn').addEventListener('click', fastLeave);

  window.addEventListener('beforeunload', () => {
    if (localStream) {
      localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
    }
    pcs.forEach((pc) => pc.close());
    socket.emit('leave-room');
  });

  /* ================= Chat ================= */
  $('toggle-chat').addEventListener('click', () => {
    const isHidden = $('chat-panel').classList.contains('hidden');
    if (isHidden) {
      openChat();
    } else {
      $('chat-panel').classList.add('hidden');
    }
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

    if (!mine) {
      showChatNotification(msg);
    }
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

  addMessage($('ai-messages'), {
    who: 'AI Tutor',
    text: 'Hi! Ask me anything about what you are studying — math, science, languages, exam prep.',
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
})();
