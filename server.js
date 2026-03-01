// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// --- Allowed front-end URLs ---
const allowedOrigins = [
  "http://localhost:3000",
  "https://cheery-jalebi-717ac4.netlify.app",
  "https://your-frontend.onrender.com", // replace with your actual front-end Render URL if any
];

// --- CORS middleware ---
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow server-to-server or Postman requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed for origin: " + origin));
  },
  methods: ["GET", "POST"]
}));

// Optional: log incoming requests for debugging
app.use((req, res, next) => {
  console.log("Incoming request origin:", req.headers.origin);
  next();
});

const server = http.createServer(app);

// --- Socket.IO setup ---
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// --- Store users and messages per room ---
const roomsUsers = {};    // { roomId: { socketId: username } }
const roomsMessages = {}; // { roomId: [ { senderName, text } ] }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // --- Join room with username ---
  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!roomsUsers[roomId]) roomsUsers[roomId] = {};
    roomsUsers[roomId][socket.id] = username;

    // Send existing users to new user
    const users = Object.entries(roomsUsers[roomId])
      .filter(([id]) => id !== socket.id)
      .map(([id, name]) => ({ id, username: name }));
    socket.emit("all-users", users);

    // Notify others
    socket.to(roomId).emit("user-joined", { id: socket.id, username });

    // Announce join in chat
    const joinMsg = { senderName: "System", text: `${username} joined the room` };
    if (!roomsMessages[roomId]) roomsMessages[roomId] = [];
    roomsMessages[roomId].push(joinMsg);
    io.in(roomId).emit("chat-message", joinMsg);

    // Send previous chat messages to new user
    roomsMessages[roomId].forEach(msg => socket.emit("chat-message", msg));
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

  // --- Chat messages ---
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

        // Notify others
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

// --- Render-friendly host & port ---
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0"; // required for cloud hosting
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
