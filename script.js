// Firebase configuration - You need to replace this with your own Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAnn_i7Qxvb0Qbm8Ls6yiJMXT90aTqzRBE",
  authDomain: "diceroll-d6e74.firebaseapp.com",
  projectId: "diceroll-d6e74",
  storageBucket: "diceroll-d6e74.firebasestorage.app",
  messagingSenderId: "242850666678",
  appId: "1:242850666678:web:19cd214746f76077e9ae17"
};

// Initialize Firebase (will be done when Firebase is loaded)
let database = null;
let roomRef = null;

// Multiplayer game state
let gameState = {
    players: new Map(),
    rolls: [],
    roomId: null,
    isHost: false
};

let currentPlayer = null;
let currentDiceType = 'd6';
let connectionStatus = 'disconnected';
let firebaseLoaded = false;

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
    loadFirebaseAndInitialize();
});

function loadFirebaseAndInitialize() {
    // Load Firebase scripts
    const script1 = document.createElement('script');
    script1.src = 'https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js';
    script1.onload = function() {
        const script2 = document.createElement('script');
        script2.src = 'https://www.gstatic.com/firebasejs/9.0.0/firebase-database-compat.js';
        script2.onload = function() {
            initializeFirebase();
        };
        document.head.appendChild(script2);
    };
    document.head.appendChild(script1);
}

function initializeFirebase() {
    try {
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        firebaseLoaded = true;
        
        updateConnectionStatus('connected');
        initializeGame();
    } catch (error) {
        console.error('Firebase initialization error:', error);
        // Fallback to localStorage for same-device multiplayer
        updateConnectionStatus('local-mode');
        initializeGameWithLocalStorage();
    }
}

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

    // Initialize Firebase room reference
    if (firebaseLoaded && database) {
        roomRef = database.ref(`rooms/${gameState.roomId}`);
        setupFirebaseListeners();
    }

    // Show UI
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'block';
        document.getElementById('playerSetup').style.display = 'flex';
        document.getElementById('playerName').focus();
    }, 1000);
}

function initializeGameWithLocalStorage() {
    // Fallback initialization with localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam) {
        gameState.roomId = roomParam;
        gameState.isHost = false;
    } else {
        gameState.roomId = generateRoomId();
        gameState.isHost = true;
        window.history.replaceState({}, '', `?room=${gameState.roomId}`);
    }

    document.getElementById('roomId').textContent = gameState.roomId;
    document.getElementById('roomLink').textContent = window.location.href;

    // Setup localStorage listeners
    setupLocalStorageListeners();

    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'block';
        document.getElementById('playerSetup').style.display = 'flex';
        document.getElementById('playerName').focus();
    }, 1000);
}

function setupFirebaseListeners() {
    if (!roomRef) return;

    // Listen for room data changes
    roomRef.on('value', (snapshot) => {
        const roomData = snapshot.val();
        if (roomData) {
            // Update game state
            gameState.rolls = roomData.rolls || [];
            
            // Update players
            gameState.players.clear();
            if (roomData.players) {
                Object.entries(roomData.players).forEach(([name, data]) => {
                    gameState.players.set(name, data);
                });
            }
            
            updateDisplay();
        }
    });

    // Keep connection alive
    setInterval(() => {
        if (currentPlayer && roomRef) {
            roomRef.child(`players/${currentPlayer}/lastSeen`).set(Date.now());
        }
    }, 5000);
}

