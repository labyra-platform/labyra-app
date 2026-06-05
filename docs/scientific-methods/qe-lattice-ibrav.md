# QE Lattice & `ibrav` — VERIFY-not-TRUST structure → input

> `docs/scientific-methods/qe-lattice-ibrav.md` · Method backing `dft/structure_io.py`
> **Core:** translate any structure (Materials Project / CIF / POSCAR) into a Quantum ESPRESSO `&SYSTEM` lattice block **safely**. The `ibrav`→`celldm` mapping is a known footgun for centered and low-symmetry cells, so Labyra **verifies** every non-trivial `ibrav` by round-trip reconstruction and falls back to `ibrav=0` on any mismatch.
> **Principle:** đi chậm chắc · VERIFY chứ không TRUST · cảnh báo không chặn (user là chuyên gia) · sai NGẦM là nguy hiểm nhất.

---

## 1. Why this matters (the centered-cell trap)

QE's `&SYSTEM` accepts two ways to define the unit cell:

- **`ibrav = 0`** + an explicit `CELL_PARAMETERS` 3×3 matrix. QE detects the symmetry itself. Robust for *every* lattice.
- **`ibrav ≠ 0`** + `celldm(...)`. QE builds the cell from a Bravais-lattice code plus a few scalars. Compact, but only correct if the scalars describe the *same* cell QE will construct.

The trap: tools that map a structure to `ibrav ≠ 0` by reading lattice parameters off the cell can silently pick the **wrong** numbers for **centered** lattices (face/body/base-centered) and **low-symmetry** systems (monoclinic, triclinic). Example: Si is fcc (`Fd-3m`). A naive mapper sees `ibrav=2` (cubic-F) but feeds `celldm(1)` from the **primitive** lattice vector length instead of the **conventional** cubic edge `a` → QE builds a cell with the wrong volume, and the run produces physically wrong numbers with **no error message**. This is exactly why Mat3ra, pymatgen and AiiDA default to `ibrav=0`.

Labyra's stance: default to the robust `ibrav=0`, attempt `ibrav≠0` only for a narrow whitelist of high-symmetry primitive lattices, and **prove** the choice by reconstructing the cell and comparing to the original before emitting any input.

---

## 2. The seven trust layers

`structure_io.py` implements L1–L5; L6–L8 live outside the module (CI, UI, and a future QE dry-run).

| Layer | What | Where |
|---|---|---|
| **L1** | `ibrav=0` default + `CELL_PARAMETERS` (QE auto-detects symmetry) | `structure_io.py` |
| **L2** | Narrow whitelist for `ibrav≠0` — only **high-symmetry P** systems | `SAFE_IBRAV` |
| **L3 ★** | **Round-trip verify**: rebuild the cell from `(ibrav, celldm)` and compare to the source; mismatch → auto-fallback to `ibrav=0` | `_cell_from_ibrav` + `_cells_match` |
| **L4** | Sanity checks: volume > 0 · no atoms closer than 0.5 Å · occupancy = 1 → otherwise **RAISE** (never swallow) | `_sanity` |
| **L5** | `ibrav=0` emitted with 9 significant figures so QE detects symmetry correctly | `emit_qe(decimals=9)` |
| **L6** | Golden test (CI): pin pymatgen/spglib, assert WO₃→`ibrav 4`, Si→`ibrav 0` | `golden_test_*` (planned) |
| **L7** | Human layer: 3D viewer + parameters → user confirms before running | app `structure-viewer` (planned) |
| **L8** | (v2) Real QE dry-run: `pw.x` reads the input and confirms symmetry/#atoms — the final arbiter | future |

The philosophy is layered defence: L1 is always safe; L2–L3 *earn* the compact form only when proven; L4 stops nonsense loudly; L6–L8 add machine and human checks. No layer trusts the `ibrav` map blindly.

---

## 3. The `ibrav` → lattice → `celldm` reference (official QE)

```
0  any (CELL_PARAMETERS)            | 8   ortho-P          celldm(1,2,3)
1  cubic P          celldm(1)       | 9/-9/91 ortho base-C celldm(1,2,3)
2  cubic F          celldm(1)       | 10  ortho face-C     celldm(1,2,3)
3/-3 cubic I        celldm(1)       | 11  ortho body-C     celldm(1,2,3)
4  hexagonal        celldm(1,3)     | 12  monoclinic-c     celldm(1,2,3,4=cos γ)
5  trigonal-R       celldm(1,4=cosα)| -12 monoclinic-b     celldm(1,2,3,5=cos β)
6  tetragonal-P     celldm(1,3)     | 13/-13 monoclinic base-C
7  tetragonal-I     celldm(1,3)     | 14  triclinic        celldm(1..6)
```

Conventions: `celldm(1)=a` in **Bohr**, `celldm(2)=b/a`, `celldm(3)=c/a`, `celldm(4)=cos(bc)`, `celldm(5)=cos(ac)`, `celldm(6)=cos(ab)`.

Caveats baked into the module:
- **Negative `ibrav`** (e.g. `-3`, `-9`, `-12`) selects a *different axis convention* and is easy to get wrong → never auto-selected.
- **Monoclinic** uses `celldm(4)` vs `celldm(5)` depending on the unique axis (c vs b) → never auto-selected.
- Bohr radius constant used: `BOHR = 0.529177210903 Å`.

