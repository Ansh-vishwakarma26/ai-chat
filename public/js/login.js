/* StudyHub login page */
(function () {
  const $ = (id) => document.getElementById(id);
  const AVATARS = ['🧑‍🎓', '👩‍🎓', '👨‍🎓', '🦉', '🐼', '🚀', '🌟', '☕', '🧠', '📗'];

  const saved = JSON.parse(localStorage.getItem('studyhub-profile') || '{}');

  const picker = $('avatar-picker');
  let chosenAvatar = saved.avatar || AVATARS[0];
  AVATARS.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-option' + (a === chosenAvatar ? ' selected' : '');
    btn.textContent = a;
    btn.addEventListener('click', () => {
      chosenAvatar = a;
      picker.querySelectorAll('.avatar-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    picker.appendChild(btn);
  });

  if (saved.name) $('login-name').value = saved.name;
  if (saved.language) $('login-language').value = saved.language;
  if (saved.country) $('login-country').value = saved.country;

  function showError(msg) {
    const el = $('login-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function login() {
    const name = $('login-name').value.trim();
    if (!name) { showError('Please enter your name.'); return; }
    if (!$('login-language').value) { showError('Please choose the language you study in.'); return; }

    localStorage.setItem('studyhub-profile', JSON.stringify({
      name,
      avatar: chosenAvatar,
      language: $('login-language').value,
      country: $('login-country').value || 'Any'
    }));
    window.location.href = '/home.html';
  }

  $('btn-login').addEventListener('click', login);
  $('login-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
})();
