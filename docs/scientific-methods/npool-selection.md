# Automatic k-point pool selection (`-npool`)

## What `-npool` does

pw.x parallelises over irreducible k-points by splitting the MPI ranks into
`npool` pools; each pool owns a subset of k-points and further parallelises the
plane waves / FFT across its `NPROC / npool` ranks. k-point parallelisation has
near-linear scaling and low communication, so it is the preferred axis — but only
up to the point where each pool still has enough ranks to distribute the dense
FFT grid.

## Why it must be per-material

The number of **irreducible** k-points `n_k` is a function of the k-mesh **and**
the crystal symmetry. The same 15×15×4 mesh gives a different `n_k` for 2H-WS₂
(P6₃/mmc) than for monoclinic WO₃ (P2₁/c). A fixed npool is therefore wrong for
some material every time; it has to be derived from `n_k`.

`n_k` is known **before** running QE: spglib (`get_ir_reciprocal_mesh`) folds the
automatic mesh into the irreducible wedge — the same count QE later prints as
`number of k points`. For a bands path (`crystal_b`) the point count is explicit
(bands lists every point; no symmetry reduction). Spin-polarised runs (`nspin=2`)
double the k-point work in QE's pool split.

## Selection heuristic (`src/dft/npool.py`)

Given `NPROC` MPI ranks and `n_k` irreducible k-points, npool must:

1. divide `NPROC` (pool sizes are equal);
2. be ≤ `n_k` (no empty pools);
3. leave ≥ `min_ranks_per_pool` ranks per pool for the FFT.

`min_ranks_per_pool` scales with the FFT load — it rises with the charge-density
cutoff (PAW / hard pseudopotentials produce large grids: 4 → 6 at ecutrho ≥ 400
Ry, → 7 at ≥ 600 Ry) and with cell size (→ 8 for ≥ 100 atoms). If no divisor meets
the floor, the floor is relaxed to ≥ 2 rather than forfeiting k-parallelism.

Among the candidates, npool maximises **effective** parallel k-work:

```
score(npool) = npool · load_efficiency
load_efficiency = n_k / (npool · ⌈n_k / npool⌉)   ∈ (0, 1]
```

`load_efficiency` is 1 when npool divides `n_k` evenly and < 1 otherwise (the
busiest pool has one extra k-point). Scoring by `npool · load_efficiency` — not
nominal `npool` — is what prevents the degenerate "must divide evenly" solution:
`n_k = 81` shares no non-trivial divisor with `NPROC = 28`, but the picker still
returns npool = 4 (load_eff 0.96), not npool = 1 (load_eff 1.0), because 4 pools
do 3.8× more effective k-work.

## Worked example (2H-WS₂ PBE+U, the project's reference)

`n_k = 81` (15×15×4 mesh, no shift), ecutrho = 720 Ry (PAW), 6 atoms.

| Machine | NPROC (= vCPU / 2) | npool | ranks/pool | load-eff |
| --- | --- | --- | --- | --- |
| c2d-standard-56 | 28 | 4 | 7 | 0.96 |
| n2-standard-96 | 48 | 6 | 8 | 0.96 |

Note NPROC is **half** the vCPU count: GCP vCPUs are hyperthreads, and pure-MPI on
physical cores is optimal for memory-bandwidth-bound plane-wave QE, so `io.launch`
sets `NPROC = vCPU / 2`.

## Override

Auto-npool runs only when npool is not explicitly set (None/0/1) and only for
pw.x calc types (postproc binaries ignore `-npool`). A workflow- or unit-level
`npool` is always respected. Resolution fails safe: if `n_k` can't be determined
(e.g. a structure missing its Å cell), npool = 1 and QE runs single-pool.
