// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const os = require("os");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Get LAN IP automatically
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
const PORT = 3001;

const io = new Server(server, { cors: { origin: "*" } });

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

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});