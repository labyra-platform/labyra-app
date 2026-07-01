# Quantum ESPRESSO pw.x Input Reference (R337)

## Overview

Labyra's DFT compose editor builds a Quantum ESPRESSO `pw.x` (PWscf) input
file (`.in`) organised by the exact namelist/card structure QE expects. This
document is the authoritative mapping used to design and validate the editor:
which variable lives in which block, which are surfaced as **core** (always
shown) vs **advanced** (revealed on demand), and — critically — the **emit
policy** that decides what actually gets written to the `.in`.

Scope: the `pw.x` calculation types Labyra supports (`scf`, `nscf`, `bands`,
`relax`, `vc-relax`) plus the parameters relevant to the WO₃₋ₓ/WS₂ PEC line
(slab dipole correction, DFT+U, vdW-D3, magnetism). Post-processing codes
(`bands.x`, `dos.x`, `projwfc.x`) have their own smaller inputs and are handled
separately.

Source: official QE documentation, **pw.x / PWscf v7.5** (`Doc/INPUT_PW.html`).
All quantities without an explicit unit are in **Rydberg atomic units**; Hubbard
parameters are the exception and are always in **eV**.

## Input structure

Namelists **must appear in this order**, followed by cards:

```
&CONTROL … /
&SYSTEM … /
&ELECTRONS … /
[ &IONS … / ]      # only relax / md / vc-relax / vc-md
[ &CELL … / ]      # only vc-relax / vc-md
[ &FCP … / ]       # constant-µ ESM (not used by Labyra)
[ &RISM … / ]      # implicit solvent (not used by Labyra)

ATOMIC_SPECIES
ATOMIC_POSITIONS { crystal | angstrom | … }
K_POINTS { automatic | crystal_b | gamma | … }
[ CELL_PARAMETERS { angstrom | bohr | alat } ]   # required when ibrav = 0
[ OCCUPATIONS ]
[ HUBBARD { atomic | ortho-atomic | … } ]         # DFT+U / +V / +J
[ CONSTRAINTS | ATOMIC_VELOCITIES | ATOMIC_FORCES | ADDITIONAL_K_POINTS | SOLVENTS ]
```

`&IONS` / `&CELL` are only emitted for the relevant `calculation`; emitting them
for `scf` is an input error.

## Emit policy (the important rule)

QE has internal defaults for almost every variable. Writing a variable to the
`.in` **means overriding its default**. Therefore:

- **Core parameters** are always written to the `.in`. They are either QE-
  `REQUIRED` (`calculation`, `ibrav`, `nat`, `ntyp`, `ecutwfc`) or values a
  materials calculation should always pin explicitly for reproducibility
  (`ecutrho`, `occupations`, `conv_thr`, k-grid, pseudopotentials).
- **Advanced parameters are NOT written unless the user explicitly sets them.**
  An untouched advanced field contributes **nothing** to the `.in` — QE uses its
  own default. This keeps the input minimal, avoids silently changing behaviour,
  and prevents a stray field from breaking a run.

Implementation consequence for the editor: each advanced field carries an
"active / touched" flag. The `.in` generator iterates only over (core ∪
{advanced fields the user activated}). The preview panel (R336) therefore shows
exactly what QE will receive — nothing more.

The classification below drives both the UI (core vs collapsed "Advanced")
and the generator's emit set.

## &CONTROL

| Variable | Tier | Notes |
|---|---|---|
| `calculation` | core | task; comes from the node's execute type (scf/nscf/bands/relax/vc-relax) |
| `restart_mode` | core | `from_scratch` default |
| `nstep` | core (relax/vc-relax) | ionic/MD steps; QE default 1 for scf, 50 otherwise |
| `etot_conv_thr` | core (relax/vc-relax) | energy convergence for ionic min, default 1e-4 |
| `forc_conv_thr` | core (relax/vc-relax) | force convergence, default 1e-3 |
| `tstress` / `tprnfor` | auto | QE forces these `.true.` for vc-relax/relax; editor does not expose |
| `verbosity` | advanced | `high`/`low` |
| `disk_io` | advanced | `low`/`medium`/`none` |
| `max_seconds` | advanced | wall-time cap for queue splitting |
| `iprint`, `dt` | advanced | MD-only |
| `prefix`, `outdir`, `pseudo_dir` | managed | set by Labyra, not user-editable |
| `tefield`, `dipfield`, `lelfield`, `lberry`, `lorbm`, `gate`, `lfcp`, `trism`, `twochem` | skip / PEC | see **Slab/PEC** block for `tefield`+`dipfield` |

