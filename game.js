// Configuración del canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1000;
canvas.height = 700;

// Variables del juego
let score = 0;
let lives = 3;
let level = 1;
let gameRunning = false;
let paused = false;
let lastShotTime = 0;
const shotCooldownMs = 180;

const LEADERBOARD_KEY = 'galaxia-en-casa-leaderboard-v1';
const PLAYER_IDS_KEY = 'galaxia-en-casa-player-ids-v1';
const LAST_ACCESS_KEY = 'galaxia-en-casa-last-access-v1';
const PRESET_PLAYER_IDS = {
    jr: '001',
    yule: '002',
    miguel: '003',
    jesy: '004'
};
const FIXED_PLAYER_ID_KEYS = new Set(Object.keys(PRESET_PLAYER_IDS));
const defaultLeaderboard = [
    {
        name: 'JR',
        playerId: '001',
        score: 4750,
        level: 10,
        lives: 1,
        date: '2026-03-22'
    },
    {
        name: 'Yule',
        playerId: '002',
        score: 3920,
        level: 8,
        lives: 2,
        date: '2026-03-21'
    },
    {
        name: 'Miguel',
        playerId: '003',
        score: 3210,
        level: 7,
        lives: 1,
        date: '2026-03-20'
    },
    {
        name: 'Jesy',
        playerId: '004',
        score: 2500,
        level: 6,
        lives: 1,
        date: '2026-03-19'
    }
];

let playerIdsByName = loadPlayerIds();
let leaderboard = loadLeaderboard();
let highScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
let currentPlayerName = '';
let currentPlayerId = '';

const highScoreEl = document.getElementById('highScore');
const startScreenEl = document.getElementById('startScreen');
const startLeaderboardBodyEl = document.getElementById('startLeaderboardBody');
const endLeaderboardBodyEl = document.getElementById('endLeaderboardBody');
const startGameBtn = document.getElementById('startGameBtn');
const restartBtn = document.getElementById('restartBtn');
const pauseBtn = document.getElementById('pauseBtn');
const playerNameInputEl = document.getElementById('playerNameInput');
const playerCodeInputEl = document.getElementById('playerCodeInput');
const nameErrorEl = document.getElementById('nameError');

// Jugador
const player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 100,
    width: 35,
    height: 30,
    speed: 6,
    minY: canvas.height / 2, // Límite superior de movimiento
    maxY: canvas.height - 50, // Límite inferior
    color: '#00ff00'
};

// Ajustar tamaño del canvas según la ventana
function getViewportSize() {
    const innerWidth = window.innerWidth || document.documentElement.clientWidth;
    const innerHeight = window.innerHeight || document.documentElement.clientHeight;

    if (window.visualViewport) {
        return {
            width: Math.min(innerWidth, window.visualViewport.width),
            height: Math.min(innerHeight, window.visualViewport.height)
        };
    }

    return {
        width: innerWidth,
        height: innerHeight
    };
}

function resizeCanvas() {
    const viewport = getViewportSize();
    const isPhone = viewport.width <= 760;
    const isTablet = viewport.width > 760 && viewport.width <= 1024;
    const viewportWidth = Math.max(280, Math.floor(viewport.width));
    const headerHeight = document.querySelector('.game-header')?.offsetHeight || 0;
    const reservedVerticalSpace = isPhone ? 10 : 20;
    const availableHeight = Math.max(200, Math.floor(viewport.height - headerHeight - reservedVerticalSpace));
    const horizontalInset = (isPhone || isTablet) ? 0 : 8;
    const maxWidth = Math.max(280, viewportWidth - horizontalInset);
    const maxHeight = (isPhone || isTablet) ? availableHeight : Math.min(700, availableHeight);

    const maxCanvasWidth = (isPhone || isTablet) ? maxWidth : Math.min(1000, maxWidth);
    const newWidth = Math.max(280, Math.floor(maxCanvasWidth));
    const minHeight = isPhone ? 220 : isTablet ? 300 : 340;
    const newHeight = Math.max(minHeight, Math.floor(maxHeight));
    
    // Solo cambiar si es diferente
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Reajustar posición del jugador
        if (player.x > canvas.width - player.width) {
            player.x = canvas.width - player.width;
        }
        player.minY = canvas.height / 2;
        player.maxY = canvas.height - Math.max(34, Math.floor(canvas.height * 0.07));
    }
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 50);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeCanvas);
}

