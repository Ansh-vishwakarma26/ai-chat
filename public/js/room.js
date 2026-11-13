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
  // ICE config comes from the server so optional TURN credentials (dead/unpaid
  // public relays stall ICE for ~15s) never have to be hard-coded here.
  let iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  const iceReady = Promise.race([
    fetch('/api/ice-servers')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.iceServers) && d.iceServers.length) iceServers = d.iceServers;
      })
      .catch(() => {}),
    // Never let a slow config request delay joining
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]);

  // Start with WebSocket (avoids the slow polling -> upgrade handshake behind
  // proxies) and fall back to polling only if WebSocket is unavailable.
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    randomizationFactor: 0.3,
    timeout: 10000
  });
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

    // Attach tracks to peer connections that were created before media was
    // ready, then renegotiate so the remote side actually receives them.
    pcs.forEach((pc, peerId) => {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      renegotiate(peerId);
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

    // Avatar shown in place of the video when the camera is off
    const camOffAvatar = document.createElement('div');
    camOffAvatar.className = 'cam-off-avatar';
    camOffAvatar.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:var(--bg-elevated);color:var(--text-tertiary);font-size:2rem;z-index:1;';
    if (window.getStudyAvatarSvg) {
      camOffAvatar.innerHTML = window.getStudyAvatarSvg(avId);
    } else {
      camOffAvatar.textContent = '🧑‍🎓';
    }
    tile.appendChild(camOffAvatar);

    if (!isMe) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const muteBtn = document.createElement('button');
      muteBtn.textContent = '🔇';
      muteBtn.title = 'Mute this person for you only';
      tile.dataset.peerId = id;
      muteBtn.addEventListener('click', () => toggleMuteForMe(tile.dataset.peerId, muteBtn));
      actions.appendChild(muteBtn);
      tile.appendChild(actions);
    }

    $('video-grid').appendChild(tile);
    updateGridCount();
  }

  function removeTile(id) {
    clearPendingRemoval(id);
    for (const [cid, pid] of clientIdToPeer) {
      if (pid === id) clientIdToPeer.delete(cid);
    }
    const pc = pcs.get(id);
    if (pc) {
      pc.close();
      pcs.delete(id);
    }
    remoteStreams.delete(id);
    mutedByMe.delete(id);
    peerMeta.delete(id);
    pendingIce.delete(id);
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
    if (tile) {
      tile.classList.toggle('cam-off', !on);
      const camAvatar = tile.querySelector('.cam-off-avatar');
      if (camAvatar) camAvatar.style.display = on ? 'none' : 'flex';
    }
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
        for (const [peerId, pc] of pcs) {
          pc.addTrack(vTrack, localStream);
          renegotiate(peerId);
        }
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
  // ICE candidates can arrive before the offer/answer is applied. Dropping them
  // (the old behaviour) left connections stuck for several seconds, so queue
  // them per peer and flush once the remote description exists.
  const pendingIce = new Map();

  function queueIce(peerId, candidate) {
    const pc = pcs.get(peerId);
    if (!pc) return;
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      if (!pendingIce.has(peerId)) pendingIce.set(peerId, []);
      pendingIce.get(peerId).push(candidate);
      return;
    }
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  }

  function flushIce(peerId) {
    const pc = pcs.get(peerId);
    const queued = pendingIce.get(peerId);
    if (!pc || !queued) return;
    pendingIce.delete(peerId);
    queued.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
  }

  function createPeer(peerId) {
    if (pcs.has(peerId)) return pcs.get(peerId);
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 0,
      bundlePolicy: 'max-bundle'
    });
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
      let stream = e.streams[0];
      if (!stream) {
        // Some browsers fire track events without a stream container
        stream = remoteStreams.get(peerId) || new MediaStream();
        stream.addTrack(e.track);
      }
      if (e.track.kind === 'video') setTileCam(peerId, true);
      remoteStreams.set(peerId, stream);
      attachStream(peerId, stream);
    };
    pc.onconnectionstatechange = () => {
      const tile = $('tile-' + peerId);
      const state = pc.connectionState;
      if (tile) tile.classList.toggle('peer-connecting', state === 'connecting' || state === 'new');
      if (state === 'failed' && pc.signalingState === 'stable') {
        try { pc.restartIce(); } catch (_) {}
        makeOffer(peerId);
      }
      if (state === 'connected' && tile) tile.classList.remove('peer-connecting');
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

  // Re-offer once the connection is idle again (used when tracks are added
  // after the first negotiation, e.g. turning the camera on mid-call).
  function renegotiate(peerId) {
    const pc = pcs.get(peerId);
    if (!pc) return;
    if (pc.signalingState === 'stable') { makeOffer(peerId); return; }
    const onStable = () => {
      if (pc.signalingState !== 'stable') return;
      pc.removeEventListener('signalingstatechange', onStable);
      makeOffer(peerId);
    };
    pc.addEventListener('signalingstatechange', onStable);
  }

  socket.on('relay', async ({ from, type, data }) => {
    try {
      if (type === 'offer') {
        const pc = createPeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        flushIce(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('relay', { to: from, type: 'answer', data: pc.localDescription });
      } else if (type === 'answer') {
        const pc = pcs.get(from);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          flushIce(from);
        }
      } else if (type === 'ice') {
        queueIce(from, data);
      }
    } catch (_) {}
  });

  /* ================= Room lifecycle: Fast & Non-Blocking ================= */
  // Socket.IO reconnects (network blip, phone backgrounded, tab restored) give
  // us a brand-new socket id. We close stale peer connections but KEEP the peer
  // tiles on screen so the member videos do not disappear and come back.
  const pendingRemoval = new Map(); // peerId -> timeout id
  const clientIdToPeer = new Map(); // clientId -> current peerId

  function clearPendingRemoval(peerId) {
    const t = pendingRemoval.get(peerId);
    if (t) { clearTimeout(t); pendingRemoval.delete(peerId); }
  }

  function resetPeerConnections() {
    pcs.forEach((pc) => { try { pc.close(); } catch (_) {} });
    pcs.clear();
    remoteStreams.clear();
    pendingIce.clear();
    peerMeta.clear();
  }

  function reconcilePeers(peers) {
    const keep = new Set(peers.map((p) => p.id));
    clientIdToPeer.clear();
    for (const p of peers) {
      clearPendingRemoval(p.id);
      if (p.clientId) clientIdToPeer.set(p.clientId, p.id);
    }
    // Drop tiles for people who really left while we were disconnected
    document.querySelectorAll('#video-grid .tile').forEach((tile) => {
      const id = tile.id.slice('tile-'.length);
      if (id !== LOCAL_ID && !keep.has(id)) removeTile(id);
    });
  }

  let joinedOnce = false;
  let joinAttempt = 0;
  let joinTimer = null;
  let leaving = false;

  async function onJoined(res) {
    $('room-code').textContent = roomId;
    $('room-title').textContent = res.room.name || 'Study room';
    document.title = `StudyHub — ${res.room.name || roomId}`;

    // Negotiate only once our camera/mic tracks exist. Offering before
    // getUserMedia resolves produced connections with no media (black remote
    // tiles in both directions).
    await initMedia();
    await iceReady;
    if (leaving) return;

    // Keep the tiles that are already on screen; only drop people who left
    reconcilePeers(res.peers);

    // Populate peers
    for (const p of res.peers) {
      peerMeta.set(p.id, p);
      addTile(p.id, p.name, p.language, false, p.avatar);
      setTileMic(p.id, p.micOn);
      setTileCam(p.id, p.camOn);
      makeOffer(p.id);
    }
    // Only announce once, not on every reconnect
    if (!onJoined._announced) {
      onJoined._announced = true;
      addMessage($('chat-messages'), { text: `You joined "${res.room.name}". Invite friends using ID: ${roomId}`, cls: 'system' });
    }
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
        showReconnectStatus();
        joinTimer = setTimeout(joinRoom, Math.min(1000 * joinAttempt, 5000));
        return;
      }
      leaveGracefully((res && res.error) || 'Could not join room.');
    });
  }

  let reconnecting = false;
  let reconnectStatusTimer = null;

  function showReconnectStatus() {
    if (reconnecting || leaving) return;
    reconnecting = true;
    toast('Connection lost — reconnecting…', 10 * 60 * 1000);
  }

  function clearReconnectStatus() {
    clearTimeout(reconnectStatusTimer);
    if (!reconnecting) return;
    reconnecting = false;
    const t = $('toast');
    if (t) t.classList.add('hidden');
  }

  socket.on('connect', () => {
    myId = socket.id;
    clearReconnectStatus();

    // Rebuild connections but keep the on-screen tiles (no flicker)
    resetPeerConnections();

    // Join room via socket immediately in parallel with camera warm-up
    joinRoom();

    // Start media acquisition in parallel
    initMedia();
  });

  socket.on('disconnect', (reason) => {
    if (leaving) return;
    // Socket.IO reconnects automatically; keep the local tile visible. Only
    // mention it if the drop lasts, so quick blips stay invisible.
    if (reason !== 'io client disconnect') {
      clearTimeout(reconnectStatusTimer);
      reconnectStatusTimer = setTimeout(showReconnectStatus, 1500);
    }
  });

  // Reuse an existing tile when the same browser tab rejoins with a new socket
  // id (reconnect), so the member's video does not vanish and reappear.
  function adoptTile(oldId, newId) {
    const tile = document.getElementById('tile-' + oldId);
    if (!tile || document.getElementById('tile-' + newId)) return;
    clearPendingRemoval(oldId);

    tile.id = 'tile-' + newId;
    tile.dataset.peerId = newId;
    const video = document.getElementById('video-' + oldId);
    if (video) video.id = 'video-' + newId;

    const stream = remoteStreams.get(oldId);
    if (stream) { remoteStreams.set(newId, stream); remoteStreams.delete(oldId); }
    const meta = peerMeta.get(oldId);
    if (meta) { peerMeta.delete(oldId); peerMeta.set(newId, meta); }
    if (mutedByMe.has(oldId)) { mutedByMe.delete(oldId); mutedByMe.add(newId); }
    const pc = pcs.get(oldId);
    if (pc) { try { pc.close(); } catch (_) {} pcs.delete(oldId); }
    pendingIce.delete(oldId);
  }

  socket.on('peer-joined', (p) => {
    const prevId = p.clientId ? clientIdToPeer.get(p.clientId) : null;
    const adopted = prevId && prevId !== p.id;
    if (adopted) adoptTile(prevId, p.id);
    if (p.clientId) clientIdToPeer.set(p.clientId, p.id);

    peerMeta.set(p.id, p);
    addTile(p.id, p.name, p.language, false, p.avatar);
    setTileCam(p.id, p.camOn !== false);
    if (adopted) makeOffer(p.id);
    addMessage($('chat-messages'), { text: `${p.name} joined the room.`, cls: 'system' });
  });

  socket.on('peer-left', ({ id }) => {
    const meta = peerMeta.get(id);
    addMessage($('chat-messages'), { text: `${meta ? meta.name : 'A participant'} left the room.`, cls: 'system' });
    // Hold the tile briefly: a reconnect replaces the socket id and the same
    // person immediately rejoins, which should not blink their video.
    clearPendingRemoval(id);
    pendingRemoval.set(id, setTimeout(() => removeTile(id), 2000));
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
