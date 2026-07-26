const MODE_LABELS = Object.freeze({
    'speed-run': 'Speed Run',
    era: 'Era Challenge',
    streak: 'Streak',
    weekly: 'Weekly Challenge',
    constructor: 'Constructor Guesser',
    'pilot-sudoku': 'Pilot Sudoku',
    track: 'Track Guesser'
});

const CLASSIC_HEADER_MARKUP = String.raw`<header class="site-header mode-page-site-header">
        <button type="button" id="menu-hamburger" class="hamburger" aria-label="Deschide meniul" aria-controls="dropdown-menu" aria-expanded="false" aria-haspopup="true">☰</button>
        <nav id="dropdown-menu" class="dropdown hidden" aria-label="Meniu principal" aria-hidden="true" inert>
            <details class="menu-section" open>
                <summary class="menu-section-title">🏁 Navigare</summary>
                <div class="menu-section-content">
                    <button type="button" class="menu-item" data-mode-path="/">🏠 Game Hub</button>
                    <button type="button" class="menu-item is-current-mode" data-mode-path="/modes/speed-run/" aria-current="page">⏱️ Speed Run</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/era/">🕰️ Era Challenge</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/streak/">🔥 Streak</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/weekly/">📅 Weekly Challenge</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/constructor/">🏭 Constructor Guesser</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/pilot-sudoku/">🧩 Pilot Sudoku</button>
                    <button type="button" class="menu-item" data-mode-path="/modes/track/">🗺️ Track Guesser</button>
                </div>
            </details>

            <details class="menu-section">
                <summary class="menu-section-title">🎨 Temă vizuală</summary>
                <div class="menu-section-content">
                    <button type="button" data-theme="default" class="menu-item theme-item">🌌 F1 Classic (Dark)</button>
                    <button type="button" data-theme="neon" class="menu-item theme-item">✨ Night Race (Neon)</button>
                    <button type="button" data-theme="carbon" class="menu-item theme-item">🏁 Carbon &amp; Checkers</button>
                </div>
            </details>
        </nav>

        <h1>
            <button type="button" id="siteHomeControl" class="site-home-control" aria-label="F1 Guesser – revino la pagina principală">🏎️ F1 GUESSER</button>
        </h1>

        <div class="header-actions">
            <button type="button" id="authOpenBtn" class="auth-open-btn" title="Deschide profilul">👤 Se verifică...</button>
            <button type="button" id="feedbackSettingsBtn" class="feedback-settings-btn" title="Setări sunet și vibrații" aria-label="Deschide setările pentru sunet și vibrații">
                <span aria-hidden="true">⚙️</span><span class="feedback-settings-label">Setări</span>
            </button>
        </div>
    </header>`;

