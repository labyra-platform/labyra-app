/**
 * DFT parameter reference — a curated documentation source for every DFT/QE
 * parameter the composer exposes: QE keyword, meaning, typical value, unit and
 * dependencies, grouped by namelist/topic, plus the primary method citations.
 * Content is scientific reference material (verified against the QE input
 * description and the cited papers), not app configuration. @phase R393
 */

export interface DftParam {
  /** QE input keyword, e.g. "ecutwfc". */
  keyword: string;
  name: string;
  description: string;
  typical?: string;
  unit?: string;
  note?: string;
}

export interface DftRefCategory {
  id: string;
  title: string;
  namelist?: string;
  intro: string;
  params: DftParam[];
}

export interface DftCitation {
  topic: string;
  label: string;
  doi?: string;
}

export const DFT_REFERENCE: DftRefCategory[] = [
  {
    id: 'xc',
    title: 'Exchange–correlation & method level',
    namelist: '&SYSTEM',
    intro:
      'Selects the functional and the correlation treatment (plain GGA, GGA+U, +U+V, meta-GGA, hybrid). This is the single biggest determinant of accuracy and cost — see the Foundations “functional ladder” concept.',
    params: [
      {
        keyword: 'input_dft',
        name: 'Functional override',
        description:
          "Force a specific exchange–correlation functional regardless of the pseudopotential default, e.g. 'pbe', 'pbesol', 'scan', 'r2scan', or a hybrid 'pbe0'/'hse'. Best practice: use pseudopotentials generated with the matching functional (SCAN needs SCAN-consistent pseudos for full accuracy).",
        typical: "'pbe' (default for PBE pseudos)"
      },
      {
        keyword: 'method level',
        name: 'GGA / GGA+U / +U+V / hybrid',
        description:
          'Plain GGA (PBE) for general solids; GGA+U adds an on-site Hubbard correction for localized d/f states; +U+V adds inter-site coupling for covalent systems; meta-GGA (SCAN) improves energetics across chemistries; hybrids (HSE06) give accurate gaps at 10–100× cost.',
        typical: 'GGA+U for correlated oxides'
      },
      {
        keyword: 'exx_fraction / screening_parameter',
        name: 'Hybrid mixing & screening',
        description:
          'For hybrids: exx_fraction is the fraction of exact (Fock) exchange (0.25 for PBE0/HSE); screening_parameter is the HSE range-separation ω (bohr⁻¹) that limits exact exchange to short range.',
        typical: 'exx_fraction 0.25, ω ≈ 0.106',
        unit: 'bohr⁻¹ (ω)'
      },
      {
        keyword: 'ecutfock',
        name: 'Exact-exchange cutoff',
        description:
          'Plane-wave cutoff for the Fock exchange operator in hybrid calculations. Can often be lower than ecutrho to save memory/time, but must be converged for the property of interest.',
        typical: '≤ ecutrho',
        unit: 'Ry'
      },
      {
        keyword: 'nqx1 / nqx2 / nqx3',
        name: 'Exact-exchange q-grid',
        description:
          'Grid of q-points for the exchange operator in hybrids. Usually coarser than the k-grid (e.g. k-grid/2) because exact exchange varies smoothly — a major cost lever.',
        typical: 'k-grid or coarser'
      }
    ]
  },
  {
    id: 'control',
    title: 'Run control',
    namelist: '&CONTROL',
    intro:
      'Selects the type of calculation and the ionic-relaxation stopping criteria. These govern what pw.x computes and when a geometry optimization is considered converged.',
    params: [
      {
        keyword: 'calculation',
        name: 'Calculation type',
        description:
          'scf = single self-consistent field at fixed geometry; nscf = non-self-consistent (dense k-grid for DOS on a fixed density); bands = eigenvalues along a k-path; relax = optimize atomic positions at fixed cell; vc-relax = optimize positions AND cell (variable-cell).',
        typical: 'vc-relax → scf → bands / nscf'
      },
      {
        keyword: 'etot_conv_thr',
        name: 'Energy convergence (ionic)',
        description:
          'Convergence threshold on the TOTAL-ENERGY CHANGE between consecutive ionic steps (|ΔE|), not the absolute energy. A relax/vc-relax stops when |ΔE| < etot_conv_thr AND the force criterion is also met.',
        typical: '1e-4 (default) → 1e-5 for tight relaxation',
        unit: 'Ry',
        note: 'Only used for relax / vc-relax. Absent in scf/nscf/bands.'
      },
      {
        keyword: 'forc_conv_thr',
        name: 'Force convergence (ionic)',
        description:
          'Convergence threshold on the maximum residual force on any atom. BFGS is converged only when the largest |force| drops below this value.',
        typical: '1e-3 (default) → 1e-4 for accurate geometries',
        unit: 'Ry/Bohr',
        note: 'Relax / vc-relax only.'
      },
      {
        keyword: 'nstep',
        name: 'Max ionic steps',
        description: 'Maximum number of ionic (geometry) steps before pw.x stops.',
        typical: '50–200'
      },
      {
        keyword: 'verbosity',
        name: 'Output verbosity',
        description:
          "Controls how much is written to the .out. 'high' echoes symmetry, forces and per-iteration detail useful for debugging and for parsing convergence.",
        typical: "'high' | 'low'"
      },
      {
        keyword: 'tprnfor / tstress',
        name: 'Print forces / stress',
        description:
          'Force pw.x to compute and print forces (tprnfor) and the stress tensor (tstress) even for an scf run. Required if you want forces/stress without a relaxation.',
        typical: '.true.'
      }
    ]
  },
  {
    id: 'system',
    title: 'System & basis',
    namelist: '&SYSTEM',
    intro:
      'Defines the cell, the plane-wave basis size, electronic occupations and the exchange-correlation treatment. The two cutoffs (ecutwfc, ecutrho) are the primary accuracy/cost knobs.',
    params: [
      {
        keyword: 'ecutwfc',
        name: 'Wavefunction cutoff',
        description:
          'Plane-wave kinetic-energy cutoff for the Kohn–Sham wavefunctions. Sets the basis-set size: larger = more complete basis, more accurate, more expensive. Must be converged per system; never below the pseudopotential’s author-suggested minimum.',
        typical: '40–80 (from the UPF header, then converge)',
        unit: 'Ry',
        note: 'Set the global value at or above the largest suggested cutoff across all species.'
      },
      {
        keyword: 'ecutrho',
        name: 'Charge-density cutoff',
        description:
          'Kinetic-energy cutoff for the charge density and potential. Norm-conserving (NC) pseudos need 4×ecutwfc; ultrasoft (US) and PAW need more (augmentation charges are sharper).',
        typical: '4×ecutwfc (NC); 8–12×ecutwfc (US/PAW)',
        unit: 'Ry'
      },
      {
        keyword: 'occupations',
        name: 'Occupations',
        description:
          "How electrons fill states. 'fixed' for insulators/semiconductors with a clear gap; 'smearing' for metals (and safer for small-gap systems); 'tetrahedra' for accurate DOS on a filled k-grid.",
        typical: "'smearing' (metals) | 'fixed' (insulators)"
      },
      {
        keyword: 'smearing / degauss',
        name: 'Smearing scheme / width',
        description:
          "Broadening of occupations near the Fermi level. Schemes: 'gaussian', 'mp' (Methfessel–Paxton), 'mv'/'cold' (Marzari–Vanderbilt), 'fd' (Fermi–Dirac). degauss is the width — larger smooths SCF but shifts energies; extrapolate to degauss→0 for accuracy.",
        typical: 'mv/mp, degauss 0.01–0.02',
        unit: 'Ry (degauss)'
      },
      {
        keyword: 'nspin / starting_magnetization',
        name: 'Spin polarization',
        description:
          'nspin=1 non-magnetic; nspin=2 collinear spin-polarized (needed for magnetic systems or open-shell defects). starting_magnetization seeds the initial moment per species to break symmetry.',
        typical: 'nspin=1 (closed shell) | 2 (magnetic)'
      },
      {
        keyword: 'nbnd',
        name: 'Number of bands',
        description:
          'Number of Kohn–Sham states computed. Must exceed the number of occupied bands; add empty bands for smearing, DOS and unoccupied-state analysis (bands/nscf).',
        typical: 'occupied + ~20–50% empty'
      },
      {
        keyword: 'ibrav',
        name: 'Bravais lattice index',
        description:
          'Selects the lattice type. ibrav=0 means the cell is given explicitly via CELL_PARAMETERS (most flexible; used for imported/relaxed cells).',
        typical: '0 (free) with CELL_PARAMETERS'
      },
      {
        keyword: 'noncolin / lspinorb',
        name: 'Non-collinear / spin–orbit',
        description:
          'noncolin=.true. treats magnetization as a full 3D vector (spin spirals, canted magnets). lspinorb=.true. adds spin–orbit coupling (implies noncolin) and requires fully-relativistic pseudopotentials — needed for heavy elements (5d W), valley splitting, topology.',
        typical: '.false. (scalar-relativistic first pass)'
      },
      {
        keyword: 'assume_isolated',
        name: 'Isolated-system correction',
        description:
          "Removes spurious interaction between periodic images for non-3D-periodic systems: 'martyna-tuckerman' (molecules), 'esm' (effective screening medium for slabs/electrodes), 'makov-payne' (charged-molecule energy correction). Essential for accurate molecule/slab energetics in a periodic code.",
        typical: "'none' (bulk) | 'esm' (slab) | 'mt' (molecule)"
      },
      {
        keyword: 'tot_charge',
        name: 'Total cell charge',
        description:
          'Net charge added to the cell (electrons removed if positive). Used for charged defects and electrochemical/ionic states; in 3D-periodic cells a compensating jellium background is added — combine with a charged-cell correction for formation energies.',
        typical: '0 (neutral)',
        unit: 'e'
      },
      {
        keyword: 'nosym / noinv',
        name: 'Symmetry control',
        description:
          'nosym=.true. disables crystal symmetry (all k-points computed explicitly); noinv keeps rotations but drops inversion. Needed for broken-symmetry states, some magnetic orderings, or debugging symmetry-related errors — at higher cost.',
        typical: '.false. (use symmetry)'
      }
    ]
  },
  {
    id: 'hubbard',
    title: 'Hubbard correction (DFT+U)',
    namelist: '&SYSTEM / HUBBARD',
    intro:
      'Adds an on-site Coulomb correction to localized d/f manifolds that semi-local functionals over-delocalize (e.g. transition-metal 3d/5d, O 2p). Improves band gaps, magnetic moments and redox energetics of correlated oxides.',
    params: [
      {
        keyword: 'U (Hubbard_U)',
        name: 'Effective Hubbard U',
        description:
          'The effective on-site interaction (Dudarev U−J) applied to a chosen atomic manifold (e.g. W-5d, O-2p). Larger U localizes electrons more strongly and typically widens the gap. Material- and manifold-specific; determined from literature or linear-response.',
        typical: 'system-dependent (e.g. W-5d ≈ 6.2, O-2p ≈ 9.0)',
        unit: 'eV'
      },
      {
        keyword: 'projector',
        name: 'Hubbard projector',
        description:
          'Basis used to define site occupations: atomic, ortho-atomic (Löwdin-orthogonalized — recommended for consistency), or Wannier. Ortho-atomic avoids double counting from non-orthogonal atomic orbitals.',
        typical: 'ortho-atomic'
      },
      {
        keyword: 'species labels',
        name: 'Oxidation-state distinction',
        description:
          'U is NOT transferable between different oxidation/coordination environments of the same element. The same element in two chemical states (e.g. W⁶⁺ in WO₃ vs W⁴⁺ in WS₂) needs SEPARATE species labels so each gets its own U.',
        note: 'Give distinct atom labels per environment in the input.'
      },
      {
        keyword: 'V (Hubbard_V)',
        name: 'Inter-site Hubbard V',
        description:
          'Extended DFT+U+V coupling between an atom and a specific neighbor, capturing metal–ligand hybridization that on-site U alone misses. Improves gaps and energetics in partly-covalent systems (e.g. Li-ion cathodes). Specified per atom pair; can be computed by DFPT linear response.',
        typical: 'system-dependent',
        unit: 'eV',
        note: 'Requires neighbor-pair bookkeeping in the HUBBARD card.'
      }
    ]
  },
  {
    id: 'vdw',
    title: 'Dispersion (van der Waals)',
    namelist: '&SYSTEM',
    intro:
      'Semi-local functionals miss long-range London dispersion. Grimme’s DFT-D3 adds a pairwise (and optional three-body) atom–atom C₆/R⁶ correction — essential for layered materials, molecular crystals and adsorption.',
    params: [
      {
        keyword: 'vdw_corr',
        name: 'Dispersion correction',
        description:
          "Selects the scheme. 'grimme-d3' is the D3 method; other options include grimme-d2, TS and MBD. D3 is a good default for solids and interfaces.",
        typical: "'grimme-d3'"
      },
      {
        keyword: 'dftd3_version',
        name: 'D3 damping variant',
        description:
          'Damping function for D3. version=3 = D3 with zero-damping D3(0); version=4 = D3 with Becke–Johnson damping (D3-BJ), the modern recommended variant (better for intermolecular/near-equilibrium distances).',
        typical: '4 (D3-BJ)'
      },
      {
        keyword: 'dftd3_threebody',
        name: 'Three-body term',
        description:
          'Include the Axilrod–Teller–Muto three-body dispersion term. Small but can matter for dense/large systems.',
        typical: '.true.'
      }
    ]
  },
  {
    id: 'electrons',
    title: 'SCF (electrons)',
    namelist: '&ELECTRONS',
    intro:
      'Controls the self-consistent-field loop: how tightly the density is converged, how it is mixed between iterations, and which diagonalizer is used.',
    params: [
      {
        keyword: 'conv_thr',
        name: 'SCF convergence threshold',
        description:
          'The SCF loop stops when the estimated energy error (from the density difference) falls below this value. Tighter → more accurate energies/forces but more iterations. Forces need a tighter conv_thr than energies.',
        typical: '1e-6 (rough) → 1e-8/1e-10 (forces, phonons)',
        unit: 'Ry'
      },
      {
        keyword: 'mixing_beta',
        name: 'Density mixing factor',
        description:
          'Fraction of the new density mixed in each SCF step. Smaller values stabilize hard-to-converge (metallic, magnetic, large) systems at the cost of more iterations.',
        typical: '0.7 (default) → 0.1–0.3 (difficult)'
      },
      {
        keyword: 'mixing_mode',
        name: 'Mixing preconditioner',
        description:
          "Damps the unstable long-wavelength (small-q) density components. 'plain' (Broyden) for insulators/semiconductors; 'TF' (Thomas–Fermi/Kerker screening) for metals; 'local-TF' for spatially inhomogeneous systems — slabs, molecules in vacuum, charged cells.",
        typical: "'plain' | 'TF' (metals) | 'local-TF' (slabs)"
      },
      {
        keyword: 'mixing_ndim',
        name: 'Mixing history depth',
        description:
          'Number of previous iterations kept for Broyden mixing. A larger history builds a better inverse-Jacobian estimate and helps stubborn convergence, at more memory.',
        typical: '8 (default) → 12–20 (difficult)'
      },
      {
        keyword: 'diagonalization',
        name: 'Iterative diagonalizer',
        description:
          "Eigensolver for the KS Hamiltonian. 'david' (Davidson — fast, ~2–4× wavefunction memory, default); 'cg' (conjugate-gradient — robust, low memory, slower); 'ppcg' (block preconditioned CG — many bands, GPU-friendly); 'paro' (parallel orbital updating — high core counts); 'rmm-davidson' (RMM-DIIS — very fast, needs a good starting guess, QE ≥ 7.2).",
        typical: "'david' | 'cg' (low memory)"
      },
      {
        keyword: 'diago_thr_init',
        name: 'Initial diagonalization threshold',
        description:
          'Eigenvalue convergence required in the FIRST SCF iterations. Loose early (the potential is still changing) then tightened automatically as the density converges — set explicitly only to debug convergence.',
        typical: 'auto (rarely set)'
      },
      {
        keyword: 'diago_david_ndim',
        name: 'Davidson subspace size',
        description:
          'Working-subspace dimension for Davidson, as a multiple of the number of bands. Larger converges in fewer steps but uses more memory; reduce to 2 if memory-bound.',
        typical: '2–4'
      },
      {
        keyword: 'electron_maxstep',
        name: 'Max SCF iterations',
        description: 'Cap on SCF iterations per ionic step before giving up.',
        typical: '100–200'
      },
      {
        keyword: 'startingpot / startingwfc',
        name: 'SCF starting guess',
        description:
          "Initial potential ('atomic' superposition or 'file' to restart) and wavefunctions ('atomic+random' is a robust default; 'file' reuses a previous run).",
        typical: "startingpot='atomic', startingwfc='atomic+random'"
      }
    ]
  },
  {
    id: 'ions',
    title: 'Ionic & cell relaxation',
    namelist: '&IONS / &CELL',
    intro:
      'Present only for relax (&IONS) and vc-relax (&IONS + &CELL). Controls the geometry optimizer and, for variable-cell, the target pressure and cell degrees of freedom.',
    params: [
      {
        keyword: 'ion_dynamics',
        name: 'Ionic optimizer',
        description:
          "Algorithm for moving atoms. 'bfgs' (quasi-Newton) is the standard for relaxation; 'damp' for damped dynamics.",
        typical: "'bfgs'"
      },
      {
        keyword: 'upscale',
        name: 'conv_thr up-scaling',
        description:
          'Near the end of a relaxation, BFGS tightens conv_thr by up to this factor so forces are accurate as the minimum is approached.',
        typical: '100 (default)'
      },
      {
        keyword: 'trust_radius_max',
        name: 'Max BFGS step',
        description: 'Largest allowed ionic displacement in one BFGS step (trust region).',
        typical: '0.8 (default)',
        unit: 'Bohr'
      },
      {
        keyword: 'cell_dynamics / press',
        name: 'Cell optimizer / target pressure',
        description:
          "vc-relax only. cell_dynamics='bfgs' relaxes the cell; press is the target external pressure (0 for equilibrium).",
        typical: 'bfgs, press=0',
        unit: 'kbar (press)'
      },
      {
        keyword: 'cell_dofree',
        name: 'Cell degrees of freedom',
        description:
          "Restricts which cell parameters relax: 'all', 'ibrav' (keep symmetry), '2Dxy' (fix c for slabs/2D), 'z', etc.",
        typical: "'all' | '2Dxy' (slabs)"
      }
    ]
  },
  {
    id: 'kpoints',
    title: 'k-points & parallelization',
    intro:
      'Brillouin-zone sampling controls accuracy for periodic systems; the pool count controls how that sampling is distributed across MPI processes.',
    params: [
      {
        keyword: 'K_POINTS automatic',
        name: 'Monkhorst–Pack grid',
        description:
          'A regular nx×ny×nz k-mesh with optional shift. Denser grids are needed for metals and small cells; converge total energy vs grid density. Grid spacing should be roughly uniform in reciprocal length across a/b/c.',
        typical: 'e.g. 8×8×2 for a layered hexagonal cell'
      },
      {
        keyword: 'npool',
        name: 'k-point pools',
        description:
          'Splits k-points into npool groups processed in parallel (k-point parallelization). Best efficiency when the number of irreducible k-points divides evenly by npool and each pool still fits in memory. Total MPI ranks = npool × (ranks per pool).',
        typical: 'a divisor of the irreducible k-point count',
        note: 'Memory feasibility per pool is the first gate; then maximize load balance.'
      }
    ]
  },
  {
    id: 'bandpath',
    title: 'Band paths & k-point conventions',
    intro:
      'A band structure samples eigenvalues along a path through high-symmetry k-points. The path and its labels depend on a standardization convention applied to the primitive cell — see the Foundations “band-structure paths” concept.',
    params: [
      {
        keyword: 'path convention',
        name: 'High-symmetry path scheme',
        description:
          'Setyawan–Curtarolo (2010): tabulated paths per Bravais lattice, common in HT databases. Hinuma/seekpath (2017): fully crystallographic, standardizes the primitive cell and handles all space groups — the platform default. Latimer–Munro (2020): materials-agnostic, unique complete path from symmetry.',
        typical: 'seekpath (Hinuma)'
      },
      {
        keyword: 'K_POINTS crystal_b',
        name: 'Explicit path (band mode)',
        description:
          'For a bands calculation, the k-path is given as a list of high-symmetry vertices in crystal (reciprocal-lattice) coordinates with the number of points per segment. crystal_b/tpiba_b let QE interpolate between vertices.',
        typical: '20–40 points per segment'
      },
      {
        keyword: 'standardized cell',
        name: 'Cell standardization',
        description:
          'The structure fed to the band step must be the standardized primitive cell that the chosen convention assumes; otherwise the high-symmetry coordinates no longer match their labels and the plotted gap direction can be wrong.',
        note: 'seekpath returns the standardized cell together with the path.'
      }
    ]
  },
  {
    id: 'pseudo',
    title: 'Pseudopotentials',
    intro:
      'Replace core electrons with an effective potential. The type sets the required cutoffs and accuracy; the functional must be identical across all species in a calculation.',
    params: [
      {
        keyword: 'PAW / US / NC',
        name: 'Pseudopotential type',
        description:
          'NC (norm-conserving): hardest, ecutrho=4×ecutwfc, cheapest density. US (ultrasoft): softer wavefunctions (lower ecutwfc) but higher ecutrho. PAW (projector-augmented-wave): US-like cost with all-electron accuracy near nuclei — recommended for magnetism, EFG, and DFT+U.',
        typical: 'PAW for correlated oxides'
      },
      {
        keyword: 'functional consistency',
        name: 'XC functional match',
        description:
          'Every pseudopotential must be generated with the SAME exchange-correlation functional as the run (e.g. all PBE). Mixing functionals (e.g. a PBE and an LDA pseudo) is a silent error.',
        note: 'The functional is encoded in the UPF header.'
      },
      {
        keyword: 'suggested cutoffs',
        name: 'Author-suggested cutoffs',
        description:
          'Each UPF header carries a minimum ecutwfc/ecutrho recommended by its author. Set the global cutoffs at or above the LARGEST across all species; then converge upward.',
        unit: 'Ry'
      }
    ]
  }
];

