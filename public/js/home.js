/* StudyHub home page */
(function () {
  const $ = (id) => document.getElementById(id);
  const AVATARS = ['🧑‍🎓', '👩‍🎓', '👨‍🎓', '🦉', '🐼', '🚀', '🌟', '☕', '🧠', '📗'];

  const profile = JSON.parse(localStorage.getItem('studyhub-profile') || 'null');
  if (!profile || !profile.name) { window.location.href = '/'; return; }

  const hour = new Date().getHours();
  $('greeting').textContent =
    hour < 5 ? 'Late-night grind?' : hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!';
  $('chip-avatar').textContent = profile.avatar || '🧑‍🎓';
  $('chip-name').textContent = profile.name;
  $('chip-meta').textContent = ` · ${profile.language}${profile.country && profile.country !== 'Any' ? ' · ' + profile.country : ''}`;

  function go(roomId) {
    window.location.href = '/room.html?id=' + encodeURIComponent(roomId);
  }

  function toast(msg, ms = 2500) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  const socket = io();

  /* ---------- Join by ID ---------- */
  $('btn-join').addEventListener('click', () => {
    const id = $('join-id').value.trim().toUpperCase();
    if (!id) { toast('Enter a room ID first.'); return; }
    go(id);
  });
  $('join-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

  /* ---------- Random join: find an open seat, else wait for a partner ---------- */
  $('btn-random').addEventListener('click', async () => {
    const status = $('random-status');
    const btn = $('btn-random');
    btn.disabled = true;
    status.classList.remove('hidden');
    status.textContent = 'Searching for an open seat…';

    try {
      const res = await fetch('/api/random-room?language=' + encodeURIComponent(profile.language) +
                              '&country=' + encodeURIComponent(profile.country));
      const data = await res.json();
      if (data.roomId) {
        status.textContent = `Found a seat in "${data.roomName}" — joining…`;
        go(data.roomId);
        return;
      }
    } catch { /* fall through to matchmaking */ }

    status.textContent = 'No open seats right now — waiting to pair you with the next person who hits "Random join"…';
    socket.emit('quick-match', {
      profile,
      language: profile.language,
      country: profile.country
    }, (r) => {
      if (r && r.ok && !r.queued) go(r.roomId);
    });
  });

  socket.on('matched', (data) => go(data.roomId));
  window.addEventListener('beforeunload', () => socket.emit('cancel-match'));

  /* ---------- Create room ---------- */
  $('btn-create').addEventListener('click', () => {
    socket.emit('create-room', {
      profile,
      name: $('create-name').value.trim() || `${profile.name}'s room`,
      isPublic: $('create-public').checked
    }, (res) => {
      if (!res || !res.ok) return;
      const el = $('created-id');
      el.textContent = res.roomId;
      el.classList.remove('hidden');
      el.title = 'Click to copy and enter';
      el.onclick = () => {
        navigator.clipboard.writeText(res.roomId).catch(() => {});
        go(res.roomId);
      };
      $('btn-create').textContent = 'Enter room →';
      $('btn-create').onclick = () => go(res.roomId);
    });
  });

  /* ---------- Browse / search public rooms ---------- */
  async function loadRooms() {
    const params = new URLSearchParams();
    if ($('search-q').value.trim()) params.set('q', $('search-q').value.trim());
    if ($('search-language').value) params.set('language', $('search-language').value);
    if ($('search-country').value) params.set('country', $('search-country').value);

    const list = $('room-list');
    try {
      const res = await fetch('/api/rooms?' + params.toString());
      const data = await res.json();
      if (!data.rooms.length) {
        list.innerHTML = '<p class="muted">No public rooms match. Create one or use random join!</p>';
        return;
      }
      list.innerHTML = '';
      for (const room of data.rooms) {
        const row = document.createElement('div');
        row.className = 'room-row';
        const full = room.participantCount >= room.maxParticipants;
        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML =
          `<span class="name">${escapeHtml(room.name)}</span>` +
          `<span class="tags">` +
          `<span class="badge">🆔 ${room.id}</span>` +
          `<span class="badge">🌐 ${escapeHtml(room.language)}</span>` +
          `<span class="badge">📍 ${escapeHtml(room.country)}</span>` +
          `<span class="badge">👥 ${room.participantCount}/${room.maxParticipants}</span>` +
          `</span>`;
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = full ? 'Full' : 'Join';
        btn.disabled = full;
        btn.addEventListener('click', () => go(room.id));
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '<p class="muted">Could not load rooms. Is the server running?</p>';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  $('btn-search').addEventListener('click', loadRooms);
  ['search-q', 'search-language', 'search-country'].forEach((id) =>
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRooms(); })
  );
  $('search-language').addEventListener('change', loadRooms);
  $('search-country').addEventListener('change', loadRooms);
  loadRooms();
  setInterval(loadRooms, 5000);

  /* ---------- Settings drawer ---------- */
  const panel = $('settings-panel');
  $('open-settings').addEventListener('click', () => {
    $('set-name').value = profile.name;
    $('set-language').value = profile.language;
    $('set-country').value = profile.country || 'Any';
    $('set-default-mic').value = profile.defaultMic === 'off' ? 'off' : 'on';
    $('set-default-cam').checked = profile.defaultCam !== false;
    panel.classList.remove('hidden');
  });
  $('close-settings').addEventListener('click', () => panel.classList.add('hidden'));

  let settingsAvatar = profile.avatar || AVATARS[0];
  const avWrap = $('set-avatars');
  AVATARS.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-option' + (a === settingsAvatar ? ' selected' : '');
    btn.textContent = a;
    btn.addEventListener('click', () => {
      settingsAvatar = a;
      avWrap.querySelectorAll('.avatar-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    avWrap.appendChild(btn);
  });

  $('btn-save-settings').addEventListener('click', () => {
    const name = $('set-name').value.trim();
    if (!name) { toast('Name cannot be empty.'); return; }
    profile.name = name;
    profile.avatar = settingsAvatar;
    profile.language = $('set-language').value;
    profile.country = $('set-country').value;
    profile.defaultMic = $('set-default-mic').value;
    profile.defaultCam = $('set-default-cam').checked;
    localStorage.setItem('studyhub-profile', JSON.stringify(profile));
    $('chip-avatar').textContent = profile.avatar;
    $('chip-name').textContent = profile.name;
    $('chip-meta').textContent = ` · ${profile.language}${profile.country && profile.country !== 'Any' ? ' · ' + profile.country : ''}`;
    panel.classList.add('hidden');
    toast('Settings saved ✓');
  });

  $('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('studyhub-profile');
    window.location.href = '/';
  });
})();
