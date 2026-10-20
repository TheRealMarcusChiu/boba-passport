import './styles.css';
import { mountApp } from './ui/app.js';

let storage;
try {
  storage = window.localStorage;
} catch {
  // Some privacy modes throw on access; fall back to a session-only store so the UI still works.
  const memory = new Map();
  storage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
}

mountApp(document.getElementById('app'), { storage });