// Controles
const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    space: false
};

const mouse = {
    x: player.x + player.width / 2,
    y: player.y + player.height / 2,
    insideCanvas: false,
    rightDown: false
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function updatePointerFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((clientY - rect.top) / rect.height) * canvas.height;
}

function normalizeNameKey(name = '') {
    return String(name).trim().toLowerCase();
}

function isValidPlayerId(value) {
    return typeof value === 'string' && /^\d{3}$/.test(value);
}

function getUsedPlayerIds() {
    const idsFromMap = Object.values(playerIdsByName).filter(isValidPlayerId);
    const idsFromLeaderboard = leaderboard
        .map(entry => entry?.playerId)
        .filter(isValidPlayerId);
    return new Set([...idsFromMap, ...idsFromLeaderboard]);
}

function generateUniquePlayerId(usedIds) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const candidate = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
        if (!usedIds.has(candidate)) {
            return candidate;
        }
    }

    for (let candidate = 1; candidate <= 999; candidate++) {
        const asText = String(candidate).padStart(3, '0');
        if (!usedIds.has(asText)) {
            return asText;
        }
    }

    return '000';
}

function loadPlayerIds() {
    const base = { ...PRESET_PLAYER_IDS };

    try {
        const raw = localStorage.getItem(PLAYER_IDS_KEY);
        if (!raw) {
            return base;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return base;
        }

        Object.entries(parsed).forEach(([key, value]) => {
            const normalizedKey = normalizeNameKey(key);
            if (normalizedKey && isValidPlayerId(value) && !FIXED_PLAYER_ID_KEYS.has(normalizedKey)) {
                base[normalizedKey] = value;
            }
        });

        return base;
    } catch (error) {
        return base;
    }
}

function savePlayerIds() {
    localStorage.setItem(PLAYER_IDS_KEY, JSON.stringify(playerIdsByName));
}

function saveLastAccess(name, playerId) {
    const payload = {
        name: sanitizePlayerName(name || ''),
        playerId: isValidPlayerId(playerId || '') ? playerId : ''
    };
    localStorage.setItem(LAST_ACCESS_KEY, JSON.stringify(payload));
}

function loadLastAccess() {
    try {
        const raw = localStorage.getItem(LAST_ACCESS_KEY);
        if (!raw) {
            return { name: '', playerId: '' };
        }

        const parsed = JSON.parse(raw);
        return {
            name: sanitizePlayerName(parsed?.name || ''),
            playerId: isValidPlayerId(parsed?.playerId || '') ? parsed.playerId : ''
        };
    } catch (error) {
        return { name: '', playerId: '' };
    }
}

function ensureSeedPlayers(entries) {
    const byName = new Map(entries.map(entry => [normalizeNameKey(entry.name || ''), entry]));
    defaultLeaderboard.forEach(seed => {
        const key = normalizeNameKey(seed.name);
        if (!byName.has(key)) {
            entries.push({ ...seed });
        }
    });
    return entries;
}

function getEntryPlayerKey(entry) {
    if (isValidPlayerId(entry?.playerId || '')) {
        return `id:${entry.playerId}`;
    }
    return `name:${normalizeNameKey(entry?.name || 'jugador')}`;
}

function selectBestEntry(a, b) {
    if (!a) return b;
    if (!b) return a;

    if ((b.score || 0) > (a.score || 0)) {
        return { ...a, ...b };
    }

    if ((b.score || 0) < (a.score || 0)) {
        return a;
    }

    if ((b.level || 0) > (a.level || 0)) {
        return { ...a, ...b };
    }

    return a;
}

