/* Shared UI helpers for the Pearl Mini emulator. */
(function (global) {
  'use strict';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 64 64');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---- Toast ---- */
  var toastTimer = null;
  function toast(msg, warn) {
    var t = document.getElementById('toast');
    t.innerHTML = msg;
    t.className = 'show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 4200);
  }

  /* ---- Dialogs ---- */
  function closeDialog() {
    document.getElementById('dialog-backdrop').classList.remove('open');
    document.getElementById('dialog').innerHTML = '';
  }

  function showDialog(build) {
    var back = document.getElementById('dialog-backdrop');
    var box = document.getElementById('dialog');
    box.innerHTML = '';
    build(box);
    back.classList.add('open');
  }

  function alertBox(title, body) {
    return new Promise(function (resolve) {
      showDialog(function (box) {
        box.appendChild(el('h2', { text: title }));
        box.appendChild(el('p', { html: body }));
        box.appendChild(el('div', { class: 'dialog-actions' }, [
          el('button', {
            class: 'btn primary', text: 'OK',
            onclick: function () { closeDialog(); resolve(true); }
          })
        ]));
      });
    });
  }

  function confirmBox(title, body, okLabel) {
    return new Promise(function (resolve) {
      showDialog(function (box) {
        box.appendChild(el('h2', { text: title }));
        box.appendChild(el('p', { html: body }));
        box.appendChild(el('div', { class: 'dialog-actions' }, [
          el('button', {
            class: 'btn', text: 'Cancel',
            onclick: function () { closeDialog(); resolve(false); }
          }),
          el('button', {
            class: 'btn primary', text: okLabel || 'Confirm',
            onclick: function () { closeDialog(); resolve(true); }
          })
        ]));
      });
    });
  }

  function promptBox(title, body, initial, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      showDialog(function (box) {
        box.appendChild(el('h2', { text: title }));
        if (body) box.appendChild(el('p', { html: body }));
        var err = el('div', { class: 'err' });
        var input = el('input', {
          type: opts.password ? 'password' : 'text',
          value: initial || '',
          inputmode: opts.numeric ? 'numeric' : null
        });
        box.appendChild(input);
        box.appendChild(err);

        function submit() {
          var v = input.value.trim();
          if (opts.validate) {
            var msg = opts.validate(v);
            if (msg) { err.textContent = msg; return; }
          }
          closeDialog();
          resolve(v);
        }
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === 'Return') submit();
          if (e.key === 'Escape' || e.key === 'Esc') { closeDialog(); resolve(null); }
        });
        box.appendChild(el('div', { class: 'dialog-actions' }, [
          el('button', { class: 'btn', text: 'Cancel',
            onclick: function () { closeDialog(); resolve(null); } }),
          el('button', { class: 'btn primary', text: opts.okLabel || 'Confirm', onclick: submit })
        ]));
        setTimeout(function () { input.focus(); }, 30);
      });
    });
  }

  /* ---- Spinner ( < value/label > ) ---- */
  function spinner(opts) {
    var value = opts.get();
    var readout = el('div', { class: 'readout' }, [
      el('div', { class: 'val', text: String(value) }),
      el('div', { class: 'lbl', text: opts.label })
    ]);

    function bump(dir) {
      var v = opts.get() + dir * (opts.step || 1);
      v = Math.max(opts.min, Math.min(opts.max, v));
      opts.set(v);
      readout.querySelector('.val').textContent = String(v);
      if (opts.onchange) opts.onchange(v);
    }

    var dec = el('button', { class: 'arrow', text: '<', onclick: function () { bump(-1); } });
    var inc = el('button', { class: 'arrow', text: '>', onclick: function () { bump(1); } });
    if (opts.disabled) { dec.disabled = true; inc.disabled = true; }

    var wrap = el('div', { class: 'spin' }, [dec, readout, inc]);
    wrap.refresh = function () { readout.querySelector('.val').textContent = String(opts.get()); };
    return wrap;
  }

  /* ---- Screen chrome ---- */
  function chrome(opts) {
    /* opts: { title, showSave, showBack, onBack, supervisor, onUser } */
    var icons = [];
    icons.push(el('button', {
      class: 'chrome-icon', title: opts.supervisor ? 'Supervisor mode — click to sign out' : 'Switch user',
      onclick: opts.onUser
    }, [(function () {
      var s = icon('i-person');
      s.style.color = opts.supervisor ? 'var(--blue)' : 'var(--hmi-green)';
      return s;
    })()]));

    if (opts.showSave !== false) {
      icons.push(el('button', {
        class: 'chrome-icon', title: 'Save parameters', onclick: opts.onSave
      }, [icon('i-floppy')]));
    }
    if (opts.showBack !== false) {
      icons.push(el('button', {
        class: 'chrome-icon', title: 'Back', onclick: opts.onBack
      }, [icon('i-back')]));
    }

    return [
      el('div', { class: 'titlebar', text: opts.title }),
      el('div', { class: 'chrome-icons' }, icons)
    ];
  }

  /* ---- Valve / Feed lamps ---- */
  function lamps(state) {
    function lamp(label, on) {
      return el('button', { class: 'footer-item', onclick: state.toggle.bind(null, label) }, [
        el('div', { class: 'lamp' + (on ? ' on' : '') }),
        el('span', { text: label })
      ]);
    }
    return [lamp('Valve', state.valve), lamp('Feed', state.feed)];
  }

  /* ---- Stage scaling ---- */
  function fitStage() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var pad = 24;
    var sx = (window.innerWidth - pad) / 1340;
    var sy = (window.innerHeight - pad) / 872;
    var s = Math.max(0.1, Math.min(sx, sy));
    /* The translate keeps the stage centred on the viewport whatever the scale;
       see the note on #stage in styles.css. */
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  /* Watch the wrapper as well as the window: the page can be resized by its
     container (an embed, a split pane) without a window resize event firing. */
  function watchStage() {
    fitStage();
    window.addEventListener('resize', fitStage);
    if (typeof ResizeObserver === 'function') {
      var wrap = document.getElementById('stage-wrap');
      if (wrap) new ResizeObserver(fitStage).observe(wrap);
    }
  }

  global.UI = {
    el: el, icon: icon, toast: toast,
    alert: alertBox, confirm: confirmBox, prompt: promptBox,
    closeDialog: closeDialog, showDialog: showDialog,
    spinner: spinner, chrome: chrome, lamps: lamps,
    fitStage: fitStage, watchStage: watchStage
  };
})(window);