## &SYSTEM

Largest namelist. Structural variables (`ibrav`, `celldm`/`A…`, `nat`, `ntyp`,
`space_group`) come from the crystal structure, not the parameter editor.

| Variable | Tier | Notes |
|---|---|---|
| `ecutwfc` | core | REQUIRED; wavefunction cutoff (Ry) |
| `ecutrho` | core | default 4×ecutwfc; USPP typically 8–12×, PAW typically 4× (test required) |
| `occupations` | core | `fixed` (insulator) / `smearing` (metal) / `tetrahedra` (DOS) |
| `smearing` | core (if smearing) | `gaussian` / `methfessel-paxton` / `marzari-vanderbilt` (cold) / `fermi-dirac` |
| `degauss` | core (if smearing) | smearing width (Ry) |
| `nbnd` | core | number of bands; default = valence for insulator, +20% for metal |
| `nspin` | magnetism | 1 (non-polarised) / 2 (LSDA) |
| `starting_magnetization(i)` | magnetism | per-species; required to get a nonzero magnetic ground state |
| `tot_magnetization` | magnetism | fix total moment (mutually exclusive with starting_magnetization) |
| `noncolin`, `lspinorb`, `angle1`, `angle2` | magnetism/adv | noncollinear + spin-orbit |
| `tot_charge` | advanced | charged cell (+1 = one e⁻ removed); jellium background auto-added |
| `nosym`, `noinv`, `nosym_evc`, `no_t_rev`, `force_symmorphic` | advanced | symmetry control |
| `nr1/nr2/nr3`, `nr1s/nr2s/nr3s` | advanced | manual FFT grid (all three required) |
| `input_dft` | advanced | override functional from PP (use with care) |
| **Hybrid (HSE/PBE0)** `ecutfock`, `exx_fraction`, `screening_parameter`, `exxdiv_treatment`, `x_gamma_extrapolation`, `ecutvcut`, `nqx1/2/3` | advanced | only when functional = hybrid |
| **vdW** `vdw_corr` | core (this line) | `grimme-d3` / `grimme-d2` / `ts` / `xdm` / `mbd` |
| `dftd3_version`, `dftd3_threebody` | advanced | D3 variant (Labyra uses D3-BJ) |
| **Slab/PEC** `assume_isolated`, `esm_bc`, `edir`, `emaxpos`, `eopreg`, `eamp`, `tefield`, `dipfield` | PEC | asymmetric-slab dipole correction; `dipfield`+`tefield` with the discontinuity in vacuum |
| RISM / gate / sic / dmft / twochem variables | skip | not used by Labyra |

## &ELECTRONS

| Variable | Tier | Notes |
|---|---|---|
| `conv_thr` | core | SCF convergence on estimated energy error, default 1e-6 |
| `mixing_beta` | core | charge mixing factor, default 0.7 (lower for hard-to-converge slabs) |
| `electron_maxstep` | core | max SCF iterations |
| `mixing_mode` | core | `plain` / `TF` / `local-TF` |
| `diagonalization` | core | `david` / `cg` / `ppcg` / `paro` / `rmm-davidson` |
| `mixing_ndim` | advanced | mixing history dimension |
| `diago_thr_init` | advanced | initial diagonalisation threshold |
| `diago_david_ndim`, `diago_cg_maxiter`, `diago_rmm_ndim`, `diago_rmm_conv`, `diago_gs_nblock`, `diago_full_acc` | advanced | per-solver knobs |
| `startingpot`, `startingwfc` | advanced | `atomic`/`file` etc. |
| `adaptive_thr`, `conv_thr_init`, `conv_thr_multi`, `scf_must_converge` | advanced | adaptive threshold + convergence behaviour |

