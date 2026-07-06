/**
 * DFT foundations — the theory behind the parameters. Each concept has a concise
 * summary (always shown) and a deeper expandable block, with key equations
 * (KaTeX) and textbook pointers. Reference material; derivations are summarized,
 * not reproduced from the cited books. @phase R394
 */
import type { ReactNode } from 'react';
import { Math } from '@/components/ui-extra/math';

export interface Foundation {
  id: string;
  title: string;
  summary: ReactNode;
  deeper: ReactNode;
  refs: string[];
}

export const FOUNDATIONS: Foundation[] = [
  {
    id: 'dft-ks',
    title: 'DFT & the Kohn–Sham equations',
    summary: (
      <>
        <p>
          Density Functional Theory recasts the intractable many-electron problem in terms of the
          ground-state electron density <Math tex='n(\mathbf{r})' /> rather than the full
          wavefunction. The Hohenberg–Kohn theorems establish that the ground-state energy is a
          unique functional of <Math tex='n(\mathbf{r})' />, minimized at the true density.
        </p>
        <p>
          The Kohn–Sham scheme makes this practical by mapping the interacting system onto a
          fictitious set of non-interacting electrons with the same density, moving in an effective
          potential. This yields single-particle equations solved self-consistently:
        </p>
        <Math
          display
          tex='\left[-\tfrac{1}{2}\nabla^2 + v_{\text{eff}}(\mathbf{r})\right]\psi_i(\mathbf{r}) = \varepsilon_i\,\psi_i(\mathbf{r})'
        />
      </>
    ),
    deeper: (
      <>
        <p>
          The effective potential collects the external (ionic), Hartree, and exchange–correlation
          contributions:
        </p>
        <Math
          display
          tex="v_{\text{eff}}(\mathbf{r}) = v_{\text{ext}}(\mathbf{r}) + \int\frac{n(\mathbf{r}')}{|\mathbf{r}-\mathbf{r}'|}\,d\mathbf{r}' + v_{\text{xc}}(\mathbf{r})"
        />
        <p>
          with <Math tex='v_{\text{xc}} = \delta E_{\text{xc}}[n]/\delta n' />. All the unknown
          many-body physics is folded into the exchange–correlation functional{' '}
          <Math tex='E_{\text{xc}}[n]' />, which must be approximated. The workhorse approximations
          are the LDA (density only) and GGA — of which <strong>PBE</strong> is the standard for
          solids, depending on the density and its gradient <Math tex='\nabla n' />. Because{' '}
          <Math tex='v_{\text{eff}}' /> depends on <Math tex='n' />, which itself is built from the{' '}
          <Math tex='\psi_i' />, the equations are solved iteratively (the SCF loop) until the
          density is self-consistent. GGA/LDA systematically underestimate band gaps and
          over-delocalize localized electrons — the motivation for the DFT+U and hybrid corrections
          below.
        </p>
      </>
    ),
    refs: ['Martin, Electronic Structure (2020), Ch. 6–7', 'Sholl & Steckel, DFT (2009), Ch. 1']
  },
  {
    id: 'functionals',
    title: 'The exchange–correlation ladder (LDA → hybrids)',
    summary: (
      <>
        <p>
          Everything unknown in DFT lives in the exchange–correlation functional{' '}
          <Math tex='E_{\text{xc}}[n]' />, which must be approximated. The approximations form a
          hierarchy — Perdew’s “Jacob’s ladder” — of increasing ingredients, accuracy and cost:
        </p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            <strong>LDA</strong> — uses the density <Math tex='n' /> only (uniform-gas limit).
          </li>
          <li>
            <strong>GGA</strong> — adds the gradient <Math tex='\nabla n' />; <strong>PBE</strong>{' '}
            is the solid-state standard, <strong>PBEsol</strong> is tuned for lattice constants.
          </li>
          <li>
            <strong>meta-GGA</strong> — adds the kinetic-energy density <Math tex='\tau' />;{' '}
            <strong>SCAN</strong> / <strong>r²SCAN</strong> describe diverse bonding well at
            near-GGA cost.
          </li>
          <li>
            <strong>hybrids</strong> — mix in exact (Hartree–Fock) exchange; <strong>PBE0</strong>,{' '}
            <strong>HSE06</strong> give accurate gaps at ~10–100× the cost.
          </li>
        </ul>
        <p>The functional is the single most consequential choice in a calculation.</p>
      </>
    ),
    deeper: (
      <>
        <p>
          The core failure of LDA/GGA is <strong>self-interaction error</strong>: an electron
          spuriously repels itself, over-delocalizing charge and shrinking band gaps. Two families
          fix this. Hybrids replace a fraction <Math tex='a' /> of semi-local exchange with exact
          exchange:
        </p>
        <Math
          display
          tex='E_{\text{xc}}^{\text{hyb}} = a\,E_{x}^{\text{HF}} + (1-a)\,E_{x}^{\text{DFT}} + E_{c}^{\text{DFT}}'
        />
        <p>
          PBE0 uses <Math tex='a=1/4' /> from perturbation-theory arguments. <strong>HSE06</strong>{' '}
          range-separates the exchange, applying exact exchange only at short range (screened by an
          error-function of range <Math tex='\omega' />) — this makes it tractable for solids while
          keeping the gap improvement, since the expensive long-range Fock term is dropped. Exact
          exchange in a plane-wave code is costly because it couples all occupied orbital pairs; QE
          controls this with a coarser q-grid (<code>nqx1/2/3</code>) and a separate Fock cutoff (
          <code>ecutfock</code>). <strong>meta-GGAs</strong> take a different route: the kinetic-
          energy density <Math tex='\tau(\mathbf{r})=\tfrac12\sum_i|\nabla\psi_i|^2' /> lets the
          functional recognize covalent, metallic and weakly-bonded regions and adapt locally — SCAN
          satisfies all 17 known exact constraints, and r²SCAN restores numerical smoothness. For
          correlated <Math tex='d/f' /> oxides, <strong>DFT+U</strong> is a far cheaper, more
          targeted cure than a hybrid. Practical guidance: PBE for general solids, PBEsol for
          lattice/surface energetics, SCAN/r²SCAN for accurate formation energies across
          chemistries, HSE06 when the gap must be right, and GGA+U for transition-metal oxides on a
          budget.
        </p>
      </>
    ),
    refs: [
      'Perdew, Burke, Ernzerhof, Phys. Rev. Lett. 77, 3865 (1996)',
      'Heyd, Scuseria, Ernzerhof, J. Chem. Phys. 118, 8207 (2003)',
      'Sun, Ruzsinszky, Perdew (SCAN), Phys. Rev. Lett. 115, 036402 (2015)'
    ]
  },
  {
    id: 'plane-waves',
    title: 'Plane waves & energy cutoff',
    summary: (
      <>
        <p>
          In a periodic crystal, Bloch’s theorem lets each Kohn–Sham orbital be expanded in a plane-
          wave basis. The basis is truncated by a kinetic-energy cutoff{' '}
          <Math tex='E_{\text{cut}}' /> (the QE keyword <code>ecutwfc</code>): only plane waves with
        </p>
        <Math display tex='\tfrac{1}{2}\,|\mathbf{k}+\mathbf{G}|^2 \le E_{\text{cut}}' />
        <p>
          are kept. A larger cutoff means a more complete basis — more accurate but more expensive.
          The cutoff must be <em>converged</em>: increase it until the total energy (or the property
          of interest) stops changing.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          Plane waves are attractive because they are complete, unbiased (no atom-centered
          assumptions), and make forces/stresses easy via the Hellmann–Feynman theorem. Their cost
          is that sharp features (core oscillations) need impractically high cutoffs — which is why
          pseudopotentials are used. There are two cutoffs: <code>ecutwfc</code> for the orbitals
          and <code>ecutrho</code> for the charge density. Since the density is a product of
          orbitals, its Fourier components extend twice as far, so for norm-conserving
          pseudopotentials <Math tex='E_{\rho} = 4\,E_{\text{cut}}' />. Ultrasoft/PAW potentials add
          sharp augmentation charges and need{' '}
          <Math tex='E_{\rho} \approx 8\text{–}12\,E_{\text{cut}}' />. An under-converged{' '}
          <code>ecutrho</code> shows up as noisy forces and “egg-box” errors.
        </p>
      </>
    ),
    refs: [
      'Martin, Electronic Structure (2020), Ch. 12',
      'Giustino, Materials Modelling (2014), Ch. 3'
    ]
  },
  {
    id: 'pseudopotentials',
    title: 'Pseudopotentials (NC / US / PAW)',
    summary: (
      <>
        <p>
          Core electrons are chemically inert but expensive to represent with plane waves.
          Pseudopotentials replace the nucleus + core with a smooth effective potential acting on
          the valence electrons only, so the wavefunction is nodeless and soft inside a cutoff
          radius <Math tex='r_c' />, matching the all-electron result outside it.
        </p>
        <p>
          Three families trade softness against accuracy: norm-conserving (NC), ultrasoft (US), and
          projector-augmented-wave (PAW).
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          <strong>Norm-conserving</strong> potentials preserve the integrated charge inside{' '}
          <Math tex='r_c' /> (the norm), guaranteeing correct scattering but requiring higher{' '}
          <Math tex='E_{\text{cut}}' />. <strong>Ultrasoft</strong> (Vanderbilt) relaxes the norm
          constraint for much softer orbitals — lower <code>ecutwfc</code> — at the price of an
          augmentation charge that raises <code>ecutrho</code> and complicates the overlap operator.{' '}
          <strong>PAW</strong> (Blöchl) is a linear transformation that reconstructs the full
          all-electron wavefunction from a smooth auxiliary one, combining US-like cost with
          all-electron accuracy near the nucleus — important for magnetism, hyperfine/EFG
          properties, and DFT+U, where the on-site occupations must be accurate. Two rules are
          non-negotiable: the pseudopotential’s exchange–correlation functional must match the run
          (all PBE, say), and the global cutoffs must sit at or above the largest suggested value
          across all species.
        </p>
      </>
    ),
    refs: ['Blöchl, Phys. Rev. B 50, 17953 (1994)', 'Martin, Electronic Structure (2020), Ch. 11']
  },
  {
    id: 'bz-smearing',
    title: 'Brillouin-zone sampling & smearing',
    summary: (
      <>
        <p>
          Integrals over occupied states become sums over a discrete k-point mesh (Monkhorst–Pack).
          The mesh density controls accuracy: denser is needed for metals and small cells; converge
          the total energy against grid size. For metals, the abrupt Fermi cutoff makes these sums
          converge slowly, so occupations are <em>smeared</em> over a width <Math tex='\sigma' />{' '}
          (the keyword <code>degauss</code>).
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          Smearing replaces the step function with a smooth occupation{' '}
          <Math tex='f\!\left((\varepsilon-\varepsilon_F)/\sigma\right)' />. Gaussian and
          Fermi–Dirac schemes introduce an entropy term that biases the energy; the{' '}
          <strong>Methfessel–Paxton</strong> (higher-order Hermite) and{' '}
          <strong>Marzari–Vanderbilt “cold”</strong> schemes are designed so the free energy stays
          close to the <Math tex='\sigma\to 0' /> limit, allowing a larger, cheaper{' '}
          <Math tex='\sigma' />. Best practice: use MP or cold smearing for metals with{' '}
          <Math tex='\sigma \approx 0.01\text{–}0.02\ \text{Ry}' />, and check that the extrapolated{' '}
          <Math tex='\sigma\to 0' /> energy is stable. For insulators with a clean gap use fixed
          occupations; for accurate DOS use the tetrahedron method on a dense grid.
        </p>
      </>
    ),
    refs: [
      'Monkhorst & Pack, Phys. Rev. B 13, 5188 (1976)',
      'Marzari et al., Phys. Rev. Lett. 82, 3296 (1999)'
    ]
  },
  {
    id: 'dft-u',
    title: 'DFT+U (Hubbard correction)',
    summary: (
      <>
        <p>
          Semi-local functionals suffer from self-interaction error that over-delocalizes localized{' '}
          <Math tex='d' />/<Math tex='f' /> electrons, giving too-small gaps and wrong redox
          energetics in transition-metal oxides. DFT+U adds a Hubbard-like penalty that restores the
          energy cost of double occupation on a chosen atomic manifold, localizing those electrons.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          In the rotationally-invariant Dudarev formulation, a single effective{' '}
          <Math tex='U_{\text{eff}} = U - J' /> acts on the occupation matrix{' '}
          <Math tex='n^{\sigma}' /> of the manifold:
        </p>
        <Math
          display
          tex='E_U = \frac{U_{\text{eff}}}{2}\sum_{\sigma}\mathrm{Tr}\!\left[\mathbf{n}^{\sigma}\left(\mathbf{1}-\mathbf{n}^{\sigma}\right)\right]'
        />
        <p>
          The term vanishes for fully occupied (<Math tex='n=1' />) or empty (<Math tex='n=0' />)
          states and is maximal at half occupation — precisely penalizing fractional occupation. The
          occupation matrix depends on the choice of projectors; <strong>ortho-atomic</strong>{' '}
          (Löwdin-orthogonalized) projectors are recommended for internal consistency.{' '}
          <Math tex='U' /> is <em>not</em> a universal constant: it depends on the element’s
          oxidation state and local coordination, so the same element in two chemical environments
          (e.g. <Math tex='\text{W}^{6+}' /> in WO₃ vs <Math tex='\text{W}^{4+}' /> in WS₂) needs
          separate species labels and separate <Math tex='U' /> values. Values come from the
          literature or from a first-principles linear-response calculation.
        </p>
      </>
    ),
    refs: [
      'Dudarev et al., Phys. Rev. B 57, 1505 (1998)',
      'Cococcioni & de Gironcoli, Phys. Rev. B 71, 035105 (2005)'
    ]
  },
  {
    id: 'vdw',
    title: 'Van der Waals dispersion (DFT-D3)',
    summary: (
      <>
        <p>
          Local and semi-local functionals cannot capture long-range London dispersion — the{' '}
          <Math tex='1/R^6' /> attraction from correlated fluctuations. This matters critically for
          layered materials (graphite, TMDs), molecular crystals, and adsorption. Grimme’s DFT-D3
          adds an explicit, geometry-dependent pairwise correction on top of the DFT energy.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>The D3 dispersion energy is a damped sum over atom pairs:</p>
        <Math
          display
          tex='E_{\text{disp}} = -\sum_{A<B}\sum_{n=6,8} s_n\,\frac{C_n^{AB}}{R_{AB}^{n}}\,f_{d,n}(R_{AB})'
        />
        <p>
          The coefficients <Math tex='C_6^{AB}' /> are computed from tabulated, geometry-dependent
          (coordination-number-aware) atomic references, which is what makes D3 more transferable
          than the older D2. The damping function <Math tex='f_{d,n}' /> removes the singularity at
          short range. Two variants exist: <strong>zero-damping</strong> D3(0) (
          <code>dftd3_version=3</code>) sends the correction to zero at small <Math tex='R' />,
          while <strong>Becke–Johnson damping</strong> D3-BJ (<code>dftd3_version=4</code>)
          approaches a finite constant and generally performs better near equilibrium and for
          intermolecular interactions — the recommended default. An optional Axilrod–Teller–Muto
          three-body term adds many-body dispersion for dense systems.
        </p>
      </>
    ),
    refs: [
      'Grimme et al., J. Chem. Phys. 132, 154104 (2010)',
      'Grimme, Ehrlich & Goerigk, J. Comput. Chem. 32, 1456 (2011)'
    ]
  },
  {
    id: 'relaxation',
    title: 'Geometry optimization (forces & BFGS)',
    summary: (
      <>
        <p>
          Equilibrium structures are found by minimizing the total energy with respect to atomic
          positions (relax) and, optionally, the cell (vc-relax). The gradient is the set of forces,
          obtained cheaply from the Hellmann–Feynman theorem once the SCF density is converged.
          Quasi-Newton BFGS uses successive gradients to build up curvature information and step
          toward the minimum.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          The Hellmann–Feynman force on atom <Math tex='I' /> is{' '}
          <Math tex='\mathbf{F}_I = -\partial E/\partial \mathbf{R}_I' />; for a variable cell, the
          analogous derivative with respect to strain gives the stress tensor. Convergence requires{' '}
          <em>both</em> criteria to be met: the maximum residual force below{' '}
          <code>forc_conv_thr</code> and the step-to-step energy change <Math tex='|\Delta E| <' />{' '}
          <code>etot_conv_thr</code>. Two subtleties matter in practice. First, forces are only as
          accurate as the SCF density, so a relaxation needs a tighter <code>conv_thr</code> than a
          single energy — QE’s <code>upscale</code> tightens it automatically near the end. Second,
          for heterostructures the correct sequence is to relax the bulk phases first (full
          vc-relax), then the surface slab (atomic positions only, fixed cell), and finally the
          combined interface — never a single all-at-once relaxation, which mixes lattice-mismatch
          strain into the result.
        </p>
      </>
    ),
    refs: ['Martin, Electronic Structure (2020), Ch. 19', 'Sholl & Steckel, DFT (2009), Ch. 3']
  },
  {
    id: 'diagonalization',
    title: 'Iterative diagonalization',
    summary: (
      <>
        <p>
          In a plane-wave basis the Kohn–Sham Hamiltonian is a matrix of dimension 10⁴–10⁶ — far too
          large to diagonalize directly, and only the lowest ~<Math tex='N_{\text{bands}}' />{' '}
          eigenpairs are needed. Iterative subspace methods find just those, using only
          matrix–vector products <Math tex='\hat{H}\psi' /> and a preconditioner. QE offers
          Davidson, conjugate-gradient, PPCG, ParO and RMM-DIIS.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          All solve the generalized problem <Math tex='(\hat{H}-\varepsilon\hat{S})\psi=0' /> (with{' '}
          <Math tex='\hat{S}' /> the overlap for US/PAW) by refining trial orbitals iteratively:
        </p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            <strong>Davidson</strong> (<code>david</code>) — builds a small subspace from the
            current orbitals plus their preconditioned residuals, diagonalizes the projected
            Hamiltonian, and expands. Few Hamiltonian applications per step (fast) but stores 2–4×
            the wavefunctions (memory-hungry). The default.
          </li>
          <li>
            <strong>Conjugate gradient</strong> (<code>cg</code>) — optimizes bands essentially one
            at a time; robust and low-memory but slower. Use when Davidson exhausts memory or stalls
            on hard systems.
          </li>
          <li>
            <strong>PPCG</strong> (<code>ppcg</code>) — projected, preconditioned block CG that
            scales well to many bands and to GPUs.
          </li>
          <li>
            <strong>ParO</strong> (<code>paro</code>) — parallel orbital-updating, good at very
            large core counts.
          </li>
          <li>
            <strong>RMM-DIIS</strong> (<code>rmm-davidson</code>, QE ≥ 7.2) — residual minimization;
            very fast per step but needs a decent starting guess (best in the middle/end of SCF).
          </li>
        </ul>
        <p>
          Convergence hinges on <strong>preconditioning</strong> — multiplying the residual by an
          approximate inverse of the kinetic operator so all plane-wave components converge at a
          similar rate. <code>diago_thr_init</code> sets the initial eigenvalue accuracy; QE
          tightens it automatically as the density converges (loose early diagonalization saves time
          when the potential is still changing).
        </p>
      </>
    ),
    refs: ['Payne et al., Rev. Mod. Phys. 64, 1045 (1992)', 'Kresse & Furthmüller (1996)']
  },
  {
    id: 'mixing',
    title: 'Charge-density mixing & SCF convergence',
    summary: (
      <>
        <p>
          Each SCF iteration maps an input density to an output density. Feeding the output straight
          back in generally oscillates or diverges — “charge sloshing”. Mixing blends input and
          output with a factor <Math tex='\beta' /> (<code>mixing_beta</code>) and a history of
          previous steps, and a preconditioner (<code>mixing_mode</code>) that damps the unstable
          long-wavelength components.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          The instability is dielectric: a small change in the potential at long wavelength drives a
          large change in density (poor screening), and the effect worsens for metals and large
          cells. Broyden mixing (<code>plain</code>) uses the density history to build a
          quasi-Newton approximation of the inverse dielectric Jacobian:
        </p>
        <Math
          display
          tex='n^{(m+1)}_{\text{in}} = n^{(m)}_{\text{in}} + \beta\,\hat{G}\left(n^{(m)}_{\text{out}} - n^{(m)}_{\text{in}}\right)'
        />
        <p>
          where <Math tex='\hat{G}' /> is the preconditioner. For metals, a Thomas–Fermi (Kerker-
          like) preconditioner (<code>local-TF</code> / TF) suppresses the small-
          <Math tex='q' /> divergence; <code>local-TF</code> further adapts to spatial inhomogeneity
          — essential for slabs and molecules in vacuum where screening varies. Practical recipe:
          start at <Math tex='\beta=0.7' />; for a stubborn magnetic/metallic/large system drop to
          0.1–0.3, raise the history depth <code>mixing_ndim</code>, and switch to{' '}
          <code>local-TF</code>. Divergence that no <Math tex='\beta' /> fixes usually signals a
          physical problem (bad starting magnetization, too little smearing, or a broken structure)
          rather than a mixing issue.
        </p>
      </>
    ),
    refs: [
      'Kresse & Furthmüller, Phys. Rev. B 54, 11169 (1996)',
      'Kerker, Phys. Rev. B 23, 3082 (1981)'
    ]
  },
  {
    id: 'dft-u-v',
    title: 'Extended Hubbard: DFT+U+V',
    summary: (
      <>
        <p>
          On-site DFT+U localizes electrons on a single atom, but in partly-covalent systems the
          relevant electrons are shared with neighboring ligands. DFT+U+V adds an{' '}
          <em>inter-site</em> interaction <Math tex='V' /> between an atom and its neighbors,
          capturing that hybridization — often improving band gaps and energetics where pure U over-
          or under-localizes.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          The extended functional supplements the on-site term with an inter-site coupling of the
          generalized occupations <Math tex='n^{IJ}' /> between sites <Math tex='I' /> and a
          neighbor <Math tex='J' />:
        </p>
        <Math
          display
          tex='E_{V} = -\,\frac{1}{2}\sum_{I\neq J} V^{IJ}\sum_{\sigma}\mathrm{Tr}\!\left[\mathbf{n}^{IJ,\sigma}\,\mathbf{n}^{JI,\sigma}\right]'
        />
        <p>
          Physically <Math tex='V' /> rewards charge shared across a bond, correcting the tendency
          of plain +U to push electrons fully onto one atom. It is important for transition-metal
          compounds with significant metal–ligand covalency — Li-ion cathode voltages and some oxide
          gaps are notably better with +U+V. Both <Math tex='U' /> and <Math tex='V' /> can be
          derived from first principles by density-functional perturbation theory (Timrov, Marzari,
          Cococcioni), avoiding empirical fitting. The cost over plain +U is modest; the bookkeeping
          (neighbor shells, per-pair <Math tex='V' />) is the main added complexity.
        </p>
      </>
    ),
    refs: [
      'Campo & Cococcioni, J. Phys.: Condens. Matter 22, 055602 (2010)',
      'Timrov, Marzari, Cococcioni, Phys. Rev. B 103, 045141 (2021)'
    ]
  },
  {
    id: 'kpath',
    title: 'Band-structure paths & k-point conventions',
    summary: (
      <>
        <p>
          A band structure plots eigenvalues along a path connecting high-symmetry points (Γ, X, M,
          K, L, …) of the Brillouin zone, where bands typically have extrema or degeneracies. Which
          points, in what order, and with what labels is fixed by a <em>convention</em> tied to a
          standardized primitive cell. The common schemes are Setyawan–Curtarolo, Hinuma (seekpath),
          and Latimer–Munro.
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          The hard part is standardization: the same crystal can be written in different cells, and
          the correct labels depend on the Bravais lattice <em>and its sub-variation</em> (e.g. the
          distinct cases of base-centered monoclinic, which depend on cell-parameter ratios).
          Getting this wrong mislabels points and can miss the true gap direction.
        </p>
        <ul className='ml-5 list-disc space-y-1'>
          <li>
            <strong>Setyawan–Curtarolo (2010)</strong> — tabulated paths for every Bravais lattice
            assuming a specific standard cell; widely used, the basis of many HT databases.
          </li>
          <li>
            <strong>Hinuma / seekpath (2017)</strong> — fully crystallographic: detects the space
            group, standardizes the primitive cell, and generates correct paths for all cases
            including the awkward centered lattices. The de-facto choice for high-throughput
            pipelines (and what this platform uses via seekpath).
          </li>
          <li>
            <strong>Latimer–Munro (2020)</strong> — a materials-agnostic scheme that derives a
            unique, complete path purely from the symmetry, designed to be reproducible across
            arbitrary inputs.
          </li>
        </ul>
        <p>
          Whichever convention you use, the structure fed to the band step must be the{' '}
          <em>standardized</em> cell that convention assumes — otherwise the high-symmetry
          coordinates no longer correspond to their labels.
        </p>
      </>
    ),
    refs: [
      'Setyawan & Curtarolo, Comput. Mater. Sci. 49, 299 (2010)',
      'Hinuma et al. (seekpath), Comput. Mater. Sci. 128, 140 (2017)',
      'Munro et al. (Latimer–Munro), Phys. Rev. B 101, 024105 (2020)'
    ]
  },
  {
    id: 'soc',
    title: 'Spin–orbit coupling & non-collinear magnetism',
    summary: (
      <>
        <p>
          Spin–orbit coupling (SOC) couples an electron’s spin to its orbital motion, splitting
          bands — crucial for heavy elements (5d such as W), topological materials, and magnetic
          anisotropy. Including it requires <em>fully-relativistic</em> pseudopotentials and
          <em>non-collinear</em> two-component spinor wavefunctions (<code>lspinorb</code>, which
          implies <code>noncolin</code>).
        </p>
      </>
    ),
    deeper: (
      <>
        <p>
          A scalar-relativistic calculation keeps the large relativistic effects (mass–velocity,
          Darwin) but averages SOC away. Switching SOC on turns each orbital into a spinor and the
          magnetization into a full 3D vector field <Math tex='\mathbf{m}(\mathbf{r})' />, roughly
          doubling cost and requiring <Math tex='j' />
          -dependent (fully-relativistic) pseudopotentials. For W (5d), SOC splits the{' '}
          <Math tex='d' /> manifold and reorders valence states — in the WS₂/WSe₂ family it produces
          the large valence-band spin (“valley”) splitting central to their optoelectronics.{' '}
          <strong>Non-collinear magnetism</strong> (<code>noncolin</code> without{' '}
          <code>lspinorb</code>) is needed when moments are not parallel: canted or frustrated
          antiferromagnets, spin spirals and skyrmions. For a first WO₃/WS₂ electronic pass,
          scalar-relativistic PBE+U is usually adequate; add SOC when the valence-band splitting,
          magnetic anisotropy energy, or band topology is the target.
        </p>
      </>
    ),
    refs: [
      'Martin, Electronic Structure (2020), Ch. 10',
      'Dal Corso, Phys. Rev. B 82, 075116 (2010)'
    ]
  }
];

/** Textbooks worth citing for the theory sections. */
export const DFT_TEXTBOOKS: string[] = [
  'R. M. Martin, Electronic Structure: Basic Theory and Practical Methods, 2nd ed., Cambridge University Press (2020).',
  'D. Sholl & J. Steckel, Density Functional Theory: A Practical Introduction, Wiley (2009).',
  'F. Giustino, Materials Modelling using Density Functional Theory, Oxford University Press (2014).',
  'J. Kohanoff, Electronic Structure Calculations for Solids and Molecules, Cambridge University Press (2006).'
];
