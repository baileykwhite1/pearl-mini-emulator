/* Sorting simulation for the Pearl Mini emulator.
 *
 * MODEL NOTE
 * Every category is modelled as a 0-255 "defect signal" where a higher number
 * means more defect-like, and a bean is ejected when its signal exceeds the
 * Range for that category. This reproduces the behaviour the user manual
 * describes -- "the machine will only accept the colours within this range and
 * will reject everything to the right of this scale", so lowering a Range
 * squeezes the acceptance window and rejects more -- without claiming to
 * reproduce the machine's internal colour mathematics.
 *
 * A defect is only seen when the bean is at least as large as the Spot size for
 * that category, so raising Spot makes the machine blind to smaller defects.
 *
 * Simulated time runs 6x faster than real time so that dust-cleaning intervals
 * are observable in a browser session. */

(function (global) {
  'use strict';

  var TIME_SCALE = 6;
  var EJECTORS = 64;

  var MIX = [
    { type: 'good',   share: 0.90 },
    { type: 'quaker', share: 0.04 },
    { type: 'patio',  share: 0.03 },
    { type: 'burnt',  share: 0.03 }
  ];

  /* Mean / sd of the defect signal each bean type produces in each category. */
  var SIGNATURE = {
    good:   { patio: [158, 15], green: [46, 16], quaker: [28, 11],  burnt: [176, 15] },
    quaker: { patio: [158, 15], green: [52, 17], quaker: [112, 20], burnt: [176, 15] },
    patio:  { patio: [240, 9],  green: [44, 16], quaker: [30, 12],  burnt: [182, 15] },
    burnt:  { patio: [150, 16], green: [40, 15], quaker: [40, 14],  burnt: [249, 5] }
  };

  /* Which profile category letter drives which sorting category. */
  var CATEGORY_LETTER = { patio: 'A', green: 'B', quaker: 'C', burnt: 'D' };

  var COLOURS = {
    good:   '#9a6b3f',
    quaker: '#c9a227',
    patio:  '#cfcfc4',
    burnt:  '#241a14'
  };

  function gauss(mean, sd) {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  function pickType() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < MIX.length; i++) {
      acc += MIX[i].share;
      if (r <= acc) return MIX[i].type;
    }
    return 'good';
  }

  function Simulator() {
    this.running = false;
    this.beans = [];
    this.dust = 0;
    this.secondsSinceClean = 0;
    this.elapsed = 0;
    this.ejectorFlash = new Array(EJECTORS).fill(0);
    this.reset();
  }

  Simulator.prototype.reset = function () {
    this.beans = [];
    this.dust = 0;
    this.secondsSinceClean = 0;
    this.elapsed = 0;
    this.stats = {
      fed: 0, accepted: 0, rejected: 0,
      fedByType:      { good: 0, quaker: 0, patio: 0, burnt: 0 },
      passedByType:   { good: 0, quaker: 0, patio: 0, burnt: 0 }, // reached accept
      rejectedByType: { good: 0, quaker: 0, patio: 0, burnt: 0 }
    };
  };

  Simulator.prototype.manualClean = function () {
    this.dust = 0;
    this.secondsSinceClean = 0;
  };

  /* Decide the fate of one bean against the current profile. */
  Simulator.prototype.judge = function (bean, profile) {
    var exists = profile.categories || { A: true, C: true, D: true };
    var ALL = ['patio', 'green', 'quaker', 'burnt'];

    /* Each camera sorts on its own set of categories, so a category switched
       off on the front is still live on the back. */
    function catsFor(cam) {
      var active = cam.active || exists;
      return ALL.filter(function (c) {
        var L = CATEGORY_LETTER[c];
        return exists[L] && active[L];
      });
    }
    // Dust on the glass adds reading noise; a heavily fouled window both misses
    // defects and throws out good coffee.
    var dustNoise = this.dust * 26;
    // Running the vibrator too hard spreads beans unevenly into the chamber,
    // which is why the manual says not to touch the chute setting.
    var overload = Math.max(0, (profile.chute - 70) / 30);
    var spreadNoise = overload * 22;
    var noise = Math.sqrt(dustNoise * dustNoise + spreadNoise * spreadNoise);

    for (var side = 0; side < 2; side++) {
      var cam = side === 0 ? profile.F : profile.B;
      var cats = catsFor(cam);
      for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        var reading = bean.signal[c] + gauss(0, 5 + noise);
        var setting = cam[c];
        if (bean.spot >= setting.spot && reading > setting.range) {
          return { eject: true, category: c };
        }
      }
    }
    return { eject: false, category: null };
  };

  Simulator.prototype.spawn = function (profile) {
    var type = pickType();
    var sig = SIGNATURE[type];
    var bean = {
      type: type,
      spot: clamp(gauss(90, 22), 18, 170),
      signal: {
        patio:  clamp(gauss(sig.patio[0], sig.patio[1]), 0, 255),
        green:  clamp(gauss(sig.green[0], sig.green[1]), 0, 255),
        quaker: clamp(gauss(sig.quaker[0], sig.quaker[1]), 0, 255),
        burnt:  clamp(gauss(sig.burnt[0], sig.burnt[1]), 0, 255)
      },
      lane: 1 + Math.floor(Math.random() * EJECTORS),
      x: 0, y: 0, vx: 0, vy: 0,
      judged: false, eject: false
    };
    var verdict = this.judge(bean, profile);
    bean.eject = verdict.eject;
    bean.category = verdict.category;

    this.stats.fed++;
    this.stats.fedByType[type]++;
    if (verdict.eject) {
      this.stats.rejected++;
      this.stats.rejectedByType[type]++;
    } else {
      this.stats.accepted++;
      this.stats.passedByType[type]++;
    }
    return bean;
  };

  /* Advance the simulation. dt is real seconds. */
  Simulator.prototype.step = function (dt, profile, geom) {
    var simDt = dt * TIME_SCALE;
    this.elapsed += simDt;

    if (this.running) {
      // Dust builds up while coffee is flowing.
      this.dust = clamp(this.dust + simDt * 0.0008, 0, 1);
      this.secondsSinceClean += simDt;

      var intervalSec = (profile.clean.interval || 0) * 60;
      if (intervalSec > 0 && this.secondsSinceClean >= intervalSec) {
        // The wipers settle for "Clean Period" seconds, then sweep.
        this.dust = 0;
        this.secondsSinceClean = 0;
      }

      // Feed rate follows the chute vibrator setting.
      var perSec = profile.chute * 1.1;
      this.spawnAccumulator = (this.spawnAccumulator || 0) + perSec * dt;
      var n = Math.floor(this.spawnAccumulator);
      this.spawnAccumulator -= n;
      for (var i = 0; i < n && this.beans.length < 900; i++) {
        var b = this.spawn(profile);
        b.x = geom.chuteX + (Math.random() - 0.5) * geom.chuteW;
        b.y = -10 - Math.random() * 40;
        b.vy = 150 + Math.random() * 40;
        this.beans.push(b);
      }
    }

    // Move beans and fire ejectors at the eject line.
    var keep = [];
    for (var j = 0; j < this.beans.length; j++) {
      var bean = this.beans[j];
      bean.vy += 620 * dt;
      bean.y += bean.vy * dt;
      bean.x += bean.vx * dt;

      if (!bean.judged && bean.y >= geom.ejectY) {
        bean.judged = true;
        if (bean.eject) {
          bean.vx = 190 + Math.random() * 70;   // blown forward, to the reject side
          this.ejectorFlash[bean.lane - 1] = 0.12;
        } else {
          bean.vx = -18 - Math.random() * 12;   // falls into the accept chute
        }
      }
      if (bean.y < geom.h + 30) keep.push(bean);
    }
    this.beans = keep;

    for (var k = 0; k < EJECTORS; k++) {
      if (this.ejectorFlash[k] > 0) this.ejectorFlash[k] -= dt;
    }
  };

  Simulator.prototype.derived = function () {
    var s = this.stats;
    var acc = s.accepted || 1;
    var defectsPassed = s.passedByType.quaker + s.passedByType.patio + s.passedByType.burnt;
    var fedGood = s.fedByType.good || 1;
    return {
      rejectRate: s.fed ? (s.rejected / s.fed) * 100 : 0,
      purity: ((acc - defectsPassed) / acc) * 100,
      goodYield: ((s.passedByType.good) / fedGood) * 100,
      defectsPassed: defectsPassed,
      defectsPassedRate: s.fed ? (defectsPassed / s.fed) * 100 : 0,
      goodRejected: s.rejectedByType.good,
      goodRejectedRate: fedGood ? (s.rejectedByType.good / fedGood) * 100 : 0
    };
  };

  /* Coaching text that follows the tuning logic in the user manual. */
  Simulator.prototype.advice = function () {
    var d = this.derived();
    if (this.stats.fed < 300) {
      return 'Feeding coffee — let a few hundred beans through before judging the result.';
    }
    if (this.dust > 0.6) {
      return '<strong>Glass is fouling.</strong> Dust cleaning is off or too infrequent, so the cameras ' +
             'are misreading beans. Set a Clean Interval, or run Manual Cleaning.';
    }
    var msgs = [];
    if (d.defectsPassedRate > 1.2) {
      var worst = 'Quaker';
      var p = this.stats.passedByType;
      if (p.patio >= p.quaker && p.patio >= p.burnt) worst = 'Patio';
      else if (p.burnt >= p.quaker && p.burnt >= p.patio) worst = 'Burnt';
      msgs.push('<strong>Defects reaching the accept side.</strong> Lower your <strong>' + worst +
                ' Range</strong> to squeeze the acceptance range and make sorting stricter.');
    }
    if (d.goodRejectedRate > 4) {
      msgs.push('<strong>Good coffee in the reject bucket.</strong> Your acceptance range is too ' +
                'strict — raise the Range that is firing most. Adjust Range before Spot.');
    }
    if (!msgs.length) {
      msgs.push('Sorting within expected tolerance. Purity ' + d.purity.toFixed(1) +
                '%, good-bean yield ' + d.goodYield.toFixed(1) + '%.');
    }
    return msgs.join('<br><br>');
  };

  Simulator.CATEGORY_LETTER = CATEGORY_LETTER;
  Simulator.EJECTORS = EJECTORS;
  Simulator.COLOURS = COLOURS;
  Simulator.TIME_SCALE = TIME_SCALE;
  global.Simulator = Simulator;
})(window);
