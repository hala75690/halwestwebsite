// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Serve the HTML and client-side JavaScript files
app.use(express.static(__dirname));

const ROOM_ID = 'always_on_chat_room'; // Fixed room name for simplicity

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle user joining the room
    socket.on('join', () => {
        const room = io.sockets.adapter.rooms.get(ROOM_ID);
        const numClients = room ? room.size : 0;
        
        console.log(`Clients in room ${ROOM_ID}: ${numClients}`);
        
        if (numClients === 0) {
            // First person joins (Creator)
            socket.join(ROOM_ID);
            console.log(`User ${socket.id} created the room.`);
            socket.emit('log', 'You created the room. Waiting for friend to join...');
        } else if (numClients === 1) {
            // Second person joins (Joiner)
            socket.join(ROOM_ID);
            console.log(`User ${socket.id} joined the room. Start signaling.`);
            socket.emit('log', 'Friend joined. Starting connection...');
            
            // Tell the first client (Creator) that a friend has joined, initiating the call
            socket.to(ROOM_ID).emit('ready');
        } else {
            // Room is full
            socket.emit('full');
            socket.emit('log', 'Room is full.');
        }
    });

    // Handle signaling data (Offers, Answers, and ICE Candidates)
    socket.on('signal', (message) => {
        // Relay the message to the other client in the room
        socket.to(ROOM_ID).emit('signal', message);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Notify the remaining user that their friend has left
        socket.to(ROOM_ID).emit('friend_left');
    });
});

server.listen(port, () => {
    console.log(`🚀 Voice Chat Server running at http://localhost:${port}`);
    console.log('Open this URL in two separate browser tabs/windows to test.');
});
