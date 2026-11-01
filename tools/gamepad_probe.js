// Gamepads that aren't there: a preload for play_page.mjs (--preload tools/gamepad_probe.js) that gives the page
// stand-in pads of the standard mapping, so a play can check what the game makes of several controllers and where its
// rumble goes, with no pad plugged in. A plan's eval steps drive it:
//
//   plugPads(n | [id, ...])   plugs in n pads (4 if none given), or one per id given, as a real pad connects: there
//                             in navigator.getGamepads() from then on, and a gamepadconnected event each. Call it once
//                             the program has started SDL (the launcher is SDL's), say at the start of the plan's
//                             "start" steps, before Start Game: a page whose RecompFrontend is older than 060709f
//                             never opens a pad that is there as SDL starts (site/touch_pad.js).
//   padRumbles()              what reached each pad's vibrationActuator: "plays <n per pad> resets <n per pad> peak
//                             <the strongest weakMagnitude per pad>"
//   padRumbleCalls()          the rumbles that came in, from RecompFrontend's recompinput_web_rumble (its EM_JS, which
//                             takes the pad's index in navigator.getGamepads()): how many, and the first 12 of them
//                             logged as "gamepadprobe rumble pad <index> strength <n>" as they come, with the pads'
//                             ids beside them. A pad a port plays on that gets no plays or resets is one the page
//                             didn't find behind its joystick.
//
// Each pad's id is "Xbox 360 Controller (XInput STANDARD GAMEPAD)", Chrome's for an Xbox pad on Windows, unless given, so
// four pads plugged in are four of one name, which the page tells apart by the order they connected. SDL names a pad
// after its id as it comes over Emscripten's EmscriptenGamepadEvent, 63 bytes at most, and renames it
// (SDL_CreateJoystickName: spaces, a maker's name, a word it finds again later cut off the front), so the ids a real
// browser gives (Chrome's "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)") can be given
// to see that the page still finds each pad. The buttons and sticks stay at rest: the keyboard plays port 1 beside
// them, and a plan writes what a port's player does through the game's own memory. The rumble's arguments are read
// through the calling function's, which a page built in strict mode doesn't allow; then it logs that it can't.
if (navigator.getGamepads && !self.__gamepadProbe) {
  self.__gamepadProbe = true;
  let pads = [];
  const plays = [], resets = [], peak = [];
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
            'pads', JSON.stringify(pads.map((g) => g.id)));
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
    plays.length = resets.length = peak.length = 0;
    for (const p of pads) {
      plays.push(0); resets.push(0); peak.push(0);
      dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: p }));
    }
    console.log('gamepadprobe plugged', pads.length);
    return true;
  };
  self.padRumbles = () => `plays ${plays.join(' ')} resets ${resets.join(' ')} peak ${peak.map((x) => x.toFixed(2)).join(' ')}`;
  self.padRumbleCalls = () => calls;
}
