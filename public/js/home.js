/* StudyHub — home page */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* ── Auth guard ── */
  let profile;
  try { profile = JSON.parse(localStorage.getItem('studyhub-profile') || 'null'); } catch (_) {}
  if (!profile || !profile.name) { window.location.replace('/'); return; }

  const AVATARS = window.STUDY_AVATARS || [];
  function getAvatar(id) {
    if (window.getStudyAvatar) return window.getStudyAvatar(id);
    return AVATARS.find(a => a.id === id) || { id: 'alex', label: 'Student', svg: '🧑‍🎓' };
  }

  /* ── Greeting ── */
  const hour = new Date().getHours();
  $('greeting').textContent =
    hour < 5  ? `Night owl mode, ${profile.name} 🦉` :
    hour < 12 ? `Good morning, ${profile.name} ☀️`  :
    hour < 18 ? `Good afternoon, ${profile.name} 👋` :
                `Good evening, ${profile.name} 🌙`;

  /* ── Profile chip ── */
  function updateChip() {
    const av = getAvatar(profile.avatar);
    const chipAv = $('chip-avatar');
    chipAv.style.cssText = 'width:28px;height:28px;border-radius:8px;overflow:hidden;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;';
    chipAv.innerHTML = av.svg;
    $('chip-name').textContent = profile.name;
    const meta = [profile.language];
    if (profile.country && profile.country !== 'Any') meta.push(profile.country);
    $('chip-meta').textContent = ' · ' + meta.join(' · ');
  }
  updateChip();

  /* ── Navigation ── */
  function go(roomId) {
    document.body.style.transition = 'opacity 0.2s ease';
    document.body.style.opacity = '0.6';
    document.body.style.pointerEvents = 'none';
    window.location.href = '/room.html?id=' + encodeURIComponent(roomId);
  }

  /* ── Toast ── */
  function toast(msg, ms = 2500) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  const socket = io();

  /* ── Join by ID ── */
  $('btn-join').addEventListener('click', () => {
    const id = $('join-id').value.trim().toUpperCase();
    if (!id || id.length < 4) { toast('Enter a valid room code first.'); $('join-id').focus(); return; }
    go(id);
  });
  $('join-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });

  /* ── Random join ── */
  $('btn-random').addEventListener('click', async () => {
    const statusEl = $('random-status');
    const btn      = $('btn-random');
    btn.disabled = true;
    btn.textContent = 'Searching…';
    statusEl.classList.remove('hidden');
    statusEl.textContent = 'Looking for an open seat…';

    try {
      const res  = await fetch('/api/random-room?language=' + encodeURIComponent(profile.language) +
                               '&country=' + encodeURIComponent(profile.country));
      const data = await res.json();
      if (data.roomId) {
        statusEl.textContent = `Found "${data.roomName}" — joining…`;
        go(data.roomId);
        return;
      }
    } catch { /* fall through */ }

    statusEl.textContent = 'No open seats — waiting to match you with the next person…';
    socket.emit('quick-match', {
      profile,
      language: profile.language,
      country:  profile.country
    }, r => { if (r && r.ok && !r.queued) go(r.roomId); });
  });

  socket.on('matched', data => go(data.roomId));
  window.addEventListener('beforeunload', () => socket.emit('cancel-match'));

  /* ── Create room ── */
  let createdRoomId = null;

  $('btn-create').addEventListener('click', () => {
    $('btn-create').disabled = true;
    $('btn-create').textContent = 'Creating room…';

    socket.emit('create-room', {
      profile,
      name:     $('create-name').value.trim() || `${profile.name}'s room`,
      isPublic: $('create-public').checked
    }, res => {
      $('btn-create').disabled = false;
      $('btn-create').textContent = 'Create room & get ID';

      if (!res || !res.ok) {
        toast('Could not create room.');
        return;
      }
      createdRoomId = res.roomId;

      const idEl      = $('created-id');
      const actionsEl = $('created-actions');

      idEl.textContent = res.roomId;
      idEl.title = 'Click to copy room ID';
      idEl.classList.remove('hidden');
      idEl.onclick = () => {
        navigator.clipboard.writeText(res.roomId).catch(() => {});
        toast('Room ID copied to clipboard!');
      };

      // Show action buttons
      actionsEl.classList.remove('hidden');

      // Hide old create button
      $('btn-create').classList.add('hidden');
      toast('Room created! ID: ' + res.roomId);
    });
  });

  $('btn-enter-room') && $('btn-enter-room').addEventListener('click', () => {
    if (createdRoomId) {
      $('btn-enter-room').disabled = true;
      $('btn-enter-room').textContent = 'Entering…';
      go(createdRoomId);
    }
  });

  $('btn-delete-room') && $('btn-delete-room').addEventListener('click', async () => {
    if (!createdRoomId) return;
    const btn = $('btn-delete-room');
    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .7s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Deleting…`;

    try {
      const res = await fetch('/api/rooms/' + encodeURIComponent(createdRoomId), { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        resetCreateCard();
        toast('Room deleted ✓');
      } else {
        socket.emit('delete-room', { roomId: createdRoomId }, (resp) => {
          resetCreateCard();
          toast('Room deleted ✓');
        });
      }
    } catch {
      socket.emit('delete-room', { roomId: createdRoomId });
      resetCreateCard();
      toast('Room deleted.');
    }
  });

  function resetCreateCard() {
    $('created-id').classList.add('hidden');
    $('created-actions').classList.add('hidden');
    $('btn-create').classList.remove('hidden');
    $('btn-create').textContent = 'Create room & get ID';
    $('create-name').value = '';
    const btn = $('btn-delete-room');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Delete room`;
    }
    createdRoomId = null;
    loadRooms();
  }

  /* ── Browse rooms ── */
  async function loadRooms() {
    const params = new URLSearchParams();
    if ($('search-q').value.trim())    params.set('q',        $('search-q').value.trim());
    if ($('search-language').value)    params.set('language', $('search-language').value);
    if ($('search-country').value)     params.set('country',  $('search-country').value);

    const list  = $('room-list');
    const badge = $('room-count');

    try {
      const res  = await fetch('/api/rooms?' + params.toString());
      const data = await res.json();

      if (!data.rooms.length) {
        list.innerHTML = '<p class="muted" style="font-size:.875rem;padding:12px 0">No public rooms match — create one or use random join!</p>';
        badge.style.display = 'none';
        return;
      }

      badge.textContent   = data.rooms.length + ' room' + (data.rooms.length !== 1 ? 's' : '');
      badge.style.display = 'inline-flex';
      list.innerHTML = '';

      for (const room of data.rooms) {
        const full = room.participantCount >= room.maxParticipants;
        const row  = document.createElement('div');
        row.className = 'room-row';

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML =
          `<span class="name">${esc(room.name)}</span>` +
          `<span class="tags">` +
          `<span class="badge">🆔 ${room.id}</span>` +
          `<span class="badge">🌐 ${esc(room.language)}</span>` +
          `<span class="badge">📍 ${esc(room.country)}</span>` +
          `<span class="badge" style="${full ? 'color:var(--danger)' : 'color:var(--ok)'}">👥 ${room.participantCount}/${room.maxParticipants}</span>` +
          `</span>`;

        const btn = document.createElement('button');
        btn.className = 'btn' + (full ? '' : ' primary');
        btn.textContent = full ? 'Full' : 'Join';
        btn.disabled = full;
        if (!full) btn.addEventListener('click', () => go(room.id));

        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '<p class="muted" style="font-size:.875rem;padding:12px 0">Could not load rooms. Is the server running?</p>';
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  $('btn-search').addEventListener('click', loadRooms);
  ['search-q','search-language','search-country'].forEach(id =>
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') loadRooms(); })
  );
  $('search-language').addEventListener('change', loadRooms);
  $('search-country').addEventListener('change', loadRooms);
  loadRooms();
  setInterval(loadRooms, 5000);

  /* ── Settings drawer ── */
  const panel = $('settings-panel');

  $('open-settings').addEventListener('click', () => {
    $('set-name').value          = profile.name;
    $('set-language').value      = profile.language;
    $('set-country').value       = profile.country || 'Any';
    $('set-default-mic').value   = profile.defaultMic === 'off' ? 'off' : 'on';
    $('set-default-cam').checked = profile.defaultCam !== false;
    panel.classList.remove('hidden');
    $('set-name').focus();
  });

  $('close-settings').addEventListener('click', () => panel.classList.add('hidden'));

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') &&
        !panel.contains(e.target) &&
        e.target !== $('open-settings') &&
        !$('open-settings').contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  /* Settings avatar picker */
  let settingsAvatarId = profile.avatar || (AVATARS[0] && AVATARS[0].id) || 'alex';
  const avWrap = $('set-avatars');
  avWrap.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
  avWrap.innerHTML = '';

  AVATARS.forEach(av => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.setAttribute('aria-label', av.label);
    btn.style.cssText = `
      aspect-ratio:1; border-radius:12px; border:2px solid ${av.id === settingsAvatarId ? 'var(--accent)' : 'var(--border)'};
      cursor:pointer; overflow:hidden; padding:0; background:none;
      box-shadow:${av.id === settingsAvatarId ? '0 0 0 3px var(--accent-glow)' : 'none'};
      transition:transform .15s,border-color .15s;
    `;
    btn.innerHTML = av.svg;
    btn.addEventListener('click', () => {
      settingsAvatarId = av.id;
      avWrap.querySelectorAll('button').forEach(b => {
        b.style.borderColor = 'var(--border)';
        b.style.boxShadow   = 'none';
      });
      btn.style.borderColor = 'var(--accent)';
      btn.style.boxShadow   = '0 0 0 3px var(--accent-glow)';
    });
    avWrap.appendChild(btn);
  });

  $('btn-save-settings').addEventListener('click', () => {
    const name = $('set-name').value.trim();
    if (!name) { toast('Name cannot be empty.'); return; }

    profile.name       = name;
    profile.avatar     = settingsAvatarId;
    profile.language   = $('set-language').value;
    profile.country    = $('set-country').value;
    profile.defaultMic = $('set-default-mic').value;
    profile.defaultCam = $('set-default-cam').checked;

    localStorage.setItem('studyhub-profile', JSON.stringify(profile));
    updateChip();
    panel.classList.add('hidden');
    toast('Settings saved ✓');
  });

  $('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('studyhub-profile');
    window.location.href = '/';
  });
})();