function dedupeLeaderboard(entries) {
    const byPlayer = new Map();

    entries.forEach(entry => {
        const key = getEntryPlayerKey(entry);
        const existing = byPlayer.get(key);
        byPlayer.set(key, selectBestEntry(existing, entry));
    });

    return Array.from(byPlayer.values());
}

function findNameByPlayerId(playerId) {
    if (!isValidPlayerId(playerId)) {
        return '';
    }

    const fromMap = Object.entries(playerIdsByName).find(([, value]) => value === playerId);
    if (fromMap) {
        const key = fromMap[0];
        return leaderboard.find(entry => normalizeNameKey(entry.name) === key)?.name || key.toUpperCase();
    }

    const fromLeaderboard = leaderboard.find(entry => entry.playerId === playerId);
    return fromLeaderboard ? fromLeaderboard.name : '';
}

function getOrCreatePlayerId(name, preferredId) {
    const normalizedName = normalizeNameKey(name);
    if (!normalizedName) {
        return '000';
    }

    if (PRESET_PLAYER_IDS[normalizedName]) {
        playerIdsByName[normalizedName] = PRESET_PLAYER_IDS[normalizedName];
        savePlayerIds();
        return PRESET_PLAYER_IDS[normalizedName];
    }

    if (isValidPlayerId(playerIdsByName[normalizedName])) {
        return playerIdsByName[normalizedName];
    }

    const usedIds = getUsedPlayerIds();
    let resolvedId = null;

    if (isValidPlayerId(preferredId) && !usedIds.has(preferredId)) {
        resolvedId = preferredId;
    }

    if (!resolvedId) {
        const presetId = PRESET_PLAYER_IDS[normalizedName];
        if (isValidPlayerId(presetId) && (!usedIds.has(presetId) || normalizedName === 'jr')) {
            resolvedId = presetId;
        }
    }

    if (!resolvedId) {
        resolvedId = generateUniquePlayerId(usedIds);
    }

    playerIdsByName[normalizedName] = resolvedId;
    savePlayerIds();
    return resolvedId;
}

function loadLeaderboard() {
    try {
        const raw = localStorage.getItem(LEADERBOARD_KEY);
        if (!raw) {
            const seeded = defaultLeaderboard.map(entry => ({ ...entry }));
            seeded.forEach(entry => {
                entry.playerId = getOrCreatePlayerId(entry.name, entry.playerId);
            });
            savePlayerIds();
            const sortedSeeded = seeded
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            saveLeaderboard(sortedSeeded);
            return sortedSeeded;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            const seeded = defaultLeaderboard.map(entry => ({ ...entry }));
            seeded.forEach(entry => {
                entry.playerId = getOrCreatePlayerId(entry.name, entry.playerId);
            });
            savePlayerIds();
            const sortedSeeded = seeded
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            saveLeaderboard(sortedSeeded);
            return sortedSeeded;
        }

        const normalizedEntries = ensureSeedPlayers(parsed
            .filter(entry => typeof entry.score === 'number')
            .map(entry => {
                const safeName = sanitizePlayerName(entry.name || 'Jugador') || 'Jugador';
                return {
                    ...entry,
                    name: safeName,
                    playerId: getOrCreatePlayerId(safeName, entry.playerId),
                    level: typeof entry.level === 'number' ? entry.level : 1,
                    lives: typeof entry.lives === 'number' ? entry.lives : 0
                };
            }));

        const sortedEntries = dedupeLeaderboard(normalizedEntries)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        savePlayerIds();
        saveLeaderboard(sortedEntries);
        return sortedEntries;
    } catch (error) {
        const seeded = defaultLeaderboard.map(entry => ({ ...entry }));
        seeded.forEach(entry => {
            entry.playerId = getOrCreatePlayerId(entry.name, entry.playerId);
        });
        savePlayerIds();
        const sortedSeeded = seeded
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
        saveLeaderboard(sortedSeeded);
        return sortedSeeded;
    }
}

function saveLeaderboard(entries) {
    const payload = Array.isArray(entries) ? entries : leaderboard;
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(payload));
}

