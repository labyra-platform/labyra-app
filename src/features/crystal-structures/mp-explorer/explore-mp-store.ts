/**
 * Module-level store for the MP Explorer, so switching subtabs (which unmount the
 * routed page) keeps the mode / selected elements / query / results instead of
 * resetting. Lives at module scope → survives client navigation, clears on a full
 * reload (F5). Not reactive across components; ExploreMpView seeds useState from
 * it and writes back on change.
 *
 * @phase R326-explore-persist
 */

export type ExploreMode = 'only' | 'atleast' | 'formula' | 'mpid';

export interface MpResult {
  mpId: string;
  formula: string;
  crystalSystem: string;
  spaceGroup: string;
  spaceGroupNumber: number | null;
  nsites: number | null;
  energyAboveHull: number | null;
  bandGap: number | null;
  isGapDirect: boolean | null;
  density: number | null;
  volume: number | null;
  theoretical: boolean | null;
}

export interface ExploreState {
  mode: ExploreMode;
  selectedEls: string[];
  text: string;
  results: MpResult[] | null;
  error: string | null;
}

let state: ExploreState = {
  mode: 'formula',
  selectedEls: [],
  text: '',
  results: null,
  error: null
};

export const exploreStore = {
  get: (): ExploreState => state,
  set: (partial: Partial<ExploreState>): void => {
    state = { ...state, ...partial };
  }
};
