const CONVERGENCE_CSV_COLUMNS = Object.freeze([
    'state',
    'n',
    'l',
    'backend',
    'iteration',
    'time_ms',
    'energy_hartree',
    'exact_energy_hartree',
    'residual'
]);

const CSV_SPECIAL_CHARACTERS_PATTERN = /[",\n]/;

function createConvergenceCSV(states) {
    const lines = [CONVERGENCE_CSV_COLUMNS.join(',')];

    states.forEach((state) => {
        state.runs.forEach((run) => {
            const { iterations, elapsedMs, energy, residual } = run.history;

            for (let checkIndex = 0; checkIndex < iterations.length; checkIndex++) {
                const fields = [
                    state.id,
                    state.n,
                    state.l,
                    run.label,
                    iterations[checkIndex],
                    elapsedMs[checkIndex].toFixed(3),
                    energy[checkIndex],
                    state.exactEnergy,
                    residual[checkIndex]
                ];

                lines.push(fields.map(escapeCSVField).join(','));
            }
        });
    });

    return `${lines.join('\n')}\n`;
}

function escapeCSVField(value) {
    const text = String(value);

    if (!CSV_SPECIAL_CHARACTERS_PATTERN.test(text)) {
        return text;
    }

    return `"${text.replaceAll('"', '""')}"`;
}

function downloadCSV(fileName, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const linkElement = document.createElement('a');

    linkElement.href = url;
    linkElement.download = fileName;
    linkElement.click();

    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export {
    CONVERGENCE_CSV_COLUMNS,
    createConvergenceCSV,
    downloadCSV
};