function updateHighScoreDisplay() {
    highScoreEl.textContent = highScore;
}

function renderLeaderboard(targetBody) {
    if (!targetBody) return;

    const rows = leaderboard
        .slice(0, 8)
        .map((entry, index) => (
            `<tr>
                <td>${index + 1}</td>
                <td>${entry.name || 'Jugador'}</td>
                <td>${entry.score}</td>
                <td>${entry.playerId || '000'}</td>
            </tr>`
        ))
        .join('');

    targetBody.innerHTML = rows || '<tr><td colspan="4">Sin puntajes todavia</td></tr>';
}

function renderAllLeaderboards() {
    renderLeaderboard(startLeaderboardBodyEl);
    renderLeaderboard(endLeaderboardBodyEl);
}

function addScoreToLeaderboard(name = 'Jugador', playerId = '000') {
    const newEntry = {
        name,
        playerId,
        score,
        level,
        lives,
        date: new Date().toISOString().split('T')[0]
    };

    const playerKey = getEntryPlayerKey(newEntry);
    const existingIndex = leaderboard.findIndex(entry => getEntryPlayerKey(entry) === playerKey);

    if (existingIndex >= 0) {
        leaderboard[existingIndex] = selectBestEntry(leaderboard[existingIndex], newEntry);
    } else {
        leaderboard.push(newEntry);
    }

    leaderboard = dedupeLeaderboard(leaderboard)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    highScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
    saveLeaderboard();
    updateHighScoreDisplay();
    renderAllLeaderboards();
}

function sanitizePlayerName(value) {
    return value.trim().replace(/\s+/g, ' ').slice(0, 14);
}

function sanitizePlayerId(value = '') {
    return String(value).replace(/\D/g, '').slice(0, 3);
}

function showNameError(show) {
    if (!nameErrorEl) return;
    nameErrorEl.classList.toggle('show', show);
}

function resetGameState() {
    resizeCanvas();

    score = 0;
    lives = 3;
    level = 1;
    paused = false;
    gameRunning = true;
    lastShotTime = 0;

    bullets = [];
    enemyBullets = [];
    particles = [];
    keys.space = false;
    mouse.rightDown = false;

    player.x = canvas.width / 2 - player.width / 2;
    player.y = canvas.height - Math.max(70, Math.floor(canvas.height * 0.18));
    player.minY = canvas.height / 2;
    player.maxY = canvas.height - Math.max(34, Math.floor(canvas.height * 0.07));

    updateScore();
    updateLives();
    updateLevel();
    createEnemies();
}

