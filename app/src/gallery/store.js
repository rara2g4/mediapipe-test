function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

export function createTemporaryCaptureStore({ dbName, storeName, logger = console }) {
  let databasePromise = null;

  function openDatabase() {
    if (!isIndexedDbAvailable()) {
      return Promise.resolve(null);
    }

    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "id" });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((error) => {
        logger.error(error);
        return null;
      });
    }

    return databasePromise;
  }

  async function readAll(fallbackCaptures = []) {
    const database = await openDatabase();
    if (!database) {
      return [...fallbackCaptures];
    }

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const captures = [...request.result].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        resolve(captures);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      logger.error(error);
      return [...fallbackCaptures];
    });
  }

  async function save(capture) {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(capture);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      logger.error(error);
    });
  }

  async function remove(captureId) {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(captureId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      logger.error(error);
    });
  }

  return {
    readAll,
    save,
    remove,
  };
}