## &IONS (relax / vc-relax only)

| Variable | Tier | Notes |
|---|---|---|
| `ion_dynamics` | core | `bfgs` (relax) / `damp` / `fire` / `verlet` (md) |
| `bfgs_ndim` | core | BFGS history |
| `pot_extrapolation`, `wfc_extrapolation` | advanced | restart extrapolation |
| `trust_radius_max/min/ini`, `upscale`, `w_1`, `w_2` | advanced | BFGS trust region |
| `fire_*` | advanced | FIRE minimiser parameters |
| MD thermostat (`ion_temperature`, `tempw`, `nraise`, …) | skip | MD-only, not in Labyra scope |

## &CELL (vc-relax only)

| Variable | Tier | Notes |
|---|---|---|
| `cell_dynamics` | core | `bfgs` / `sd` / `damp-pr` / `damp-w` |
| `press` | core | target pressure (kbar) |
| `cell_dofree` | core | `all` / `x` / `xy` / `2Dxy` / `z` / `shape` / `volume` … — key for 2D materials (fix c) |
| `press_conv_thr` | advanced | pressure convergence |
| `cell_factor`, `wmass` | advanced | |

## Cards

### ATOMIC_SPECIES

Format per line: `X  Mass_X  PseudoPot_X`, i.e. species label, atomic mass, and
the **pseudopotential filename** (`.UPF`). This is where the editor exposes a
per-species **UPF upload/drop** control; the uploaded filename is written
verbatim into column 3, and the file is staged into `pseudo_dir`. Mass is
auto-filled from the periodic table and editable.

### HUBBARD (DFT+U / +V / +J)

Replaces the deprecated `Hubbard_U(i)` namelist syntax. Structure:

```
HUBBARD {atomic | ortho-atomic | norm-atomic | wf | pseudo}
U     label-manifold  u_val          # e.g.  U W-3d 6.2
J0    label-manifold  j0_val         # optional
ALPHA label-manifold  alpha_val      # optional
V     label-manifold label'-manifold' I J v_val   # inter-site +V
```

- Projector line (`atomic`, `ortho-atomic`, …) selects the Hubbard projector;
  `ortho-atomic` is the common robust choice.
- `manifold` is written as `3d`, `2p`, `4f`, …
- **All Hubbard parameters are in eV.**
- Labyra WO₃₋ₓ defaults: `U W-3d 6.2`, `U O-2p 9.0` (thesis DFT+U setup).

Emit policy: the HUBBARD card is written only when DFT+U is enabled for the
node; otherwise it is omitted entirely.

### K_POINTS

- `automatic` → `nk1 nk2 nk3 sk1 sk2 sk3` (Monkhorst–Pack grid + shift).
- `crystal_b` / `tpiba_b` → high-symmetry path for `bands`.
- `gamma` → single Γ point (molecules / large cells).

### CELL_PARAMETERS

Required when `ibrav = 0`: three lattice vectors under a unit option
(`angstrom` / `bohr` / `alat`). Supplied from the crystal structure.

## Build plan mapping

| Round | Scope |
|---|---|
| R337 | Reorganise the **existing** editor params into the namelist blocks above (UI-only, emit policy wired for advanced-off). No new params. |
| R338 | HUBBARD (+U) block: per-species U in eV, projector selector; wire into generator + card emit. |
| R339 | ATOMIC_SPECIES card + **UPF upload** (storage, per-species assignment, filename into input). |
| R340 | Remaining advanced params (diagonalization knobs, symmetry, hybrid, slab/PEC dipole). |

Each round keeps the compose → preview (`.in`) → submit path green and
verifiable.