const AUTH_PANEL_MARKUP = String.raw`<!-- Auth modal: login/register pentru pregătirea profilului și a duelurilor cu prieteni. -->
<div class="auth-backdrop" id="authBackdrop" aria-hidden="true"></div>
<div class="auth-panel" id="authPanel" role="dialog" aria-modal="true" aria-labelledby="authTitle" aria-describedby="authSubtitle" aria-hidden="true" tabindex="-1" inert>
    <button type="button" class="auth-close" id="authCloseBtn" aria-label="Închide autentificarea">×</button>
    <h2 id="authTitle">Autentificare</h2>
    <p id="authSubtitle" class="auth-subtitle">Intră în cont ca să pregătim profilul și jocurile cu prieteni.</p>
    <p id="authUserBadge" class="auth-user-badge">Joci momentan ca Guest.</p>

    <section id="authAccountView" class="auth-account-view is-hidden" aria-label="Sumar cont">
        <div class="auth-profile-card">
            <div id="authAccountAvatar" class="auth-account-avatar auth-avatar-visual" data-avatar-key="helmet-red" aria-hidden="true">
                <span class="auth-helmet-icon"></span>
            </div>
            <div class="auth-profile-copy">
                <strong id="authAccountUsername">Utilizator</strong>
                <span id="authAccountEmail">email@example.com</span>
                <small id="authAccountMemberSince">Membru F1 Guesser</small>
            </div>
            <span id="authAccountLevel" class="auth-level-badge">Nivel 1</span>
        </div>

        <div class="auth-profile-tabs" role="tablist" aria-label="Secțiunile profilului">
            <button type="button" id="authTabOverview" role="tab" aria-selected="true" aria-controls="authPanelOverview" tabindex="0">Prezentare</button>
            <button type="button" id="authTabAchievements" role="tab" aria-selected="false" aria-controls="authPanelAchievements" tabindex="-1">Badge-uri</button>
            <button type="button" id="authTabStats" role="tab" aria-selected="false" aria-controls="authPanelStats" tabindex="-1">Statistici</button>
            <button type="button" id="authTabHistory" role="tab" aria-selected="false" aria-controls="authPanelHistory" tabindex="-1">Istoric</button>
            <button type="button" id="authTabSettings" role="tab" aria-selected="false" aria-controls="authPanelSettings" tabindex="-1">Setări</button>
        </div>

        <section id="authPanelOverview" class="auth-tab-panel" role="tabpanel" aria-labelledby="authTabOverview">
            <div class="auth-progress-card" role="group" aria-label="Progres nivel cont">
                <div class="auth-progress-heading">
                    <strong>Progres nivel</strong>
                    <span id="authTotalXp">0 XP total</span>
                </div>
                <div id="authXpProgress" class="auth-xp-progress" role="progressbar" aria-label="Progres până la nivelul următor" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span id="authXpProgressBar"></span>
                </div>
                <div class="auth-progress-detail">
                    <span id="authLevelProgressText">0 / 100 XP</span>
                    <strong id="authXpToNextLevel">100 XP până la nivelul 2</strong>
                </div>
            </div>

            <div class="auth-stats-grid" role="group" aria-label="Statistici totale">
                <div class="auth-stat-card"><strong id="authStatPlayed">0</strong><span>Jocuri</span></div>
                <div class="auth-stat-card"><strong id="authStatWon">0</strong><span>Victorii</span></div>
                <div class="auth-stat-card"><strong id="authStatWinRate">0%</strong><span>Win rate</span></div>
                <div class="auth-stat-card"><strong id="authStatBestStreak">0</strong><span>Best streak</span></div>
            </div>

            <div class="auth-mode-stats" role="group" aria-label="Statistici pe mod de joc">
                <div><strong>Single</strong><span id="authSingleStats">0 jocuri · 0 victorii</span></div>
                <div><strong>Daily</strong><span id="authDailyStats">0 jocuri · 0 victorii</span></div>
                <div><strong>Duel</strong><span id="authDuelStats">0 jocuri · 0 victorii · 0 remize</span></div>
            </div>
        </section>

        <section id="authPanelAchievements" class="auth-tab-panel" role="tabpanel" aria-labelledby="authTabAchievements" hidden>
            <div class="auth-achievements-section" role="region" aria-labelledby="authAchievementsTitle">
                <div class="auth-section-heading">
                    <h3 id="authAchievementsTitle">Achievements</h3>
                    <span id="authAchievementSummary">0 / 8 deblocate</span>
                </div>
                <div id="authAchievementGrid" class="auth-achievement-grid" aria-live="polite"></div>
            </div>
        </section>

        <section id="authPanelStats" class="auth-tab-panel" role="tabpanel" aria-labelledby="authTabStats" hidden>
            <div class="auth-stats-details" role="region" aria-labelledby="authStatsDetailsTitle">
                <div class="auth-section-heading">
                    <h3 id="authStatsDetailsTitle">Statistici detaliate</h3>
                    <div class="auth-mode-selector" role="group" aria-label="Alege modul pentru statistici">
                        <button type="button" id="authStatsModeSingle" class="is-active" aria-pressed="true">Single</button>
                        <button type="button" id="authStatsModeDaily" aria-pressed="false">Daily</button>
                        <button type="button" id="authStatsModeDuel" aria-pressed="false">Duel</button>
                    </div>
                </div>
                <div class="auth-detail-summary">
                    <span id="authModeOutcomeDetail">0 victorii · 0 înfrângeri</span>
                    <span id="authModeStreakDetail">Streak: 0 · Record: 0</span>
                </div>
                <div class="auth-attempt-distribution" role="group" aria-label="Distribuția victoriilor pe încercări">
                    <div><span>1</span><i><b id="authGuessBar1"></b></i><strong id="authGuessCount1">0</strong></div>
                    <div><span>2</span><i><b id="authGuessBar2"></b></i><strong id="authGuessCount2">0</strong></div>
                    <div><span>3</span><i><b id="authGuessBar3"></b></i><strong id="authGuessCount3">0</strong></div>
                    <div><span>4</span><i><b id="authGuessBar4"></b></i><strong id="authGuessCount4">0</strong></div>
                    <div><span>5</span><i><b id="authGuessBar5"></b></i><strong id="authGuessCount5">0</strong></div>
                    <div><span>6</span><i><b id="authGuessBar6"></b></i><strong id="authGuessCount6">0</strong></div>
                </div>
            </div>
        </section>

        <section id="authPanelHistory" class="auth-tab-panel" role="tabpanel" aria-labelledby="authTabHistory" hidden>
            <div class="auth-history-section" role="region" aria-labelledby="authHistoryTitle">
                <div class="auth-section-heading">
                    <h3 id="authHistoryTitle">Ultimele jocuri</h3>
                    <span>Maximum 10</span>
                </div>
                <div id="authGameHistory" class="auth-game-history"></div>
            </div>
        </section>

        <section id="authPanelSettings" class="auth-tab-panel" role="tabpanel" aria-labelledby="authTabSettings" hidden>
            <div class="auth-settings-card auth-feedback-settings-card">
                <div>
                    <strong>Sunete și vibrații</strong>
                    <span id="authFeedbackSettingsSummary">Sunete: 70% · Vibrații: 70%</span>
                </div>
                <button type="button" id="authFeedbackSettingsBtn" class="auth-feedback-settings-btn">Configurează</button>
            </div>

            <details class="auth-settings-card auth-settings-disclosure auth-avatar-settings">
                <summary>
                    <span><strong>Alege avatarul</strong><small>Selectează una dintre cele 8 căști F1.</small></span>
                </summary>
                <div id="authAvatarPresetGrid" class="auth-avatar-grid" role="group" aria-label="Avataruri presetate">
                    <button type="button" id="authAvatarHelmetRed" class="auth-avatar-option" aria-pressed="true" aria-label="Cască roșie">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-red" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Rosso</small>
                    </button>
                    <button type="button" id="authAvatarHelmetBlue" class="auth-avatar-option" aria-pressed="false" aria-label="Cască albastră">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-blue" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Apex</small>
                    </button>
                    <button type="button" id="authAvatarHelmetYellow" class="auth-avatar-option" aria-pressed="false" aria-label="Cască galbenă">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-yellow" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Pole</small>
                    </button>
                    <button type="button" id="authAvatarHelmetGreen" class="auth-avatar-option" aria-pressed="false" aria-label="Cască verde">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-green" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Emerald</small>
                    </button>
                    <button type="button" id="authAvatarHelmetOrange" class="auth-avatar-option" aria-pressed="false" aria-label="Cască portocalie">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-orange" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Papaya</small>
                    </button>
                    <button type="button" id="authAvatarHelmetPurple" class="auth-avatar-option" aria-pressed="false" aria-label="Cască violet">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-purple" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Velocity</small>
                    </button>
                    <button type="button" id="authAvatarHelmetCyan" class="auth-avatar-option" aria-pressed="false" aria-label="Cască cyan">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-cyan" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Ice</small>
                    </button>
                    <button type="button" id="authAvatarHelmetWhite" class="auth-avatar-option" aria-pressed="false" aria-label="Cască albă">
                        <span class="auth-avatar-visual" data-avatar-key="helmet-white" aria-hidden="true"><span class="auth-helmet-icon"></span></span><small>Monaco</small>
                    </button>
                </div>
                <button type="button" id="authSaveAvatarBtn" class="auth-settings-submit auth-avatar-save">Salvează avatarul</button>
            </details>

            <details class="auth-settings-card auth-settings-disclosure">
                <summary>
                    <span><strong>Schimbă username-ul</strong><small>Poate fi modificat o dată la 7 zile.</small></span>
                </summary>
                <p id="authUsernameCooldownHint" class="auth-settings-hint auth-username-cooldown-hint"></p>
                <form id="authUsernameSettingsForm" class="auth-settings-form">
                    <label>
                        Username nou
                        <input type="text" id="authSettingsUsername" autocomplete="username" minlength="3" maxlength="20" required>
                    </label>
                    <label>
                        Parola curentă
                        <input type="password" id="authUsernameCurrentPassword" autocomplete="current-password" maxlength="64" required>
                    </label>
                    <button type="submit" id="authSaveUsernameBtn" class="auth-settings-submit">Salvează username-ul</button>
                </form>
            </details>

            <details class="auth-settings-card auth-settings-disclosure">
                <summary>
                    <span><strong>Schimbă parola</strong><small>Actualizează parola și securizează sesiunile.</small></span>
                </summary>
                <form id="authPasswordSettingsForm" class="auth-settings-form">
                    <label>
                        Parola curentă
                        <input type="password" id="authPasswordCurrent" autocomplete="current-password" maxlength="64" required>
                    </label>
                    <label>
                        Parola nouă
                        <input type="password" id="authPasswordNew" autocomplete="new-password" minlength="8" maxlength="64" required>
                    </label>
                    <label>
                        Confirmă parola nouă
                        <input type="password" id="authPasswordConfirm" autocomplete="new-password" minlength="8" maxlength="64" required>
                    </label>
                    <button type="submit" id="authSavePasswordBtn" class="auth-settings-submit">Schimbă parola</button>
                </form>
                <p class="auth-settings-hint">După schimbare, celelalte sesiuni vor fi deconectate automat.</p>
            </details>

            <div class="auth-settings-card auth-security-card">
                <div>
                    <strong>Logout peste tot</strong>
                    <span>Închide toate sesiunile contului, inclusiv aceasta.</span>
                </div>
                <button type="button" id="authLogoutAllBtn" class="auth-danger-btn">Logout peste tot</button>
            </div>
            <p id="authSettingsMessage" class="auth-settings-message" aria-live="polite"></p>
        </section>
        <p id="authAccountStatsMessage" class="auth-account-stats-message" aria-live="polite"></p>
    </section>

    <form class="auth-form" id="authForm">
        <label id="authUsernameGroup">
            Username
            <input type="text" id="authUsername" autocomplete="username" minlength="3" maxlength="20" placeholder="ex: Narcis_7">
        </label>
        <label>
            Email
            <input type="email" id="authEmail" autocomplete="email" placeholder="email@example.com" required>
        </label>
        <label>
            Parolă
            <input type="password" id="authPassword" autocomplete="current-password" minlength="8" maxlength="64" placeholder="8-64 caractere" required>
        </label>
        <button type="submit" id="authSubmitBtn" class="auth-submit-btn">Login</button>
    </form>

    <p id="authMessage" class="auth-message" aria-live="polite"></p>
    <div class="auth-actions-row">
        <button type="button" id="authSwitchBtn" class="auth-link-btn">Nu ai cont? Register</button>
        <button type="button" id="authLogoutBtn" class="auth-link-btn danger is-hidden">Logout</button>
    </div>
</div>`;

