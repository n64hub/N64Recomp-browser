// Gamepads that aren't there: a preload for play_page.mjs (--preload tools/gamepad_probe.js) that gives the page
// stand-in pads of the standard mapping, so a play can check what the game makes of several controllers and where its
// rumble goes, with no pad plugged in. A plan's eval steps drive it:
//
//   plugPads(n | [id, ...])   plugs in n pads (4 if none given), or one per id given, as a real pad connects: there
//                             in navigator.getGamepads() from then on, and a gamepadconnected event each. Call it once
//                             the program has started SDL (the launcher is SDL's), say at the start of the plan's
//                             "start" steps, before Start Game: a page whose RecompFrontend is older than 060709f
//                             never opens a pad that is there as SDL starts (site/touch_pad.js).
//   unplugPad(index)          pulls pad <index> out, as Chrome sees one go: its place in navigator.getGamepads() is null
//                             from then on, the Gamepad the page holds says connected false, and a
//                             gamepaddisconnected event says so. true, or false while no pad <index> is in.
//   replugPad(index, at)      plugs the pad last pulled out of place <index> in again, the same id, as Chrome sees one
//                             come back: a new Gamepad at place <at>, or the lowest free place if none is given (Chrome
//                             gives a pad the first free one, so a pad another took the place of comes back at another),
//                             and a gamepadconnected event. Its place, or -1 while it is in or <at> is taken. SDL makes
//                             it a new joystick, its instance id the next, whatever place it comes back at.
//   padSet(index, state)      moves pad <index>'s sticks and buttons and leaves them there, as a player holds them:
//                             state.axes is the standard mapping's [left x, left y, right x, right y], -1 to 1, down
//                             positive, a null left as it is, and state.buttons an object of the standard mapping's
//                             button numbers (0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start, 10 and 11 the
//                             sticks' clicks, 12-15 the d-pad's up, down, left and right) to a value, 0 to 1 (true is
//                             1); padSet(index) lets go of all of it. The pad's timestamp moves, as SDL reads a pad
//                             only when it has (SDL_emscriptenjoystick.c). true, or false while no pad <index> is in.
//   padRumbles()              what reached each pad's vibrationActuator: "plays <n per pad> resets <n per pad> peak
//                             <the strongest weakMagnitude per pad>"
//   padRumbleCalls()          the rumbles that came in, from RecompFrontend's recompinput_web_rumble (its EM_JS, which
//                             takes the pad's index in navigator.getGamepads()): how many, and the first 12 of them
//                             logged as "gamepadprobe rumble pad <index> strength <n>" as they come, with the pads'
//                             ids beside them. A pad a port plays on that gets no plays or resets is one the page
//                             didn't find behind its joystick.
//
// navigator.getGamepads() is Chrome's four places (more if more pads are plugged in), null where no pad is in. Each
// pad's id is "Xbox 360 Controller (XInput STANDARD GAMEPAD)", Chrome's for an Xbox pad on Windows, unless given, so
// four pads plugged in are four of one name, which the page tells apart by the order they connected. SDL names a pad
// after its id as it comes over Emscripten's EmscriptenGamepadEvent, 63 bytes at most, and renames it
// (SDL_CreateJoystickName: spaces, a maker's name, a word it finds again later cut off the front), so the ids a real
// browser gives (Chrome's "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)") can be given
// to see that the page still finds each pad. The buttons and sticks stay at rest until padSet moves them: the keyboard
// plays port 1 beside them. The rumble's arguments are read through the calling function's, which a page built in
// strict mode doesn't allow; then it logs that it can't.
if (navigator.getGamepads && !self.__gamepadProbe) {
  self.__gamepadProbe = true;
  let pads = [null, null, null, null];
  const plays = [0, 0, 0, 0], resets = [0, 0, 0, 0], peak = [0, 0, 0, 0];
  const unplugged = {};
  let calls = 0, logged = 0;
  const pad = (index, id) => ({
    id, index, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: {
      type: 'dual-rumble',
      playEffect: (type, params) => {
        plays[index]++;
        peak[index] = Math.max(peak[index], params.weakMagnitude || 0, params.strongMagnitude || 0);
        return Promise.resolve('complete');
      },
      reset: () => { resets[index]++; return Promise.resolve('complete'); },
    },
  });
  navigator.getGamepads = function gamepadProbe() {
    if (/recompinput_web_rumble/.test(new Error().stack || '')) {
      calls++;
      if (logged < 12) {
        logged++;
        try {
          const args = gamepadProbe.caller.arguments;
          console.log('gamepadprobe rumble pad', args[0], 'strength', args[1],
            'pads', JSON.stringify(pads.map((g) => g && g.id)));
        } catch (e) {
          logged = 12;
          console.log('gamepadprobe rumble: its arguments can\'t be read here,', String(e));
        }
      }
    }
    return pads;
  };
  self.plugPads = (what = 4) => {
    const ids = Array.isArray(what) ? what : Array.from({ length: what }, (_, i) => 'Xbox 360 Controller (XInput STANDARD GAMEPAD)');
    pads = ids.map((id, i) => pad(i, id));
    while (pads.length < 4) pads.push(null);
    plays.length = resets.length = peak.length = 0;
    for (const p of pads) {
      plays.push(0); resets.push(0); peak.push(0);
      if (p) dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: p }));
    }
    for (const k of Object.keys(unplugged)) delete unplugged[k];
    console.log('gamepadprobe plugged', ids.length);
    return true;
  };
  self.unplugPad = (index) => {
    const p = pads[index];
    if (!p) return false;
    pads[index] = null;
    unplugged[index] = p.id;
    p.connected = false;
    p.timestamp = performance.now();
    dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: p }));
    console.log('gamepadprobe unplugged', index);
    return true;
  };
  self.replugPad = (index, at) => {
    const id = unplugged[index];
    if (id === undefined) return -1;
    if (at === undefined) at = pads.indexOf(null) < 0 ? pads.length : pads.indexOf(null);
    if (pads[at]) return -1;
    delete unplugged[index];
    const p = pad(at, id);
    pads[at] = p;
    while (plays.length <= at) { plays.push(0); resets.push(0); peak.push(0); }
    dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: p }));
    console.log('gamepadprobe replugged', index, 'at', at);
    return at;
  };
  self.padSet = (index, state) => {
    const p = pads[index];
    if (!p) return false;
    const { axes = [], buttons = {} } = state || { axes: [0, 0, 0, 0], buttons: Object.fromEntries(p.buttons.map((_, i) => [i, 0])) };
    axes.forEach((v, i) => { if (v !== null && v !== undefined) p.axes[i] = v; });
    for (const [i, v] of Object.entries(buttons)) {
      const value = Number(v);
      p.buttons[i] = { pressed: value > 0.5, touched: value > 0, value };
    }
    p.timestamp = performance.now();
    return true;
  };
  self.padRumbles = () => `plays ${plays.join(' ')} resets ${resets.join(' ')} peak ${peak.map((x) => x.toFixed(2)).join(' ')}`;
  self.padRumbleCalls = () => calls;
}
