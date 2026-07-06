/**
 * DFT workflow & practice — how to actually run reliable calculations: converge
 * the knobs, order multi-step relaxations, set up slabs/interfaces, and choose
 * parallelization. Practical guidance to accompany the parameter reference.
 * @phase R394
 */
import type { ReactNode } from 'react';

export interface WorkflowTopic {
  id: string;
  title: string;
  body: ReactNode;
}

export const WORKFLOW_TOPICS: WorkflowTopic[] = [
  {
    id: 'convergence',
    title: 'Convergence testing',
    body: (
      <>
        <p>
          No DFT result is meaningful until the two numerical knobs are converged, in this order:
        </p>
        <ol className='ml-5 list-decimal space-y-1'>
          <li>
            <strong>Plane-wave cutoff</strong> — fix a reasonable k-mesh, then increase{' '}
            <code>ecutwfc</code> in steps (e.g. 40 → 50 → 60 → 70 Ry) until the total energy per
            atom changes by less than your tolerance (~1 meV/atom). Set <code>ecutrho</code> to the
            appropriate multiple for the pseudopotential type.
          </li>
          <li>
            <strong>k-point mesh</strong> — fix the converged cutoff, then densify the
            Monkhorst–Pack grid until the energy (and, for metals, the smearing-extrapolated energy)
            is stable. Aim for roughly uniform spacing in reciprocal length across a/b/c; a long
            axis needs fewer k-points than a short one.
          </li>
        </ol>
        <p>
          Converge the <em>property you care about</em>, not just the total energy — band gaps,
          magnetic moments, and adsorption energies can require tighter settings than the energy
          alone. Energy differences between similar structures converge faster than absolute
          energies (error cancellation), so use consistent settings across a comparison set.
        </p>
      </>
    )
  },
  {
    id: 'relax-order',
    title: 'Relaxation order for heterostructures',
    body: (
      <>
        <p>A WO₃/WS₂-type heterostructure must be relaxed in stages, never all at once:</p>
        <ol className='ml-5 list-decimal space-y-1'>
          <li>
            <strong>Bulk phases</strong> — full variable-cell relaxation (<code>vc-relax</code>) of
            each bulk material to obtain equilibrium lattice parameters at your level of theory.
          </li>
          <li>
            <strong>Surface slab</strong> — cleave the relevant surface, add vacuum, and relax{' '}
            <em>atomic positions only</em> at the fixed bulk-derived cell (<code>relax</code> with{' '}
            <code>cell_dofree='2Dxy'</code> if any cell relaxation is allowed). Check surface energy
            vs slab thickness and vacuum size.
          </li>
          <li>
            <strong>Interface / adsorbate</strong> — assemble the combined system on the fixed slab
            cell and relax positions. A large lattice mismatch (≈13–15% for WS₂ on WO₃) means the
            overlayer is a flake or strained film, not a coherent 2D/2D epitaxial match — model it
            accordingly.
          </li>
        </ol>
        <p>
          A single all-at-once relaxation lets lattice-mismatch strain contaminate every quantity;
          staging isolates the physics of each interface.
        </p>
      </>
    )
  },
  {
    id: 'slab',
    title: 'Slab & vacuum setup',
    body: (
      <>
        <p>
          Surfaces are modeled as periodic slabs separated by vacuum. Two convergence checks are
          essential: <strong>vacuum thickness</strong> (enough that periodic images don’t interact —
          typically ≥15 Å, more if there is a net dipole) and <strong>slab thickness</strong>{' '}
          (enough bulk-like layers in the middle that the two surfaces are decoupled). For polar or
          asymmetric slabs, apply a <strong>dipole correction</strong> so the spurious field from
          the artificial dipole across the vacuum is removed. Freeze the innermost layers at bulk
          positions to mimic the semi-infinite substrate if desired.
        </p>
      </>
    )
  },
  {
    id: 'parallel',
    title: 'Parallelization (npool & MPI)',
    body: (
      <>
        <p>
          pw.x parallelizes over several axes; the most efficient for k-point-rich systems is{' '}
          <strong>pool parallelization</strong> (<code>npool</code>), which splits k-points into
          independent groups. The heuristic:
        </p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            Total MPI ranks = <code>npool</code> × (ranks per pool). Choose <code>npool</code> as a
            divisor of the number of <em>irreducible</em> k-points for even load balance.
          </li>
          <li>
            <strong>Memory feasibility first</strong>: each pool holds a full copy of the
            wavefunctions for its k-points, so a pool must fit in a node’s memory before you
            optimize for speed.
          </li>
          <li>
            Plane-wave (G-vector) parallelization within a pool scales the FFT/diagonalization but
            has more communication; use it to fill ranks after pools are set.
          </li>
        </ul>
        <p>
          A dense-k, small-cell metal benefits from many pools; a large supercell with few k-points
          benefits from G-vector parallelization instead.
        </p>
      </>
    )
  },
  {
    id: 'dos-extraction',
    title: 'Band structure, DOS & PDOS extraction',
    body: (
      <>
        <p>The full electronic-structure pass runs in sequence on the relaxed geometry:</p>
        <ol className='ml-5 list-decimal space-y-1'>
          <li>
            <strong>scf</strong> — converge the ground-state density.
          </li>
          <li>
            <strong>bands</strong> — non-self-consistent eigenvalues on a standardized k-path; then{' '}
            <code>bands.x</code> writes ε(k) for plotting (use <code>lsym</code> for symmetry
            labels).
          </li>
          <li>
            <strong>nscf</strong> — eigenvalues on a dense, uniform k-grid (2–4× the scf density)
            for the DOS.
          </li>
          <li>
            <strong>dos.x / projwfc.x</strong> — total DOS and atom/(l,m)-projected PDOS on that
            grid.
          </li>
        </ol>
        <p>Three checks make the result trustworthy:</p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            <strong>Converge the DOS grid</strong> — densify the nscf mesh until the DOS shape (and
            the gap) stops changing. Use a small broadening (degauss 0.005–0.01 Ry) or the
            tetrahedron method for sharp features.
          </li>
          <li>
            <strong>Reference the Fermi level</strong> — shift energies so E_F (or the VBM for an
            insulator) sits at 0, and state which reference you used.
          </li>
          <li>
            <strong>Read the band-edge character</strong> — from the PDOS/fat bands, identify which
            atoms and orbitals dominate the VBM and CBM. For a photocatalyst this sets the band-edge
            positions relative to the H⁺/H₂ and O₂/H₂O redox levels and thus whether the material
            can drive the reaction.
          </li>
        </ul>
        <p>
          For spin-polarized systems (<code>nspin=2</code>) the DOS/PDOS are resolved into up and
          down channels; plot them mirrored to show the magnetic splitting.
        </p>
      </>
    )
  },
  {
    id: 'phonons',
    title: 'Phonon calculation & dynamical stability',
    body: (
      <>
        <p>The DFPT phonon pipeline runs on a well-relaxed, tightly-converged geometry:</p>
        <ol className='ml-5 list-decimal space-y-1'>
          <li>
            <strong>scf</strong> — with a tight <code>conv_thr</code> (phonons are second
            derivatives; a loose density poisons the frequencies).
          </li>
          <li>
            <strong>ph.x</strong> — DFPT on a q-grid (<code>ldisp</code>, <code>nq1/2/3</code>),
            writing the dynamical matrices; set <code>epsil=.true.</code> for polar insulators.
          </li>
          <li>
            <strong>q2r.x</strong> — Fourier-transform the matrices to real-space force constants
            (with the acoustic sum rule).
          </li>
          <li>
            <strong>matdyn.x</strong> — interpolate the dispersion along a q-path and/or the phonon
            DOS (again with the acoustic sum rule).
          </li>
        </ol>
        <p>What to check:</p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            <strong>Imaginary modes = instability.</strong> Negative (imaginary) frequencies mean
            the structure is a saddle point. Distinguish genuine soft modes (a real phase
            transition, or a wrong structure) from tiny numerical artefacts near Γ that the acoustic
            sum rule removes. Never report properties of a structure with real imaginary phonons.
          </li>
          <li>
            <strong>Enforce the acoustic sum rule</strong> (<code>asr='crystal'</code>) so the three
            acoustic branches vanish at Γ.
          </li>
          <li>
            <strong>Converge tightly</strong> — the phonon q-grid, <code>tr2_ph</code>, and the
            underlying <code>ecutwfc</code>/k-grid all need to be tighter than for a total-energy
            calculation.
          </li>
          <li>
            <strong>Polar materials</strong> — include Born charges + dielectric (<code>epsil</code>
            ) for the LO–TO splitting, or the optical branches near Γ will be wrong.
          </li>
        </ul>
        <p>
          A clean phonon spectrum (all real frequencies) is the standard proof that a predicted
          structure is dynamically stable, and the phonon DOS then yields the harmonic free energy,
          entropy and heat capacity.
        </p>
      </>
    )
  }
];
