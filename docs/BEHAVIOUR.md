# Emulated behaviour and its source

Every behaviour below is taken from the SOVDA knowledge base. Where the emulator makes
a modelling choice that the articles do not specify, it is called out as **[model]**.

## Terminology

The manual's mapping between what the screen displays and what the documentation calls
it, reproduced exactly:

| Machine displays | Term used in the manual | Emulator |
|---|---|---|
| P1 / Sensitivity / Range | Acceptance Range | `Range` |
| P2 / Scale | Scale | `Scale` |
| P4 / Spot | Spot Size | `Spot` |
| Category A — Black White / White / Stone / Patio | Patio | `A Patio` |
| Category B — Green | (not covered) | `B Green`, switched off |
| Category C — Red Green / Quaker | Quaker | `C Quaker` |
| Category D — Black / Dark / Burnt | Burnt | `D Burnt` |
| Categories E and F | (not covered) | present, unnamed, switched off |

The machine has six category slots, A–F. Coffee runs A, C and D with B, E and F
switched off — which is why Sensitivity Regulation shows a gap in the lettering
rather than three adjacent columns. The emulator drives its Sensitivity columns
from those switches, so turning B on adds a `B Green` column exactly as the
machine would.

## Sorting

| Behaviour | Source |
|---|---|
| Range runs 0–255; 0 is the anchor, the set value is the maximum of the acceptance range, everything to the right is rejected | User Manual, *How Colour Sorting Works* |
| Lowering a Range squeezes the acceptance range and makes sorting stricter; raising it accepts more | User Manual, *How Colour Sorting Works* |
| F and B tabs hold independent settings for the front and back cameras | User Manual, *Sensitivity Regulation* |
| Back camera seeded 4 points below the front, modelling a Front Delta of 4 | User Manual, *How Colour Sorting Works* |
| Patio around 215 (±20); Burnt only catches completely black beans | User Manual, *A note on Patio and Burnt* |
| Scale (P2) applies only to Patio and should stay at 1 — the emulator warns if you change it | User Manual, *How Colour Sorting Works* |
| Spot is the size of colour the machine looks for; raising it makes the machine blind to smaller defects | User Manual, *Spot Size / P4* |
| Adjust Range before Spot — the coaching text always names Range first | User Manual, *Spot Size / P4* |
| Colour and size only: no insect bites, elephant ear or other defects, and it is not a destoner | User Manual, *Spot Size / P4*, *A note on Patio and Burnt* |
| Dust on the glass degrades sorting until a cleaning cycle runs | User Manual, *Cleaning and Maintenance* |
| Chute vibrator affects sorting performance and should not be changed — the emulator warns and degrades separation above 70 | User Manual, *Chute Settings* **[model: the threshold and the size of the effect]** |

**[model]** Each category is simulated as a 0–255 defect signal where higher means more
defect-like, and a bean is ejected when its signal exceeds the Range and its size is at
least the Spot value. This reproduces the operational behaviour the manual describes
without claiming to reproduce the machine's internal colour mathematics. Bean
populations, defect rates and the exact yield numbers are illustrative.

**[model]** Simulated time runs 6× faster than real time so cleaning intervals are
observable in a browser session.

## Profiles

| Behaviour | Source |
|---|---|
| No "new" profile — you copy an existing one with Save As | User Manual, *Creating and Saving Profiles* |
| New profiles should be built from the technician's Coffee Template | Managing Pearl Mini Profiles |
| Save As loads the new profile immediately | User Manual, *Creating and Saving Profiles* |
| The loaded profile is shown at the top of the screen and follows you through most screens | User Manual, *Creating and Saving Profiles* |
| Call File loads the selected profile and can take up to 60 seconds | Managing Pearl Mini Profiles |
| Overwrite is the only way to save profile settings, and needs Supervisor mode | User Manual, *Creating and Saving Profiles* |
| The floppy-disk icon and "Would you like to save your Parameters?" do **not** save profiles | User Manual, *An important note on Saving, and the Supervisor Mode* |
| Overwrite also saves the cleaning settings | User Manual, *File Selection* |
| Lock disables Overwrite and Delete; the profile can still be edited while sorting but reverts to the saved values | User Manual, *Creating and Saving Profiles* |
| Overwrite, Delete, Rename and Lock only appear in Supervisor mode with a profile selected | User Manual, *File Selection*; Managing Pearl Mini Profiles |
| Profiles display a mode prefix such as `[RedMode06]` before the name | User Manual, *Creating and Saving Profiles* |

## Supervisor mode

| Behaviour | Source |
|---|---|
| Password is the machine date in `YYYYMMDD` format | User Manual, *Creating and Saving Profiles* |
| Person icon changes colour once in Supervisor mode | User Manual, *Creating and Saving Profiles*; File Selection screenshots |
| System, Camera, Background Plate and Light Settings sit behind Supervisor mode and carry a warning not to change them | User Manual, *System Settings, Camera Settings…* |

The emulator goes one step further than the machine and refuses to show those four
screens at all, because there is nothing safe to practise there.

## Dust cleaning

| Behaviour | Source |
|---|---|
| Saved per profile, not per machine | User Manual, *Dust Cleaning Settings* |
| Clean Period is the settling delay before the wipers actuate | User Manual, *Dust Cleaning Settings* |
| Clean Interval sets how often cleaning happens; coffees with more silverskin want it more often | User Manual, *Dust Cleaning Settings* |
| Both recommended at 5 | User Manual, *Dust Cleaning Settings* |
| Manual Cleaning forces a cycle | User Manual, *Dust Cleaning Settings* |
| Setting both to 0 stops the wipers — on the machine this is the safety step before entering the sorting chamber | User Manual, *Dust Cleaning Settings* |

