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

Every screen an operator touches is here: Home, the nine-tile Menu, Sensitivity
Regulation, Dust Cleaning Setting, Feed Setting, File Selection, Valve Test, View Image,
and the operation history, service and network screens behind the dock icons. Behind
Supervisor mode you can also reach Camera Setting (white balance), System Setting and
the category/parameter configuration.

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

4. **Switch on a category you do not need.** Turn `B Green` on in the category
   screen and squeeze its Range. You start rejecting good coffee for a defect that
   was never in the batch.

### User levels

The person icon opens the user panel. Touch the field and a numeric keypad asks for a
password — and the code you type decides which level you land on. The clock stays
visible over the keypad, because three of the four codes are made from it.

| Level | Icon | Password | Reaches |
|---|---|---|---|
| Operator | Green | none | No System Setting |
| Supervisor | Blue | machine date, `YYYYMMDD` | General Setting only |
| Manufacturer Engineer | Yellow | time, `HHMM` | All System Setting except Machine Type |
| JXO | Red | day and time, `DDHHMM` | Everything |

Overwrite, Delete, Rename and Lock appear at Supervisor and above.

### Why A, C and D?

Sensitivity Regulation shows `A Patio`, `C Quaker` and `D Burnt` with a gap in the
lettering. The machine has six category slots and coffee only uses three — `B Green`,
`E` and `F` are switched off. Touch any column header to see and change that.

Those switches are **per camera**. Turn Quaker off on the F tab and the B tab keeps
sorting on it — which you can watch in the counters: purity barely moves, because the
back camera is still catching them. Turn everything off for a camera and the tab reads
`NULL`; touch NULL to switch something back on.

In Supervisor mode the same panel also switches the P1–P4 parameter slots on and off
(also per camera), and `File Information Modify_Label` renames them.

### Typing values

Any number can be typed instead of stepped. Touch the value and a keypad opens showing
the permitted MIN and MAX.

The floppy-disk icon deliberately does **not** save your profile — same as the machine.
Profiles are only written by **Overwrite File** in File Selection.

## What it does not do

System Setting is reproduced in full and gated by level — General Setting with its
seven tiles, the 21-row ON-OFF Settings list, Port Setting's five tabs, Camera Program,
PLC, Network, and Type of machine for JXO. Camera Setting and System Setting are
**read-only**, behind a warning:
on a real machine changing them causes sorting problems that need a technician visit to
put right. Background Plate Setting, AI Mode, and the label picker behind the parameter
table are not reproduced at all.

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

…and from HMI screenshots of a commissioned machine, which is where the menu layout,
the Operator keypad, the camera screens, System Setting and the category configuration
come from.

[`docs/BEHAVIOUR.md`](docs/BEHAVIOUR.md) maps each emulated behaviour back to the
article it came from.

If the machine and this emulator ever disagree, the knowledge base is right and this
is wrong. Please raise an issue.
