const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// In-memory store, keyed by room id.
// rooms[roomId] = { strokes: [ {id, userId, color, size, points:[{x,y}]} ], users: Map(socketId -> {name, color}) }
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { strokes: [], users: new Map() };
  }
  return rooms[roomId];
}

function roomUserCount(roomId) {
  return rooms[roomId] ? rooms[roomId].users.size : 0;
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ room, name, color }) => {
    currentRoom = room || 'default';
    socket.join(currentRoom);

    const r = getRoom(currentRoom);
    r.users.set(socket.id, { name: name || 'Guest', color: color || '#333333' });

    // Send existing drawing state to the newly joined client
    socket.emit('canvas-state', r.strokes);

    io.to(currentRoom).emit('user-count', roomUserCount(currentRoom));
    socket.to(currentRoom).emit('user-joined', { name: name || 'Guest' });
  });

  socket.on('draw-start', (stroke) => {
    if (!currentRoom) return;
    const r = getRoom(currentRoom);
    r.strokes.push({ ...stroke, userId: socket.id, points: [stroke.point] });
    socket.to(currentRoom).emit('draw-start', { ...stroke, userId: socket.id });
  });

  socket.on('draw-move', ({ id, point }) => {
    if (!currentRoom) return;
    const r = getRoom(currentRoom);
    const stroke = r.strokes.find((s) => s.id === id);
    if (stroke) stroke.points.push(point);
    socket.to(currentRoom).emit('draw-move', { id, point, userId: socket.id });
  });

  socket.on('draw-end', ({ id }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('draw-end', { id, userId: socket.id });
  });

  socket.on('cursor-move', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('cursor-move', { ...data, userId: socket.id });
  });

  socket.on('clear-canvas', () => {
    if (!currentRoom) return;
    const r = getRoom(currentRoom);
    r.strokes = [];
    io.to(currentRoom).emit('clear-canvas');
  });

  socket.on('restore-board', (strokes) => {
    if (!currentRoom || !Array.isArray(strokes)) return;
    const r = getRoom(currentRoom);
    r.strokes = strokes;
    io.to(currentRoom).emit('canvas-state', r.strokes);
  });

  socket.on('undo-last', () => {
    if (!currentRoom) return;
    const r = getRoom(currentRoom);
    // Remove the most recent stroke made by this socket
    for (let i = r.strokes.length - 1; i >= 0; i--) {
      if (r.strokes[i].userId === socket.id) {
        r.strokes.splice(i, 1);
        break;
      }
    }
    io.to(currentRoom).emit('canvas-state', r.strokes);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const r = rooms[currentRoom];
    if (!r) return;
    const user = r.users.get(socket.id);
    r.users.delete(socket.id);
    io.to(currentRoom).emit('user-count', roomUserCount(currentRoom));
    if (user) {
      socket.to(currentRoom).emit('user-left', { name: user.name });
    }
    socket.to(currentRoom).emit('cursor-remove', { userId: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`Whiteboard server running on port ${PORT}`);
});