export const DFT_CITATIONS: DftCitation[] = [
  {
    topic: 'Quantum ESPRESSO',
    label: 'Giannozzi et al., J. Phys.: Condens. Matter 21, 395502 (2009)',
    doi: '10.1088/0953-8984/21/39/395502'
  },
  {
    topic: 'Quantum ESPRESSO (advanced)',
    label: 'Giannozzi et al., J. Phys.: Condens. Matter 29, 465901 (2017)',
    doi: '10.1088/1361-648X/aa8f79'
  },
  {
    topic: 'PBE exchange-correlation',
    label: 'Perdew, Burke, Ernzerhof, Phys. Rev. Lett. 77, 3865 (1996)',
    doi: '10.1103/PhysRevLett.77.3865'
  },
  {
    topic: 'PAW method',
    label: 'Blöchl, Phys. Rev. B 50, 17953 (1994)',
    doi: '10.1103/PhysRevB.50.17953'
  },
  {
    topic: 'DFT+U (linear response)',
    label: 'Cococcioni, de Gironcoli, Phys. Rev. B 71, 035105 (2005)',
    doi: '10.1103/PhysRevB.71.035105'
  },
  {
    topic: 'DFT+U (Dudarev formulation)',
    label: 'Dudarev et al., Phys. Rev. B 57, 1505 (1998)',
    doi: '10.1103/PhysRevB.57.1505'
  },
  {
    topic: 'DFT-D3 dispersion',
    label: 'Grimme et al., J. Chem. Phys. 132, 154104 (2010)',
    doi: '10.1063/1.3382344'
  },
  {
    topic: 'D3 Becke–Johnson damping',
    label: 'Grimme, Ehrlich, Goerigk, J. Comput. Chem. 32, 1456 (2011)',
    doi: '10.1002/jcc.21759'
  },
  {
    topic: 'Monkhorst–Pack k-points',
    label: 'Monkhorst, Pack, Phys. Rev. B 13, 5188 (1976)',
    doi: '10.1103/PhysRevB.13.5188'
  },
  {
    topic: 'Methfessel–Paxton smearing',
    label: 'Methfessel, Paxton, Phys. Rev. B 40, 3616 (1989)',
    doi: '10.1103/PhysRevB.40.3616'
  },
  {
    topic: 'Marzari–Vanderbilt (cold) smearing',
    label: 'Marzari et al., Phys. Rev. Lett. 82, 3296 (1999)',
    doi: '10.1103/PhysRevLett.82.3296'
  },
  {
    topic: 'HSE screened hybrid',
    label: 'Heyd, Scuseria, Ernzerhof, J. Chem. Phys. 118, 8207 (2003)',
    doi: '10.1063/1.1564060'
  },
  {
    topic: 'SCAN meta-GGA',
    label: 'Sun, Ruzsinszky, Perdew, Phys. Rev. Lett. 115, 036402 (2015)',
    doi: '10.1103/PhysRevLett.115.036402'
  },
  {
    topic: 'r²SCAN meta-GGA',
    label: 'Furness et al., J. Phys. Chem. Lett. 11, 8208 (2020)',
    doi: '10.1021/acs.jpclett.0c02405'
  },
  {
    topic: 'DFT+U+V (extended Hubbard)',
    label: 'Campo & Cococcioni, J. Phys.: Condens. Matter 22, 055602 (2010)',
    doi: '10.1088/0953-8984/22/5/055602'
  },
  {
    topic: 'Hubbard parameters from DFPT',
    label: 'Timrov, Marzari, Cococcioni, Phys. Rev. B 103, 045141 (2021)',
    doi: '10.1103/PhysRevB.103.045141'
  },
  {
    topic: 'k-path (Setyawan–Curtarolo)',
    label: 'Setyawan & Curtarolo, Comput. Mater. Sci. 49, 299 (2010)',
    doi: '10.1016/j.commatsci.2010.05.010'
  },
  {
    topic: 'k-path (seekpath / Hinuma)',
    label: 'Hinuma et al., Comput. Mater. Sci. 128, 140 (2017)',
    doi: '10.1016/j.commatsci.2016.10.015'
  },
  {
    topic: 'k-path (Latimer–Munro)',
    label: 'Munro et al., Phys. Rev. B 101, 024105 (2020)',
    doi: '10.1103/PhysRevB.101.024105'
  },
  {
    topic: 'Fully-relativistic PAW (SOC)',
    label: 'Dal Corso, Phys. Rev. B 82, 075116 (2010)',
    doi: '10.1103/PhysRevB.82.075116'
  }
];
