// Keeps a player's saves in their own Google Drive, in the app's hidden folder there (the drive.appdata scope, which
// sees nothing else of the Drive), so they follow the player to another browser or device. Optional: nothing happens
// until the player signs in on the hub (site/site.js), which keeps the access token in localStorage, the origin's, so
// every game's page on the hub finds it. A page linked with n64recomp_browser_frontend (--pre-js, after
// persistent_home.js) syncs; the hub loads this file too (tools/publish_site.sh copies it) and uploads the saves a
// browser already has when the player signs in.
//
// What syncs: the runtime's save files, HOME/.config/<program id>/saves/... (N64ModernRuntime's pi.cpp), named in the
// Drive by their path under HOME, so a game's saves are the same file on every device. Never their .temp and .bak, and
// never a file of 1 MB or more: an N64 save is 128 KB at most, and the stored ROM, which never leaves the browser, is
// in the same folder.
//
// Each file is compared three ways: what this browser holds, what the Drive holds (a SHA-256 in the file's
// appProperties), and what the two held when they last agreed (localStorage, this browser's own). Only one side
// changed: it goes to the other. Both did (two devices played offline): the newer one wins at the next start, and the
// other is kept in the Drive beside it, <path>.conflict-<time>, a copy the hub lists and can make the save again, so
// nothing is lost.
//
// A browser that never synced a game's saves and holds others than the Drive's (a second device signing in) can't be
// settled by the times: a game may write a fresh save on its first start (GoldenEye does), newer than the player's
// progress elsewhere. So a sign-in holds that game (held, in localStorage): nothing of its saves goes up or comes down,
// on the hub or in its page, until the player keeps this browser's or the Drive's on the hub. One the hub didn't see
// (written since, or in a database it couldn't read) loses to the Drive at its page's start, kept as a copy the same way.
//
// A page pulls before main() runs, after persistent_home.js has read HOME in: the runtime reads a save once, when the
// game starts, so one written later would be overwritten by the game's next save. A pull that takes more than 8 s is
// given up, and the game starts with what the browser holds. While the game runs, a save it writes goes up within
// 10 s; one missed (the tab closed first, or the token ran out) goes up at the next start.
//
// The token is Google's for a browser app (the implicit flow, no server here): an hour long, with no refresh token.
// The hub gets a new one without asking the player when it loads with an old one, by going to Google and back with
// prompt=none, and a page opened on its own with an old one goes to the hub for it first (shell.html). A page in the
// hub's frame uses the hub's.
const SaveSync = (() => {
  const key = 'save-sync', drive = 'https://www.googleapis.com/drive/v3/files',
        upload = 'https://www.googleapis.com/upload/drive/v3/files';
  const stored = () => {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  };
  const store = (record) => {
    try { record ? localStorage.setItem(key, JSON.stringify(record)) : localStorage.removeItem(key); } catch {}
  };
  // The token, or null when signed out or it runs out within a minute.
  const token = () => {
    const record = stored();
    return record?.token && record.expires > Date.now() + 60000 ? record.token : null;
  };
  // A path under HOME that is a save.
  const isSave = (path, size) => /^\.config\/[^/]+\/saves\/.+/.test(path) && !/\.(temp|bak)$/.test(path) &&
    !/\.conflict-/.test(path) && size < (1 << 20);
  // A save's game: its program id.
  const game = (path) => path.split('/')[1];
  const copyName = (path, time) => path + '.conflict-' + new Date(time).toISOString();
  const hex = async (data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  const request = async (url, options) => {
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + options.token } });
    if (response.status === 401) {
      // Ran out or revoked: the next start gets a new one.
      const record = stored();
      if (record) store({ ...record, expires: 0 });
    }
    if (!response.ok) throw new Error(url.replace(/\?.*/, '') + ': ' + response.status + ' ' + response.statusText);
    return response;
  };
  // The Drive's saves: path -> { id, hash, time }, the newest where a path has more than one.
  const list = async (auth, signal) => {
    const files = new Map();
    let page = '';
    do {
      const response = await request(drive + '?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,' +
        'modifiedTime,appProperties)' + (page && '&pageToken=' + encodeURIComponent(page)), { token: auth, signal });
      const body = await response.json();
      for (const f of body.files) {
        const time = Date.parse(f.modifiedTime);
        if (!files.has(f.name) || files.get(f.name).time < time) {
          files.set(f.name, { id: f.id, hash: f.appProperties?.sha256, time });
        }
      }
      page = body.nextPageToken;
    } while (page);
    return files;
  };
  const download = async (auth, id, signal) =>
    new Uint8Array(await (await request(drive + '/' + id + '?alt=media', { token: auth, signal })).arrayBuffer());
  // Creates the file, or replaces the contents of the one with this id.
  const put = async (auth, name, data, hash, id, signal) => {
    const boundary = 'save-sync-' + crypto.randomUUID();
    const meta = { name, appProperties: { sha256: hash }, ...(id ? {} : { parents: ['appDataFolder'] }) };
    const body = new Blob(['--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(meta), '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n', data,
      '\r\n--' + boundary + '--']);
    await request(upload + (id ? '/' + id : '') + '?uploadType=multipart&fields=id', {
      token: auth, signal, method: id ? 'PATCH' : 'POST', body,
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary } });
  };
  // What this browser and the Drive held when they last agreed on a file.
  const agreed = (path, hash) => {
    const record = stored();
    if (record) store({ ...record, synced: { ...record.synced, [path]: hash } });
  };
  // The games held for the player's choice: program ids.
  const held = () => new Set(stored()?.held);
  const hold = (ids, on) => {
    const record = stored(), set = new Set(record?.held);
    for (const id of ids) on ? set.add(id) : set.delete(id);
    if (record) store({ ...record, held: [...set] });
  };

  // Syncs one browser's saves: local is path -> { data, time } (time in ms). With pull, the Drive's that win are
  // returned (path -> data) for the caller to write; without it (the push while a game runs, the hub's sign-in) they
  // are left for the next start. Throws on a failed request: what synced before it stays recorded.
  const sync = async (local, { pull, signal } = {}) => {
    const auth = token();
    if (!auth) return null;
    const remote = await list(auth, signal), waiting = held();
    const synced = stored()?.synced || {}, pulled = new Map(), done = { up: 0, down: 0, conflicts: 0 };
    // A file pulled is recorded by what it holds, not the hash its properties say: one written to the Drive by another
    // client has none.
    const took = async (path, data) => {
      pulled.set(path, data);
      agreed(path, await hex(data));
    };
    for (const path of new Set([...local.keys(), ...remote.keys()])) {
      if (!isSave(path, local.get(path)?.data.byteLength ?? 0) || waiting.has(game(path))) continue;
      const mine = local.get(path), theirs = remote.get(path), last = synced[path];
      const hash = mine && await hex(mine.data);
      if (hash && hash === theirs?.hash) {
        if (last !== hash) agreed(path, hash);
      } else if (!mine || last === hash) {
        // Only the Drive's changed.
        if (!pull) continue;
        await took(path, await download(auth, theirs.id, signal));
        done.down++;
      } else if (!theirs || last === theirs.hash) {
        // Only this browser's changed.
        await put(auth, path, mine.data, hash, theirs?.id, signal);
        agreed(path, hash);
        done.up++;
      } else if (!pull) {
        // Both changed, or this browser never synced it: settled at the next start, where this browser's can be replaced.
        continue;
      } else if (last !== undefined && mine.time >= theirs.time) {
        // Both changed, and this browser's is newer: the Drive's is kept beside it.
        const data = await download(auth, theirs.id, signal);
        await put(auth, copyName(path, theirs.time), data, theirs.hash, null, signal);
        await put(auth, path, mine.data, hash, theirs.id, signal);
        agreed(path, hash);
        done.up++, done.conflicts++;
      } else {
        // The Drive's is newer, or this browser never synced the file: this browser's is kept beside it.
        await put(auth, copyName(path, mine.time), mine.data, hash, null, signal);
        await took(path, await download(auth, theirs.id, signal));
        done.down++, done.conflicts++;
      }
    }
    if (done.up || done.down) console.log('Save sync: ' + done.up + ' up, ' + done.down + ' down, ' + done.conflicts + ' in conflict');
    return pulled;
  };

  // After a sign-in on the hub: the games this browser never synced and holds other saves of than the Drive are held
  // (above), and the rest sync as at any time.
  const signedIn = async (local) => {
    const auth = token();
    if (!auth) return;
    const remote = await list(auth), synced = stored()?.synced || {}, ask = new Set();
    for (const [path, mine] of local) {
      const theirs = remote.get(path);
      if (theirs && synced[path] === undefined && isSave(path, mine.data.byteLength) &&
          await hex(mine.data) !== theirs.hash) ask.add(game(path));
    }
    hold(ask, true);
    await sync(local);
  };
  // The player's choice for a held game. This browser's: each of its saves the Drive holds otherwise replaces the
  // Drive's, which is kept as a copy. The Drive's: the game is let go, and its page's next start takes the Drive's and
  // keeps this browser's as a copy (sync, a browser that never synced the file).
  const settle = async (local, id, keepMine) => {
    const auth = token();
    if (!auth) throw new Error('signed out');
    if (keepMine) {
      const remote = await list(auth);
      for (const [path, mine] of local) {
        if (game(path) !== id || !isSave(path, mine.data.byteLength)) continue;
        const theirs = remote.get(path), hash = await hex(mine.data);
        if (theirs?.hash !== hash) {
          if (theirs) await put(auth, copyName(path, theirs.time), await download(auth, theirs.id), theirs.hash);
          await put(auth, path, mine.data, hash, theirs?.id);
        }
        agreed(path, hash);
      }
    }
    hold([id], false);
  };
  // The copies kept in the Drive when a save was replaced, newest first: { id, path (the save's), time (the copy's) }.
  const copies = async () => {
    const auth = token(), found = [];
    if (!auth) return found;
    for (const [name, f] of await list(auth)) {
      const m = /^(.*)\.conflict-(.+)$/.exec(name);
      if (m) found.push({ id: f.id, path: m[1], time: Date.parse(m[2]) });
    }
    return found.sort((a, b) => b.time - a.time);
  };
  // A copy made the save again. The save it replaces is kept as a copy in turn, and every browser takes the Drive's at
  // its game's next start: one that agreed with the replaced save as one only the Drive changed, one changed since as two
  // that both did, where the newer wins.
  const restore = async (copy) => {
    const auth = token();
    if (!auth) throw new Error('signed out');
    const theirs = (await list(auth)).get(copy.path), data = await download(auth, copy.id);
    if (theirs) await put(auth, copyName(copy.path, theirs.time), await download(auth, theirs.id), theirs.hash);
    await put(auth, copy.path, data, await hex(data), theirs?.id);
    await request(drive + '/' + copy.id, { token: auth, method: 'DELETE' });
  };

  return { key, stored, store, token, isSave, game, held, sync, signedIn, settle, copies, restore };
})();

