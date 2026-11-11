/* StudyHub landing page logic */
(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- Profile (persisted locally) ---------- */
  const profile = JSON.parse(localStorage.getItem('studyhub-profile') || '{}');
  if (profile.name) $('profile-name').value = profile.name;
  if (profile.language) $('profile-language').value = profile.language;
  if (profile.country) $('profile-country').value = profile.country;

  function saveProfile() {
    const p = {
      name: $('profile-name').value.trim() || 'Guest',
      language: $('profile-language').value || 'Any',
      country: $('profile-country').value || 'Any'
    };
    localStorage.setItem('studyhub-profile', JSON.stringify(p));
    return p;
  }

  function requireProfile() {
    const p = saveProfile();
    if (p.name === 'Guest' && !confirm('Continue as "Guest"? Set your name/language/country in the top bar for better matching.')) {
      return null;
    }
    return p;
  }

  function go(roomId) {
    window.location.href = '/room.html?id=' + encodeURIComponent(roomId);
  }

  /* ---------- Create room ---------- */
  const socket = io();

  $('btn-create').addEventListener('click', () => {
    const p = requireProfile();
    if (!p) return;
    socket.emit('create-room', {
      profile: p,
      name: $('create-name').value.trim() || `${p.name}'s room`,
      isPublic: $('create-public').checked
    }, (res) => {
      if (!res || !res.ok) return;
      const el = $('created-id');
      el.textContent = res.roomId;
      el.classList.remove('hidden');
      el.title = 'Click to copy, then click again to enter';
      el.onclick = () => {
        navigator.clipboard.writeText(res.roomId).catch(() => {});
        go(res.roomId);
      };
      $('btn-create').textContent = 'Enter room →';
      $('btn-create').onclick = () => go(res.roomId);
    });
  });

  /* ---------- Join by ID ---------- */
  $('btn-join').addEventListener('click', () => {
    const p = requireProfile();
    if (!p) return;
    const id = $('join-id').value.trim().toUpperCase();
    if (!id) { alert('Enter a room ID first.'); return; }
    go(id);
  });
  $('join-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

  /* ---------- Quick match ---------- */
  $('btn-match').addEventListener('click', () => {
    const p = requireProfile();
    if (!p) return;
    const status = $('match-status');
    status.classList.remove('hidden');
    status.textContent = 'Looking for a study buddy…';
    $('btn-match').disabled = true;

    socket.emit('quick-match', {
      profile: p,
      language: $('match-pref-language').checked ? p.language : '',
      country: $('match-pref-country').checked ? p.country : ''
    }, (res) => {
      if (res && res.ok && !res.queued) { go(res.roomId); return; }
      status.textContent = 'Waiting for a partner… leave this page open. We will match you by language/country when possible.';
    });
  });

  socket.on('matched', (data) => go(data.roomId));
  window.addEventListener('beforeunload', () => socket.emit('cancel-match'));

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
        list.innerHTML = '<p class="muted">No public rooms match. Create one or use quick match!</p>';
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
        btn.addEventListener('click', () => {
          const p = requireProfile();
          if (p) go(room.id);
        });
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
})();
