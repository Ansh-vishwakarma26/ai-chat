/* StudyHub — Login & Profile Setup */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const AVATARS = window.STUDY_AVATARS || [];

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('studyhub-profile') || '{}'); } catch (_) {}

  let chosenAvatarId = saved.avatar || (AVATARS[0] && AVATARS[0].id) || 'alex';
  let currentStep = 1;

  // Check if user is already registered and not forcing an edit
  const isReturningUser = Boolean(saved.name && saved.language);
  const isEditing = new URLSearchParams(window.location.search).get('edit') === '1';

  if (isReturningUser && !isEditing) {
    const returningPanel = $('panel-returning');
    const wizardPanel = $('panel-wizard');

    if (returningPanel && wizardPanel) {
      wizardPanel.style.display = 'none';
      returningPanel.style.display = 'flex';

      const av = (window.getStudyAvatar && window.getStudyAvatar(saved.avatar)) || AVATARS[0];
      $('welcome-av').innerHTML = av.svg;
      $('welcome-name').textContent = saved.name;
      $('welcome-meta').textContent = `${saved.language}${saved.country && saved.country !== 'Any' ? ' • ' + saved.country : ''}`;

      $('btn-continue-home').addEventListener('click', () => {
        window.location.href = '/home.html';
      });

      $('btn-edit-profile').addEventListener('click', () => {
        returningPanel.style.display = 'none';
        wizardPanel.style.display = 'block';
        $('wizard-title').textContent = 'Edit your profile';
        $('wizard-sub').textContent = 'Update your name, avatar, or study language.';
        goToStep(1);
      });
    }
  }

  // Pre-fill inputs
  if (saved.name) $('login-name').value = saved.name;
  if (saved.language) $('login-language').value = saved.language;
  if (saved.country) $('login-country').value = saved.country;

  /* ── Build Avatar Grid ── */
  const grid = $('avatar-grid');
  grid.innerHTML = '';

  function updatePreview(id) {
    const av = (window.getStudyAvatar && window.getStudyAvatar(id)) || AVATARS[0];
    $('av-preview-icon').innerHTML = av.svg;
    const name = $('login-name').value.trim() || 'Student';
    $('av-preview-name').textContent = `${name} (${av.label})`;
    $('av-preview-tag').textContent = av.tag || 'Study Persona';
  }

  AVATARS.forEach((av) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-btn' + (av.id === chosenAvatarId ? ' selected' : '');
    btn.setAttribute('aria-label', av.label);
    btn.innerHTML = av.svg;

    btn.addEventListener('click', () => {
      chosenAvatarId = av.id;
      grid.querySelectorAll('.avatar-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      updatePreview(av.id);
    });

    grid.appendChild(btn);
  });

  updatePreview(chosenAvatarId);

  /* ── Step Navigation ── */
  function goToStep(step) {
    currentStep = step;
    [1, 2, 3].forEach((s) => {
      const panel = $(`step-${s}`);
      const tab = $(`tab-${s}`);
      if (panel) panel.classList.toggle('active', s === step);
      if (tab) {
        tab.classList.toggle('active', s === step);
        tab.classList.toggle('done', s < step);
      }
    });
  }

  function showError(stepNum, msg) {
    const err = $(`login-error-${stepNum}`);
    if (err) {
      err.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg}`;
      err.classList.remove('hidden');
    }
  }

  function clearError(stepNum) {
    const err = $(`login-error-${stepNum}`);
    if (err) err.classList.add('hidden');
  }

  $('login-name').addEventListener('input', () => {
    clearError(1);
    updatePreview(chosenAvatarId);
  });

  // Step 1 -> 2
  $('btn-step1-next').addEventListener('click', () => {
    const name = $('login-name').value.trim();
    if (!name) {
      showError(1, 'Please enter a display name to continue.');
      $('login-name').focus();
      return;
    }
    clearError(1);
    updatePreview(chosenAvatarId);
    goToStep(2);
  });
  $('login-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-step1-next').click();
  });

  // Step 2 navigation
  $('btn-step2-back').addEventListener('click', () => goToStep(1));
  $('btn-step2-next').addEventListener('click', () => goToStep(3));

  // Step 3 navigation
  $('btn-step3-back').addEventListener('click', () => goToStep(2));

  // Submit
  $('btn-submit').addEventListener('click', () => {
    const name = $('login-name').value.trim();
    const language = $('login-language').value;
    const country = $('login-country').value || 'Any';

    if (!language) {
      showError(3, 'Please select the language you study in.');
      $('login-language').focus();
      return;
    }
    clearError(3);

    const btn = $('btn-submit');
    btn.disabled = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .7s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving profile…`;

    const profileData = {
      name,
      avatar: chosenAvatarId,
      language,
      country,
      defaultMic: saved.defaultMic || 'on',
      defaultCam: saved.defaultCam !== false
    };

    localStorage.setItem('studyhub-profile', JSON.stringify(profileData));

    setTimeout(() => {
      window.location.href = '/home.html';
    }, 300);
  });

  $('login-language').addEventListener('change', () => clearError(3));
  $('login-language').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-submit').click();
  });
})();
