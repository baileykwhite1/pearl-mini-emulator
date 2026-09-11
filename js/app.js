/* Pearl Mini emulator — screens, routing and machine state.
 *
 * Screen layouts and control names follow the SOVDA knowledge base article
 * "User Manual - Pearl Mini" and the HMI screenshots published with it. */

(function (global) {
  'use strict';

  var el = UI.el, icon = UI.icon;

  var M = {
    supervisor: false,
    valve: false,
    feed: false,
    screen: 'home',
    powered: true,
    sensTab: 'F',
    valveTab: 'F',
    selectedFileId: null,
    ejectorNumber: 1,
    testSpeed: 100,
    log: [],
    sim: new Simulator()
  };

  var root = document.getElementById('screens');

  /* ---------------- logging ---------------- */
  function stamp(d) {
    d = d || new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function logEvent(msg, isError) {
    M.log.unshift({ t: stamp(), msg: msg, err: !!isError });
    if (M.log.length > 200) M.log.pop();
  }

  /* ---------------- clock ---------------- */
  function tickClock() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    document.getElementById('clock').textContent =
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '  ' +
      d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
  }

  function todayPassword() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* ---------------- helpers ---------------- */
  function title() { return Profiles.displayName(Profiles.working); }

  function toggleLamp(which) {
    if (which === 'Valve') M.valve = !M.valve;
    else M.feed = !M.feed;
    logEvent(which + ' ' + ((which === 'Valve' ? M.valve : M.feed) ? 'activated' : 'deactivated'));
    render();
  }

  function onUserIcon() {
    if (M.supervisor) {
      UI.confirm('User', 'Return to <strong>Operator</strong>? Supervisor-only options will be hidden.',
        'Return to Operator').then(function (ok) {
        if (ok) { M.supervisor = false; logEvent('Signed out of Supervisor mode'); render(); }
      });
      return;
    }
    UI.prompt(
      'Operator',
      'Enter the Supervisor password. On the real machine this is the date set on the machine in ' +
      '<strong>YYYYMMDD</strong> format.',
      '',
      {
        password: true, numeric: true, okLabel: 'Confirm',
        validate: function (v) {
          if (v !== todayPassword()) return 'Incorrect password.';
          return null;
        }
      }
    ).then(function (v) {
      if (v === null) return;
      M.supervisor = true;
      logEvent('Supervisor mode entered');
      UI.toast('Supervisor');
      render();
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
      supervisor: M.supervisor,
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
      if (d[0] === 'i-person') s.style.color = M.supervisor ? 'var(--blue)' : 'var(--hmi-green)';
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

  /* ---- Menu ---- */
  var MENU = [
    { label: 'Sensitivity Regulation', to: 'sensitivity' },
    { label: 'Dust Cleaning Settings', to: 'cleaning' },
    { label: 'Chute Settings', to: 'chute' },
    { label: 'File Selection', to: 'files' },
    { label: 'Valve Test', to: 'valvetest' },
    { label: 'System Settings', locked: true },
    { label: 'Camera Settings', locked: true },
    { label: 'Background Plate Settings', locked: true },
    { label: 'Light Settings', locked: true }
  ];

  screens.menu = function () {
    var tiles = MENU.map(function (m) {
      var kids = [el('span', { text: m.label })];
      if (m.locked) kids.push(el('span', { class: 'lock-note', text: 'Supervisor' }));
      return el('button', {
        class: 'menu-tile' + (m.locked ? ' locked' : ''),
        onclick: function () {
          if (m.locked) return openProtected(m.label);
          go(m.to);
        }
      }, kids);
    });
    return el('div', { class: 'screen active' }, stdChrome({ back: 'home' }).concat([
      el('div', { class: 'menu-grid' }, tiles)
    ]));
  };

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
          '. On a real Pearl Mini these values belong to the technician’s calibration.');
        logEvent(name + ' opened in Supervisor mode', true);
      }
    });
  }

  /* ---- Sensitivity Regulation ---- */
  function camera() { return Profiles.working[M.sensTab]; }

  function sensColumn(letter, name, key) {
    var cam = camera();
    var rows = [UI.spinner({
      label: 'Range', min: 0, max: 255,
      get: function () { return cam[key].range; },
      set: function (v) { cam[key].range = v; }
    })];

    if (key === 'patio') {
      rows.push(UI.spinner({
        label: 'Scale', min: 0, max: 3,
        get: function () { return cam.patio.scale; },
        set: function (v) {
          cam.patio.scale = v;
          if (v !== 1) UI.toast('Scale should remain at 1 on Patio.', true);
        }
      }));
    }

    var spot = UI.spinner({
      label: 'Spot', min: 1, max: 255,
      get: function () { return cam[key].spot; },
      set: function (v) { cam[key].spot = v; }
    });
    spot.classList.add('sens-spot');

    return el('div', { class: 'sens-col' }, [
      el('div', { class: 'sens-head', html: letter + '<br>' + name }),
      el('div', { class: 'sens-rows' }, rows),
      spot
    ]);
  }

  screens.sensitivity = function () {
    var body = el('div', { class: 'tab-body' }, [
      el('div', { class: 'sens-cols' }, [
        sensColumn('A', 'Patio', 'patio'),
        sensColumn('C', 'Quaker', 'quaker'),
        sensColumn('D', 'Burnt', 'burnt')
      ])
    ]);

    return el('div', { class: 'screen active' }, stdChrome({}).concat([
      tabs('sensTab'),
      body,
      footer([
        footerItem('Data Same', 'i-datasame', function () {
          UI.toast('Data Same is not used on the Pearl Mini.', true);
        }),
        footerItem('View Image', 'i-viewimg', viewImage),
        footerItem('Feed Setting', 'i-chart', function () { go('chute'); }),
        M.sim.running
          ? footerItem('Stop', 'i-stop', stopSorting)
          : footerItem('Start', 'i-start', startSorting)
      ])
    ]));
  };

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

    var num = el('div', { class: 'num', text: String(p.chute) });

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
      var val = el('div', { class: 'num', text: String(c[key]),
        style: 'font-size:24px;width:70px;text-align:center' });
      function set(v) { c[key] = Math.max(0, Math.min(max, v)); val.textContent = String(c[key]); }
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
        class: 'file-row' + (p.id === M.selectedFileId ? ' selected' : ''),
        onclick: function () { M.selectedFileId = p.id; render(); }
      }, [
        el('div', { text: '[' + (i + 1) + ']' }),
        el('div', {}, [
          document.createTextNode(Profiles.displayName(p)),
          p.locked ? el('span', { class: 'lockmark', text: '● LOCKED' }) : null
        ]),
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
      supervisor: M.supervisor,
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
      title: title(), supervisor: M.supervisor, showSave: false,
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
      ? M.log.map(function (l) {
          return el('div', { class: 'log-line' + (l.err ? ' err' : ''), text: l.t + '  ' + l.msg });
        })
      : [el('div', { class: 'log-line', text: 'No events recorded.' })];

    return el('div', { class: 'screen active' }, UI.chrome({
      title: 'Operation History', supervisor: M.supervisor, showSave: false,
      onUser: onUserIcon, onBack: function () { go('home'); }
    }).concat([el('div', { class: 'info-body' }, lines)]));
  };

  screens.contact = function () {
    return el('div', { class: 'screen active' }, UI.chrome({
      title: 'Service & Contact', supervisor: M.supervisor, showSave: false,
      onUser: onUserIcon, onBack: function () { go('home'); }
    }).concat([
      el('div', { class: 'info-body' }, [
        el('p', { html: 'On a commissioned machine this screen carries the service and contact ' +
          'details loaded by your technician.' }),
        el('p', { style: 'margin-top:18px', html:
          'For support, use <strong>Contact Technical Support</strong> on the SOVDA knowledge base, ' +
          'or speak to your Technical Brand Ambassador.' }),
        el('p', { style: 'margin-top:18px;color:#8a8a8a;font-size:17px', html:
          'Serial number, install date and technician contact details are machine-specific and are ' +
          'not reproduced in this emulator.' })
      ])
    ]));
  };

  screens.network = function () {
    return el('div', { class: 'screen active' }, UI.chrome({
      title: 'Network', supervisor: M.supervisor, showSave: false,
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
      title: title(), supervisor: M.supervisor, showSave: false,
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
    if (M.screen !== 'sensitivity') go('run');
    else render();
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

  /* ---------------- routing ---------------- */
  var currentNode = null;

  function go(name) {
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
        '<h3>Supervisor mode</h3><p>The person icon asks for the machine date in ' +
        '<code>YYYYMMDD</code> format, exactly as on a real Pearl Mini. Today that is ' +
        '<code>' + todayPassword() + '</code>. Overwrite, Delete, Rename and Lock only appear once ' +
        'you are signed in.</p>' +
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
          M.supervisor = false;
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
  UI.fitStage();
  window.addEventListener('resize', UI.fitStage);
  go('home');
  requestAnimationFrame(frame);

  global.PearlMini = M;
})(window);
