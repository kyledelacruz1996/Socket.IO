// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// CORS config: allow any Netlify site
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    if (origin.endsWith(".netlify.app")) return callback(null, true);
    return callback(new Error("CORS not allowed for this origin"));
  },
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);

// Use dynamic port (Railway or fallback)
const PORT = process.env.PORT || 3001;

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.endsWith(".netlify.app")) return callback(null, true);
      return callback(new Error("CORS not allowed for this origin"));
    },
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    const users = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    socket.emit("all-users", users.filter(id => id !== socket.id));
    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("offer", ({ target, offer }) => {
    io.to(target).emit("offer", { offer, sender: socket.id });
  });

  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer", { answer, sender: socket.id });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { candidate, sender: socket.id });
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("user-left", socket.id);
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