function startGame() {
    const proposedName = sanitizePlayerName(playerNameInputEl.value);
    const proposedCode = sanitizePlayerId(playerCodeInputEl ? playerCodeInputEl.value : '');

    if (!proposedName && !proposedCode) {
        showNameError(true);
        (playerNameInputEl || playerCodeInputEl).focus();
        return;
    }

    let resolvedName = proposedName;
    let resolvedId = '';

    if (proposedCode && !isValidPlayerId(proposedCode)) {
        nameErrorEl.textContent = 'El codigo debe tener 3 digitos.';
        showNameError(true);
        playerCodeInputEl.focus();
        return;
    }

    if (proposedName && proposedCode) {
        const knownIdForName = playerIdsByName[normalizeNameKey(proposedName)];
        const knownNameForCode = findNameByPlayerId(proposedCode);

        if (knownIdForName && knownIdForName !== proposedCode) {
            nameErrorEl.textContent = `El codigo correcto para ${proposedName} es ${knownIdForName}.`;
            showNameError(true);
            playerCodeInputEl.focus();
            return;
        }

        if (knownNameForCode && normalizeNameKey(knownNameForCode) !== normalizeNameKey(proposedName)) {
            nameErrorEl.textContent = `El codigo ${proposedCode} pertenece a ${knownNameForCode}.`;
            showNameError(true);
            playerNameInputEl.focus();
            return;
        }

        resolvedName = proposedName;
        resolvedId = getOrCreatePlayerId(resolvedName, proposedCode);
    } else if (proposedCode) {
        const existingName = findNameByPlayerId(proposedCode);
        resolvedName = existingName || `Jugador ${proposedCode}`;
        resolvedId = getOrCreatePlayerId(resolvedName, proposedCode);
    } else {
        resolvedName = proposedName;
        resolvedId = getOrCreatePlayerId(resolvedName);
    }

    currentPlayerName = resolvedName;
    currentPlayerId = resolvedId;
    saveLastAccess(currentPlayerName, currentPlayerId);

    // Cierra teclado movil antes de recalcular el tamano del juego
    if (playerNameInputEl) playerNameInputEl.blur();
    if (playerCodeInputEl) playerCodeInputEl.blur();

    resizeCanvas();
    playerNameInputEl.value = currentPlayerName;
    if (playerCodeInputEl) {
        playerCodeInputEl.value = currentPlayerId;
    }
    nameErrorEl.textContent = 'Debes escribir nombre o codigo para comenzar.';
    showNameError(false);
    if (pauseBtn) {
        pauseBtn.textContent = 'PAUSA';
    }
    startScreenEl.classList.remove('active');
    document.getElementById('gameOver').classList.remove('active');
    resetGameState();

    // Segunda pasada para evitar saltos de tamano tras ocultar overlays/teclado
    setTimeout(resizeCanvas, 80);
}

function openStartScreen() {
    gameRunning = false;
    paused = false;
    startScreenEl.classList.add('active');
    document.getElementById('gameOver').classList.remove('active');
    resizeCanvas();
    if (currentPlayerName) {
        playerNameInputEl.value = currentPlayerName;
    }
    if (playerCodeInputEl && currentPlayerId) {
        playerCodeInputEl.value = currentPlayerId;
    }
    nameErrorEl.textContent = 'Debes escribir nombre o codigo para comenzar.';
    showNameError(false);
    if (pauseBtn) {
        pauseBtn.textContent = 'PAUSA';
    }
    renderAllLeaderboards();
    setTimeout(resizeCanvas, 80);
}

function shootPlayerBullet() {
    const now = Date.now();
    if (bullets.length < 5 && now - lastShotTime >= shotCooldownMs) {
        bullets.push(new Bullet(player.x + player.width / 2 - 2, player.y));
        lastShotTime = now;
    }
}

// Arrays para enemigos, balas y balas enemigas
let enemies = [];
let bullets = [];
let enemyBullets = [];
let particles = [];

