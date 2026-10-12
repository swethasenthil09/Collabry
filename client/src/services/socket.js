import { io } from 'socket.io-client';

const resolveSocketUrl = () => {
  let url = import.meta.env.VITE_SOCKET_URL;
  if (!url) {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:5000';
    }
    return 'https://collabry-server.onrender.com';
  }
  return url.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
};

const SOCKET_URL = resolveSocketUrl();

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (token) {
      return connectSocket(token);
    }
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