## Valve Test

| Behaviour | Source |
|---|---|
| Single fires the listed ejector; Multiple fires the whole set in quick succession | User Manual, *Valve Test* |
| Ejectors are numbered 1–64, left to right, facing the front of the machine | User Manual, *Valve Test* |
| Valve must be active for ejectors to fire | User Manual, *Valve Test* |
| Two LED rows are the front and back camera signals, not two sets of ejectors | User Manual, *Valve Test* |

## Home screen and dock

Dock order and function follow the *Software Functions* section and the home screen
screenshot: network, service contact, operation history, user switching, file selection,
feed settings, forced cleaning cycle.

"Data Same" and "Mode Switch" are present but inert — the manual states both are not
used on the Pearl Mini. AI Mode is not implemented; the manual does not recommend its
use at present.

## Menu

The menu is a 3×3 grid of icon tiles, named exactly as the machine names them:

| | | |
|---|---|---|
| Sensitivity Regulation | Dust Cleaning Setting | Feed Setting |
| File Selection | Artificial Intelligence | Valve Test |
| Camera Setting | Background Plate Setting | System Setting |

Two naming notes. The tile reads **Feed Setting**, while the user manual calls
the same screen "Chute Settings" — the panel on it is legended *Chute Vibrator*.
And there is no top-level *Light Setting*: Light is a tab inside System Setting →
Port Setting, though the manual groups it with the other calibration screens.

**Artificial Intelligence** is a tile in its own right. The manual states AI Mode
is experimental and not currently recommended, so the emulator shows that message
rather than reproducing any behaviour.

## User levels

| Behaviour | Source |
|---|---|
| The person icon opens a panel with a single field reading `Operator` and a green tick | HMI screenshots |
| Touching the field opens a numeric keypad titled "Please enter password." | HMI screenshots |
| Keypad layout is 1-2-3 / Cancel, 4-5-6 / Clear, 7-8-9 / Confirm, . 0 # | HMI screenshots |
| Password is the machine date in `YYYYMMDD` | User Manual, *Creating and Saving Profiles* |
| After a correct password the field reads `Supervisor`; the green tick applies it | User Manual; HMI screenshots |
| The person icon changes colour with the signed-in level | HMI screenshots |

The icon appears green, blue, orange and red across the screenshots, so there are
more levels than the two the manual describes. The emulator implements only the
two it can source — Operator (green) and Supervisor (blue) — and uses orange on
System Setting to match what that screen shows. **[model]**

## Camera screens

These are two different screens and it is worth keeping them apart:

| Screen | Reached from | Contents |
|---|---|---|
| **View Image** | Sensitivity Regulation footer | The plain camera view: background plate, faint vertical streaking, and whatever coffee is passing. No readout, no sampling box, no controls. |
| **Camera Setting** (white balance) | Menu tile, Supervisor | The same view plus a `T:` temperature readout, a drag-to-sample box that switches the readout to `R: G: B: T:`, the Red/Green/Blue gains, Auto Regulation and Reference Value. |

Reference values are seeded at R 242, G 242, B 243 and the gains at 373 / 448 /
574, as shown in the screenshots. Camera Setting sits behind the Supervisor
warning: on a real machine these belong to the technician's calibration.

## System Setting

Reproduced as a read-only view so the screen is recognisable without teaching
anyone to change it.

- Title carries the software version string, e.g. `JXO-VT-2.8-3527-20250419111509`
- **Save&Restart** beside the floppy icon (disabled in the emulator)
- Left navigation: General Setting, ON-OFF Settings, Port Setting, Camera Program,
  PLC, Network, Fault Code
- Port Setting tabs: COM, Vibrator Board, Background, SprayValve, Light
- COM shows a Peripheral List with COM-A → `COM1 · ETM_V3x Connected` and
  COM-B → `COM2 · [08]SETM_DIDO Connected`
- Vibrator Board lists 16 rows; row 1 is `1 sorting · 1 · Chute Vibrator`, enabled

Only COM and Vibrator Board carry real content. The rest state plainly that they
are not reproduced.

## Category and parameter configuration

| Behaviour | Source |
|---|---|
| A–F category switches, with the enabled ones exposing P1–P4 slots | HMI screenshots |
| A `File Information Modify_Label` button leads to the parameter table | HMI screenshots |
| The table maps each category's P1–P4 to a displayed name | HMI screenshots |
| For coffee: P1 → Range, P2 → Scale (Patio only), P4 → Spot | HMI screenshots |
| Rows continue past F with E, F, U, V, W, X, Y | HMI screenshots |

This is where `P1` comes to read `Range` and `P4` reads `Spot` on Sensitivity
Regulation. On the machine each cell opens a label picker holding a long list of
defect and parameter names, and a label can be added per language — the
screenshots show `SOVDA-EN` as a language entry alongside English. The emulator
shows the mapping read-only and does not reproduce the picker or the label editor.

**Navigation not verified.** The screenshots do not show how these screens are
reached. The emulator puts them behind a `Categories` button in File Selection
under Supervisor mode, because the screens are titled with a profile name. If the
real path is different, this is the thing in the emulator most likely to be wrong.

## Deliberately not modelled

Physical procedures — uncrating, assembly, air filter changes, Teflon fin
replacement, recommissioning intervals — along with machine specifications,
capacities and site requirements. Those live in the knowledge base, which is the
authority for all of them.

Within the software: the label picker and its on-screen keyboard, AI Mode
behaviour, Background Plate Setting, and the General Setting, ON-OFF Settings,
Camera Program, PLC, Network and Fault Code panels.