// Clase para las balas del jugador
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 3;
        this.height = 12;
        this.speed = 8;
        this.color = '#00ff00';
    }

    update() {
        this.y -= this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// Clase para las balas enemigas
class EnemyBullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 3;
        this.height = 12;
        this.speed = 1.5 + (level * 0.25); // Velocidad más lenta al inicio
        this.color = '#ff0000';
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// Clase para enemigos
class Enemy {
    constructor(x, y, type = 1) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 28;
        const mobileSpeedFactor = canvas.width <= 760 ? 0.82 : 1;
        this.speedX = (0.6 + (level * 0.15)) * mobileSpeedFactor; // Velocidad adaptada para pantallas pequenas
        this.speedY = 0;
        this.dropStep = Math.max(8, Math.floor(canvas.height * 0.025));
        this.type = type;
        this.shootTimer = Math.random() * 100 + 50;
        this.colors = ['#ff00ff', '#00ffff', '#ffff00'];
        this.color = this.colors[type - 1] || '#ff00ff';
        this.points = type * 10;
    }

    update() {
        this.x += this.speedX;
        
        // Cambiar dirección al tocar los bordes
        if (this.x <= 0 || this.x + this.width >= canvas.width) {
            this.speedX *= -1;
            this.y += this.dropStep;
        }

        // Disparar aleatoriamente con probabilidad progresiva
        this.shootTimer--;
        const shootChance = (canvas.width <= 760 ? 0.002 : 0.003) + (level * 0.0018);
        if (this.shootTimer <= 0 && Math.random() < shootChance) {
            enemyBullets.push(new EnemyBullet(this.x + this.width / 2 - 2, this.y + this.height));
            this.shootTimer = Math.random() * 200 + 150; // Mucho más tiempo entre disparos
        }
    }

    draw() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // Cuerpo principal de la nave enemiga
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, this.width / 2, this.height / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Cabina/cúpula
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY - 5, this.width / 3, this.height / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        
        // Ventanas/luces
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX - 8, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX + 8, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Alas laterales
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x, centerY);
        ctx.lineTo(this.x - 6, centerY + 8);
        ctx.lineTo(this.x + 5, centerY + 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(this.x + this.width, centerY);
        ctx.lineTo(this.x + this.width + 6, centerY + 8);
        ctx.lineTo(this.x + this.width - 5, centerY + 5);
        ctx.closePath();
        ctx.fill();
        
        // Borde oscuro
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, this.width / 2, this.height / 3, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// Clase para partículas de explosión
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.size = Math.random() * 4 + 2;
        this.color = color;
        this.life = 30;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        this.size *= 0.95;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

// Crear oleada de enemigos
function createEnemies() {
    enemies = [];
    const baseRows = Math.min(2 + Math.floor(level / 3), 5); // Empieza con 2 filas, aumenta cada 3 niveles
    const baseCols = Math.min(5 + Math.floor(level / 2), 10); // Empieza con 5 columnas, aumenta más lento
    const spacing = Math.min(95, Math.max(52, Math.floor(canvas.height * 0.18)));
    const maxRowsByHeight = Math.max(2, Math.floor((canvas.height * 0.42) / spacing));
    const maxColsByWidth = Math.max(3, Math.floor((canvas.width - 24) / spacing));
    const rows = Math.max(2, Math.min(baseRows, maxRowsByHeight));
    const cols = Math.max(3, Math.min(baseCols, maxColsByWidth));
    const formationWidth = (cols - 1) * spacing + 32;
    const offsetX = Math.max(12, Math.floor((canvas.width - formationWidth) / 2));
    const offsetY = Math.min(40, Math.max(16, Math.floor(canvas.height * 0.08)));

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Los enemigos más fuertes aparecen en niveles más altos
            let type = 1;
            if (level > 2 && row < 1) type = 3;
            else if (level > 1 && row < 2) type = 2;
            
            enemies.push(new Enemy(
                offsetX + col * spacing,
                offsetY + row * spacing,
                type
            ));
        }
    }
}

// Crear explosión
function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// Dibujar jugador
function drawPlayer() {
    const centerX = player.x + player.width / 2;
    
    // Cuerpo principal de la nave
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(centerX, player.y);
    ctx.lineTo(player.x + 5, player.y + player.height);
    ctx.lineTo(centerX, player.y + player.height - 8);
    ctx.lineTo(player.x + player.width - 5, player.y + player.height);
    ctx.closePath();
    ctx.fill();
    
    // Alas
    ctx.fillStyle = '#00cc00';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y + 15);
    ctx.lineTo(player.x - 8, player.y + 25);
    ctx.lineTo(player.x + 5, player.y + 22);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(player.x + player.width, player.y + 15);
    ctx.lineTo(player.x + player.width + 8, player.y + 25);
    ctx.lineTo(player.x + player.width - 5, player.y + 22);
    ctx.closePath();
    ctx.fill();
    
    // Cabina
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(centerX, player.y + 12, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Detalles
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 3, player.y + player.height - 5);
    ctx.lineTo(centerX - 3, player.y + player.height);
    ctx.moveTo(centerX + 3, player.y + player.height - 5);
    ctx.lineTo(centerX + 3, player.y + player.height);
    ctx.stroke();
}

