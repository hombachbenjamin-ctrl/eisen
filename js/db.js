const DB_NAME = 'eisen';
const DB_VERSION = 1;

let connection = null;

function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('kv');
      db.createObjectStore('sessions', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      // iOS can drop the connection while the app sits in the background.
      db.onclose = () => {
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = null;
      reject(request.error);
    };
  });
  return connection;
}

async function run(stores, mode, work, retry = true) {
  const db = await open();
  let tx;
  try {
    tx = db.transaction(stores, mode);
  } catch (error) {
    if (retry && error.name === 'InvalidStateError') {
      connection = null;
      return run(stores, mode, work, false);
    }
    throw error;
  }
  return new Promise((resolve, reject) => {
    const result = work(tx);
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kvGet = (key) => run('kv', 'readonly', (tx) => tx.objectStore('kv').get(key));
export const kvSet = (key, value) => run('kv', 'readwrite', (tx) => tx.objectStore('kv').put(value, key));
export const sessionsAll = () => run('sessions', 'readonly', (tx) => tx.objectStore('sessions').getAll());
export const sessionPut = (session) => run('sessions', 'readwrite', (tx) => tx.objectStore('sessions').put(session));
export const sessionDelete = (id) => run('sessions', 'readwrite', (tx) => tx.objectStore('sessions').delete(id));

export const replaceAll = (entries, sessions) =>
  run(['kv', 'sessions'], 'readwrite', (tx) => {
    const kv = tx.objectStore('kv');
    const store = tx.objectStore('sessions');
    kv.clear();
    store.clear();
    Object.entries(entries).forEach(([key, value]) => kv.put(value, key));
    sessions.forEach((session) => store.put(session));
  });
