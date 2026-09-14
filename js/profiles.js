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
      patio:  { range: 215 - delta, scale: 1, p3: 0, spot: 30 },
      green:  { range: 120 - delta, scale: 1, p3: 0, spot: 45 },
      quaker: { range: 70  - delta, scale: 1, p3: 0, spot: 45 },
      burnt:  { range: 235 - delta, scale: 1, p3: 0, spot: 60 },
      /* Which categories this camera is sorting on, and which P1-P4 slots each
         one exposes. Both are per camera: switching Quaker off, or hiding a
         parameter slot, on the front leaves the back untouched. */
      active: { A: true, B: false, C: true, D: true, E: false, F: false },
      slots: slotDefaults()
    };
  }

  /* Which P1-P4 slots each category exposes. Per camera. */
  function slotDefaults() {
    return {
      A: { P1: true, P2: true,  P3: false, P4: true },
      B: { P1: true, P2: false, P3: false, P4: true },
      C: { P1: true, P2: false, P3: false, P4: true },
      D: { P1: true, P2: false, P3: false, P4: true },
      E: { P1: false, P2: false, P3: false, P4: false },
      F: { P1: false, P2: false, P3: false, P4: false }
    };
  }

  /* What each slot is called. File-level: the label table is one table per
     file, and renaming a slot renames it wherever it appears. */
  function labelDefaults() {
    return {
      A: { P1: 'Range', P2: 'Scale', P3: null, P4: 'Spot' },
      B: { P1: 'Range', P2: null,    P3: null, P4: 'Spot' },
      C: { P1: 'Range', P2: null,    P3: null, P4: 'Spot' },
      D: { P1: 'Range', P2: null,    P3: null, P4: 'Spot' },
      E: { P1: null, P2: null, P3: null, P4: null },
      F: { P1: null, P2: null, P3: null, P4: null }
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
      /* Which categories exist for this file at all. */
      categories: { A: true, B: false, C: true, D: true, E: false, F: false },
      labels: labelDefaults(),
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

  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* Profiles stored by an earlier version lack the per-camera active set, the
     slot switches and the labels. Fill them in rather than discard the file. */
  function normalise(p) {
    if (!p.categories) p.categories = { A: true, B: false, C: true, D: true, E: false, F: false };
    if (!p.labels) p.labels = labelDefaults();
    delete p.slots;                       // moved onto each camera
    ['F', 'B'].forEach(function (side) {
      var cam = p[side];
      if (!cam) return;
      if (!cam.green) cam.green = { range: 120, scale: 1, p3: 0, spot: 45 };
      ['patio', 'green', 'quaker', 'burnt'].forEach(function (k) {
        if (cam[k].scale === undefined) cam[k].scale = 1;
        if (cam[k].p3 === undefined) cam[k].p3 = 0;
      });
      if (!cam.active) {
        cam.active = {};
        LETTERS.forEach(function (L) { cam.active[L] = !!p.categories[L]; });
      }
      if (!cam.slots) cam.slots = slotDefaults();
    });
    return p;
  }

  var state = null;

  function load() {
    if (state) return state;
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.profiles && parsed.profiles.length) {
          parsed.profiles.forEach(normalise);
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
    LETTERS: LETTERS,

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
