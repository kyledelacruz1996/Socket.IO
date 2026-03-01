<template>
  <v-container fluid>
    <!-- Username -->
    <v-row v-if="!username">
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Enter Username</v-card-title>
          <v-card-text>
            <v-text-field v-model="tempUsername" label="Username"></v-text-field>
          </v-card-text>
          <v-card-actions>
            <v-btn color="primary" @click="setUsername">Join</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Video + Chat -->
    <v-row v-else>
      <!-- Video -->
      <v-col cols="12" md="8">
        <v-row>
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title>You ({{ username }})</v-card-title>
              <video ref="localVideo" autoplay muted playsinline width="100%"></video>
            </v-card>
          </v-col>

          <v-col v-for="(stream, id) in remoteStreams" :key="id" cols="12" md="6">
            <v-card>
              <v-card-title>{{ usernames[id] || id }}</v-card-title>
              <video :ref="el => setRemoteVideo(el, id)" autoplay playsinline width="100%"></video>
            </v-card>
          </v-col>
        </v-row>

        <v-row class="mt-4">
          <v-btn color="error" @click="endCall">End Call</v-btn>
        </v-row>
      </v-col>

      <!-- Chat -->
      <v-col cols="12" md="4">
        <v-card height="100%">
          <v-card-title>Team Chat</v-card-title>
          <v-card-text class="chat-box" style="height:400px;overflow-y:auto" ref="chatBox">
            <div v-for="(msg, i) in messages" :key="i">
              <strong v-if="msg.senderName !== 'System'">{{ msg.senderName }}:</strong>
              <em v-else>{{ msg.text }}</em>
              <span v-if="msg.senderName !== 'System'"> {{ msg.text }}</span>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-text-field
              v-model="chatInput"
              label="Type a message"
              dense
              hide-details
              @keyup.enter="sendMessage"
            ></v-text-field>
            <v-btn color="primary" @click="sendMessage">Send</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, reactive, nextTick } from "vue";
import { io } from "socket.io-client";

const SERVER_IP = "192.168.1.16"; // replace with your LAN IP
const SERVER_PORT = 3001;
const socket = io(`http://${SERVER_IP}:${SERVER_PORT}`);
const roomId = "room1";

const tempUsername = ref("");
const username = ref("");

const localVideo = ref(null);
const remoteStreams = reactive({});
const peers = {};
const usernames = reactive({});
let localStream;

const messages = reactive([]);
const chatInput = ref("");

const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- Username ---
function setUsername() {
  if (!tempUsername.value.trim()) return;
  username.value = tempUsername.value.trim();
  joinRoom();
}

// --- Join room ---
async function joinRoom() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ video:true,audio:true });
    localVideo.value.srcObject = localStream;
  }
  socket.emit("join-room", { roomId, username: username.value });
}

// --- Socket events ---
socket.on("all-users", async (users) => {
  for (const user of users) {
    await createPeer(user.id, true);
    usernames[user.id] = user.username;
  }
});

socket.on("user-joined", async (user) => {
  await createPeer(user.id, false);
  usernames[user.id] = user.username;
});

socket.on("offer", async ({ offer, sender }) => {
  if (!peers[sender]) await createPeer(sender, false);
  await peers[sender].setRemoteDescription(offer);
  const answer = await peers[sender].createAnswer();
  await peers[sender].setLocalDescription(answer);
  socket.emit("answer", { target: sender, answer });
});

socket.on("answer", async ({ answer, sender }) => {
  if (peers[sender]) await peers[sender].setRemoteDescription(answer);
});

socket.on("ice-candidate", async ({ candidate, sender }) => {
  if (peers[sender]) await peers[sender].addIceCandidate(candidate);
});

socket.on("user-left", ({ id }) => {
  peers[id]?.close();
  delete peers[id];
  delete remoteStreams[id];
  delete usernames[id];
});

// Chat
socket.on("chat-message", ({ senderName, text }) => {
  messages.push({ senderName, text });
  nextTick(() => scrollChatToBottom());
});

const chatBox = ref(null);
function scrollChatToBottom() {
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
}

// --- Create Peer ---
async function createPeer(userId, initiator) {
  if (peers[userId]) return;

  const peer = new RTCPeerConnection(servers);
  peers[userId] = peer;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.ontrack = (event) => { remoteStreams[userId] = event.streams[0]; };

  peer.onicecandidate = (event) => {
    if (event.candidate) socket.emit("ice-candidate", { target:userId, candidate:event.candidate });
  };

  if (initiator) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { target:userId, offer });
  }
}

// --- Set video ---
function setRemoteVideo(el,id){ if(!el || !remoteStreams[id]) return; el.srcObject = remoteStreams[id]; }

// --- Send Chat ---
function sendMessage() {
  if (!chatInput.value.trim()) return;
  socket.emit("chat-message", { roomId, text: chatInput.value, senderName: username.value });
  messages.push({ senderName:"You", text:chatInput.value });
  chatInput.value = "";
  nextTick(()=>scrollChatToBottom());
}

// --- End Call ---
function endCall() {
  Object.values(peers).forEach(peer => peer.close());
  localStream?.getTracks().forEach(track => track.stop());
  localStream = null;
  for (const id in remoteStreams) delete remoteStreams[id];
  Object.keys(peers).forEach(id => delete peers[id]);
}

socket.on("connect", ()=>console.log("Connected:",socket.id));
</script>
