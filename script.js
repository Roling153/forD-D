// Multiplayer game state
let gameState = {
    players: new Map(),
    rolls: [],
    roomId: null,
    isHost: false
};

let currentPlayer = null;
let currentDiceType = 'd6';
let syncInterval = null;
let lastSyncTime = 0;
let connectionStatus = 'disconnected';

// Available dice types
const diceTypes = {
    d6: { sides: 6, symbol: '🎲' },
    d8: { sides: 8, symbol: '🎲' },
    d12: { sides: 12, symbol: '🎲' },
    d16: { sides: 16, symbol: '🎲' },
    d20: { sides: 20, symbol: '🎲' }
};

// Initialize the game
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
});

function initializeGame() {
    // Get room ID from URL or generate new one
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam) {
        gameState.roomId = roomParam;
        gameState.isHost = false;
    } else {
        gameState.roomId = generateRoomId();
        gameState.isHost = true;
        // Update URL with room ID
        window.history.replaceState({}, '', `?room=${gameState.roomId}`);
    }

    // Update room info
    document.getElementById('roomId').textContent = gameState.roomId;
    document.getElementById('roomLink').textContent = window.location.href;

    // Initialize multiplayer storage
    initializeMultiplayerStorage();

    // Check if player name is stored
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'block';
        document.getElementById('playerSetup').style.display = 'flex';
        document.getElementById('playerName').focus();
        
        // Start connection simulation
        updateConnectionStatus('connected');
        startSyncLoop();
    }, 1000);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initializeMultiplayerStorage() {
    // Initialize room data structure in memory
    if (!window.roomData) {
        window.roomData = {};
    }
    
    if (!window.roomData[gameState.roomId]) {
        window.roomData[gameState.roomId] = {
            players: {},
            rolls: [],
            lastUpdate: Date.now()
        };
    }
    
    // Load existing room data
    const roomData = window.roomData[gameState.roomId];
    if (roomData) {
        gameState.rolls = roomData.rolls || [];
        
        // Convert players object back to Map
        if (roomData.players) {
            Object.entries(roomData.players).forEach(([name, data]) => {
                gameState.players.set(name, data);
            });
        }
    }
}

function updateConnectionStatus(status) {
    connectionStatus = status;
    const statusEl = document.getElementById('connectionStatus');
    
    if (status === 'connected') {
        statusEl.textContent = '🟢 Connected';
        statusEl.className = 'connection-status connected';
    } else {
        statusEl.textContent = '🔴 Disconnected';
        statusEl.className = 'connection-status disconnected';
    }
}

function setPlayerName() {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim();
    
    if (name && name.length > 0) {
        // Check if name is already taken
        if (gameState.players.has(name)) {
            alert('This name is already taken. Please choose another name.');
            return;
        }
        
        currentPlayer = name;
        document.getElementById('playerDisplay').textContent = name;
        
        // Add player to game state
        gameState.players.set(name, {
            name: name,
            joinTime: Date.now(),
            lastSeen: Date.now(),
            isOnline: true
        });
        
        showGameInterface();
        saveRoomData();
        broadcastPlayerJoin(name);
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        if (currentPlayer) {
            broadcastPlayerLeave(currentPlayer);
            gameState.players.delete(currentPlayer);
            saveRoomData();
        }
        
        currentPlayer = null;
        
        hideGameInterface();
        document.getElementById('playerSetup').style.display = 'flex';
        document.getElementById('playerName').value = '';
        document.getElementById('playerName').focus();
    }
}

function showGameInterface() {
    document.getElementById('playerSetup').style.display = 'none';
    document.getElementById('currentPlayer').style.display = 'flex';
    document.getElementById('onlinePlayers').style.display = 'flex';
    document.getElementById('gameSection').style.display = 'block';
    document.getElementById('rollHistory').style.display = 'block';
    document.getElementById('stats').style.display = 'flex';
    
    document.getElementById('currentPlayerTag').textContent = currentPlayer;
    updateDisplay();
}

function hideGameInterface() {
    document.getElementById('currentPlayer').style.display = 'none';
    document.getElementById('onlinePlayers').style.display = 'none';
    document.getElementById('gameSection').style.display = 'none';
    document.getElementById('rollHistory').style.display = 'none';
    document.getElementById('stats').style.display = 'none';
}

