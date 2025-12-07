// client.js

// --- Global Variables ---
let localStream;
let peerConnection;
const logElement = document.getElementById('log');
const socket = io(); // Connects to the server

// STUN Server Configuration (required for WebRTC to find public IP addresses)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const roomName = 'always_on_chat_room';

// --- Helper Functions ---

function writeLog(message) {
    const p = document.createElement('p');
    p.textContent = message;
    logElement.appendChild(p);
    logElement.scrollTop = logElement.scrollHeight;
}

// --- Main Action: Join the Room ---

function joinRoom() {
    document.getElementById('joinButton').disabled = true;
    writeLog('Joining room...');
    
    // 1. Request microphone access first
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            localStream = stream;
            document.getElementById('localAudio').srcObject = stream;
            writeLog('✅ Microphone access granted. Voice chat is now active.');

            // 2. Tell the server we are joining
            socket.emit('join', roomName);
            
            // 3. Set up client-side socket listeners
            setupSocketListeners();
        })
        .catch(error => {
            writeLog(`❌ Error accessing microphone: ${error.name}. Please check permissions.`);
            document.getElementById('joinButton').disabled = false;
            console.error('Mic access error:', error);
        });
}

// --- WebRTC Setup Functions ---

function createPeerConnection() {
    writeLog('Creating RTCPeerConnection...');
    peerConnection = new RTCPeerConnection(configuration);

    // 1. Add local audio tracks to the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // 2. Handle remote stream being received
    peerConnection.ontrack = (event) => {
        writeLog('🔊 Remote stream track received! Connection successful.');
        document.getElementById('remoteAudio').srcObject = event.streams[0];
    };
    
    // 3. Gathering ICE Candidates (sends network info to the server for relay)
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                type: 'candidate',
                candidate: event.candidate
            });
        }
    };
    
    // 4. Connection state changes
    peerConnection.oniceconnectionstatechange = (event) => {
        writeLog(`Connection State: ${peerConnection.iceConnectionState}`);
    };
}

function createOffer() {
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            // Send the Offer SDP to the other peer via the server
            socket.emit('signal', {
                type: 'offer',
                sdp: peerConnection.localDescription
            });
            writeLog('Sent Offer to friend.');
        });
}

function createAnswer(offerSdp) {
    peerConnection.setRemoteDescription(offerSdp)
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            // Send the Answer SDP back to the Offer creator via the server
            socket.emit('signal', {
                type: 'answer',
                sdp: peerConnection.localDescription
            });
            writeLog('Sent Answer back to creator.');
        });
}


// --- Socket Listeners (Handles Communication from Server) ---

function setupSocketListeners() {
    socket.on('log', (message) => writeLog(message));

    socket.on('full', () => {
        writeLog('❌ Room is full.');
        document.getElementById('joinButton').disabled = false;
    });

    // Received by the FIRST client: Friend has joined and we need to start the call
    socket.on('ready', () => {
        writeLog('Friend joined! Initiating WebRTC call...');
        createPeerConnection();
        createOffer();
    });
    
    // Event: Friend has left
    socket.on('friend_left', () => {
        writeLog('⚠️ Friend has left the room.');
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        document.getElementById('remoteAudio').srcObject = null;
    });

    // Event: Receiving signaling data (Offer, Answer, Candidate)
    socket.on('signal', async (message) => {
        if (!peerConnection) {
            // The second client creates the PC when they receive the first signal (Offer)
            createPeerConnection();
        }

        try {
            if (message.type === 'offer') {
                writeLog('Received Offer. Creating Answer...');
                await createAnswer(new RTCSessionDescription(message.sdp));
            } else if (message.type === 'answer') {
                writeLog('Received Answer. Completing handshake.');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
            } else if (message.type === 'candidate' && message.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        } catch (e) {
            console.error('Error handling signaling message:', e);
            writeLog('❌ Error processing signaling data.');
        }
    });
}
