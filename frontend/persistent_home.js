// Link with --pre-js (n64recomp_browser_frontend does): keeps HOME, /home/web_user, in the browser's IndexedDB, so what a
// recomp writes there outlives the page. RecompFrontend's app folder is HOME/.config/<program id>: the settings, the
// saves, and the ROM the player picked (recomp::select_rom stores a copy there), which never leaves the browser.
//
// IndexedDB is asynchronous and the file system the program sees is not, so the folder is read in before main() runs,
// and written back every two seconds and when the page is hidden or closed. Only files that changed since are written.
// A crash or a closed tab loses at most the last two seconds.
//
// IndexedDB belongs to the origin, and every game's page on a host is one origin (the hub's folders), so each page
// keeps HOME in a database of its own, named after its folder on the site. IDBFS names one after the mount point, which
// made one database of every page's HOME: each boot read every game's files in, ROM copies included, and each write back
// mirrored the whole folder, so a page in another tab deleted what a second game had stored since it booted. A page whose
// own database is empty reads that shared one in once, keeps only the folders the program opens a file in (a child of
// HOME, or of a folder in HOME whose name starts with a dot, as .config/<program id>), and once they are stored in its
// own database deletes them from the shared one, and the shared one once no other game's files are left in it.
//
// IndexedDB serializes what it stores on the thread that stores it, and that is the page's thread, WebGPU's: a 64 MB ROM
// took 120 ms there in Chrome, a present held back as long. So a file of 1 MB or more is stored by a worker of its own,
// given a copy (~20 ms for 64 MB), in the same form, and the next write back waits until the worker has stored it.
//
// The program's threads reach these files through calls the page's thread runs between its own tasks, so a write back
// lists HOME only once IndexedDB has answered what it holds, and reads each file it stores in the same task. IDBFS lists
// first, and a save finishing while IndexedDB answered (the runtime writes <save>.temp, copies it over the save and
// deletes it) left a file listed that was gone when it was read: that write back reported ENOENT, while storing all the
// rest.
//
// A browser may delete an origin's IndexedDB to make room, and Safari deletes it after 7 days without a visit, so once
// HOME holds something (read in, or a ROM stored) the page asks for it to be kept (navigator.storage.persist(), which
// covers every page on the origin): Chrome and Safari decide by themselves, Firefox asks the player once.
// Module.homeRead resolves once HOME is read in, true, or false where it couldn't be (save_sync.js waits for it).
if (typeof document !== 'undefined') {
  Module['preRun'] = [].concat(Module['preRun'] || []);
  Module['preRun'].push(() => {
    const home = '/home/web_user';
    const database = home + ' ' + location.pathname.replace(/[^/]*$/, ''), shared = home;
    let source = database;
    const getDB = IDBFS.getDB;
    IDBFS.getDB = (name, callback) => getDB(name === home ? source : name, callback);
    IDBFS.syncfs = (mount, populate, callback) => IDBFS.getRemoteSet(mount, (error, remote) => {
      if (error) return callback(error);
      IDBFS.getLocalSet(mount, (error, local) => {
        if (error) return callback(error);
        IDBFS.reconcile(populate ? remote : local, populate ? local : remote, callback);
      });
    });
    // An error as words: IDBFS hands back an FS.ErrnoError (a name and an errno, 44 is ENOENT) or a DOMException.
    const describe = (error) => error && typeof error === 'object'
      ? [error.name, error.message, 'errno' in error && 'errno ' + error.errno].filter(Boolean).join(', ')
      : String(error);

    // The folder a path in HOME is kept by: HOME/<name>, or HOME/.<name>/<name>. None for HOME and its dot folders.
    const folderOf = (path) => {
      const parts = path.slice(home.length + 1).split('/');
      if (!path.startsWith(home + '/') || (parts[0].startsWith('.') && parts.length < 2)) return null;
      return home + '/' + parts.slice(0, parts[0].startsWith('.') ? 2 : 1).join('/');
    };
    // While a page moves out of the shared database: the folders the program opened a file in, which alone are written
    // to its own (with the dot folders holding them), those of them written so far, and how many of those are deleted
    // from the shared one (null once it is gone).
    let opened = null, written = new Set(), forgotten = 0;
    const moveOut = () => {
      opened = new Set();
      const open = FS.open;
      FS.open = (path, ...rest) => {
        const folder = typeof path === 'string' && folderOf(path);
        if (folder) opened.add(folder);
        return open(path, ...rest);
      };
      const getLocalSet = IDBFS.getLocalSet;
      IDBFS.getLocalSet = (mount, callback) => getLocalSet(mount, (error, set) => {
        if (!error) {
          written = new Set(opened);
          for (const path in set.entries) {
            const folder = folderOf(path);
            if (folder ? !written.has(folder) : ![...written].some((f) => f.startsWith(path + '/'))) {
              delete set.entries[path];
            }
          }
        }
        callback(error, set);
      });
    };
    // Deletes the folders written to the page's own database from the shared one, and that once nothing else is in it.
    const forget = () => getDB(shared, (error, db) => {
      if (error || forgotten === null) return;
      forgotten = written.size;
      const transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(IDBFS.DB_STORE_NAME);
      for (const folder of written) {
        store.delete(folder);
        store.delete(IDBKeyRange.bound(folder + '/', folder + '/￿'));
      }
      const keys = store.getAllKeys();
      transaction.oncomplete = () => {
        if (!keys.result.some(folderOf)) {
          forgotten = null;
          db.close();
          delete IDBFS.dbs[shared];
          indexedDB.deleteDatabase(shared);
        }
      };
    });

    FS.mkdirTree(home);
    FS.mount(IDBFS, { autoPersist: false }, home);
    // Writing back only starts once the folder has been read in: a write is a mirror of the folder, so one made
    // before then (a large ROM takes seconds to read) would delete everything not read in yet.
    let syncing = true, again = false;
    // The worker that stores the large files, and the stores it hasn't answered yet (resolved when it does).
    let writer = null, nextWrite = 0;
    const answers = new Map(), writing = [];
    let kept = false;
    const keep = () => {
      if (kept || !navigator.storage?.persist) return;
      kept = true;
      navigator.storage.persisted().then((persisted) => persisted || navigator.storage.persist())
        .catch((error) => console.log('persistent storage refused: ' + describe(error)));
    };
    const storeRemoteEntry = IDBFS.storeRemoteEntry;
    IDBFS.storeRemoteEntry = (store, path, entry, callback) => {
      const contents = entry['contents'];
      if (!contents || contents.byteLength < (1 << 20)) {
        return storeRemoteEntry(store, path, entry, callback);
      }
      keep();
      if (!writer) {
        const code = `const connections = {};
          onmessage = ({ data: { id, db, store, path, entry } }) => {
            connections[db] ??= new Promise((resolve, reject) => {
              const open = indexedDB.open(db);
              open.onsuccess = () => resolve(open.result);
              open.onerror = () => reject(open.error);
            });
            connections[db].then((connection) => new Promise((resolve, reject) => {
              const transaction = connection.transaction([store], 'readwrite');
              transaction.objectStore(store).put(entry, path);
              transaction.oncomplete = resolve;
              transaction.onerror = transaction.onabort = () => reject(transaction.error);
            })).then(() => postMessage({ id }),
                     (error) => postMessage({ id, path, error: error ? error.name + ', ' + error.message : 'aborted' }));
          };`;
        writer = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        writer.onmessage = ({ data: { id, path, error } }) => {
          if (error) {
            // Not stored, so the next write back stores it again.
            console.error('Could not save ' + path + ' to IndexedDB: ' + error);
          }
          answers.get(id)(!error);
          answers.delete(id);
        };
      }
      const id = nextWrite++, copy = contents.slice();
      writing.push(new Promise((resolve) => answers.set(id, resolve)));
      writer.postMessage({ id, db: store.transaction.db.name, store: store.name, path, entry: { ...entry, 'contents': copy } },
                         [copy.buffer]);
      callback();
    };
    addRunDependency('persistent-home');
    let homeRead;
    Module.homeRead = new Promise((resolve) => homeRead = resolve);
    const read = (error) => {
      if (error) {
        // Never written back then, so what is stored is not replaced with an empty folder.
        console.error('Could not read the saved files from IndexedDB, so nothing is saved this time: ' + describe(error));
      } else {
        syncing = false;
        if (FS.readdir(home).length > 2) keep();
      }
      source = database;
      homeRead(!error);
      removeRunDependency('persistent-home');
    };
    FS.syncfs(true, (error) => {
      if (error || FS.readdir(home).length > 2) return read(error);
      // Its own database is empty: the shared one, if there is one, is read in.
      (indexedDB.databases ? indexedDB.databases() : Promise.resolve([{ name: shared }])).then((databases) => {
        if (!databases.some((d) => d.name === shared)) return read();
        source = shared;
        FS.syncfs(true, (error) => {
          if (!error) moveOut();
          read(error);
        });
      }, () => read());
    });

    const save = () => {
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      FS.syncfs(false, (error) => {
        if (error) {
          // The next write back stores whatever this one didn't: it compares the files with what IndexedDB holds.
          console.error('Could not save files to IndexedDB: ' + describe(error));
        }
        // The shared database keeps a folder until the worker has stored its large files in the page's own too.
        Promise.all(writing.splice(0)).then((stored) => {
          if (!error && stored.every(Boolean) && forgotten !== null && written.size > forgotten) {
            forget();
          }
          syncing = false;
          if (again) {
            again = false;
            save();
          }
        });
      });
    };
    setInterval(save, 2000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        save();
      }
    });
    addEventListener('pagehide', save);
  });
}