function changeDiceType() {
    const selector = document.getElementById('diceSelector');
    currentDiceType = selector.value;
    const dice = document.getElementById('dice');
    const diceInfo = diceTypes[currentDiceType];
    dice.textContent = diceInfo.symbol;
}

function clearScreen() {
    if (confirm('Are you sure you want to clear all roll history?')) {
        gameState.rolls = [];
        saveRoomData();
        broadcastClearHistory();
        updateDisplay();
    }
}

function rollDice() {
    if (!currentPlayer) return;
    
    const dice = document.getElementById('dice');
    const rollButton = document.querySelector('.roll-button');
    
    rollButton.disabled = true;
    dice.classList.add('rolling');
    
    let animationCount = 0;
    const maxSides = diceTypes[currentDiceType].sides;
    const animationInterval = setInterval(() => {
        dice.textContent = Math.floor(Math.random() * maxSides) + 1;
        animationCount++;
        
        if (animationCount >= 8) {
            clearInterval(animationInterval);
            
            const result = Math.floor(Math.random() * maxSides) + 1;
            dice.textContent = result;
            
            // Add roll and broadcast to other players
            const rollData = {
                player: currentPlayer,
                value: result,
                diceType: currentDiceType,
                timestamp: Date.now(),
                isCurrentPlayer: true
            };
            
            gameState.rolls.unshift(rollData);
            saveRoomData();
            broadcastRoll(rollData);
            updateDisplay();
            
            setTimeout(() => {
                dice.classList.remove('rolling');
                rollButton.disabled = false;
                dice.textContent = diceTypes[currentDiceType].symbol;
            }, 1000);
        }
    }, 100);
}

function updateDisplay() {
    updateRollHistory();
    updateStats();
    updateOnlinePlayers();
}

function updateRollHistory() {
    const rollList = document.getElementById('rollList');
    rollList.innerHTML = '';
    
    gameState.rolls.slice(0, 20).forEach(roll => {
        const entry = document.createElement('div');
        entry.className = `roll-entry ${roll.player === currentPlayer ? 'own-roll' : ''}`;
        
        const timeStr = new Date(roll.timestamp).toLocaleTimeString();
        const diceLabel = roll.diceType ? roll.diceType.toUpperCase() : 'D6';
        
        entry.innerHTML = `
            <div>
                <div class="player-name">${roll.player} (${diceLabel})</div>
                <div class="roll-time">${timeStr}</div>
            </div>
            <div class="roll-result">${roll.value}</div>
        `;
        
        rollList.appendChild(entry);
    });
}

function updateStats() {
    const totalRolls = gameState.rolls.length;
    const currentPlayerRolls = gameState.rolls.filter(r => r.player === currentPlayer).length;
    const averageRoll = totalRolls > 0 ? (gameState.rolls.reduce((sum, r) => sum + r.value, 0) / totalRolls).toFixed(1) : 0;
    const onlineCount = Array.from(gameState.players.values()).filter(p => p.isOnline).length;
    
    document.getElementById('totalRolls').textContent = totalRolls;
    document.getElementById('yourRolls').textContent = currentPlayerRolls;
    document.getElementById('averageRoll').textContent = averageRoll;
    document.getElementById('onlineCount').textContent = onlineCount;
}

function updateOnlinePlayers() {
    const container = document.getElementById('onlinePlayers');
    
    // Remove old player tags
    container.querySelectorAll('.player-tag:not(.current)').forEach(tag => tag.remove());
    
    // Add online players
    gameState.players.forEach((player, name) => {
        if (name !== currentPlayer && player.isOnline) {
            const tag = document.createElement('div');
            tag.className = 'player-tag online';
            tag.textContent = name;
            container.appendChild(tag);
        }
    });
}

function saveRoomData() {
    // Save current room state to shared storage
    if (!window.roomData) {
        window.roomData = {};
    }
    
    const playersObj = {};
    gameState.players.forEach((player, name) => {
        playersObj[name] = player;
    });
    
    window.roomData[gameState.roomId] = {
        players: playersObj,
        rolls: gameState.rolls,
        lastUpdate: Date.now()
    };
}