// Actualizar juego
function update() {
    if (!gameRunning || paused) return;

    // Mover jugador
    if (keys.left && player.x > 0) {
        player.x -= player.speed;
    }
    if (keys.right && player.x < canvas.width - player.width) {
        player.x += player.speed;
    }
    if (keys.up && player.y > player.minY) {
        player.y -= player.speed;
    }
    if (keys.down && player.y < player.maxY) {
        player.y += player.speed;
    }

    // Control por mouse: la nave sigue al cursor dentro del canvas
    if (mouse.insideCanvas) {
        player.x = clamp(mouse.x - player.width / 2, 0, canvas.width - player.width);
        player.y = clamp(mouse.y - player.height / 2, player.minY, player.maxY);
    }

    // Disparar
    if (keys.space || mouse.rightDown) {
        shootPlayerBullet();
    }

    // Actualizar balas del jugador
    bullets = bullets.filter(bullet => {
        bullet.update();
        return bullet.y > 0;
    });

    // Actualizar balas enemigas
    enemyBullets = enemyBullets.filter(bullet => {
        bullet.update();
        return bullet.y < canvas.height;
    });

    // Actualizar enemigos
    enemies.forEach(enemy => enemy.update());

    // Actualizar partículas
    particles = particles.filter(particle => {
        particle.update();
        return particle.life > 0;
    });

    // Detectar colisiones bala-enemigo
    bullets.forEach((bullet, bulletIndex) => {
        enemies.forEach((enemy, enemyIndex) => {
            if (bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y) {
                
                createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color);
                enemies.splice(enemyIndex, 1);
                bullets.splice(bulletIndex, 1);
                score += enemy.points;
                updateScore();
            }
        });
    });

    // Detectar colisiones bala enemiga-jugador
    enemyBullets.forEach((bullet, index) => {
        if (bullet.x < player.x + player.width &&
            bullet.x + bullet.width > player.x &&
            bullet.y < player.y + player.height &&
            bullet.y + bullet.height > player.y) {
            
            enemyBullets.splice(index, 1);
            lives--;
            updateLives();
            createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#00ff00');
            
            if (lives <= 0) {
                gameOver();
            }
        }
    });

    // Detectar colisión enemigo-jugador
    const enemyBottomGameOverY = canvas.height - Math.max(12, Math.floor(canvas.height * 0.08));
    enemies.forEach(enemy => {
        if (enemy.x < player.x + player.width &&
            enemy.x + enemy.width > player.x &&
            enemy.y < player.y + player.height &&
            enemy.y + enemy.height > player.y) {
            gameOver();
        }
        
        // Game over si los enemigos llegan abajo
        if (enemy.y + enemy.height >= enemyBottomGameOverY) {
            gameOver();
        }
    });

    // Siguiente nivel si no quedan enemigos
    if (enemies.length === 0) {
        level++;
        updateLevel();
        createEnemies();
    }
}

// Dibujar todo
function draw() {
    // Limpiar canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar estrellas de fondo
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137) % canvas.width;
        const y = (i * 251 + Date.now() * 0.02) % canvas.height;
        ctx.fillRect(x, y, 2, 2);
    }

    // Dibujar jugador
    drawPlayer();

    // Dibujar balas
    bullets.forEach(bullet => bullet.draw());
    enemyBullets.forEach(bullet => bullet.draw());

    // Dibujar enemigos
    enemies.forEach(enemy => enemy.draw());

    // Dibujar partículas
    particles.forEach(particle => particle.draw());

    // Mostrar pausa
    if (paused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff00';
        ctx.font = '48px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSA', canvas.width / 2, canvas.height / 2);
    }
}

// Loop del juego
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Actualizar puntuación
function updateScore() {
    document.getElementById('score').textContent = score;
}

function updateLives() {
    document.getElementById('lives').textContent = lives;
}

function updateLevel() {
    document.getElementById('level').textContent = level;
}

// Game Over
function gameOver() {
    gameRunning = false;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalLevel').textContent = level;
    document.getElementById('finalLives').textContent = lives;
    addScoreToLeaderboard(currentPlayerName || 'Jugador', currentPlayerId || getOrCreatePlayerId(currentPlayerName || 'Jugador'));
    document.getElementById('gameOver').classList.add('active');
}

