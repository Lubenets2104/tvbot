// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Получаем данные пользователя из Telegram
const user = tg.initDataUnsafe?.user || {
    id: 123456789,
    first_name: 'Test User',
    username: 'testuser'
};

// Глобальные переменные
let currentStream = null;
let userSubscription = null;
let hls = null;

// ⚠️ ВАЖНО: Замени на свой ngrok URL после запуска ngrok!
// Например: const API_URL = 'https://abc123.ngrok-free.app';
const API_URL = 'ТВОЙ_NGROK_URL_СЮДА';  // ← ИЗМЕНИ ЭТО!

// ============= ИНИЦИАЛИЗАЦИЯ =============

document.addEventListener('DOMContentLoaded', async () => {
    console.log('TVbot Mini App загружен');
    console.log('Пользователь:', user);
    
    // Устанавливаем тему
    applyTheme();
    
    // Показываем информацию о пользователе
    updateUserInfo();
    
    // Проверяем подписку пользователя
    await checkUserAccess();
    
    // Загружаем список стримов
    await loadStreams();
    
    // Настраиваем обработчики событий
    setupEventHandlers();
    
    // Автообновление каждые 10 секунд
    setInterval(loadStreams, 10000);
});

// ============= TELEGRAM THEME =============

function applyTheme() {
    const themeParams = tg.themeParams;
    
    if (themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-bg', themeParams.bg_color);
    }
    if (themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-text', themeParams.text_color);
    }
    if (themeParams.button_color) {
        document.documentElement.style.setProperty('--tg-button', themeParams.button_color);
    }
}

// ============= ПОЛЬЗОВАТЕЛЬ =============

function updateUserInfo() {
    const usernameEl = document.getElementById('username');
    usernameEl.textContent = user.first_name || user.username || 'Гость';
}

async function checkUserAccess() {
    try {
        const response = await fetch(`${API_URL}/api/check-access/${user.id}`);
        const data = await response.json();
        
        userSubscription = data;
        updateSubscriptionBadge();
        
        console.log('Статус подписки:', data);
        
    } catch (error) {
        console.error('Ошибка проверки доступа:', error);
        userSubscription = { hasAccess: false, tier: 'none' };
    }
}

function updateSubscriptionBadge() {
    const badge = document.getElementById('subscription-badge');
    
    if (!userSubscription || !userSubscription.hasAccess) {
        badge.textContent = 'FREE';
        badge.className = 'badge badge-free';
        return;
    }
    
    const tierLabels = {
        basic: { text: '⭐ BASIC', class: 'badge-basic' },
        premium: { text: '💎 PREMIUM', class: 'badge-premium' },
        vip: { text: '👑 VIP', class: 'badge-vip' }
    };
    
    const tier = tierLabels[userSubscription.tier] || tierLabels.basic;
    badge.textContent = tier.text;
    badge.className = `badge ${tier.class}`;
}

// ============= ЗАГРУЗКА СТРИМОВ =============

async function loadStreams() {
    try {
        const response = await fetch(`${API_URL}/api/streams`);
        const data = await response.json();
        
        if (data.streams && data.streams.length > 0) {
            currentStream = data.streams[0];
            updateStreamStatus('live');
            
            // Проверяем доступ перед загрузкой видео
            if (userSubscription && userSubscription.hasAccess) {
                loadVideo(currentStream.url);
                showChatIfPremium();
            } else {
                showAccessDenied();
            }
        } else {
            currentStream = null;
            updateStreamStatus('offline');
            showNoStream();
        }
        
    } catch (error) {
        console.error('Ошибка загрузки стримов:', error);
        updateStreamStatus('error');
    }
}

function updateStreamStatus(status) {
    const statusEl = document.getElementById('stream-status');
    const textEl = document.getElementById('status-text');
    
    statusEl.className = 'stream-status';
    
    switch(status) {
        case 'live':
            statusEl.classList.add('status-live');
            textEl.textContent = '🔴 В эфире';
            break;
        case 'offline':
            statusEl.classList.add('status-offline');
            textEl.textContent = '⚫ Не в эфире';
            break;
        case 'error':
            statusEl.classList.add('status-error');
            textEl.textContent = '⚠️ Ошибка подключения';
            break;
    }
}