function loadRoomData() {
    // Load room state from shared storage
    if (window.roomData && window.roomData[gameState.roomId]) {
        const roomData = window.roomData[gameState.roomId];
        
        gameState.rolls = roomData.rolls || [];
        
        // Update players but keep current player as online
        gameState.players.clear();
        if (roomData.players) {
            Object.entries(roomData.players).forEach(([name, data]) => {
                gameState.players.set(name, {
                    ...data,
                    isOnline: name === currentPlayer ? true : data.isOnline
                });
            });
        }
        
        // Update current player's last seen time
        if (currentPlayer && gameState.players.has(currentPlayer)) {
            const player = gameState.players.get(currentPlayer);
            player.lastSeen = Date.now();
            player.isOnline = true;
        }
        
        updateDisplay();
    }
}

// Multiplayer communication functions
function broadcastRoll(rollData) {
    console.log(`Roll broadcast: ${rollData.player} rolled ${rollData.value} on ${rollData.diceType}`);
    
    // Trigger custom event for other tabs/windows
    dispatchEvent(new CustomEvent('diceRoll', {
        detail: {
            roomId: gameState.roomId,
            rollData: rollData
        }
    }));
}

function broadcastPlayerJoin(playerName) {
    console.log(`Player ${playerName} joined room ${gameState.roomId}`);
    
    dispatchEvent(new CustomEvent('playerJoin', {
        detail: {
            roomId: gameState.roomId,
            playerName: playerName
        }
    }));
}

function broadcastPlayerLeave(playerName) {
    console.log(`Player ${playerName} left room ${gameState.roomId}`);
    
    dispatchEvent(new CustomEvent('playerLeave', {
        detail: {
            roomId: gameState.roomId,
            playerName: playerName
        }
    }));
}

function broadcastClearHistory() {
    console.log('History cleared by current player');
    
    dispatchEvent(new CustomEvent('clearHistory', {
        detail: {
            roomId: gameState.roomId
        }
    }));
}

// Listen for multiplayer events
addEventListener('diceRoll', function(e) {
    if (e.detail.roomId === gameState.roomId) {
        loadRoomData();
    }
});

addEventListener('playerJoin', function(e) {
    if (e.detail.roomId === gameState.roomId) {
        loadRoomData();
    }
});

addEventListener('playerLeave', function(e) {
    if (e.detail.roomId === gameState.roomId) {
        loadRoomData();
    }
});

addEventListener('clearHistory', function(e) {
    if (e.detail.roomId === gameState.roomId) {
        loadRoomData();
    }
});

function startSyncLoop() {
    syncInterval = setInterval(() => {
        // Sync with shared room data
        lastSyncTime = Date.now();
        
        if (currentPlayer) {
            // Update current player's last seen time
            if (gameState.players.has(currentPlayer)) {
                const player = gameState.players.get(currentPlayer);
                player.lastSeen = Date.now();
                player.isOnline = true;
            }
            
            // Mark players as offline if they haven't been seen recently
            const now = Date.now();
            gameState.players.forEach((player, name) => {
                if (name !== currentPlayer && now - player.lastSeen > 30000) {
                    player.isOnline = false;
                }
            });
            
            saveRoomData();
            loadRoomData();
        }
    }, 5000);
}

// Allow Enter key to set name
document.getElementById('playerName').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        setPlayerName();
    }
});

// Copy room link functionality
document.getElementById('roomLink').addEventListener('click', function() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        const originalText = this.textContent;
        this.textContent = 'Link copied!';
        setTimeout(() => {
            this.textContent = originalText;
        }, 2000);
    });
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (currentPlayer) {
        if (document.hidden) {
            // Mark player as potentially offline
            if (gameState.players.has(currentPlayer)) {
                gameState.players.get(currentPlayer).lastSeen = Date.now();
            }
        } else {
            // Mark player as online when returning to tab
            if (gameState.players.has(currentPlayer)) {
                const player = gameState.players.get(currentPlayer);
                player.lastSeen = Date.now();
                player.isOnline = true;
            }
            saveRoomData();
            loadRoomData();
        }
    }
});

// Handle before unload to mark player as offline
window.addEventListener('beforeunload', function() {
    if (currentPlayer && gameState.players.has(currentPlayer)) {
        gameState.players.get(currentPlayer).isOnline = false;
        saveRoomData();
    }
});
