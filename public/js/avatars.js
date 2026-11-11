/* StudyHub - Centralized Premium Vector Avatars */
(function (global) {
  'use strict';

  const AVATARS = [
    {
      id: 'alex',
      label: 'Alex (Tech)',
      tag: 'Developer',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-alex)"/>
        <defs>
          <linearGradient id="grad-alex" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#4F46E5"/><stop offset="1" stop-color="#7C3AED"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="35" r="16" fill="#FDE047"/>
        <path d="M26 31C26 23.268 32.268 17 40 17C47.732 17 54 23.268 54 31V33H26V31Z" fill="#1E1B4B"/>
        <rect x="23" y="32" width="6" height="12" rx="3" fill="#312E81"/>
        <rect x="51" y="32" width="6" height="12" rx="3" fill="#312E81"/>
        <path d="M25 32C25 24 31.7 18 40 18C48.3 18 55 24 55 32" stroke="#6366F1" stroke-width="3" stroke-linecap="round"/>
        <circle cx="34" cy="36" r="2.5" fill="#1E1B4B"/>
        <circle cx="46" cy="36" r="2.5" fill="#1E1B4B"/>
        <path d="M37 42C38.5 43.5 41.5 43.5 43 42" stroke="#1E1B4B" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 72C18 58.745 28.745 52 40 52C51.255 52 62 58.745 62 72" fill="#312E81"/>
        <path d="M32 52L40 60L48 52" stroke="#818CF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    },
    {
      id: 'maya',
      label: 'Maya (Focus)',
      tag: 'Med Student',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-maya)"/>
        <defs>
          <linearGradient id="grad-maya" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#EA580C"/><stop offset="1" stop-color="#F43F5E"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="36" r="15" fill="#FED7AA"/>
        <path d="M25 35C25 24 31 16 40 16C49 16 55 24 55 35C55 38 52 38 51 34C48 24 43 23 40 23C37 23 32 24 29 34C28 38 25 38 25 35Z" fill="#431407"/>
        <circle cx="35" cy="36" r="2.2" fill="#431407"/>
        <circle cx="45" cy="36" r="2.2" fill="#431407"/>
        <path d="M38 42C39.3 43.2 40.7 43.2 42 42" stroke="#431407" stroke-width="2" stroke-linecap="round"/>
        <circle cx="30" cy="40" r="3" fill="#FDA4AF" opacity="0.6"/>
        <circle cx="50" cy="40" r="3" fill="#FDA4AF" opacity="0.6"/>
        <path d="M19 72C19 59 28.5 53 40 53C51.5 53 61 59 61 72" fill="#9F1239"/>
      </svg>`
    },
    {
      id: 'kai',
      label: 'Kai (Cyber)',
      tag: 'Engineer',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-kai)"/>
        <defs>
          <linearGradient id="grad-kai" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#0284C7"/><stop offset="1" stop-color="#0D9488"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="36" r="16" fill="#FCE7F3"/>
        <path d="M24 33C24 22 31 15 40 15C49 15 56 22 56 33C56 35 52 33 50 28C46 20 42 21 40 21C38 21 34 20 30 28C28 33 24 35 24 33Z" fill="#0F172A"/>
        <rect x="29" y="32" width="22" height="7" rx="3.5" fill="#38BDF8"/>
        <rect x="31" y="34" width="7" height="3" rx="1.5" fill="#FFFFFF"/>
        <rect x="42" y="34" width="7" height="3" rx="1.5" fill="#FFFFFF"/>
        <path d="M38 44C39.3 45 40.7 45 42 44" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 72C18 59 28 53 40 53C52 53 62 59 62 72" fill="#0F766E"/>
        <path d="M40 53V65" stroke="#2DD4BF" stroke-width="2" stroke-linecap="round"/>
      </svg>`
    },
    {
      id: 'sophia',
      label: 'Sophia (Design)',
      tag: 'Architect',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-sophia)"/>
        <defs>
          <linearGradient id="grad-sophia" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#9333EA"/><stop offset="1" stop-color="#EC4899"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="36" r="15" fill="#FFEDD5"/>
        <path d="M23 45C23 25 30 15 40 15C50 15 57 25 57 45C54 48 50 35 48 29C45 22 42 22 40 22C38 22 35 22 32 29C30 35 26 48 23 45Z" fill="#581C87"/>
        <circle cx="34" cy="36" r="2.2" fill="#581C87"/>
        <circle cx="46" cy="36" r="2.2" fill="#581C87"/>
        <path d="M38 42C39.3 43.2 40.7 43.2 42 42" stroke="#581C87" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 72C18 59 28 54 40 54C52 54 62 59 62 72" fill="#701A75"/>
      </svg>`
    },
    {
      id: 'foxy',
      label: 'Foxy (Smart)',
      tag: 'Strategist',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-foxy)"/>
        <defs>
          <linearGradient id="grad-foxy" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#F97316"/><stop offset="1" stop-color="#FB923C"/>
          </linearGradient>
        </defs>
        <polygon points="18,34 26,12 36,34" fill="#C2410C"/>
        <polygon points="44,34 54,12 62,34" fill="#C2410C"/>
        <polygon points="21,34 27,17 33,34" fill="#FFEDD5"/>
        <polygon points="47,34 53,17 59,34" fill="#FFEDD5"/>
        <path d="M18 36C18 28 28 24 40 24C52 24 62 28 62 36C62 50 40 64 40 64C40 64 18 50 18 36Z" fill="#EA580C"/>
        <path d="M22 36C22 48 34 58 40 62C46 58 58 48 58 36C52 38 46 36 40 44C34 36 28 38 22 36Z" fill="#FFF7ED"/>
        <circle cx="32" cy="40" r="3.2" fill="#1C1917"/>
        <circle cx="48" cy="40" r="3.2" fill="#1C1917"/>
        <circle cx="33" cy="39" r="1" fill="#FFFFFF"/>
        <circle cx="49" cy="39" r="1" fill="#FFFFFF"/>
        <ellipse cx="40" cy="51" rx="4" ry="2.8" fill="#431407"/>
      </svg>`
    },
    {
      id: 'owl',
      label: 'Scholar Owl',
      tag: 'Night Study',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-owl)"/>
        <defs>
          <linearGradient id="grad-owl" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#312E81"/><stop offset="1" stop-color="#4338CA"/>
          </linearGradient>
        </defs>
        <polygon points="20,28 26,10 34,26" fill="#3730A3"/>
        <polygon points="46,26 54,10 60,28" fill="#3730A3"/>
        <ellipse cx="40" cy="44" rx="25" ry="24" fill="#4F46E5"/>
        <circle cx="31" cy="40" r="11" fill="#EEF2FF"/>
        <circle cx="49" cy="40" r="11" fill="#EEF2FF"/>
        <circle cx="31" cy="40" r="7.5" fill="#F59E0B"/>
        <circle cx="49" cy="40" r="7.5" fill="#F59E0B"/>
        <circle cx="31" cy="40" r="4.5" fill="#0F172A"/>
        <circle cx="49" cy="40" r="4.5" fill="#0F172A"/>
        <circle cx="33" cy="38" r="1.5" fill="#FFFFFF"/>
        <circle cx="51" cy="38" r="1.5" fill="#FFFFFF"/>
        <polygon points="40,46 36,54 44,54" fill="#F59E0B"/>
        <path d="M26 33C29 31 34 32 37 36" stroke="#C7D2FE" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M54 33C51 31 46 32 43 36" stroke="#C7D2FE" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`
    },
    {
      id: 'panda',
      label: 'Zen Panda',
      tag: 'Mindful',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-panda)"/>
        <defs>
          <linearGradient id="grad-panda" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#334155"/><stop offset="1" stop-color="#475569"/>
          </linearGradient>
        </defs>
        <circle cx="21" cy="24" r="11" fill="#0F172A"/>
        <circle cx="59" cy="24" r="11" fill="#0F172A"/>
        <ellipse cx="40" cy="46" rx="25" ry="23" fill="#F8FAFC"/>
        <ellipse cx="29" cy="40" rx="8" ry="7.5" fill="#0F172A" transform="rotate(-15 29 40)"/>
        <ellipse cx="51" cy="40" rx="8" ry="7.5" fill="#0F172A" transform="rotate(15 51 40)"/>
        <circle cx="29" cy="40" r="2.8" fill="#FFFFFF"/>
        <circle cx="51" cy="40" r="2.8" fill="#FFFFFF"/>
        <circle cx="29.5" cy="39.5" r="1.5" fill="#0F172A"/>
        <circle cx="51.5" cy="39.5" r="1.5" fill="#0F172A"/>
        <ellipse cx="40" cy="51" rx="4" ry="2.8" fill="#0F172A"/>
        <path d="M36 55C38 57 42 57 44 55" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
      </svg>`
    },
    {
      id: 'cosmo',
      label: 'Astro Cosmo',
      tag: 'Explorer',
      svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="20" fill="url(#grad-cosmo)"/>
        <defs>
          <linearGradient id="grad-cosmo" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#0F172A"/><stop offset="1" stop-color="#1E1B4B"/>
          </linearGradient>
        </defs>
        <rect x="20" y="18" width="40" height="38" rx="16" fill="#F8FAFC"/>
        <rect x="25" y="24" width="30" height="22" rx="9" fill="#0284C7"/>
        <path d="M28 27C32 25 44 25 50 30" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
        <rect x="16" y="28" width="5" height="12" rx="2.5" fill="#94A3B8"/>
        <rect x="59" y="28" width="5" height="12" rx="2.5" fill="#94A3B8"/>
        <path d="M19 72C19 60 28 55 40 55C52 55 61 60 61 72" fill="#E2E8F0"/>
        <circle cx="40" cy="64" r="3.5" fill="#6366F1"/>
      </svg>`
    }
  ];

  function getAvatar(id) {
    if (!id) return AVATARS[0];
    const match = AVATARS.find(a => a.id === id);
    if (match) return match;
    // Map legacy names
    if (id === 'fox') return AVATARS.find(a => a.id === 'foxy') || AVATARS[0];
    if (id === 'robot') return AVATARS.find(a => a.id === 'cosmo') || AVATARS[0];
    if (id === 'cat') return AVATARS.find(a => a.id === 'maya') || AVATARS[0];
    if (id === 'bear') return AVATARS.find(a => a.id === 'alex') || AVATARS[0];
    return AVATARS[0];
  }

  function getAvatarSvg(id) {
    return getAvatar(id).svg;
  }

  global.STUDY_AVATARS = AVATARS;
  global.getStudyAvatar = getAvatar;
  global.getStudyAvatarSvg = getAvatarSvg;

})(typeof window !== 'undefined' ? window : this);