function setupLocalStorageListeners() {
    // Fallback for localStorage
    window.addEventListener('storage', function(e) {
        if (e.key === `diceGame_${gameState.roomId}`) {
            loadLocalRoomData();
        }
    });

    // Sync loop for localStorage
    setInterval(() => {
        if (currentPlayer) {
            updateLocalPlayerStatus();
            loadLocalRoomData();
        }
    }, 3000);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateConnectionStatus(status) {
    connectionStatus = status;
    const statusEl = document.getElementById('connectionStatus');
    
    if (status === 'connected') {
        statusEl.textContent = '🟢 Connected (Real-time)';
        statusEl.className = 'connection-status connected';
    } else if (status === 'local-mode') {
        statusEl.textContent = '🟡 Local Mode (Same Device Only)';
        statusEl.className = 'connection-status local-mode';
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
        const playerData = {
            name: name,
            joinTime: Date.now(),
            lastSeen: Date.now(),
            isOnline: true
        };
        
        gameState.players.set(name, playerData);
        
        // Save to Firebase or localStorage
        if (firebaseLoaded && roomRef) {
            roomRef.child(`players/${name}`).set(playerData);
        } else {
            saveLocalRoomData();
        }
        
        showGameInterface();
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        if (currentPlayer) {
            // Mark player as offline
            if (firebaseLoaded && roomRef) {
                roomRef.child(`players/${currentPlayer}/isOnline`).set(false);
            } else {
                if (gameState.players.has(currentPlayer)) {
                    gameState.players.get(currentPlayer).isOnline = false;
                }
                saveLocalRoomData();
            }
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
        
        if (firebaseLoaded && roomRef) {
            roomRef.child('rolls').remove();
        } else {
            saveLocalRoomData();
        }
        
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
            
            // Add roll data
            const rollData = {
                player: currentPlayer,
                value: result,
                diceType: currentDiceType,
                timestamp: Date.now()
            };
            
            // Save to Firebase or localStorage
            if (firebaseLoaded && roomRef) {
                roomRef.child('rolls').push(rollData);
            } else {
                gameState.rolls.unshift(rollData);
                saveLocalRoomData();
                updateDisplay();
            }
            
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
    
    // Sort rolls by timestamp (newest first)
    const sortedRolls = [...gameState.rolls].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedRolls.slice(0, 20).forEach(roll => {
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

// LocalStorage fallback functions
function saveLocalRoomData() {
    const storageKey = `diceGame_${gameState.roomId}`;
    const playersObj = {};
    gameState.players.forEach((player, name) => {
        playersObj[name] = player;
    });
    
    const roomData = {
        players: playersObj,
        rolls: gameState.rolls,
        lastUpdate: Date.now()
    };
    
    try {
        localStorage.setItem(storageKey, JSON.stringify(roomData));
    } catch (e) {
        console.error('Error saving room data:', e);
    }
}

function loadLocalRoomData() {
    const storageKey = `diceGame_${gameState.roomId}`;
    try {
        const existingData = localStorage.getItem(storageKey);
        if (existingData) {
            const roomData = JSON.parse(existingData);
            gameState.rolls = roomData.rolls || [];
            
            gameState.players.clear();
            if (roomData.players) {
                Object.entries(roomData.players).forEach(([name, data]) => {
                    gameState.players.set(name, data);
                });
            }
            
            updateDisplay();
        }
    } catch (e) {
        console.error('Error loading room data:', e);
    }
}

function updateLocalPlayerStatus() {
    if (currentPlayer && gameState.players.has(currentPlayer)) {
        const player = gameState.players.get(currentPlayer);
        player.lastSeen = Date.now();
        player.isOnline = true;
        
        // Mark other players as offline if not seen recently
        const now = Date.now();
        gameState.players.forEach((p, name) => {
            if (name !== currentPlayer && now - p.lastSeen > 30000) {
                p.isOnline = false;
            }
        });
        
        saveLocalRoomData();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
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
        }).catch(() => {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = window.location.href;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            const originalText = this.textContent;
            this.textContent = 'Link copied!';
            setTimeout(() => {
                this.textContent = originalText;
            }, 2000);
        });
    });
});

// Handle page visibility and unload
document.addEventListener('visibilitychange', function() {
    if (currentPlayer && !document.hidden) {
        if (firebaseLoaded && roomRef) {
            roomRef.child(`players/${currentPlayer}/lastSeen`).set(Date.now());
        }
    }
});

window.addEventListener('beforeunload', function() {
    if (currentPlayer) {
        if (firebaseLoaded && roomRef) {
            roomRef.child(`players/${currentPlayer}/isOnline`).set(false);
        }
    }
});
