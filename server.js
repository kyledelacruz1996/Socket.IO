// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const os = require("os");

const app = express();

// CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        origin === "http://localhost:3000" ||
        origin.endsWith(".netlify.app")
      )
        return callback(null, true);
      return callback(new Error("CORS not allowed for this origin"));
    },
    methods: ["GET", "POST"],
  })
);

const server = http.createServer(app);

// Auto-detect LAN IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "0.0.0.0";
}

const HOST = getLocalIP();
const PORT = process.env.PORT || 3001;

// Store users and messages per room
const roomsUsers = {};    // { roomId: { socketId: username } }
const roomsMessages = {}; // { roomId: [ { senderName, text } ] }

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        origin === "http://localhost:3000" ||
        origin.endsWith(".netlify.app")
      )
        return callback(null, true);
      return callback(new Error("CORS not allowed for this origin"));
    },
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // --- Join room with username ---
  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!roomsUsers[roomId]) roomsUsers[roomId] = {};
    roomsUsers[roomId][socket.id] = username;

    // Send existing users to new user
    const users = [];
    for (const [id, name] of Object.entries(roomsUsers[roomId])) {
      if (id !== socket.id) users.push({ id, username: name });
    }
    socket.emit("all-users", users);

    // Notify others
    socket.to(roomId).emit("user-joined", { id: socket.id, username });

    // --- Announce join in chat ---
    const joinMsg = { senderName: "System", text: `${username} joined the room` };
    if (!roomsMessages[roomId]) roomsMessages[roomId] = [];
    roomsMessages[roomId].push(joinMsg);
    io.in(roomId).emit("chat-message", joinMsg);

    // Send previous chat messages
    if (roomsMessages[roomId]) {
      roomsMessages[roomId].forEach((msg) => socket.emit("chat-message", msg));
    }
  });

  // --- WebRTC signaling ---
  socket.on("offer", ({ target, offer }) =>
    io.to(target).emit("offer", { offer, sender: socket.id })
  );
  socket.on("answer", ({ target, answer }) =>
    io.to(target).emit("answer", { answer, sender: socket.id })
  );
  socket.on("ice-candidate", ({ target, candidate }) =>
    io.to(target).emit("ice-candidate", { candidate, sender: socket.id })
  );

  // --- Chat ---
  socket.on("chat-message", ({ roomId, text, senderName }) => {
    const msg = { senderName, text };
    if (!roomsMessages[roomId]) roomsMessages[roomId] = [];
    roomsMessages[roomId].push(msg);
    io.in(roomId).emit("chat-message", msg);
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    for (const [roomId, users] of Object.entries(roomsUsers)) {
      if (users[socket.id]) {
        const username = users[socket.id];
        delete users[socket.id];

        // Notify others in room
        socket.to(roomId).emit("user-left", { id: socket.id, username });

        // Announce in chat
        const leaveMsg = { senderName: "System", text: `${username} left the room` };
        if (!roomsMessages[roomId]) roomsMessages[roomId] = [];
        roomsMessages[roomId].push(leaveMsg);
        io.in(roomId).emit("chat-message", leaveMsg);
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
