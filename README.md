# Pearl Mini Emulator

A browser emulator of the SOVDA Pearl Mini control screen. It runs the same menus, the
same profile handling and the same sorting logic as the machine, so roasters can learn
the software before they ever stand in front of one.

**Live:** https://baileykwhite1.github.io/pearl-mini-emulator/

It is a training aid. It is not connected to a machine and cannot affect one.

## Why

New operators usually meet the Pearl Mini software for the first time during
commissioning, with coffee already in the hopper. The parts that cause trouble later —
which direction to move a Range, why the floppy-disk icon did not save their profile,
what Supervisor mode unlocks — are much easier to learn somewhere nothing is at stake.

## What it does

Every screen an operator touches is here: Home, Sensitivity Regulation, Dust Cleaning
Settings, Chute Settings, File Selection, Valve Test, and the operation history,
service and network screens behind the dock icons.

Press **Start** and coffee flows through the sorting chamber. Beans are scanned against
the loaded profile, the ejectors fire, and the counters show what ended up in each
stream — purity on the accept side, good coffee lost on the reject side. Change a Range
while it runs and you see the result within a few hundred beans.

### Three things worth trying

1. **Widen the Quaker Range.** Push it up to 130. Quakers start reaching the accept
   side and purity falls. Bring it back down and they disappear again.
2. **Squeeze it too far.** Drop it to 40. Purity stays high, but you are now throwing
   away a third of your good coffee.
3. **Turn off dust cleaning.** Set the Clean Interval to 0 and keep running. The glass
   fouls, the cameras start misreading, and yield drops even though nothing else changed.

### Supervisor mode

The person icon asks for the machine date in `YYYYMMDD` format, exactly as on a real
Pearl Mini. Overwrite, Delete, Rename and Lock only appear once you are signed in.

The floppy-disk icon deliberately does **not** save your profile — same as the machine.
Profiles are only written by **Overwrite File** in File Selection.

## What it does not do

System Settings, Camera Settings, Background Plate Settings and Light Settings are
technician calibration screens. They are deliberately left out: on a real machine
changing them causes sorting problems that need a technician visit to put right.

Sorting behaviour is modelled, not measured. Defaults come from a technician-configured
machine, but the numbers a real profile needs depend on the coffee in front of you.
Nothing here should be treated as a specification — for machine specs, capacities and
requirements, always use the knowledge base.

## Running it locally

No build step and no dependencies. Serve the folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Profiles are saved in your browser, so your work
survives a refresh. The `?` button has a reset if you want to start over.

## Source

Built from the SOVDA knowledge base:

- [User Manual - Pearl Mini](https://knowledge.sovdacoffee.com/user-manual-pearl-mini)
- [Managing Pearl Mini Profiles](https://knowledge.sovdacoffee.com/file-selection-menu)
- [Pearl Mini Specification Sheet](https://knowledge.sovdacoffee.com/pearl-mini-specification-sheet)
- [Pearl Mini Uncrate and Assembly Guide](https://knowledge.sovdacoffee.com/pearl-mini-uncrate-and-assembly-guide)

[`docs/BEHAVIOUR.md`](docs/BEHAVIOUR.md) maps each emulated behaviour back to the
article it came from.

If the machine and this emulator ever disagree, the knowledge base is right and this
is wrong. Please raise an issue.