---

## 4. The whitelist and the round-trip check

Only four high-symmetry **primitive** systems are eligible for `ibrav≠0`, where the primitive cell equals the conventional cell and `celldm` reads off directly:

```python
SAFE_IBRAV = {("cubic","P"): 1, ("hexagonal","P"): 4,
              ("tetragonal","P"): 6, ("orthorhombic","P"): 8}
```

For a candidate, `_cell_from_ibrav(ibrav, celldm)` reconstructs the 3×3 cell (Å):

- `ibrav=1`: `a·I`
- `ibrav=4`: hexagonal — `[[a,0,0], [-a/2, a√3/2, 0], [0,0,c]]`, `c = celldm(3)·a`
- `ibrav=6`: `[[a,0,0],[0,a,0],[0,0,c]]`
- `ibrav=8`: `[[a,0,0],[0,b,0],[0,0,c]]`

`_cells_match` then compares lattice lengths and angles against the source:

```
abc:    np.allclose(recon.abc, source.abc, rtol=1e-4)
angles: np.allclose(recon.angles, source.angles, atol=0.05°)
```

Pass → emit `ibrav≠0` with `note="đã verify round-trip"`. Fail → `ibrav=0` with `note="reconstruct LỆCH → fallback"`. Centered lattices never reach the whitelist (their centering symbol ≠ `P`), so the trap in §1 is closed by construction; the round-trip is the second net.

---

## 5. Sanity checks (`_sanity`) — fail loud, never silent

`emit_qe` refuses to produce an input if any check fails:

- **Volume** `> 0` (degenerate cell otherwise).
- **Minimum interatomic distance** `≥ 0.5 Å` (closer ⇒ overlapping atoms / bad CIF).
- **Occupancy = 1** on every site (partial occupancy / disorder needs manual handling, not a guess).

A failed check raises `ValueError("SANITY FAIL …")` rather than emitting a quietly-broken input — silent wrong inputs are the worst failure mode in DFT.

---

## 6. Primitive vs conventional (which cell)

`structure_to_qe(use_primitive=True)` standardizes via `SpacegroupAnalyzer`:

| Task | Cell | Why |
|---|---|---|
| bulk relax/scf/bands/dos/pdos | **primitive** | same physics, fewer atoms → cheaper; BZ k-path defined on the primitive cell |
| slab / surface | **conventional** → cleave | correct Miller indices |
| defect / doping | conventional → supercell | larger cell, clearer symmetry |

Total energies are **not comparable** across primitive vs conventional in absolute terms — always report per-atom and per-formula-unit.

---

## 7. Verified results (nAM ground truth)

`structure_io.py` was checked against real structures:

- **h-WO₃** (hexagonal, P) → `ibrav = 4`, round-trip verified; `celldm` matched the values nAM had typed by hand.
- **Si** (fcc, F-centered) → `ibrav = 0` robust — the centered-cell trap avoided automatically (whitelist + round-trip).
- **rutile TiO₂** (tetragonal, P) → `ibrav = 6`, round-trip verified.

---

## 8. Parameters & edge cases

```
structure_to_qe(struct, use_primitive=True, prefer_ibrav=True, angle_tol=5, symprec=1e-3)
  use_primitive : primitive (bulk) vs conventional (slab/defect)
  prefer_ibrav  : attempt ibrav≠0 (still gated by whitelist + round-trip); False → always ibrav=0
  symprec       : spglib symmetry tolerance (1e-3 default)
  angle_tol     : spglib angle tolerance (degrees)
emit_qe(res, decimals=9)  : 9 sig-figs for CELL_PARAMETERS (L5)
```

- Tighten `symprec` if a near-symmetric experimental cell is mis-detected; loosen if a clean cell is over-split. Changing `symprec` changes the detected space group → re-verify.
- `prefer_ibrav=False` is the safest setting for any non-standard / doped / from-paper structure.

---

## 9. License & provenance

`pymatgen` (MIT) · `spglib` (BSD) · `numpy` (BSD) — all clean for commercial SaaS. Materials Project data is **CC-BY 4.0** → record the `mp-id` as the source (mirrors PROV-O `structure.source = {materials_project, mp_id}`).

---

## 10. References

```
Quantum ESPRESSO — INPUT_PW documentation (ibrav / celldm table), https://www.quantum-espresso.org
Setyawan & Curtarolo (2010) "High-throughput electronic band structure calculations:
  challenges and tools", Comput. Mater. Sci. 49, 299. DOI 10.1016/j.commatsci.2010.05.010
  (standardized cells + Brillouin-zone paths; basis for seekpath)
Togo & Tanaka — spglib (symmetry finding), https://spglib.github.io
Materials Project — Jain et al. (2013), APL Materials 1, 011002. DOI 10.1063/1.4812323
```

---

*Core: any structure → QE `&SYSTEM` via `structure_io.py`, defaulting to `ibrav=0` and only using `ibrav≠0` for the four high-symmetry P systems when a round-trip reconstruction matches the source cell (else auto-fallback). Sanity checks raise rather than emit broken inputs. Primitive for bulk, conventional for slab/defect; energies per-atom/formula-unit. VERIFY-not-TRUST across seven layers — L1–L5 in code, L6–L8 (CI/UI/QE dry-run) outside.*
