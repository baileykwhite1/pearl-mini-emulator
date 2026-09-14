/* Pearl Mini emulator — screens, routing and machine state.
 *
 * Screen layouts and control names follow the SOVDA knowledge base article
 * "User Manual - Pearl Mini" and the HMI screenshots published with it. */

(function (global) {
  'use strict';

  var el = UI.el, icon = UI.icon;

  /* User levels, lowest to highest. Each is entered by typing its password on
     the keypad; the code itself decides which level you land on.
       Operator    no password
       Supervisor  the machine date, YYYYMMDD
       Engineer    the time, HHMM
       JXO         day and time, DDHHMM  (factory mode)
     The time-based codes accept the previous minute as well as the current one,
     so a code that was correct when you started typing still works. */
  var LEVELS = ['operator', 'supervisor', 'engineer', 'jxo'];

  var LEVEL_INFO = {
    operator:   { label: 'Operator',              colour: 'var(--hmi-green)' },
    supervisor: { label: 'Supervisor',            colour: 'var(--blue)' },
    engineer:   { label: 'Manufacturer Engineer',  colour: '#e8c53a' },
    jxo:        { label: 'JXO',                   colour: '#ff3b3b' }
  };

  var M = {
    level: 'operator',
    valve: false,
    feed: false,
    screen: 'home',
    powered: true,
    sensTab: 'F',
    valveTab: 'F',
    selectedFileId: null,
    ejectorNumber: 1,
    testSpeed: 100,
    cam: {
      side: 'F', num: 1, zoom: 1, sampled: false, box: null,
      r: 65, g: 93, b: 255, temp: 7.7,
      gain: { r: 373, g: 448, b: 574 },
      ref:  { r: 242, g: 242, b: 243 }
    },
    sysNav: 'General Setting',
    info: {
      factory: '', number: '', selected: null,
      lines: [
        ' Service Telephone',
        'knowledge.sovdacoffee.com',
        'Service WhatsApp +1 971 200 5140',
        'Service Email service@sovdacoffee.com'
      ]
    },
    lang: {
      size: 18,
      font: 'Microsoft Sans Serif',
      installed: [
        { name: 'SimplifiedChinese', on: true },
        { name: 'English',           on: true },
        { name: 'Turkish',           on: false }
      ]
    },
    sysTab: 'COM',
    log: [],
    logSelected: 0,
    modeSelected: 7,
    sim: new Simulator()
  };

  var root = document.getElementById('screens');

  function rank(level) { return LEVELS.indexOf(level || M.level); }
  function atLeast(level) { return rank() >= LEVELS.indexOf(level); }
  function levelColour() { return LEVEL_INFO[M.level].colour; }
  function levelLabel(level) { return LEVEL_INFO[level || M.level].label; }

  /* Everything that used to ask "are we supervisor?" means "supervisor or
     above", so expose it as a read-only view onto the level. */
  Object.defineProperty(M, 'supervisor', {
    get: function () { return atLeast('supervisor'); }
  });

  /* ---------------- logging ---------------- */
  function stamp(d) {
    d = d || new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function logEvent(msg, isError) {
    var d = new Date();
    var full = d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) +
               ' ' + stamp(d);
    M.log.unshift({ t: stamp(d), stamp: full, msg: msg, err: !!isError });
    if (M.log.length > 200) M.log.pop();
    if (M.logSelected != null) M.logSelected++;
  }

  /* ---------------- clock ---------------- */
  function tickClock() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    document.getElementById('clock').textContent =
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '  ' +
      d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function todayPassword(d) {
    d = d || new Date();
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function engineerPassword(d) {
    d = d || new Date();
    return pad2(d.getHours()) + pad2(d.getMinutes());
  }

  function jxoPassword(d) {
    d = d || new Date();
    return pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  /* Which level, if any, a typed code unlocks. */
  function levelForCode(code) {
    if (!code) return null;
    var now = new Date();
    var ago = new Date(now.getTime() - 60000);   // grace for a rolled-over minute
    if (code === todayPassword(now)) return 'supervisor';
    if (code === engineerPassword(now) || code === engineerPassword(ago)) return 'engineer';
    if (code === jxoPassword(now) || code === jxoPassword(ago)) return 'jxo';
    return null;
  }

  /* ---------------- helpers ---------------- */
  function title() { return Profiles.titleName(Profiles.working); }


  function toggleLamp(which) {
    if (which === 'Valve') M.valve = !M.valve;
    else M.feed = !M.feed;
    logEvent(which + ' ' + ((which === 'Valve' ? M.valve : M.feed) ? 'activated' : 'deactivated'));
    render();
  }

  function onUserIcon() {
    if (M.level !== 'operator') {
      UI.confirm('User',
        'Return to <strong>Operator</strong>? Everything above Operator will be hidden.',
        'Return to Operator').then(function (ok) {
        if (!ok) return;
        logEvent('Signed out of ' + levelLabel());
        M.level = 'operator';
        render();
      });
      return;
    }
    openUserPanel();
  }

  /* The machine shows a single-field panel with a green tick. Touching the
     field opens a numeric keypad; the password is the machine date, YYYYMMDD. */
  function openUserPanel() {
    var chosen = M.level;
    var overlay = makeOverlay('user-overlay');

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    var field = el('div', { class: 'field', text: levelLabel(chosen), onclick: askPassword });

    function askPassword() {
      numericKeypad('Please enter password.').then(function (code) {
        if (code === null) return;
        var lvl = levelForCode(code);
        if (!lvl) {
          UI.toast('Incorrect password.', true);
          return;
        }
        chosen = lvl;
        field.textContent = levelLabel(lvl);
        field.style.color = LEVEL_INFO[lvl].colour;
        UI.toast(levelLabel(lvl) + ' — press the green tick to confirm.');
      });
    }

    overlay.appendChild(el('div', { class: 'userpanel' }, [
      el('div', { class: 'bar' }),
      el('div', { class: 'inner' }, [
        field,
        el('button', { class: 'ok', title: 'Confirm', onclick: function () {
          close();
          if (chosen !== M.level) {
            M.level = chosen;
            logEvent(levelLabel() + ' mode entered');
          }
          render();
        } })
      ])
    ]));

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.getElementById('stage').appendChild(overlay);
  }

  /* Touchscreen numeric keypad, laid out as on the machine. */
  function numericKeypad(titleText) {
    return new Promise(function (resolve) {
      var value = '';
      UI.showDialog(function (box) {
        box.className = 'dialog keypad';
        box.appendChild(el('div', { class: 'kp-title', text: titleText }));
        var display = el('div', { class: 'kp-display' });
        box.appendChild(display);

        function refresh() { display.textContent = value.replace(/./g, '*'); }
        function push(ch) { if (value.length < 16) { value += ch; refresh(); } }

        function key(label, onclick, cls) {
          var b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: label, onclick: onclick });
          return b;
        }

        var keys = el('div', { class: 'kp-keys' }, [
          key('1', function () { push('1'); }), key('2', function () { push('2'); }),
          key('3', function () { push('3'); }),
          key('Cancel', function () { finish(null); }),

          key('4', function () { push('4'); }), key('5', function () { push('5'); }),
          key('6', function () { push('6'); }),
          key('Clear', function () { value = ''; refresh(); }),

          key('7', function () { push('7'); }), key('8', function () { push('8'); }),
          key('9', function () { push('9'); }),
          key('Confirm', function () { finish(value); }, 'tall'),

          key('.', function () { push('.'); }), key('0', function () { push('0'); }),
          key('#', function () { push('#'); })
        ]);
        box.appendChild(keys);

        function finish(v) {
          box.className = 'dialog';
          UI.closeDialog();
          resolve(v);
        }
        refresh();
      });
    });
  }

  function onSaveIcon() {
    /* Faithful to the manual: the floppy icon does NOT save profile settings. */
    UI.confirm('Parameters', 'Would you like to save your Parameters?', 'Save').then(function (ok) {
      if (!ok) return;
      UI.alert('Parameters saved',
        'Machine parameters were saved.<br><br>Note this did <strong>not</strong> save your profile. ' +
        'Sensitivity and cleaning settings are only stored when you <strong>Overwrite</strong> the ' +
        'profile from File Selection in Supervisor mode.');
      logEvent('Machine parameters saved (profile not written)');
    });
  }

  function stdChrome(opts) {
    opts = opts || {};
    return UI.chrome({
      title: opts.title || title(),
      level: M.level,
      showSave: opts.showSave,
      showBack: opts.showBack,
      onUser: onUserIcon,
      onSave: onSaveIcon,
      onBack: function () { go(opts.back || 'menu'); }
    });
  }

  function footer(items) {
    return el('div', { class: 'footerbar' }, items);
  }

  function footerItem(label, iconName, onclick, disabled) {
    var b = el('button', { class: 'footer-item', onclick: onclick }, [
      icon(iconName), el('span', { text: label })
    ]);
    if (disabled) b.disabled = true;
    return b;
  }

  /* ---------------- screens ---------------- */
  var screens = {};

  /* ---- Home ---- */
  screens.home = function () {
    var dock = [
      ['i-network', 'Network', function () { go('network'); }],
      ['i-phone', 'Service contact', function () { go('contact'); }],
      ['i-notepad', 'Operation history', function () { go('history'); }],
      ['i-person', 'User', onUserIcon],
      ['i-file', 'File selection', function () { go('files'); }],
      ['i-chart', 'Feed settings', function () { go('chute'); }],
      ['i-clean', 'Force cleaning cycle', function () {
        M.sim.manualClean();
        logEvent('Manual cleaning cycle forced');
        UI.toast('Cleaning cycle complete');
      }]
    ].map(function (d) {
      var s = icon(d[0]);
      if (d[0] === 'i-person') s.style.color = levelColour();
      if (d[0] === 'i-clean') s.style.color = '#f0f0f0';
      return el('button', { title: d[1], onclick: d[2] }, [s]);
    });

    return el('div', { class: 'screen active', id: 'screen-home' }, [
      el('div', { class: 'home-panel' }, [
        el('div', { class: 'wordmark' }, [
          el('span', { class: 'macron' }), document.createTextNode('SOVDA')
        ]),
        el('div', { class: 'home-actions' }, [
          el('button', { class: 'home-action', onclick: startSorting }, [
            icon('i-start'), el('span', { text: 'Start' })
          ]),
          el('button', { class: 'home-action', onclick: function () { go('menu'); } }, [
            icon('i-menu'), el('span', { text: 'Menu' })
          ]),
          el('button', { class: 'home-action', onclick: powerOff }, [
            icon('i-power'), el('span', { text: 'OFF' })
          ])
        ])
      ]),
      el('div', { class: 'dock' }, dock)
    ]);
  };

  /* ---- Menu ----
     Nine glossy tiles in a 3x3 grid, named exactly as the machine names them.
     Note "Feed Setting" (the manual calls the same screen "Chute Settings")
     and that Light Setting is not a top-level entry -- it is a tab inside
     System Setting > Port Setting. */
  var MENU = [
    { label: 'Sensitivity Regulation', icon: 't-sensitivity', to: 'sensitivity' },
    { label: 'Dust Cleaning Setting',  icon: 't-clean',       to: 'cleaning' },
    { label: 'Feed Setting',           icon: 't-feed',        to: 'chute' },
    { label: 'File Selection',         icon: 't-file',        to: 'files' },
    { label: 'Artificial Intelligence',icon: 't-ai',          to: 'ai' },
    { label: 'Valve Test',             icon: 't-valve',       to: 'valvetest' },
    { label: 'Camera Setting',         icon: 't-camera',      to: 'whitebalance', warn: true },
    { label: 'Background Plate Setting', icon: 't-bgplate',   protected: true },
    { label: 'System Setting',         icon: 't-system',      to: 'system', needs: 'supervisor' }
  ];

  screens.menu = function () {
    var tiles = MENU.map(function (m) {
      var kids = [icon(m.icon), el('span', { text: m.label })];
      if (m.protected || m.needs || m.warn) {
        kids.push(el('span', { class: 'tile-note',
          text: levelLabel(m.needs || 'supervisor') }));
      }
      return el('button', {
        class: 'menu-icon',
        onclick: function () {
          if (m.protected) return openProtected(m.label);
          if (m.warn) return openWithWarning(m.label, m.to);
          if (m.needs && !atLeast(m.needs)) {
            UI.alert(m.label, 'This screen requires ' + levelLabel(m.needs) +
              '. Use the person icon to sign in.');
            return;
          }
          go(m.to);
        }
      }, kids);
    });
    return el('div', { class: 'screen active' }, stdChrome({ back: 'home' }).concat([
      el('div', { class: 'menu-icons' }, tiles)
    ]));
  };

  function openWithWarning(name, to) {
    if (!M.supervisor) {
      UI.alert(name, 'This screen requires Supervisor mode. Use the person icon to sign in.');
      return;
    }
    UI.confirm(name,
      '<strong>White balance is part of the technician\u2019s calibration.</strong><br><br>' +
      'Look, but do not change the gains or reference values on a real machine \u2014 a camera ' +
      'that is out of balance will sort badly and needs a technician visit to put right.',
      'I understand'
    ).then(function (ok) {
      if (!ok) return;
      logEvent(name + ' opened in Supervisor mode', true);
      go(to);
    });
  }

  function openProtected(name) {
    if (!M.supervisor) {
      UI.alert(name, 'This screen requires Supervisor mode. Use the person icon to sign in.');
      return;
    }
    UI.confirm(name,
      '<strong>These settings are calibrated by a SOVDA technician.</strong><br><br>' +
      'Changing them can cause serious sorting performance issues and may require a technician ' +
      'visit to recalibrate the machine. Contact your Technical Brand Ambassador or the Service ' +
      'Department before proceeding.',
      'I understand'
    ).then(function (ok) {
      if (ok) {
        UI.alert(name, 'This emulator deliberately does not reproduce ' + name +
          '. On a real Pearl Mini these values belong to the technician\u2019s calibration.');
        logEvent(name + ' opened in Supervisor mode', true);
      }
    });
  }

  /* ---- Artificial Intelligence ---- */
  screens.ai = function () {
    return el('div', { class: 'screen active' }, stdChrome({}).concat([
      el('div', { class: 'info-body' }, [
        el('p', { html: '<strong>AI Mode is an experimental feature.</strong>' }),
        el('p', { style: 'margin-top:16px', html:
          'SOVDA does not recommend using it at present. If you would like to learn more, contact ' +
          'your Technical Brand Ambassador or the Service Department.' }),
        el('p', { style: 'margin-top:16px;color:#8a8a8a;font-size:17px', html:
          'The emulator does not reproduce AI Mode behaviour.' })
      ])
    ]));
  };

  /* ---- Sensitivity Regulation ----
     Columns are the categories that exist for the file AND are switched on for
     the camera tab you are looking at. Which spinners a column shows comes from
     that category's P1-P4 slots, and what they are called comes from its labels. */
  var CATEGORIES = [
    { letter: 'A', name: 'Patio',  key: 'patio' },
    { letter: 'B', name: 'Green',  key: 'green' },
    { letter: 'C', name: 'Quaker', key: 'quaker' },
    { letter: 'D', name: 'Burnt',  key: 'burnt' },
    { letter: 'E', name: '' },
    { letter: 'F', name: '' }
  ];

  var SLOT_FIELD = { P1: 'range', P2: 'scale', P3: 'p3', P4: 'spot' };
  var SLOT_RANGE = {
    P1: { min: 0, max: 255 }, P2: { min: 0, max: 3 },
    P3: { min: 0, max: 255 }, P4: { min: 1, max: 255 }
  };

  function catByLetter(L) {
    return CATEGORIES.filter(function (c) { return c.letter === L; })[0];
  }

  /* Categories visible on the camera tab currently selected. */
  function activeCategories() {
    var p = Profiles.working;
    var cam = p[M.sensTab];
    return CATEGORIES.filter(function (c) {
      return c.key && p.categories[c.letter] && cam.active && cam.active[c.letter];
    });
  }

  function camera() { return Profiles.working[M.sensTab]; }

  function slotLabel(L, pn) {
    var lab = Profiles.working.labels[L];
    return (lab && lab[pn]) || pn;
  }

  function slotSpinner(cat, pn) {
    var cam = camera();
    var field = SLOT_FIELD[pn];
    var lim = SLOT_RANGE[pn];
    return UI.spinner({
      label: slotLabel(cat.letter, pn), min: lim.min, max: lim.max,
      get: function () { return cam[cat.key][field]; },
      set: function (v) {
        cam[cat.key][field] = v;
        if (pn === 'P2' && cat.letter === 'A' && v !== 1) {
          UI.toast('Scale should remain at 1 on Patio.', true);
        }
      }
    });
  }

  function sensColumn(cat) {
    var slots = camera().slots[cat.letter] || {};
    var top = [];
    ['P1', 'P2', 'P3'].forEach(function (pn) {
      if (slots[pn]) top.push(slotSpinner(cat, pn));
    });

    var kids = [
      el('button', {
        class: 'sens-head', html: cat.letter + '<br>' + cat.name,
        title: 'Switch categories on or off for this camera',
        onclick: openCategoryPanel
      }),
      el('div', { class: 'sens-rows' }, top)
    ];

    if (slots.P4) {
      var bottom = slotSpinner(cat, 'P4');
      bottom.classList.add('sens-spot');
      kids.push(bottom);
    }
    return el('div', { class: 'sens-col' }, kids);
  }

  screens.sensitivity = function () {
    var cols = activeCategories();
    var body;

    if (!cols.length) {
      /* Nothing switched on for this camera: the machine shows NULL, and
         touching it reopens the category panel. */
      body = el('div', { class: 'tab-body' }, [
        el('button', { class: 'null-state', text: 'NULL',
          title: 'Switch categories on for this camera', onclick: openCategoryPanel })
      ]);
    } else {
      var grid = el('div', { class: 'sens-cols' }, cols.map(sensColumn));
      grid.style.gridTemplateColumns = 'repeat(' + cols.length + ', 1fr)';
      body = el('div', { class: 'tab-body' }, [grid]);
    }

    return el('div', { class: 'screen active' }, stdChrome({}).concat([
      tabs('sensTab'),
      body,
      footer([
        footerItem('Data Same', 'i-datasame', function () {
          UI.toast('Data Same is not used on the Pearl Mini.', true);
        }),
        footerItem('View Image', 'i-viewimg', function () { go('viewimage'); }),
        footerItem('Feed Setting', 'i-chart', function () { go('chute'); }),
        M.sim.running
          ? footerItem('Stop', 'i-stop', stopSorting)
          : footerItem('Start', 'i-start', startSorting)
      ])
    ]));
  };

  /* ---- Category panel ----
     Opened from a column header or from NULL. The rockers switch categories on
     and off for the camera tab you are on, independently of the other camera.
     In Supervisor mode it also exposes the P1-P4 slots, which are likewise per
     camera, plus the label editor. Slot names are file-level. */
  /* Remove any existing overlay with this id before opening a new one, so two
     panels can never end up in the document at once. */
  function makeOverlay(id) {
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    return el('div', { class: 'dialog-backdrop open', id: id });
  }

  function openCategoryPanel() {
    var p = Profiles.working;
    var cam = p[M.sensTab];
    var letters = M.supervisor
      ? Profiles.LETTERS
      : Profiles.LETTERS.filter(function (L) { return p.categories[L]; });

    var overlay = makeOverlay('cat-overlay');
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

    function build() {
      overlay.innerHTML = '';
      var cols = letters.map(function (L) {
        var cat = catByLetter(L);
        var on = !!(p.categories[L] && cam.active[L]);

        var kids = [
          rocker(on, false, function () {
            if (M.supervisor) {
              /* Supervisor switches the category on for the file and for this
                 camera in one move, so it can be brought into use at all. */
              var next = !(p.categories[L] && cam.active[L]);
              p.categories[L] = next;
              cam.active[L] = next;
            } else {
              cam.active[L] = !cam.active[L];
            }
            logEvent('Category ' + L + ' ' + (cam.active[L] ? 'on' : 'off') +
                     ' for ' + M.sensTab + ' camera');
            build();
          }),
          el('div', { class: 'name', html: L + (cat && cat.name ? '<br>' + cat.name : '<br>&nbsp;') })
        ];

        if (M.supervisor) {
          var slots = cam.slots[L] || (cam.slots[L] = { P1: false, P2: false, P3: false, P4: false });
          kids.push(el('div', { class: 'plist' }, ['P1', 'P2', 'P3', 'P4'].map(function (pn) {
            return el('button', {
              class: 'pbtn' + (slots[pn] ? ' lit' : ''),
              text: slots[pn] ? slotLabel(L, pn) : pn,
              title: 'Switch this parameter slot on or off for the ' + M.sensTab + ' camera',
              onclick: function () {
                slots[pn] = !slots[pn];
                logEvent('Slot ' + pn + ' on category ' + L + ' ' +
                         (slots[pn] ? 'on' : 'off') + ' for ' + M.sensTab + ' camera');
                build();
              }
            });
          })));
        }
        return el('div', { class: 'cat-col' }, kids);
      });

      var panel = el('div', { class: 'catpanel' + (M.supervisor ? ' wide' : '') }, [
        el('div', { class: 'bar' }),
        el('div', { class: 'inner' }, [
          el('div', { class: 'cat-head', text: M.supervisor ? 'ABCDEF' : M.sensTab + ' camera' }),
          el('div', { class: 'cat-row' }, cols),
          el('div', { class: 'cat-foot' }, [
            M.supervisor
              ? el('button', { class: 'btn', text: 'File Information Modify_Label',
                  onclick: function () { close(); go('labels'); } })
              : el('div'),
            el('button', { class: 'ok', title: 'Confirm', onclick: function () {
              close(); render();
            } }),
            el('div')
          ])
        ])
      ]);
      overlay.appendChild(panel);
    }

    build();
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { close(); render(); }
    });
    document.getElementById('stage').appendChild(overlay);
  }

  /* ---- View Image ----
     Reached from the Sensitivity Regulation footer. This is the plain camera
     view: the background plate and whatever coffee is passing it. No readout,
     no sampling box and no calibration controls -- those belong to Camera
     Setting (white balance), which is a different screen. */
  screens.viewimage = function () {
    var canvas = el('canvas', { width: 1040, height: 560 });
    var view = el('div', { class: 'cam-view tall' }, [canvas]);

    var node = el('div', { class: 'screen active' }, [
      camToolbar('sensitivity'),
      view,
      el('button', {
        class: 'footer-item', style: 'position:absolute;right:150px;bottom:16px',
        onclick: M.sim.running ? stopSorting : startSorting
      }, [icon(M.sim.running ? 'i-stop' : 'i-start')])
    ]);

    node._camCanvas = canvas;
    drawCam(canvas, { box: false });
    return node;
  };

  /* ---- Camera Setting (white balance) ----
     Sample the background plate with a drag box and the readout switches from
     the plain temperature line to R/G/B plus temperature. Technician territory:
     the gains and reference values are part of calibration. */
  screens.whitebalance = function () {
    var canvas = el('canvas', { width: 1040, height: 518 });
    var view = el('div', { class: 'cam-view' }, [canvas]);
    var readout = el('div', { class: 'cam-readout' });

    function refreshReadout() {
      readout.className = 'cam-readout ' + (M.cam.sampled ? 'rgb' : 'plain');
      readout.textContent = M.cam.sampled
        ? 'R:' + pad3(M.cam.r) + '  G:' + pad3(M.cam.g) + '  B:' + pad3(M.cam.b) +
          '  T:' + M.cam.temp.toFixed(1)
        : 'T:' + M.cam.temp.toFixed(1);
    }
    refreshReadout();
    view.appendChild(readout);

    /* Drag to place the sample rectangle. */
    var dragging = null;
    view.addEventListener('mousedown', function (e) {
      var r = view.getBoundingClientRect();
      var sc = r.width / 1040;
      dragging = { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc };
    });
    view.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      var r = view.getBoundingClientRect();
      var sc = r.width / 1040;
      var x2 = (e.clientX - r.left) / sc, y2 = (e.clientY - r.top) / sc;
      var box = {
        x: Math.min(dragging.x, x2), y: Math.min(dragging.y, y2),
        w: Math.abs(x2 - dragging.x), h: Math.abs(y2 - dragging.y)
      };
      dragging = null;
      if (box.w < 6 || box.h < 6) { box.w = 62; box.h = 300; box.x -= 31; box.y -= 150; }
      M.cam.box = box;
      sampleBox();
      refreshReadout();
      drawCam(canvas, { box: true });
    });

    var node = el('div', { class: 'screen active' }, [
      camToolbar('menu'),
      view,
      el('div', { class: 'cam-footer' }, [
        rgbBtn('Red', 'r'), rgbBtn('Green', 'g'), rgbBtn('Blue', 'b'),
        el('button', { class: 'btn', text: 'Auto Regulation', onclick: autoRegulation }),
        el('button', { class: 'btn', text: 'Reference Value', onclick: referenceValue })
      ]),
      el('button', {
        class: 'footer-item', style: 'position:absolute;right:150px;bottom:6px',
        onclick: M.sim.running ? stopSorting : startSorting
      }, [icon(M.sim.running ? 'i-stop' : 'i-start')])
    ]);

    node._camCanvas = canvas;
    node._camBox = true;
    drawCam(canvas, { box: true });
    return node;
  };

  /* Toolbar shared by both camera screens. */
  function camToolbar(backTo) {
    return el('div', { class: 'cam-toolbar' }, [
      el('button', { class: 'tool', title: 'Stop', onclick: stopSorting }, [icon('i-camstop')]),
      el('button', { class: 'tool', title: 'Zoom out', onclick: function () { zoom(-1); } },
        [icon('i-zoomout')]),
      el('div', { class: 'zoomlabel', text: M.cam.zoom + 'x' }),
      el('button', { class: 'tool', title: 'Zoom in', onclick: function () { zoom(1); } },
        [icon('i-zoomin')]),
      el('div', { class: 'pager' }, [
        el('button', { class: 'btn', text: '<', onclick: function () { camNum(-1); } }),
        el('div', { class: 'pv', text: String(M.cam.num) }),
        el('button', { class: 'btn', text: '>', onclick: function () { camNum(1); } })
      ]),
      el('div', { class: 'pager' }, [
        el('button', { class: 'btn', text: '<', onclick: flipCam }),
        el('div', { class: 'pv', text: M.cam.side }),
        el('button', { class: 'btn', text: '>', onclick: flipCam })
      ]),
      el('div', { class: 'spacer' }),
      el('button', { class: 'chrome-icon', title: 'Save parameters', onclick: onSaveIcon },
        [icon('i-floppy')]),
      el('button', { class: 'chrome-icon', title: 'Back',
        onclick: function () { go(backTo); } }, [icon('i-back')])
    ]);
  }

  function pad3(n) { return String(Math.round(n)).padStart(3, '0'); }

  function rgbBtn(label, key) {
    return el('button', { class: 'btn', onclick: function () {
      UI.toast(label + ' gain is set by the technician during calibration.', true);
    } }, [
      el('div', { class: 'big', text: String(M.cam.gain[key]) }),
      el('div', { text: label })
    ]);
  }

  function zoom(dir) {
    var steps = [1, 2, 4, 8];
    var i = steps.indexOf(M.cam.zoom) + dir;
    M.cam.zoom = steps[Math.max(0, Math.min(steps.length - 1, i))];
    render();
  }

  function camNum(dir) {
    M.cam.num = Math.max(1, Math.min(2, M.cam.num + dir));
    render();
  }

  function flipCam() {
    M.cam.side = M.cam.side === 'F' ? 'B' : 'F';
    M.sensTab = M.cam.side;
    render();
  }

  /* Sampling the background plate returns the plate colour plus sensor noise. */
  function sampleBox() {
    M.cam.r = 65 + (Math.random() - 0.5) * 6;
    M.cam.g = 93 + (Math.random() - 0.5) * 6;
    M.cam.b = 255;
    M.cam.sampled = true;
  }

  function autoRegulation() {
    UI.confirm('Auto Regulation',
      'Run auto regulation on the ' + M.cam.side + ' camera?<br><br>' +
      'This re-balances the camera against the background plate. On a real machine this is part ' +
      'of the technician\u2019s calibration.', 'Run').then(function (ok) {
      if (!ok) return;
      M.cam.gain.r = 373 + Math.round((Math.random() - 0.5) * 8);
      M.cam.gain.g = 448 + Math.round((Math.random() - 0.5) * 8);
      M.cam.gain.b = 574 + Math.round((Math.random() - 0.5) * 8);
      logEvent('Auto regulation run on ' + M.cam.side + ' camera', true);
      UI.toast('Auto regulation complete');
      render();
    });
  }

  function referenceValue() {
    UI.showDialog(function (box) {
      box.appendChild(el('h2', { text: 'Reference Value' }));
      var wrap = el('div', { style: 'display:flex;flex-direction:column;gap:16px;margin-bottom:20px' });
      ['r', 'g', 'b'].forEach(function (k) {
        var label = { r: 'Red', g: 'Green', b: 'Blue' }[k];
        var val = el('button', { class: 'num tappable', text: String(M.cam.ref[k]),
          title: 'Touch to type a value' });
        function setv(d) {
          M.cam.ref[k] = Math.max(0, Math.min(255, M.cam.ref[k] + d));
          val.textContent = String(M.cam.ref[k]);
        }
        val.addEventListener('click', function () {
          UI.valueKeypad({ value: M.cam.ref[k], min: 0, max: 255 }).then(function (v) {
            if (v === null) return;
            M.cam.ref[k] = v;
            val.textContent = String(v);
          });
        });
        wrap.appendChild(el('div', { style: 'display:flex;align-items:center;gap:14px' }, [
          el('button', { class: 'btn', text: '<', style: 'width:78px;height:62px',
            onclick: function () { setv(-1); } }),
          el('div', { style: 'flex:1;text-align:center;font-size:20px' }, [
            el('div', { text: label + ' Reference Value' }), val
          ]),
          el('button', { class: 'btn', text: '>', style: 'width:78px;height:62px',
            onclick: function () { setv(1); } })
        ]));
      });
      box.appendChild(wrap);
      box.appendChild(el('div', { class: 'dialog-actions' }, [
        el('button', { class: 'btn primary', text: 'Confirm', onclick: function () {
          UI.closeDialog();
          logEvent('Camera reference values changed', true);
          UI.toast('Reference values set');
        } })
      ]));
    });
  }

  function drawCam(canvas, opts) {
    if (!canvas) return;
    opts = opts || {};
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    /* The background plate fills the frame: a deep blue with very faint
       vertical streaking from the line-scan sensor. */
    var grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#4038f2');
    grd.addColorStop(0.45, '#4a44ff');
    grd.addColorStop(1, '#3d35ee');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    g.globalAlpha = 0.022;
    for (var x = 0; x < W; x += 9) {
      g.fillStyle = (x % 18 === 0) ? '#ffffff' : '#000000';
      g.fillRect(x, 0, 3, H);
    }
    g.globalAlpha = 1;

    /* Coffee passing the camera while the machine is running. */
    if (M.sim.running) {
      for (var i = 0; i < M.sim.beans.length; i++) {
        var b = M.sim.beans[i];
        if (b.y < 0 || b.y > 618) continue;
        g.fillStyle = Simulator.COLOURS[b.type];
        g.beginPath();
        g.ellipse((b.x / 556) * W, (b.y / 618) * H,
                  7 * M.cam.zoom, 5 * M.cam.zoom, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    if (opts.box && M.cam.box) {
      g.strokeStyle = '#f5e642';
      g.lineWidth = 3;
      g.strokeRect(M.cam.box.x, M.cam.box.y, M.cam.box.w, M.cam.box.h);
    }
  }

  function tabs(stateKey) {
    return el('div', { class: 'tabs' }, ['F', 'B'].map(function (t) {
      return el('button', {
        class: 'tab' + (M[stateKey] === t ? ' active' : ''),
        text: t,
        onclick: function () { M[stateKey] = t; render(); }
      });
    }));
  }

  function viewImage() {
    UI.alert('View Image',
      'On the machine this shows a live frame from the ' + M.sensTab +
      ' camera so you can see how the current profile is separating your coffee.<br><br>' +
      'The emulator shows the sorting chamber instead — press <strong>Start</strong> to watch beans ' +
      'being judged against these values.');
  }

  /* ---- Chute / feed settings ---- */
  screens.chute = function () {
    var p = Profiles.working;
    var fill = el('div', { class: 'barfill' });
    fill.style.width = p.chute + '%';

    function setChute(v) {
      p.chute = v;
      num.textContent = String(v);
      fill.style.width = v + '%';
      if (v > 70) UI.toast('Chute settings affect sorting performance and should not be changed.', true);
    }

    var num = el('button', { class: 'num tappable', text: String(p.chute),
      title: 'Touch to type a value' });
    num.addEventListener('click', function () {
      UI.valueKeypad({ value: p.chute, min: 0, max: 100 }).then(function (v) {
        if (v !== null) setChute(v);
      });
    });

    return el('div', { class: 'screen active' }, stdChrome({}).concat([
      el('div', { class: 'chute-panel' }, [
        el('div', { class: 'legend', text: 'Chute Vibrator' }),
        el('div', { class: 'inner' }, [
          el('button', { class: 'btn sq', text: '-',
            onclick: function () { setChute(Math.max(0, p.chute - 1)); } }),
          num,
          el('div', { class: 'bargraph' }, [fill]),
          el('button', { class: 'btn sq', text: '+',
            onclick: function () { setChute(Math.min(100, p.chute + 1)); } })
        ])
      ]),
      footer([
        footerItem('Data Same', 'i-datasame', function () {
          UI.toast('Data Same is not used on the Pearl Mini.', true);
        }),
        el('div', { style: 'flex:1' }),
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[0],
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[1]
      ])
    ]));
  };

  /* ---- Dust cleaning ---- */
  screens.cleaning = function () {
    var c = Profiles.working.clean;

    function row(label, unit, key, max) {
      var val = el('button', { class: 'num tappable', text: String(c[key]),
        title: 'Touch to type a value' });
      function set(v) { c[key] = Math.max(0, Math.min(max, v)); val.textContent = String(c[key]); }
      val.addEventListener('click', function () {
        UI.valueKeypad({ value: c[key], min: 0, max: max }).then(function (v) {
          if (v !== null) set(v);
        });
      });
      return el('div', {
        style: 'display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:64px'
      }, [
        el('div', { text: label, style: 'font-size:22px;width:200px;text-align:right' }),
        el('button', { class: 'btn', text: '<', style: 'width:100px;height:72px',
          onclick: function () { set(c[key] - 1); } }),
        el('div', { style: 'text-align:center' }, [
          el('div', { text: unit, style: 'font-size:19px;margin-bottom:4px' }), val
        ]),
        el('button', { class: 'btn', text: '>', style: 'width:100px;height:72px',
          onclick: function () { set(c[key] + 1); } })
      ]);
    }

    return el('div', { class: 'screen active' }, stdChrome({}).concat([
      el('div', { style: 'position:absolute;top:240px;left:110px;right:110px' }, [
        row('Clean Period', '(S)', 'period', 60),
        row('Clean Interval', 'Minute', 'interval', 60)
      ]),
      footer([
        footerItem('Manual Cleaning', 'i-clean', function () {
          M.sim.manualClean();
          logEvent('Manual cleaning cycle run');
          UI.toast('Cleaning cycle complete');
          render();
        }),
        el('div', { style: 'flex:1' }),
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[0],
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[1]
      ])
    ]));
  };

  /* ---- File selection ---- */
  screens.files = function () {
    var list = Profiles.all();
    if (!M.selectedFileId || !list.some(function (p) { return p.id === M.selectedFileId; })) {
      M.selectedFileId = Profiles.loaded().id;
    }

    var rows = list.map(function (p, i) {
      var d = new Date(p.createdAt);
      function pad(n) { return String(n).padStart(2, '0'); }
      var when = d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' +
                 pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      return el('div', {
        class: 'file-row' + (p.locked ? ' locked' : '') +
               (p.id === M.selectedFileId ? ' selected' : ''),
        onclick: function () { M.selectedFileId = p.id; render(); }
      }, [
        el('div', { text: '[' + (i + 1) + ']' }),
        el('div', { text: Profiles.displayName(p) }),
        el('div', { text: when })
      ]);
    });

    var sel = list.filter(function (p) { return p.id === M.selectedFileId; })[0];
    var actions = [];

    function actionBtn(label, h, onclick, disabled) {
      var b = el('button', { class: 'btn', text: label, onclick: onclick });
      b.style.height = h + 'px';
      b.style.marginBottom = '10px';
      if (disabled) b.disabled = true;
      return b;
    }

    actions.push(actionBtn('Save as', 104, doSaveAs));
    actions.push(el('div', { class: 'nav', style: 'margin-bottom:10px' }, [
      el('button', { class: 'btn', text: '<', style: 'flex:1;height:78px',
        onclick: function () { moveSelection(-1); } }),
      el('button', { class: 'btn', text: '>', style: 'flex:1;height:78px',
        onclick: function () { moveSelection(1); } })
    ]));

    if (M.supervisor) {
      actions.push(actionBtn('Overwrite File', 78, doOverwrite, sel && sel.locked));
      actions.push(actionBtn('Delete File', 78, doDelete, sel && sel.locked));
      actions.push(actionBtn('Rename', 78, doRename, sel && sel.locked));
      actions.push(actionBtn(sel && sel.locked ? 'Unlock' : 'Lock', 78, doLock));
    }

    actions.push(el('div', { class: 'spacer' }));
    actions.push(actionBtn('Call File', 104, doCallFile));

    return el('div', { class: 'screen active' }, UI.chrome({
      title: '[S/N:' + (list.indexOf(sel) + 1) + '] ' + Profiles.displayName(sel),
      level: M.level,
      showSave: false,
      onUser: onUserIcon,
      onBack: function () { go('menu'); }
    }).concat([
      el('div', { class: 'file-table' }, [
        el('div', { class: 'file-head' }, [
          el('div', { text: 'S/N' }),
          el('div', { text: 'File Name' }),
          el('div', { text: 'Creation Time' })
        ]),
        el('div', { class: 'file-rows' }, rows)
      ]),
      el('div', { class: 'file-actions' }, actions)
    ]));
  };

  function moveSelection(dir) {
    var list = Profiles.all();
    var i = 0;
    list.forEach(function (p, k) { if (p.id === M.selectedFileId) i = k; });
    i = Math.max(0, Math.min(list.length - 1, i + dir));
    M.selectedFileId = list[i].id;
    render();
  }

  function doSaveAs() {
    UI.prompt('Save as',
      'This copies the selected profile and saves it under a new name. SOVDA recommends new profiles ' +
      'are made from your Coffee Template so the technician’s settings carry over.',
      '', {
        okLabel: 'Save',
        validate: function (v) {
          if (!v) return 'Enter a profile name.';
          if (v.length > 40) return 'Name is too long.';
          return null;
        }
      }).then(function (name) {
        if (!name) return;
        var p = Profiles.saveAs(name);
        M.selectedFileId = p.id;
        logEvent('Profile created: ' + Profiles.displayName(p));
        UI.toast('Saved and loaded ' + Profiles.displayName(p));
        render();
      });
  }

  function doOverwrite() {
    var sel = Profiles.all().filter(function (p) { return p.id === M.selectedFileId; })[0];
    UI.confirm('Overwrite File',
      'Overwrite <strong>' + Profiles.displayName(sel) + '</strong> with the current sensitivity and ' +
      'cleaning settings?', 'Overwrite').then(function (ok) {
      if (!ok) return;
      if (Profiles.overwrite(sel.id)) {
        logEvent('Profile overwritten: ' + Profiles.displayName(sel));
        UI.toast('Profile saved');
      } else {
        UI.toast('Profile is locked and cannot be overwritten.', true);
      }
      render();
    });
  }

  function doDelete() {
    var sel = Profiles.all().filter(function (p) { return p.id === M.selectedFileId; })[0];
    UI.confirm('Delete File', 'Delete <strong>' + Profiles.displayName(sel) +
      '</strong>? This cannot be undone.', 'Delete').then(function (ok) {
      if (!ok) return;
      if (Profiles.remove(sel.id)) {
        logEvent('Profile deleted: ' + Profiles.displayName(sel));
        M.selectedFileId = null;
        UI.toast('Profile deleted');
      } else {
        UI.toast('Profile is locked, or it is the last profile on the machine.', true);
      }
      render();
    });
  }

  function doRename() {
    var sel = Profiles.all().filter(function (p) { return p.id === M.selectedFileId; })[0];
    UI.prompt('Rename', null, sel.name, {
      okLabel: 'Rename',
      validate: function (v) { return v ? null : 'Enter a profile name.'; }
    }).then(function (name) {
      if (!name) return;
      Profiles.rename(sel.id, name);
      logEvent('Profile renamed to ' + name);
      render();
    });
  }

  function doLock() {
    var sel = Profiles.all().filter(function (p) { return p.id === M.selectedFileId; })[0];
    var nowLocked = Profiles.toggleLock(sel.id);
    logEvent('Profile ' + (nowLocked ? 'locked' : 'unlocked') + ': ' + Profiles.displayName(sel));
    UI.toast(nowLocked
      ? 'Locked. Overwrite and Delete are disabled; edits made during sorting will revert to the saved values.'
      : 'Unlocked.');
    render();
  }

  function doCallFile() {
    var sel = Profiles.all().filter(function (p) { return p.id === M.selectedFileId; })[0];
    var warn = Profiles.isDirty()
      ? 'The profile currently loaded has unsaved changes. Loading another profile will discard them.<br><br>'
      : '';
    UI.confirm('Call File', warn + 'Load <strong>' + Profiles.displayName(sel) +
      '</strong>?<br><br>On the machine this can take up to 60 seconds.', 'Load')
      .then(function (ok) {
        if (!ok) return;
        Profiles.loadFile(sel.id);
        M.sim.reset();
        logEvent('Profile loaded: ' + Profiles.displayName(sel));
        UI.toast('Loaded ' + Profiles.displayName(sel));
        render();
      });
  }

  /* ---- Valve test ---- */
  screens.valvetest = function () {
    var body = el('div', { class: 'tab-body' }, [
      el('div', {
        style: 'position:absolute;top:60px;left:0;right:0;display:flex;flex-direction:column;' +
               'align-items:center;gap:14px'
      }, [
        UI.spinner({
          label: 'Ejector numbers', min: 1, max: Simulator.EJECTORS,
          get: function () { return M.ejectorNumber; },
          set: function (v) { M.ejectorNumber = v; }
        }),
        UI.spinner({
          label: 'Test Speed', min: 10, max: 500, step: 10,
          get: function () { return M.testSpeed; },
          set: function (v) { M.testSpeed = v; }
        }),
        wideBtn('Single ejector test', function () { fireTest('single'); }),
        wideBtn('Multiple ejector test', function () { fireTest('multiple'); }),
        wideBtn('Auto Test', function () { fireTest('auto'); })
      ])
    ]);

    return el('div', { class: 'screen active' }, UI.chrome({
      title: title(), level: M.level, showSave: false,
      onUser: onUserIcon, onBack: function () { go('menu'); }
    }).concat([
      tabs('valveTab'),
      el('div', {
        style: 'position:absolute;top:152px;right:110px;display:flex;align-items:center;gap:14px'
      }, [
        el('button', { class: 'btn', text: '<', style: 'width:92px;height:76px' }),
        el('div', { text: '1', style: 'font-size:24px;width:30px;text-align:center' }),
        el('button', { class: 'btn', text: '>', style: 'width:92px;height:76px' })
      ]),
      body,
      footer([
        el('div', { style: 'flex:1' }),
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[0],
        UI.lamps({ valve: M.valve, feed: M.feed, toggle: toggleLamp })[1]
      ])
    ]));
  };

  function wideBtn(label, onclick) {
    var b = el('button', { class: 'btn', text: label, onclick: onclick });
    b.style.width = '430px';
    b.style.height = '72px';
    b.style.fontSize = '21px';
    return b;
  }

  function fireTest(kind) {
    if (!M.valve) {
      UI.toast('Valve must be active for ejectors to fire. Tap the Valve lamp.', true);
      return;
    }
    var flash = M.sim.ejectorFlash;
    if (kind === 'single') {
      flash[M.ejectorNumber - 1] = 0.5;
      logEvent('Single ejector test: ejector ' + M.ejectorNumber);
      UI.toast('Fired ejector ' + M.ejectorNumber + ' (' + M.valveTab + ' camera signal)');
    } else {
      var i = 0;
      var timer = setInterval(function () {
        flash[i] = 0.25;
        i++;
        if (i >= Simulator.EJECTORS) clearInterval(timer);
      }, Math.max(8, 600 / M.testSpeed * 20));
      logEvent((kind === 'auto' ? 'Auto' : 'Multiple') + ' ejector test started');
      UI.toast('Firing ejectors 1–' + Simulator.EJECTORS + ' left to right');
    }
    go('valvetest');
  }

  /* ---- Information screens ---- */
  screens.history = function () {
    var lines = M.log.length
      ? M.log.map(function (l, i) {
          return el('button', {
            class: 'il-line' + (i === M.logSelected ? ' selected' : ''),
            text: l.stamp + '  ' + l.msg,
            onclick: function () { M.logSelected = i; render(); }
          });
        })
      : [el('div', { class: 'il-line', text: 'No events recorded.' })];

    return el('div', { class: 'screen active' }, [
      el('div', { class: 'titlebar', text: title() }),
      el('div', { class: 'chrome-icons' }, [
        el('button', { class: 'btn', text: 'Operation Note', style: 'height:70px;padding:0 26px',
          onclick: function () {
            UI.prompt('Operation Note',
              'Add a note to the information list \u2014 what was run, what was changed, ' +
              'what to tell the next shift.', '', { okLabel: 'Add' }).then(function (v) {
              if (!v) return;
              logEvent('Note: ' + v);
              M.logSelected = 0;
              render();
            });
          } }),
        el('button', { class: 'chrome-icon', title: 'Back',
          onclick: function () { go('home'); } }, [icon('i-back')])
      ]),
      el('div', { class: 'il-head', text: 'Information List' }),
      el('div', { class: 'il-body' }, lines)
    ]);
  };

  screens.contact = function () {
    var info = M.info;
    var rows = info.lines.length
      ? info.lines.map(function (t) { return el('div', { class: 'log-line', text: t }); })
      : [el('div', { class: 'log-line', text: 'No service information loaded.' })];

    return el('div', { class: 'screen active' }, UI.chrome({
      title: 'Service & Contact', level: M.level, showSave: false,
      onUser: onUserIcon, onBack: function () { go('home'); }
    }).concat([
      el('div', { class: 'info-body' }, [
        (info.factory || info.number)
          ? el('p', { style: 'margin-bottom:14px',
              text: [info.factory, info.number].filter(Boolean).join('   NO.: ') })
          : null,
        el('div', {}, rows),
        el('p', { style: 'margin-top:22px;color:#8a8a8a;font-size:17px',
          html: 'Loaded by your technician under System Setting \u2192 General Setting ' +
                '\u2192 Related Info.' })
      ])
    ]));
  };

  screens.network = function () {
    return el('div', { class: 'screen active' }, UI.chrome({
      title: 'Network', level: M.level, showSave: false,
      onUser: onUserIcon, onBack: function () { go('home'); }
    }).concat([
      el('div', { class: 'info-body' }, [
        el('dl', {}, [
          el('dt', { text: 'WiFi bridge' }), el('dd', { text: 'Not connected (emulator)' }),
          el('dt', { text: 'IP address' }), el('dd', { text: '—' })
        ]),
        el('p', { style: 'margin-top:22px', html:
          'When a WiFi bridge is fitted, this screen shows the machine’s IP address so the Pearl ' +
          'Mini can be reached remotely.' })
      ])
    ]));
  };

  /* ---- Run / sorting ---- */
  screens.run = function () {
    var canvas = el('canvas', { width: 556, height: 618 });
    var statsBox = el('div', { class: 'stats' });

    var node = el('div', { class: 'screen active' }, UI.chrome({
      title: title(), level: M.level, showSave: false,
      onUser: onUserIcon, onBack: function () { go('home'); }
    }).concat([
      el('div', { class: 'run-wrap' }, [
        el('div', { class: 'chamber' }, [canvas]),
        statsBox
      ]),
      footer([
        footerItem('Sensitivity', 'i-chart', function () { go('sensitivity'); }),
        footerItem('Cleaning', 'i-clean', function () { go('cleaning'); }),
        footerItem('Reset counters', 'i-datasame', function () {
          M.sim.reset(); UI.toast('Counters reset');
        }),
        M.sim.running
          ? footerItem('Stop', 'i-stop', stopSorting)
          : footerItem('Start', 'i-start', startSorting)
      ])
    ]));

    node._canvas = canvas;
    node._stats = statsBox;
    return node;
  };

  var GEOM = { chuteX: 200, chuteW: 130, ejectY: 250, h: 618 };

  function drawRun(node) {
    var canvas = node._canvas;
    if (!canvas) return;
    var g = canvas.getContext('2d');
    var sim = M.sim;

    g.fillStyle = '#050505';
    g.fillRect(0, 0, 556, 618);

    // Chute walls
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(GEOM.chuteX - GEOM.chuteW / 2 - 12, 0);
    g.lineTo(GEOM.chuteX - GEOM.chuteW / 2 - 12, GEOM.ejectY - 40);
    g.moveTo(GEOM.chuteX + GEOM.chuteW / 2 + 12, 0);
    g.lineTo(GEOM.chuteX + GEOM.chuteW / 2 + 12, GEOM.ejectY - 40);
    g.stroke();

    // Ejector line
    g.strokeStyle = '#5e8f3e';
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(0, GEOM.ejectY); g.lineTo(556, GEOM.ejectY);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#5e8f3e';
    g.font = '13px Helvetica, Arial, sans-serif';
    g.fillText('EJECTORS', 8, GEOM.ejectY - 8);

    // Beans
    for (var i = 0; i < sim.beans.length; i++) {
      var b = sim.beans[i];
      g.fillStyle = Simulator.COLOURS[b.type];
      g.beginPath();
      g.ellipse(b.x, b.y, 3.4, 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Collection bins
    g.strokeStyle = '#2a2a2a';
    g.beginPath();
    g.moveTo(330, 540); g.lineTo(330, 618);
    g.stroke();
    g.fillStyle = '#7a7a7a';
    g.font = '14px Helvetica, Arial, sans-serif';
    g.fillText('ACCEPT', 20, 600);
    g.fillText('REJECT', 400, 600);

    // Dust haze over the glass
    if (sim.dust > 0.05) {
      g.fillStyle = 'rgba(190,180,150,' + (sim.dust * 0.22).toFixed(3) + ')';
      g.fillRect(0, 0, 556, GEOM.ejectY);
    }

    drawStats(node._stats);
  }

  function statRow(k, v, cls) {
    return el('div', { class: 'stat-row' }, [
      el('span', { class: 'k', text: k }),
      el('span', { class: 'v' + (cls ? ' ' + cls : ''), text: v })
    ]);
  }

  function drawStats(box) {
    var s = M.sim.stats, d = M.sim.derived();
    function pct(n) { return n.toFixed(1) + '%'; }

    box.innerHTML = '';
    box.appendChild(el('h3', { text: 'Throughput' }));
    box.appendChild(statRow('Beans fed', s.fed.toLocaleString()));
    box.appendChild(statRow('Accepted', s.accepted.toLocaleString()));
    box.appendChild(statRow('Rejected', s.rejected.toLocaleString()));
    box.appendChild(statRow('Reject rate', pct(d.rejectRate)));

    box.appendChild(el('h3', { text: 'Accept side' }));
    box.appendChild(statRow('Purity', pct(d.purity), d.purity > 98.5 ? 'good' : 'bad'));
    box.appendChild(statRow('Quakers through', String(s.passedByType.quaker),
      s.passedByType.quaker > s.fed * 0.006 ? 'bad' : 'good'));
    box.appendChild(statRow('Patio / stones through', String(s.passedByType.patio),
      s.passedByType.patio > s.fed * 0.004 ? 'bad' : 'good'));
    box.appendChild(statRow('Burnt through', String(s.passedByType.burnt),
      s.passedByType.burnt > s.fed * 0.004 ? 'bad' : 'good'));

    box.appendChild(el('h3', { text: 'Reject side' }));
    box.appendChild(statRow('Good coffee lost', String(s.rejectedByType.good),
      d.goodRejectedRate > 4 ? 'bad' : 'good'));
    box.appendChild(statRow('Good-bean yield', pct(d.goodYield), d.goodYield > 95 ? 'good' : 'bad'));

    box.appendChild(el('h3', { text: 'Glass' }));
    box.appendChild(statRow('Dust level', pct(M.sim.dust * 100), M.sim.dust > 0.5 ? 'bad' : 'good'));
    box.appendChild(statRow('Clean interval',
      Profiles.working.clean.interval ? Profiles.working.clean.interval + ' min' : 'OFF',
      Profiles.working.clean.interval ? 'good' : 'bad'));

    box.appendChild(el('div', { class: 'advice', html: M.sim.advice() }));
  }

  /* ---- Ejector LED bar (shown under the run + valve test screens) ---- */
  function buildLedBar() {
    var bar = el('div', { class: 'led-bar', id: 'led-bar' });
    for (var r = 0; r < 2; r++) {
      var row = el('div', { class: 'led-row' });
      for (var i = 0; i < Simulator.EJECTORS; i++) row.appendChild(el('div', { class: 'led' }));
      bar.appendChild(row);
    }
    return bar;
  }

  function updateLeds() {
    var bar = document.getElementById('led-bar');
    if (!bar) return;
    var rows = bar.children;
    for (var r = 0; r < rows.length; r++) {
      var leds = rows[r].children;
      for (var i = 0; i < leds.length; i++) {
        var on = M.sim.ejectorFlash[i] > 0 && M.valve;
        leds[i].className = 'led' + (on ? ' fire' : '');
      }
    }
  }

  /* ---- Start / stop / power ---- */
  function startSorting() {
    M.valve = true;
    M.feed = true;
    M.sim.running = true;
    logEvent('Sorting started on ' + title());
    go('run');
  }

  function stopSorting() {
    M.sim.running = false;
    M.valve = false;
    M.feed = false;
    logEvent('Sorting stopped');
    render();
  }

  function powerOff() {
    UI.confirm('OFF', 'Turn off the Pearl Mini?', 'Turn off').then(function (ok) {
      if (!ok) return;
      return UI.confirm('OFF', 'Confirm shutdown. The machine will power down safely.', 'Confirm');
    }).then(function (ok) {
      if (!ok) return;
      M.sim.running = false;
      M.valve = M.feed = false;
      M.powered = false;
      logEvent('Machine powered off from the screen');
      document.getElementById('power-off').classList.add('on');
    });
  }

  document.getElementById('power-off').addEventListener('click', function () {
    this.classList.remove('on');
    M.powered = true;
    M.sim.reset();
    logEvent('Machine powered on');
    go('home');
  });

  /* ---- System Setting ----
     Reproduced as a read-only view. The manual is explicit that changing
     anything here can cause serious sorting problems, so the emulator lets you
     recognise the screen without teaching anyone to edit it. */
  /* Supervisor reaches General Setting only. Manufacturer Engineer reaches
     everything except Type of machine at the very bottom, which is JXO only. */
  var SYS_NAV = [
    { label: 'General Setting',  needs: 'supervisor' },
    { label: 'ON-OFF Settings',  needs: 'engineer' },
    { label: 'Port Setting',     needs: 'engineer' },
    { label: 'Camera Program',   needs: 'engineer' },
    { label: 'PLC',              needs: 'engineer' },
    { label: 'Network',          needs: 'engineer' },
    { label: 'Fault Code',       needs: 'engineer' },
    { label: 'Type of machine',  needs: 'jxo' }
  ];
  var SYS_TABS = ['COM', 'Vibrator Board', 'Background', 'SprayValve', 'Light'];
  var SOFTWARE_VERSION = 'JXO-VT-2.8-3527-20250419111509';

  screens.system = function () {
    /* Drop back to the highest panel this level is allowed to see. */
    var current = SYS_NAV.filter(function (n) { return n.label === M.sysNav; })[0];
    if (!current || !atLeast(current.needs)) {
      var first = SYS_NAV.filter(function (n) { return atLeast(n.needs); })[0];
      M.sysNav = first ? first.label : 'General Setting';
    }

    /* Entries above your level are not shown at all: an Engineer session has
       seven nav buttons with no Type of machine among them. */
    var visible = SYS_NAV.filter(function (n) { return atLeast(n.needs); });
    var nav = el('div', { class: 'sys-nav' }, visible.map(function (n) {
      return el('button', {
        class: 'btn' + (M.sysNav === n.label ? ' active' : ''),
        text: n.label,
        onclick: function () { M.sysNav = n.label; render(); }
      });
    }));

    var panel;
    if (M.sysNav === 'Port Setting') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-tabs' }, SYS_TABS.map(function (t) {
          return el('button', {
            class: 'tab' + (M.sysTab === t ? ' active' : ''), text: t,
            onclick: function () { M.sysTab = t; render(); }
          });
        })),
        el('div', { class: 'sys-body' }, portBody())
      ]);
    } else if (M.sysNav === 'PLC') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body' }, [
          el('div', { class: 'plc-head', text: 'Signal Interface' }),
          el('div', { class: 'plc-list' },
            ['ETM_IN_1', 'ETM_IN_2', 'ETM_IN_3', 'ETM_IN_4', '[08]SETM_IN_1'].map(function (n) {
              return el('div', { class: 'plc-row', text: n + '  null' });
            })),
          el('div', { class: 'plc-relay' }, [
            el('div', { class: 'plc-relay-label', text: 'Electronic Relay Linkage Control' }),
            el('div', { class: 'plc-relay-actions' }, [
              el('button', { class: 'btn', text: 'Add', onclick: function () {
                UI.alert('Electronic Relay Linkage Control',
                  'Adds a relay linkage rule, tying a signal interface to an external device. ' +
                  'Technician configuration \u2014 not reproduced.');
              } }),
              el('button', { class: 'btn', text: 'Delete', onclick: function () {
                UI.toast('No linkage rules configured.', true);
              } })
            ])
          ])
        ])
      ]);
    } else if (M.sysNav === 'Network') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body' }, [
          el('div', { class: 'net-top' }, [
            el('div', { class: 'net-adapter' }, [
              el('span', { text: 'Realtek PCIe GBE Family Controller #6' }),
              el('span', { class: 'caret', text: '\u25be' })
            ]),
            el('button', { class: 'refresh', title: 'Refresh', onclick: function () {
              UI.toast('IP: 192.168.253.101');
            } }, [icon('i-refresh')])
          ]),
          el('div', { class: 'net-ip', text: 'IP: 192.168.253.101' }),
          el('div', { class: 'net-box' }, [
            el('div', { class: 'net-opt' }, [
              el('span', { class: 'box' }), el('span', { text: 'Obtain an IP address automatically' })
            ]),
            el('div', { class: 'net-opt' }, [
              el('span', { class: 'box' }), el('span', { text: 'Use the following IP address' })
            ]),
            el('button', { class: 'btn net-btn', text: 'Network', onclick: function () {
              UI.alert('Network',
                'Opens the machine\u2019s network configuration. The emulator is not on a ' +
                'network and shows the address a commissioned machine reports.');
            } })
          ])
        ])
      ]);
    } else if (M.sysNav === 'Camera Program') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body' }, [
          el('div', { class: 'camprog-row' }, [
            el('button', { class: 'btn camprog', text: 'Mode Switch',
              onclick: function () { go('modelist'); } }),
            el('button', { class: 'btn camprog', html: 'White Balance<br>Intelligent Correction',
              onclick: function () {
                UI.alert('White Balance Intelligent Correction',
                  'Runs an automatic white balance correction across the cameras. Part of ' +
                  'the technician\u2019s calibration and not reproduced. The manual white ' +
                  'balance screen is under Camera Setting on the menu.');
              } })
          ])
        ])
      ]);
    } else if (M.sysNav === 'ON-OFF Settings') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body' }, onOffBody())
      ]);
    } else if (M.sysNav === 'General Setting') {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body general' }, [
          el('div', { class: 'gen-grid' },
            GENERAL_TILES
              .filter(function (t) { return !t || atLeast(t.needs); })
              .map(function (t) {
                if (!t) return el('div');
                return el('button', { class: 'gen-tile', text: t.label,
                  onclick: function () { openGeneralItem(t.label); } });
              }))
        ])
      ]);
    } else {
      panel = el('div', { class: 'sys-panel' }, [
        el('div', { class: 'sys-body' }, [
          el('p', { style: 'font-size:20px', text: M.sysNav }),
          el('p', { style: 'margin-top:18px;color:#b9b9b9;font-size:18px;line-height:1.6',
            html: 'This is technician calibration territory. The emulator shows the navigation so ' +
                  'you can recognise where you are, but does not reproduce the contents of ' +
                  '<strong>' + M.sysNav + '</strong>.<br><br>' +
                  'On a real Pearl Mini, changing these values can cause serious sorting ' +
                  'performance issues and may require a technician visit to recalibrate.' })
        ])
      ]);
    }

    return el('div', { class: 'screen active' }, [
      el('div', { class: 'sys-title', text: SOFTWARE_VERSION }),
      el('div', { class: 'sys-saverestart' }, [
        el('button', { class: 'chrome-icon', title: 'Save', onclick: function () {
          UI.toast('Save & Restart is disabled in the emulator.', true);
        } }, [icon('i-floppy')]),
        el('div', { text: 'Save&Restart', style: 'font-size:21px' })
      ]),
      el('div', { class: 'chrome-icons' }, [
        el('button', { class: 'chrome-icon', title: 'User', onclick: onUserIcon },
          [(function () { var i2 = icon('i-person'); i2.style.color = levelColour(); return i2; })()]),
        el('button', { class: 'chrome-icon', title: 'Back',
          onclick: function () { go('menu'); } }, [icon('i-back')])
      ]),
      nav, panel
    ]);
  };

  /* Two columns, in the order the machine lists them. The gap opposite Related
     Info is real -- there is no tile there. A Supervisor sees the first five;
     Time Correction and User password need Manufacturer Engineer. */
  var GENERAL_TILES = [
    { label: 'Device Management', needs: 'supervisor' },
    { label: 'Desktop',           needs: 'supervisor' },
    { label: 'Screenshot',        needs: 'supervisor' },
    { label: 'Language Setting',  needs: 'supervisor' },
    { label: 'Related Info',      needs: 'supervisor' },
    null,
    { label: 'Time Correction',   needs: 'engineer' },
    { label: 'User password',     needs: 'engineer' }
  ];

  /* ---- Language Setting ----
     Font size and typeface on the left, the installed display languages on the
     right with the language-pack version above them. */
  var LANGUAGE_PACK_VERSION = '20220111161528953';

  var FONTS = ['Aharoni', 'Andalus', 'Angsana New', 'AngsanaUPC', 'Aparajita',
    'Arabic Transparent', 'Arabic Typesetting', 'Arial', 'Arial Baltic', 'Arial Black',
    'Arial CE', 'Arial CYR', 'Arial Greek', 'Arial TUR', 'Batang', 'BatangChe',
    'Browallia New', 'BrowalliaUPC', 'Calibri', 'Cambria', 'Cambria Math', 'Candara',
    'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel'];

  screens.language = function () {
    var L = M.lang;

    var fontList = el('div', { class: 'font-list' }, FONTS.map(function (f) {
      return el('button', {
        class: 'font-item' + (f === L.font ? ' selected' : ''), text: f,
        onclick: function () { L.font = f; render(); }
      });
    }));

    var current = L.installed.filter(function (r) { return r.on; })[0];

    return el('div', { class: 'screen active' }, [
      el('div', { class: 'lang-left' }, [
        el('div', { class: 'lang-head', text: 'Font Size' }),
        el('div', { class: 'font-size-row' }, [
          el('button', { class: 'btn sq', text: '-',
            onclick: function () { L.size = Math.max(8, L.size - 1); render(); } }),
          el('button', { class: 'num tappable', text: String(L.size),
            title: 'Touch to type a value',
            onclick: function () {
              UI.valueKeypad({ value: L.size, min: 8, max: 48 }).then(function (v) {
                if (v !== null) { L.size = v; render(); }
              });
            } }),
          el('button', { class: 'btn sq', text: '+',
            onclick: function () { L.size = Math.min(48, L.size + 1); render(); } })
        ]),
        el('div', { class: 'lang-font-name', text: L.font }),
        fontList
      ]),

      el('div', { class: 'lang-right' }, [
        el('div', { class: 'lang-ver',
          html: 'ver:' + LANGUAGE_PACK_VERSION + '<br>' + (current ? current.name : '\u2014') }),
        el('div', { class: 'lang-rows' }, L.installed.map(function (row) {
          return el('div', { class: 'lang-row' }, [
            el('div', { class: 'lang-name', text: row.name }),
            rocker(row.on, false, function () {
              row.on = !row.on;
              logEvent('Language ' + row.name + ' ' + (row.on ? 'enabled' : 'disabled'));
              render();
            })
          ]);
        }))
      ]),

      el('button', { class: 'lang-ok', title: 'Confirm',
        onclick: function () { go('system'); } }),

      el('div', { class: 'lang-note', text:
        'The emulator records these choices but keeps its own text in English at a fixed ' +
        'size, so the layout stays faithful to the machine.' })
    ]);
  };


  function openGeneralItem(name) {
    if (name === 'Language Setting') { go('language'); return; }

    if (name === 'Time Correction') { openTimeCorrection(); return; }

    if (name === 'Related Info') { go('relatedinfo'); return; }

    if (name === 'User password') { go('userpassword'); return; }

    UI.alert(name, 'The emulator does not reproduce <strong>' + name + '</strong>.');
  }

  /* ---- ON-OFF Settings ----
     The full scrolling list, in the order the machine shows it. Rows with a
     legend are drawn as a bordered group; `parts` are the values that sit to
     the left of the switch. A row with toggle:false has no switch at all. */
  var ONOFF_ROWS = [
    { group: 'FBWF', parts: ['System protection status'], on: true },
    { group: 'Layer:Group', parts: ['[F & B]'], on: false },
    { group: 'Data Same Setting',
      parts: ['Equivalent Increase or Decrease  ON-OFF'], on: false },
    { parts: ['Dedusting Detection'], on: false },
    { parts: ['Cleaning, turn Off threshold.'], on: true },
    { parts: ['Wait for delay after stopping feeding before ash removal\uFF1A 2s'], toggle: false },
    { parts: ['Flexible Feeding'], on: false },
    { parts: ['Production line following'], on: false },
    { group: 'Production Line Control-Electronic Relay Linkage Control', parts: [], on: false },
    { group: 'Peripheral Front Feed', parts: [], on: false },
    { group: 'Malfunction Indicator Lamp', parts: [], on: false },
    { group: 'Bearing Oiling',
      parts: ['[1000]Hour(H)-Warning', '[3427]Hour(H)-Used'], on: false },
    { group: 'Filter Element Setting',
      parts: ['[5000]Hour(H)-Warning', '[3474]Hour(H)-Used'], on: false },
    { group: 'Air Tank Drainage Setting',
      parts: ['interval\uFF1A\u30102\u3011Hour(H)'], on: false },
    { group: '(Alarm) Temperature Detection',
      parts: ['Count:3', 'Failure alarm: > 60\u2103'], on: false },
    { parts: ['Power Detection'], on: false },
    { parts: ['[ Light compensation]', 'Correction'], on: false },
    { parts: ['Ejector Self-Test', '0s'], on: false },
    { group: 'Push Mail', parts: ['Email: NULL'], on: false },
    { parts: ['Internet of Things (IOT)'], on: false },
    { parts: ['Image Capture(Sampling)'], on: false }
  ];

  function onOffBody() {
    return ONOFF_ROWS.map(function (r) {
      var kids = [];
      if (r.group) kids.push(el('div', { class: 'legend', text: r.group }));
      kids.push(el('div', { class: 'oo-parts' }, r.parts.map(function (t) {
        return el('span', { text: t });
      })));
      if (r.toggle !== false) kids.push(rocker(!!r.on, true));
      return el('div', { class: 'oo-row' + (r.group ? ' grouped' : '') }, kids);
    });
  }

  function portBody() {
    if (M.sysTab === 'COM') {
      return [
        el('div', { class: 'peripheral-bar', text: 'Peripheral List' }),
        comGroup('COM-A', 'COM1', 'ETM_V3x Connected'),
        comGroup('COM-B', 'COM2', '[08]SETM_DIDO Connected')
      ];
    }
    if (M.sysTab === 'Vibrator Board') {
      var rows = [];
      for (var i = 1; i <= 16; i++) {
        rows.push(el('div', { class: 'vib-row' }, [
          el('div', { class: 'n', text: String(i) }),
          el('div', { class: 'cell' + (i === 1 ? '' : ' blank'), text: i === 1 ? '1 sorting' : '' }),
          el('div', { class: 'cell' + (i === 1 ? ' idx' : ' blank'), text: i === 1 ? '1' : '' }),
          el('div', { class: 'cell' + (i === 1 ? '' : ' blank'),
            text: i === 1 ? 'Chute Vibrator' : '' }),
          rocker(i === 1, true)
        ]));
      }
      return rows;
    }
    if (M.sysTab === 'Light') {
      /* The two groups are the peripherals listed on the COM tab: the ETM board
         carries lights 0-2, the [08]SETM board 3-8. */
      return [
        lightGroup('ETM', [
          { n: 0, on: true }, { n: 1, on: true }, { n: 2, on: true }
        ]),
        lightGroup('[08]SETM', [
          { n: 3, on: false }, { n: 4, on: false }, { n: 5, on: false },
          { n: 6, on: false }, { n: 7, on: false }, { n: 8, on: false }
        ])
      ];
    }
    if (M.sysTab === 'Background') {
      return [
        el('div', { class: 'bg-row' }, [
          el('div', { class: 'side', text: 'F' }),
          el('button', { class: 'btn wide', text: 'Light Adjustment   [#1]',
            onclick: function () { lightAdjustment('F', 1); } })
        ]),
        el('div', { class: 'bg-row' }, [
          el('div', { class: 'side', text: 'B' }),
          el('button', { class: 'btn wide', text: 'Light Adjustment   [#2]',
            onclick: function () { lightAdjustment('B', 2); } })
        ])
      ];
    }
    return [el('p', {
      style: 'font-size:18px;color:#b9b9b9;line-height:1.6',
      html: 'The <strong>' + M.sysTab + '</strong> tab is part of the technician\u2019s port ' +
            'configuration and is not reproduced.'
    })];
  }

  /* Time Correction: year / month / day over hour / minute / second, each with
     its own small up and down arrows. The emulator follows the computer clock,
     so this shows the current time and explains rather than setting it. */
  function openTimeCorrection() {
    var d = new Date();
    var fields = [
      { key: 'year',   label: '(year)',   value: d.getFullYear(), min: 2000, max: 2099 },
      { key: 'month',  label: '(month)',  value: d.getMonth() + 1, min: 1, max: 12 },
      { key: 'day',    label: '(day)',    value: d.getDate(),     min: 1, max: 31 },
      { key: 'hour',   label: '(hour)',   value: d.getHours(),    min: 0, max: 23 },
      { key: 'minute', label: '(minute)', value: d.getMinutes(),  min: 0, max: 59 },
      { key: 'second', label: '(second)', value: d.getSeconds(),  min: 0, max: 59 }
    ];

    UI.showDialog(function (box) {
      box.className = 'dialog timepad';
      box.appendChild(el('div', { class: 'kp-title', text: '(Time Correction )' }));

      box.appendChild(el('div', { class: 'time-grid' }, fields.map(function (f) {
        var val = el('div', { class: 'time-box', text: String(f.value) });
        function bump(dir) {
          f.value = Math.max(f.min, Math.min(f.max, f.value + dir));
          val.textContent = String(f.value);
        }
        return el('div', { class: 'time-cell' }, [
          el('div', { class: 'time-label', text: f.label }),
          el('div', { class: 'time-input' }, [
            val,
            el('div', { class: 'time-arrows' }, [
              el('button', { class: 'up',   onclick: function () { bump(1); } }),
              el('button', { class: 'down', onclick: function () { bump(-1); } })
            ])
          ])
        ]);
      })));

      box.appendChild(el('div', { class: 'time-foot' }, [
        el('button', { class: 'ok', title: 'Confirm', onclick: function () {
          box.className = 'dialog';
          UI.closeDialog();
          UI.toast('The emulator follows your computer clock, so the machine time is ' +
                   'not changed. Note the Supervisor, Engineer and JXO passwords all ' +
                   'come from it.', true);
        } })
      ]));
    });
  }

  /* ---- Related Info ----
     Where the factory name, machine number and service contact lines live. This
     is what the telephone icon on the home screen displays, which is how SOVDA's
     support details get onto a commissioned machine. */
  screens.relatedinfo = function () {
    var info = M.info;

    var lines = info.lines.length
      ? info.lines.map(function (t, i) {
          return el('button', {
            class: 'ri-line' + (i === info.selected ? ' selected' : ''), text: t,
            onclick: function () { info.selected = i; render(); }
          });
        })
      : [el('div', { class: 'ri-empty', text: 'No information added.' })];

    function field(label, key) {
      return el('button', { class: 'ri-field', title: 'Touch to type',
        onclick: function () {
          UI.prompt(label, null, info[key], { okLabel: 'Set' }).then(function (v) {
            if (v === null) return;
            info[key] = v;
            render();
          });
        }
      }, [el('span', { text: info[key] ? label + '  ' + info[key] : label })]);
    }

    return el('div', { class: 'screen active' }, [
      el('div', { class: 'ri-panel' }, [
        el('div', { class: 'bar' }),
        el('div', { class: 'inner' }, [
          field('Factory Name', 'factory'),
          field('NO.:', 'number'),
          el('div', { class: 'ri-body' }, [
            el('div', { class: 'ri-lines' }, lines),
            el('div', { class: 'ri-actions' }, [
              el('button', { class: 'btn', text: 'Add', onclick: function () {
                UI.prompt('Add', 'Type the line to add to the information list.', '',
                  { okLabel: 'Add', validate: function (v) { return v ? null : 'Enter some text.'; } }
                ).then(function (v) {
                  if (!v) return;
                  info.lines.push(v);
                  info.selected = info.lines.length - 1;
                  logEvent('Related Info line added');
                  render();
                });
              } }),
              el('button', { class: 'btn', text: 'Delete', onclick: function () {
                if (info.selected == null || !info.lines[info.selected]) {
                  UI.toast('Select a line first.', true);
                  return;
                }
                UI.confirm('Delete',
                  'Remove <strong>' + info.lines[info.selected] + '</strong>?', 'Delete')
                  .then(function (ok) {
                    if (!ok) return;
                    info.lines.splice(info.selected, 1);
                    info.selected = null;
                    logEvent('Related Info line deleted');
                    render();
                  });
              } })
            ])
          ]),
          el('div', { class: 'ri-foot' }, [
            el('button', { class: 'ok', title: 'Confirm',
              onclick: function () { go('system'); } })
          ])
        ])
      ])
    ]);
  };

  /* ---- User password ---- */
  screens.userpassword = function () {
    var rows = ['operator', 'supervisor', 'engineer'].map(function (lv) {
      var s2 = icon('i-person');
      s2.style.color = LEVEL_INFO[lv].colour;
      return el('button', { class: 'pw-row', onclick: function () {
        UI.alert(levelLabel(lv),
          'On the machine this is where the <strong>' + levelLabel(lv) + '</strong> password ' +
          'is set. All three read <em>Default</em> here, meaning the machine is using its ' +
          'built-in codes.<br><br>The emulator keeps those fixed so the levels can be ' +
          'practised: Supervisor is the date (YYYYMMDD), Manufacturer Engineer the time ' +
          '(HHMM), and JXO the day and time (DDHHMM).');
      } }, [
        s2,
        el('div', { class: 'pw-label', text: levelLabel(lv) + ' : Default' })
      ]);
    });

    return el('div', { class: 'screen active' }, [
      el('button', { class: 'lang-ok', title: 'Confirm',
        style: 'top:92px;right:150px;bottom:auto',
        onclick: function () { go('system'); } }),
      el('div', { class: 'pw-list' }, rows)
    ]);
  };

  /* ---- Mode List ----
     Every sorting mode the machine knows, as [ModeName] file. The coffee modes
     are the ones a roastery sees: [RedMode06] and [Roasted] both run the
     top_CaffeFruit_B1_01 camera file. */
  var MODE_LIST = [
    '[HSV03] top_plastic_B1_03',
    '[PlasticMode01] top_suliao_B1_02',
    '[RedMode01] top_HongGuaZi_B1_02',
    '[RedMode02] top_huashengmi_xx_02',
    '[RedMode03] top_Cicer_B1_01',
    '[RedMode04] top_ZiHua_B1_02',
    '[RedMode05] top_HongDou_B1_02',
    '[RedMode06] top_CaffeFruit_B1_01',
    '[RedMode07] top_HSM_B1_03',
    '[RedMode08] top_HSM_B1_05',
    '[Roasted] top_CaffeFruit_B1_01',
    '[WhiteMode01] top_BaiGuaZi_B1_04',
    '[WhiteMode02] top_Cicer_B1_01',
    '[WhiteMode03] top_naihua_xx_06',
    '[WhiteMode04] top_NaiHua_B1_07'
  ];

  screens.modelist = function () {
    var rows = MODE_LIST.map(function (m, i) {
      var isCurrent = m.indexOf('[' + Profiles.working.mode + ']') === 0;
      return el('button', {
        class: 'ml-row' + (i === M.modeSelected ? ' selected' : '') +
               (isCurrent && i !== M.modeSelected ? ' current' : ''),
        text: m,
        onclick: function () { M.modeSelected = i; render(); }
      });
    });

    function foot(label, onclick, wide) {
      var b = el('button', { class: 'btn' + (wide ? ' wide' : ''), text: label, onclick: onclick });
      return b;
    }

    return el('div', { class: 'screen active' }, [
      el('div', { class: 'ml-head', text: 'Mode List' }),
      el('div', { class: 'ml-body' }, rows),
      el('div', { class: 'ml-foot' }, [
        el('button', { class: 'circle-x', title: 'Cancel',
          onclick: function () { go('system'); } }),
        foot('Delete', function () { modeNotReproduced('Delete'); }),
        foot('<', function () { moveMode(-1); }),
        foot('>', function () { moveMode(1); }),
        foot('\u25b2', function () { moveMode(-1); }),
        foot('\u25bc', function () { moveMode(1); }),
        foot('Modify', function () { modeNotReproduced('Modify'); }),
        foot('Add Type', function () { modeNotReproduced('Add Type'); })
      ])
    ]);
  };

  function moveMode(d) {
    M.modeSelected = Math.max(0, Math.min(MODE_LIST.length - 1, M.modeSelected + d));
    render();
  }

  function modeNotReproduced(action) {
    UI.alert(action,
      '<strong>' + action + '</strong> is part of building a sorting mode: choosing the ' +
      'material type, picking the camera file, and naming the A\u2013F categories and their ' +
      'P1\u2013P4 parameters.<br><br>' +
      'That is how a mode like <strong>[Roasted] top_CaffeFruit_B1_01</strong> comes to exist, ' +
      'and it is done by a SOVDA technician when your machine is built. The emulator shows the ' +
      'list but does not reproduce the editor.<br><br>' +
      'The manual is explicit that Mode Switch should not be used on a commissioned machine: ' +
      'all your profiles should show the same mode before the profile name.');
  }

  function lightGroup(legend, lamps) {
    return el('div', { class: 'light-group' }, [
      el('div', { class: 'legend', text: legend }),
      el('div', { class: 'light-row' }, lamps.map(function (l) {
        return el('div', { class: 'light-cell' }, [
          rocker(l.on, true),
          el('div', { class: 'n', text: String(l.n) })
        ]);
      }))
    ]);
  }

  function lightAdjustment(side, n) {
    UI.alert('Light Adjustment [#' + n + ']',
      'Light adjustment for the <strong>' + side + '</strong> camera\u2019s background plate.' +
      '<br><br>This is part of the technician\u2019s calibration and is not reproduced. ' +
      'A background plate that is lit wrongly will sort badly and needs a technician visit ' +
      'to put right.');
  }

  function comGroup(legend, port, status) {
    return el('div', { class: 'com-group' }, [
      el('div', { class: 'legend', text: legend }),
      el('div', { class: 'com-row' }, [
        el('button', { class: 'btn', text: port, onclick: function () {
          UI.toast('Port configuration is read-only in the emulator.', true);
        } }),
        el('div', { class: 'status', text: status }),
        el('button', { class: 'refresh', title: 'Refresh', onclick: function () {
          UI.toast(port + ': ' + status);
        } }, [icon('i-refresh')])
      ])
    ]);
  }

  /* A rocker switch. Pass readOnly for the technician screens. */
  function rocker(on, readOnly, onToggle) {
    var r = el('div', { class: 'rocker ' + (on ? 'is-on' : 'is-off') }, [
      el('span', { class: 'mark on', text: on ? '\u2713' : '' }),
      el('span', { class: 'mark off', text: on ? '' : '\u2715' }),
      el('div', { class: 'knob' })
    ]);
    r.addEventListener('click', function () {
      if (readOnly) { UI.toast('Read-only in the emulator.', true); return; }
      if (onToggle) onToggle();
    });
    return r;
  }

  /* ---- Parameter label table ----
     Reached from File Information Modify_Label on the category panel. Maps each
     category's P1-P4 slots to the names Sensitivity Regulation displays, which
     is how P1 comes to read "Range" and P4 "Spot". Names are file-level; which
     slots are switched on is per camera. */
  screens.labels = function () {
    var p = Profiles.working;
    var cam = p[M.sensTab];

    var rows = [el('div', { class: 'lab-row lab-head' }, [
      el('div', { class: 'k', text: 'Parameters mode' }),
      el('div', { class: 'cell', text: 'P1' }), el('div', { class: 'cell', text: 'P2' }),
      el('div', { class: 'cell', text: 'P3' }), el('div', { class: 'cell', text: 'P4' })
    ])];

    Profiles.LETTERS.forEach(function (L) {
      var cat = catByLetter(L);
      var cells = [el('div', { class: 'k',
        text: L + (cat && cat.name ? ':' + cat.name : '') })];

      ['P1', 'P2', 'P3', 'P4'].forEach(function (pn) {
        var named = p.labels[L] && p.labels[L][pn];
        var on = cam.slots[L] && cam.slots[L][pn];
        var cell = el('button', {
          class: 'cell lab-cell ' + (named ? 'named' : 'unnamed') + (on ? ' on' : ''),
          text: named || pn,
          title: M.supervisor ? 'Rename this slot' : 'Supervisor mode is needed to rename slots',
          onclick: function () { renameSlot(L, pn); }
        });
        cells.push(cell);
      });
      rows.push(el('div', { class: 'lab-row' }, cells));
    });

    ['U', 'V', 'W', 'X', 'Y'].forEach(function (L) {
      rows.push(el('div', { class: 'lab-row' }, [
        el('div', { class: 'k', text: L }),
        el('div', { class: 'cell unnamed', text: 'P1' }),
        el('div', { class: 'cell unnamed', text: 'P2' }),
        el('div', { class: 'cell unnamed', text: 'P3' }),
        el('div', { class: 'cell unnamed', text: 'P4' })
      ]));
    });

    return el('div', { class: 'screen active' }, stdChrome({ back: 'sensitivity' }).concat([
      el('div', {
        style: 'position:absolute;top:148px;left:0;right:0;text-align:center;font-size:20px',
        text: p.name
      }),
      el('div', { class: 'lab-table' }, rows),
      el('div', {
        style: 'position:absolute;left:118px;right:118px;bottom:30px;color:#8a8a8a;font-size:16px',
        text: M.supervisor
          ? 'Touch a slot to rename it. Names are shared by both cameras; which slots are ' +
            'switched on is set per camera in the category panel. Outlined slots are on for ' +
            'the ' + M.sensTab + ' camera.'
          : 'Read-only. Sign in as Supervisor to rename a slot.'
      })
    ]));
  };

  function renameSlot(L, pn) {
    if (!M.supervisor) {
      UI.alert('Modify Label', 'Renaming a parameter slot requires Supervisor mode.');
      return;
    }
    var p = Profiles.working;
    var current = (p.labels[L] && p.labels[L][pn]) || '';
    UI.prompt('Modify Label',
      'Name for <strong>' + L + ' ' + pn + '</strong>. This is the name Sensitivity ' +
      'Regulation will show for that parameter. Leave it empty to clear the name.',
      current, { okLabel: 'Set' }
    ).then(function (v) {
      if (v === null) return;
      if (!p.labels[L]) p.labels[L] = { P1: null, P2: null, P3: null, P4: null };
      p.labels[L][pn] = v || null;
      logEvent('Label for ' + L + ' ' + pn + ' set to ' + (v || '(none)'));
      render();
    });
  }

  /* ---------------- routing ---------------- */
  var currentNode = null;

  function go(name) {
    /* A screen change always dismisses whatever dialog was open, so a prompt
       can never linger over a screen it does not belong to. */
    UI.closeDialog();
    ['user-overlay', 'cat-overlay'].forEach(function (id) {
      var stray = document.getElementById(id);
      if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
    });
    M.screen = name;
    render();
  }

  function render() {
    root.innerHTML = '';
    currentNode = screens[M.screen]();
    root.appendChild(currentNode);
    if (M.screen === 'run') {
      /* The ejector LED display sits right at the ejector line. */
      var bar = buildLedBar();
      bar.style.left = '2px';
      bar.style.right = '2px';
      bar.style.top = (GEOM.ejectY + 6) + 'px';
      currentNode.querySelector('.chamber').appendChild(bar);
    } else if (M.screen === 'valvetest') {
      var vbar = buildLedBar();
      vbar.style.left = '110px';
      vbar.style.width = '540px';
      vbar.style.bottom = '48px';
      currentNode.appendChild(vbar);
    }
    if (M.screen === 'run') drawRun(currentNode);
  }

  /* ---------------- main loop ---------------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (M.powered) {
      M.sim.step(dt, Profiles.working, GEOM);
      if (M.screen === 'run') drawRun(currentNode);
      if ((M.screen === 'viewimage' || M.screen === 'whitebalance') && currentNode._camCanvas) {
        drawCam(currentNode._camCanvas, { box: !!currentNode._camBox });
      }
      updateLeds();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- help ---------------- */
  document.getElementById('help-btn').addEventListener('click', function () {
    UI.showDialog(function (box) {
      box.appendChild(el('h2', { text: 'About this emulator' }));
      box.appendChild(el('div', { class: 'help-body', html:
        '<p>A browser reproduction of the Pearl Mini HMI, built for training and familiarisation. ' +
        'It is not connected to a machine and cannot affect one.</p>' +
        '<h3>Try this</h3><ul>' +
        '<li>Press <code>Start</code> and watch the sorting chamber. Coloured beans are good coffee, ' +
        'yellow are quakers, pale are patio/stones, black are burnt.</li>' +
        '<li>Open <code>Sensitivity Regulation</code> while running and raise the Quaker Range — ' +
        'quakers start reaching the accept side.</li>' +
        '<li>Drop it far too low and you start throwing away good coffee.</li>' +
        '<li>Set the Clean Interval to 0 and watch the glass foul.</li>' +
        '</ul>' +
        '<h3>User levels</h3><p>The person icon asks for a password, and the code decides ' +
        'which level you land on. The clock stays visible over the keypad, because three of ' +
        'the four codes are made from it.</p>' +
        '<ul>' +
        '<li><strong>Operator</strong> — no password. No access to System Setting.</li>' +
        '<li><strong>Supervisor</strong> — the machine date, <code>YYYYMMDD</code>' +
        ' (now <code>' + todayPassword() + '</code>). Unlocks profile Overwrite, Delete, Rename ' +
        'and Lock, the parameter slots, and General Setting.</li>' +
        '<li><strong>Manufacturer Engineer</strong> — the time, <code>HHMM</code>' +
        ' (now <code>' + engineerPassword() + '</code>). All of System Setting except ' +
        'Type of machine.</li>' +
        '<li><strong>JXO</strong> — day and time, <code>DDHHMM</code>' +
        ' (now <code>' + jxoPassword() + '</code>). Factory mode: everything.</li>' +
        '</ul>' +
        '<h3>Deliberate gotcha</h3><p>The floppy-disk icon does <em>not</em> save your profile — ' +
        'just as on the machine. Profiles are only stored via <code>Overwrite File</code> in ' +
        'File Selection.</p>' +
        '<h3>Not reproduced</h3><p>System, Camera, Background Plate and Light Settings are ' +
        'technician calibration screens and are intentionally left out.</p>'
      }));
      box.appendChild(el('div', { class: 'dialog-actions' }, [
        el('button', { class: 'btn', text: 'Reset emulator', onclick: function () {
          Profiles.factoryReset();
          M.sim.reset();
          M.level = 'operator';
          M.selectedFileId = null;
          UI.closeDialog();
          go('home');
          UI.toast('Emulator reset to the technician template');
        } }),
        el('button', { class: 'btn primary', text: 'Close', onclick: UI.closeDialog })
      ]));
    });
  });

  /* ---------------- boot ---------------- */
  logEvent('Machine powered on');
  logEvent('Profile loaded: ' + title());
  tickClock();
  setInterval(tickClock, 1000);
  UI.watchStage();
  go('home');
  requestAnimationFrame(frame);

  global.PearlMini = M;
})(window);
