// BloodLink Backend - Service: Socket State (Online Users + Live Location Sessions)
const Conversation = require('../models/Conversation');

const onlineUsers = new Map(); // userId -> Set<socketId>
const liveLocationSessions = new Map(); // `${conversationId}:${userId}` -> socketId

const addSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
  return onlineUsers.get(userId).size === 1; // প্রথম connection?
};

const removeSocket = (userId, socketId) => {
  const set = onlineUsers.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(userId);
    return true; // সম্পূর্ণ offline
  }
  return false;
};

const isOnline = (userId) => onlineUsers.has(String(userId));
const getOnlineCount = () => onlineUsers.size;

// Conversation partner-দের online/offline জানানো (privacy: শুধু partners দেখবে)
const notifyPartnersStatus = async (io, userId, online) => {
  const convos = await Conversation.find({ participants: userId }).select('participants').lean();
  const partners = new Set();
  convos.forEach((c) =>
    c.participants.forEach((p) => {
      if (String(p) !== String(userId)) partners.add(String(p));
    })
  );
  const event = online ? 'user:online' : 'user:offline';
  partners.forEach((pid) => io.to(`user:${pid}`).emit(event, { userId }));
};

// ---------- Live Location Sessions ----------
const startLocationSession = (conversationId, userId) =>
  liveLocationSessions.set(`${conversationId}:${userId}`, true);

const hasLocationSession = (conversationId, userId) =>
  liveLocationSessions.has(`${conversationId}:${userId}`);

const stopLocationSession = (conversationId, userId) =>
  liveLocationSessions.delete(`${conversationId}:${userId}`);

const stopAllLocationSessionsForUser = (userId) => {
  const stopped = [];
  for (const key of liveLocationSessions.keys()) {
    if (key.endsWith(`:${userId}`)) {
      stopped.push(key.split(':')[0]); // conversationId
      liveLocationSessions.delete(key);
    }
  }
  return stopped;
};

// Lazy getIO — circular import এড়াতে
const emitToUser = (userId, event, payload) => {
  try {
    const { getIO } = require('../sockets');
    getIO().to(`user:${userId}`).emit(event, payload);
    return true;
  } catch {
    return false;
  }
};

// Blood Request real-time status updates (§৮) — requester + responders সবাই পাবে
const emitRequestUpdate = (userIds, payload) => {
  [...new Set(userIds.map(String))].forEach((id) => emitToUser(id, 'request:update', payload));
};

module.exports = {
  addSocket,
  removeSocket,
  isOnline,
  getOnlineCount,
  notifyPartnersStatus,
  startLocationSession,
  hasLocationSession,
  stopLocationSession,
  stopAllLocationSessionsForUser,
  emitToUser,
  emitRequestUpdate,
};