const FEEDBACK_PANEL_MARKUP = String.raw`<div class="feedback-backdrop" id="feedbackSettingsBackdrop" aria-hidden="true"></div>
    <section class="feedback-panel" id="feedbackSettingsPanel" role="dialog" aria-modal="true" aria-labelledby="feedbackSettingsTitle" aria-describedby="feedbackSettingsSubtitle" aria-hidden="true" tabindex="-1" inert>
        <button type="button" class="feedback-settings-close" id="feedbackSettingsCloseBtn" aria-label="Închide setările de feedback">×</button>
        <h2 id="feedbackSettingsTitle">Sunete și vibrații</h2>
        <p id="feedbackSettingsSubtitle" class="feedback-panel-subtitle">Aceleași preferințe se aplică interacțiunilor și modului curent.</p>

        <div class="feedback-options">
            <div class="feedback-option">
                <div class="feedback-option-row">
                    <label class="feedback-option-copy" for="feedbackSoundToggle"><strong>Sunete</strong><small>Confirmări pentru butoane și interacțiunile jocului.</small></label>
                    <label class="feedback-switch" for="feedbackSoundToggle">
                        <input type="checkbox" id="feedbackSoundToggle" role="switch" checked>
                        <span class="feedback-switch-track" aria-hidden="true"></span>
                    </label>
                </div>
                <label class="feedback-level-control" for="feedbackSoundVolume">
                    <span class="feedback-level-header"><span>Volum</span><output id="feedbackSoundVolumeValue" for="feedbackSoundVolume">70%</output></span>
                    <input type="range" id="feedbackSoundVolume" min="0" max="100" step="5" value="70" aria-label="Volumul sunetelor">
                </label>
            </div>

            <div class="feedback-option">
                <div class="feedback-option-row">
                    <label class="feedback-option-copy" for="feedbackHapticsToggle"><strong>Efecte haptice</strong><small>Vibrații pe dispozitivele compatibile.</small></label>
                    <label class="feedback-switch" for="feedbackHapticsToggle">
                        <input type="checkbox" id="feedbackHapticsToggle" role="switch" checked>
                        <span class="feedback-switch-track" aria-hidden="true"></span>
                    </label>
                </div>
                <label class="feedback-level-control" for="feedbackHapticIntensity">
                    <span class="feedback-level-header"><span>Intensitate</span><output id="feedbackHapticIntensityValue" for="feedbackHapticIntensity">70%</output></span>
                    <input type="range" id="feedbackHapticIntensity" min="0" max="100" step="5" value="70" aria-label="Intensitatea efectelor haptice">
                </label>
            </div>
        </div>

        <p id="feedbackHapticsSupport" class="feedback-support-note"></p>
        <button type="button" id="feedbackPreviewBtn" class="feedback-preview-btn" data-feedback-silent="true">Testează feedback-ul</button>
        <p id="feedbackSettingsStatus" class="feedback-settings-status" aria-live="polite"></p>
    </section>`;

export {
    AUTH_PANEL_MARKUP,
    CLASSIC_HEADER_MARKUP,
    FEEDBACK_PANEL_MARKUP,
    MODE_LABELS
};