// ============= ВИДЕО ПЛЕЕР =============

function loadVideo(url) {
    const video = document.getElementById('video-player');
    const noStream = document.getElementById('no-stream');
    const accessDenied = document.getElementById('access-denied');
    
    // Скрываем сообщения
    noStream.style.display = 'none';
    accessDenied.style.display = 'none';
    video.style.display = 'block';
    
    if (Hls.isSupported()) {
        if (hls) {
            hls.destroy();
        }
        
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
        });
        
        hls.loadSource(url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS поток загружен');
            video.play().catch(e => console.log('Автовоспроизведение заблокировано:', e));
            updateQualityInfo();
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS ошибка:', data);
            if (data.fatal) {
                handleVideoError();
            }
        });
        
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Нативная поддержка HLS (Safari)
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
            video.play().catch(e => console.log('Автовоспроизведение заблокировано:', e));
        });
    } else {
        tg.showAlert('Ваш браузер не поддерживает воспроизведение видео');
    }
}

function showNoStream() {
    const video = document.getElementById('video-player');
    const noStream = document.getElementById('no-stream');
    const accessDenied = document.getElementById('access-denied');
    
    video.style.display = 'none';
    accessDenied.style.display = 'none';
    noStream.style.display = 'flex';
}

function showAccessDenied() {
    const video = document.getElementById('video-player');
    const noStream = document.getElementById('no-stream');
    const accessDenied = document.getElementById('access-denied');
    
    video.style.display = 'none';
    noStream.style.display = 'none';
    accessDenied.style.display = 'flex';
}

function handleVideoError() {
    tg.showAlert('Ошибка воспроизведения. Попробуйте обновить страницу.');
}

function updateQualityInfo() {
    const qualityEl = document.getElementById('quality');
    
    if (userSubscription && userSubscription.hasAccess) {
        qualityEl.textContent = `📊 ${userSubscription.quality}`;
    } else {
        qualityEl.textContent = '📊 360p';
    }
}

// ============= ЧАТ =============

function showChatIfPremium() {
    const chatContainer = document.getElementById('chat-container');
    
    if (userSubscription && 
        (userSubscription.tier === 'premium' || userSubscription.tier === 'vip')) {
        chatContainer.style.display = 'flex';
    }
}

// ============= ОБРАБОТЧИКИ СОБЫТИЙ =============

function setupEventHandlers() {
    // Кнопка "Купить доступ"
    document.getElementById('buy-access-btn').addEventListener('click', () => {
        tg.close(); // Закрываем Mini App
        // Бот покажет меню покупки
    });
    
    // Кнопка "Донат"
    document.getElementById('donate-btn').addEventListener('click', () => {
        tg.showPopup({
            title: 'Донат',
            message: 'Закройте приложение и нажмите кнопку "Донат" в боте',
            buttons: [{ type: 'ok' }]
        });
    });
    
    // Полноэкранный режим
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        const video = document.getElementById('video-player');
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        }
    });
    
    // Обновить
    document.getElementById('refresh-btn').addEventListener('click', () => {
        tg.HapticFeedback.impactOccurred('medium');
        loadStreams();
    });
    
    // Отправка сообщения в чат
    document.getElementById('send-message')?.addEventListener('click', sendChatMessage);
    document.getElementById('message-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Закрыть чат
    document.getElementById('close-chat')?.addEventListener('click', () => {
        document.getElementById('chat-container').style.display = 'none';
    });
}

function sendChatMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatMessages = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message user';
    messageEl.innerHTML = `
        <strong>${user.first_name}:</strong> ${message}
    `;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    input.value = '';
    tg.HapticFeedback.impactOccurred('light');
}

// ============= UTILITY =============

// Показать уведомление
function showNotification(message, type = 'info') {
    tg.showPopup({
        title: type === 'error' ? 'Ошибка' : 'Уведомление',
        message: message,
        buttons: [{ type: 'ok' }]
    });
}

console.log('TVbot Mini App готов к работе!');