// Eventos de teclado
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'ArrowUp') keys.up = true;
    if (e.key === 'ArrowDown') keys.down = true;
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        keys.space = true;
    }
    if (e.key === 'p' || e.key === 'P') {
        if (gameRunning) {
            paused = !paused;
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
    if (e.key === ' ' || e.key === 'Spacebar') keys.space = false;
});

// Eventos de mouse
canvas.addEventListener('mousemove', (e) => {
    updatePointerFromClient(e.clientX, e.clientY);
    mouse.insideCanvas = true;
});

canvas.addEventListener('mouseenter', () => {
    mouse.insideCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
    mouse.insideCanvas = false;
    mouse.rightDown = false;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        e.preventDefault();
        mouse.rightDown = true;
        shootPlayerBullet();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        mouse.rightDown = false;
    }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Eventos tactiles para iPhone/iPad/Android y Chrome Inspect
canvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) {
        e.preventDefault();
    }

    if (!e.touches || e.touches.length === 0) {
        return;
    }

    const touch = e.touches[0];
    updatePointerFromClient(touch.clientX, touch.clientY);
    mouse.insideCanvas = true;

    if (!gameRunning) {
        return;
    }

    shootPlayerBullet();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) {
        e.preventDefault();
    }

    if (!e.touches || e.touches.length === 0) {
        return;
    }

    const touch = e.touches[0];
    updatePointerFromClient(touch.clientX, touch.clientY);
    mouse.insideCanvas = true;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.cancelable) {
        e.preventDefault();
    }

    if (!e.touches || e.touches.length === 0) {
        mouse.insideCanvas = false;
        mouse.rightDown = false;
    }
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
    mouse.insideCanvas = false;
    mouse.rightDown = false;
});

startGameBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', openStartScreen);
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (gameRunning) {
            paused = !paused;
            pauseBtn.textContent = paused ? 'REANUDAR' : 'PAUSA';
        }
    });
}
playerNameInputEl.addEventListener('input', () => {
    saveLastAccess(playerNameInputEl.value, playerCodeInputEl ? playerCodeInputEl.value : '');
    if (sanitizePlayerName(playerNameInputEl.value)) {
        nameErrorEl.textContent = 'Debes escribir nombre o codigo para comenzar.';
        showNameError(false);
    }
});

if (playerCodeInputEl) {
    playerCodeInputEl.addEventListener('input', () => {
        playerCodeInputEl.value = sanitizePlayerId(playerCodeInputEl.value);
        saveLastAccess(playerNameInputEl.value, playerCodeInputEl.value);
        if (sanitizePlayerId(playerCodeInputEl.value).length > 0) {
            nameErrorEl.textContent = 'Debes escribir nombre o codigo para comenzar.';
            showNameError(false);
        }
    });

    playerCodeInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            startGame();
        }
    });
}

playerNameInputEl.addEventListener('blur', () => {
    const proposedName = sanitizePlayerName(playerNameInputEl.value);
    const proposedCode = sanitizePlayerId(playerCodeInputEl ? playerCodeInputEl.value : '');
    if (!proposedName && proposedCode && isValidPlayerId(proposedCode)) {
        const existingName = findNameByPlayerId(proposedCode);
        if (existingName) {
            playerNameInputEl.value = existingName;
        }
    }
});

playerNameInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        startGame();
    }
});

// Iniciar juego
updateHighScoreDisplay();
renderAllLeaderboards();
const lastAccess = loadLastAccess();
if (lastAccess.name) {
    playerNameInputEl.value = lastAccess.name;
}
if (playerCodeInputEl && lastAccess.playerId) {
    playerCodeInputEl.value = lastAccess.playerId;
}
if (lastAccess.name || lastAccess.playerId) {
    currentPlayerName = lastAccess.name;
    currentPlayerId = lastAccess.playerId;
}
if (pauseBtn) {
    pauseBtn.textContent = 'PAUSA';
}
playerNameInputEl.focus();
gameLoop();
