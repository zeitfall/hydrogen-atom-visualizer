import { ORBITALS, getOrbital, createReferenceState } from '../domain/index.js';

import { DisplaySource } from './enums.js';

class DisplayModel extends EventTarget {
    #resultsStore;
    #selection;
    #preview;

    constructor(resultsStore) {
        super();

        this.#resultsStore = resultsStore;
        this.#selection = {
            grid: null,
            signature: '',
            backendId: '',
            backendLabel: '',
            source: DisplaySource.REFERENCE,
            stateId: ORBITALS[0].id
        };
        this.#preview = null;

        resultsStore.addEventListener('change', () => this.#handleResultsChange());
    }

    select(selection) {
        Object.assign(this.#selection, selection);

        this.#publish();
    }

    showPreview(preview) {
        this.#preview = preview;

        if (this.#selection.source === DisplaySource.NUMERICAL) {
            this.#publish();
        }
    }

    clearPreview() {
        this.#preview = null;
    }

    #handleResultsChange() {
        if (this.#selection.source === DisplaySource.NUMERICAL) {
            this.#publish();
        }
    }

    #publish() {
        const { grid, signature, backendId, backendLabel, source, stateId } = this.#selection;

        if (!grid) {
            return;
        }

        const orbital = getOrbital(stateId);
        const gridCaption = `Grid ${grid.size} × ${grid.size} × ${grid.size}, half-width ${grid.halfWidth} bohr, spacing ${grid.spacing.toFixed(3)} bohr`;

        if (source === DisplaySource.REFERENCE) {
            const referenceState = createReferenceState(grid, orbital);

            this.#dispatchChange(Float32Array.from(referenceState), grid.size, [
                `Reference solution, ${orbital.label}`,
                gridCaption
            ]);

            return;
        }

        const title = `Numerical solution, ${orbital.label}, ${backendLabel}`;
        const result = this.#resultsStore.getResult(backendId, signature, stateId);

        if (result) {
            const outcome = result.converged
                ? `Converged in ${result.iterations} iterations`
                : `Stopped at the iteration limit (${result.iterations})`;

            this.#dispatchChange(result.state, grid.size, [title, outcome, gridCaption]);

            return;
        }

        const preview = this.#preview;

        if (preview && preview.orbitalId === stateId && preview.backendId === backendId && preview.size === grid.size) {
            this.#dispatchChange(preview.data, preview.size, [
                title,
                `Iteration ${preview.iterations}, in progress`,
                gridCaption
            ]);

            return;
        }

        this.#dispatchChange(null, grid.size, [title, 'No result yet', gridCaption]);
    }

    #dispatchChange(data, size, captionLines) {
        const detail = {
            data,
            size,
            caption: captionLines.join('\n')
        };

        this.dispatchEvent(new CustomEvent('change', { detail }));
    }
}

export default DisplayModel;
