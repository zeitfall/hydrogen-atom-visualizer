import { PLACEHOLDER } from './constants.js';
import { createElement, createChevronIcon } from './dom.js';
import { formatEnergy, formatPercent, formatScientific, formatDuration, formatSpeedup } from './formatters.js';

const EXPANDED_STORAGE_KEY = 'hydrogen-results-expanded';
const BODY_ELEMENT_ID = 'results-body';

const RESULT_COLUMNS = Object.freeze([
    {
        id: 'state',
        title: 'State',
        getValue: ({ result }) => result.label
    },
    {
        id: 'energy',
        title: 'Energy',
        getValue: ({ result }) => formatEnergy(result.energy)
    },
    {
        id: 'exactEnergy',
        title: 'Exact energy',
        getValue: ({ result }) => formatEnergy(result.exactEnergy)
    },
    {
        id: 'relativeEnergyError',
        title: 'Relative error',
        getValue: ({ result }) => formatPercent(result.relativeEnergyError)
    },
    {
        id: 'residual',
        title: 'Residual',
        getValue: ({ result }) => formatScientific(result.residual)
    },
    {
        id: 'l2Error',
        title: 'L2 error',
        getValue: ({ result }) => formatScientific(result.l2Error)
    },
    {
        id: 'maxOverlap',
        title: 'Maximum overlap',
        getValue: ({ result }) => result.maxOverlap > 0 ? formatScientific(result.maxOverlap) : PLACEHOLDER
    },
    {
        id: 'iterations',
        title: 'Iterations',
        getValue: ({ result }) => String(result.iterations)
    },
    {
        id: 'time',
        title: 'Time',
        getValue: ({ result }) => formatDuration(result.elapsedMs)
    },
    {
        id: 'converged',
        title: 'Converged',
        getValue: ({ result }) => result.converged ? 'Yes' : 'No'
    }
]);

const COMPARISON_COLUMNS = Object.freeze([
    {
        id: 'speedup',
        title: 'Speed-up',
        getValue: ({ comparison }) => comparison ? formatSpeedup(comparison.speedup) : PLACEHOLDER
    },
    {
        id: 'maxDifference',
        title: 'CPU and GPU difference',
        getValue: ({ comparison }) => comparison ? formatScientific(comparison.maxDifference) : PLACEHOLDER
    }
]);

class ResultsTable {
    #containerElement;
    #cardElement;
    #toggleElement;
    #titleElement;
    #summaryElement;
    #bodyElement;
    #isExpanded;

    constructor(containerElement) {
        const cardElement = createElement('section', { className: 'results-card' });
        const toggleElement = createElement('button', { type: 'button', className: 'results-header' });
        const titleElement = createElement('span', { className: 'results-title' });
        const summaryElement = createElement('span', { className: 'results-summary' });
        const bodyElement = createElement('div', { id: BODY_ELEMENT_ID, className: 'results-body' });

        toggleElement.setAttribute('aria-controls', BODY_ELEMENT_ID);
        toggleElement.append(titleElement, summaryElement, createChevronIcon('results-chevron'));
        toggleElement.addEventListener('click', () => this.#setExpanded(!this.#isExpanded));

        cardElement.append(toggleElement, bodyElement);
        containerElement.append(cardElement);

        this.#containerElement = containerElement;
        this.#cardElement = cardElement;
        this.#toggleElement = toggleElement;
        this.#titleElement = titleElement;
        this.#summaryElement = summaryElement;
        this.#bodyElement = bodyElement;

        this.#setExpanded(loadExpandedState());
    }

    render(title, rows, totals) {
        const hasRows = rows.length > 0;

        this.#containerElement.hidden = !hasRows;

        if (!hasRows) {
            this.#bodyElement.replaceChildren();

            return;
        }

        const stateCountText = `${rows.length} ${rows.length === 1 ? 'state' : 'states'}`;
        const speedupText = totals.speedup ? `, speed-up ${formatSpeedup(totals.speedup)}` : '';

        this.#titleElement.textContent = title;
        this.#summaryElement.textContent = `${stateCountText}, ${formatDuration(totals.elapsedMs)}${speedupText}`;

        const hasComparison = rows.some((row) => row.comparison);
        const columns = hasComparison ? [...RESULT_COLUMNS, ...COMPARISON_COLUMNS] : RESULT_COLUMNS;

        const headerRowElement = createElement('tr');

        columns.forEach((column) => {
            headerRowElement.append(createElement('th', { textContent: column.title }));
        });

        const rowElements = rows.map((row) => {
            const rowElement = createElement('tr');

            if (!row.result.converged) {
                rowElement.className = 'not-converged';
            }

            columns.forEach((column) => {
                rowElement.append(createElement('td', { textContent: column.getValue(row) }));
            });

            return rowElement;
        });

        const tableElement = createElement('table');

        tableElement.append(headerRowElement, ...rowElements);

        if (rows.length > 1) {
            tableElement.append(createTotalRow(columns, totals));
        }

        this.#bodyElement.replaceChildren(tableElement);
    }

    #setExpanded(isExpanded) {
        const toggleElement = this.#toggleElement;

        this.#isExpanded = isExpanded;

        this.#cardElement.classList.toggle('collapsed', !isExpanded);
        this.#bodyElement.hidden = !isExpanded;

        toggleElement.setAttribute('aria-expanded', String(isExpanded));
        toggleElement.title = isExpanded ? 'Collapse results' : 'Expand results';

        saveExpandedState(isExpanded);
    }
}

function createTotalRow(columns, totals) {
    const totalValues = {
        state: 'Total',
        iterations: String(totals.iterations),
        time: formatDuration(totals.elapsedMs),
        speedup: totals.speedup ? formatSpeedup(totals.speedup) : ''
    };

    const rowElement = createElement('tr', { className: 'total' });

    columns.forEach((column) => {
        rowElement.append(createElement('td', { textContent: totalValues[column.id] ?? '' }));
    });

    return rowElement;
}

function loadExpandedState() {
    try {
        return localStorage.getItem(EXPANDED_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

function saveExpandedState(isExpanded) {
    try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(isExpanded));
    } catch {
        // NOTE: Storage may be blocked (e.g. in private mode), then the state is just not remembered.
    }
}

export default ResultsTable;