// A game's page: HOME is the program's file system (persistent_home.js), read in before main() runs.
if (typeof document !== 'undefined' && typeof Module !== 'undefined') {
  Module['preRun'] = [].concat(Module['preRun'] || []);
  Module['preRun'].push(() => {
    const home = '/home/web_user';
    // HOME's saves: path under HOME -> { time, size, path }.
    const saves = () => {
      const found = new Map();
      const walk = (dir) => {
        let names;
        try { names = FS.readdir(dir); } catch { return; }
        for (const name of names) {
          if (name === '.' || name === '..') continue;
          const path = dir + '/' + name, stat = FS.stat(path);
          if (FS.isDir(stat.mode)) walk(path);
          else found.set(path.slice(home.length + 1), { time: stat.mtime.getTime(), size: stat.size, path });
        }
      };
      let ids = [];
      try { ids = FS.readdir(home + '/.config'); } catch {}
      for (const id of ids) if (id !== '.' && id !== '..') walk(home + '/.config/' + id + '/saves');
      return found;
    };
    const read = (found) => new Map([...found].filter(([path, f]) => SaveSync.isSave(path, f.size))
      .map(([path, f]) => [path, { data: FS.readFile(f.path), time: f.time }]));

    // While the game runs: a save it wrote goes up, once there is a token (a page in the hub's frame may get one later).
    // Only a look that finds a file whose time changed asks the Drive anything; a failed push is tried at the next one.
    const push = () => {
      const seen = new Map([...saves()].map(([path, f]) => [path, f.time]));
      let pushing = false;
      setInterval(async () => {
        if (pushing || !SaveSync.token()) return;
        const found = saves(), changed = [...found].filter(([path, f]) => seen.get(path) !== f.time);
        if (!changed.length) return;
        pushing = true;
        try {
          await SaveSync.sync(read(found));
          for (const [path, f] of changed) seen.set(path, f.time);
        } catch (error) {
          console.error('Save sync: could not upload: ' + error.message);
        } finally {
          pushing = false;
        }
      }, 10000);
    };
    // HOME wasn't read in when homeRead is false, and isn't written back either: nothing is synced then.
    if (!SaveSync.token()) {
      Module.homeRead.then((ok) => ok && push());
      return;
    }
    addRunDependency('save-sync');
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 8000);
    Module.homeRead.then(async (ok) => {
      if (!ok) return;
      const pulled = await SaveSync.sync(read(saves()), { pull: true, signal: abort.signal });
      if (abort.signal.aborted) return;
      for (const [path, data] of pulled) {
        const full = home + '/' + path;
        FS.mkdirTree(full.replace(/\/[^/]*$/, ''));
        FS.writeFile(full, data);
      }
      push();
    }).catch((error) => {
      console.error('Save sync: ' + (abort.signal.aborted ? 'gave up after 8 s' : error.message) +
                    ', so the game starts with the saves this browser has');
      push();
    }).finally(() => {
      clearTimeout(timeout);
      removeRunDependency('save-sync');
    });
  });
}
