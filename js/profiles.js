/* Profile storage for the Pearl Mini emulator.
 *
 * Values below are the defaults visible in the SOVDA knowledge base screenshots
 * of a technician-configured machine (F camera: Patio 215/1/30, Quaker 70/45,
 * Burnt 235/60). The B camera is seeded 4 points lower to model the "Front
 * Delta of 4" described in the user manual. */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'pearlmini.profiles.v1';
  var FRONT_DELTA = 4;

  function cameraDefaults(delta) {
    return {
      patio:  { range: 215 - delta, scale: 1, spot: 30 },
      green:  { range: 120 - delta, spot: 45 },
      quaker: { range: 70  - delta, spot: 45 },
      burnt:  { range: 235 - delta, spot: 60 }
    };
  }

  function makeProfile(name, mode, opts) {
    opts = opts || {};
    return {
      id: 'p' + Math.random().toString(36).slice(2, 10),
      name: name,
      mode: mode || 'RedMode06',
      locked: !!opts.locked,
      createdAt: opts.createdAt || Date.now(),
      F: cameraDefaults(0),
      B: cameraDefaults(FRONT_DELTA),
      categories: { A: true, B: false, C: true, D: true, E: false, F: false },
      clean: { period: 5, interval: 5 },
      chute: 50
    };
  }

  function seed() {
    // The technician-built template, locked so it cannot be overwritten or
    // deleted — the manual recommends building new profiles from it.
    var template = makeProfile('Coffee Template', 'Roasted', {
      locked: true,
      createdAt: new Date(2025, 10, 8, 17, 52, 37).getTime()
    });
    var working = makeProfile('Coffee', 'RedMode06', {
      createdAt: new Date(2025, 10, 9, 9, 14, 2).getTime()
    });
    return { profiles: [template, working], loadedId: working.id };
  }

  var state = null;

  function load() {
    if (state) return state;
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.profiles && parsed.profiles.length) {
          state = parsed;
          return state;
        }
      }
    } catch (e) { /* private mode / blocked storage — fall through to seed */ }
    state = seed();
    save();
    return state;
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* non-fatal: the emulator still works for this session */ }
  }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  var Profiles = {
    FRONT_DELTA: FRONT_DELTA,

    all: function () { return load().profiles; },

    loaded: function () {
      var s = load();
      return s.profiles.filter(function (p) { return p.id === s.loadedId; })[0] || s.profiles[0];
    },

    /* The live, in-memory copy of the loaded profile. Edits on the sensitivity
     * and cleaning screens land here and are NOT persisted until the operator
     * performs an Overwrite from the File Selection screen in Supervisor mode —
     * this mirrors the real machine, where the floppy-disk icon does not save
     * profile settings. */
    working: null,

    loadFile: function (id) {
      var s = load();
      var p = s.profiles.filter(function (x) { return x.id === id; })[0];
      if (!p) return null;
      s.loadedId = id;
      Profiles.working = deepCopy(p);
      save();
      return Profiles.working;
    },

    /* True when the working copy differs from what is stored on disk. */
    isDirty: function () {
      var s = load();
      var stored = s.profiles.filter(function (x) { return x.id === s.loadedId; })[0];
      if (!stored || !Profiles.working) return false;
      var a = deepCopy(stored), b = deepCopy(Profiles.working);
      ['id', 'name', 'mode', 'locked', 'createdAt'].forEach(function (k) {
        delete a[k]; delete b[k];
      });
      return JSON.stringify(a) !== JSON.stringify(b);
    },

    saveAs: function (name) {
      var s = load();
      var copy = deepCopy(Profiles.working || Profiles.loaded());
      copy.id = 'p' + Math.random().toString(36).slice(2, 10);
      copy.name = name;
      copy.locked = false;
      copy.createdAt = Date.now();
      s.profiles.push(copy);
      s.loadedId = copy.id;
      Profiles.working = deepCopy(copy);
      save();
      return copy;
    },

    overwrite: function (id) {
      var s = load();
      var idx = -1;
      s.profiles.forEach(function (p, i) { if (p.id === id) idx = i; });
      if (idx < 0) return false;
      if (s.profiles[idx].locked) return false;
      var target = s.profiles[idx];
      var src = deepCopy(Profiles.working || Profiles.loaded());
      src.id = target.id;
      src.name = target.name;
      src.mode = target.mode;
      src.locked = target.locked;
      src.createdAt = target.createdAt;
      s.profiles[idx] = src;
      save();
      return true;
    },

    remove: function (id) {
      var s = load();
      var p = s.profiles.filter(function (x) { return x.id === id; })[0];
      if (!p || p.locked) return false;
      if (s.profiles.length <= 1) return false;
      s.profiles = s.profiles.filter(function (x) { return x.id !== id; });
      if (s.loadedId === id) {
        s.loadedId = s.profiles[0].id;
        Profiles.working = deepCopy(s.profiles[0]);
      }
      save();
      return true;
    },

    rename: function (id, name) {
      var s = load();
      var p = s.profiles.filter(function (x) { return x.id === id; })[0];
      if (!p || p.locked) return false;
      p.name = name;
      if (Profiles.working && s.loadedId === id) Profiles.working.name = name;
      save();
      return true;
    },

    toggleLock: function (id) {
      var s = load();
      var p = s.profiles.filter(function (x) { return x.id === id; })[0];
      if (!p) return false;
      p.locked = !p.locked;
      /* Locking reverts any unsaved edits to the stored values, as the manual
       * describes: users may still edit during sorting, but the profile returns
       * to what was saved when it was locked. */
      if (p.locked && s.loadedId === id) Profiles.working = deepCopy(p);
      save();
      return p.locked;
    },

    displayName: function (p) { return '[' + p.mode + '] ' + p.name; },

    serial: function (p) {
      var list = load().profiles, sn = 0;
      list.forEach(function (x, i) { if (x.id === p.id) sn = i + 1; });
      return sn;
    },

    /* Title-bar form used on most screens: [S/N:4] [Roasted] WD */
    titleName: function (p) {
      return '[S/N:' + Profiles.serial(p) + '] ' + Profiles.displayName(p);
    },

    factoryReset: function () {
      state = seed();
      Profiles.working = deepCopy(Profiles.loaded());
      save();
    }
  };

  // Prime the working copy on first load.
  load();
  Profiles.working = deepCopy(Profiles.loaded());

  global.Profiles = Profiles;
})(window);
