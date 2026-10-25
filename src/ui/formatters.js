import { PLACEHOLDER } from './constants.js';

function formatEnergy(value) {
    if (!Number.isFinite(value)) {
        return PLACEHOLDER;
    }

    return value.toFixed(6);
}

function formatPercent(value) {
    if (!Number.isFinite(value)) {
        return PLACEHOLDER;
    }

    return `${(value * 100).toFixed(2)} %`;
}

function formatScientific(value) {
    if (!Number.isFinite(value)) {
        return PLACEHOLDER;
    }

    return value.toExponential(2);
}

function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds)) {
        return PLACEHOLDER;
    }

    if (milliseconds < 1000) {
        return `${milliseconds.toFixed(0)} ms`;
    }

    const seconds = milliseconds / 1000;

    if (seconds < 60) {
        return `${seconds.toFixed(1)} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(Math.round(seconds - minutes * 60)).padStart(2, '0');

    return `${minutes} min ${remainingSeconds} s`;
}

function formatIterationTime(milliseconds) {
    if (!Number.isFinite(milliseconds)) {
        return PLACEHOLDER;
    }

    const fractionDigits = milliseconds < 10 ? 3 : 1;

    return `${milliseconds.toFixed(fractionDigits)} ms`;
}

function formatSpeedup(value) {
    if (!Number.isFinite(value)) {
        return PLACEHOLDER;
    }

    const fractionDigits = value < 10 ? 2 : 1;

    return `${value.toFixed(fractionDigits)}×`;
}

function formatThroughput(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return PLACEHOLDER;
    }

    if (value >= 1e9) {
        return `${(value / 1e9).toFixed(2)} billion`;
    }

    if (value >= 1e6) {
        return `${(value / 1e6).toFixed(1)} million`;
    }

    return value.toFixed(0);
}

function formatChartEnergy(value) {
    return value.toFixed(5);
}

function formatChartResidual(value) {
    return value.toExponential(2);
}

function formatLinearTick(tick) {
    return String(tick);
}

function formatDecadeTick(exponent) {
    return `1e${exponent}`;
}

function formatChartTime(milliseconds) {
    if (milliseconds === 0) {
        return '0';
    }

    if (milliseconds < 10) {
        return `${Number(milliseconds.toPrecision(2))} ms`;
    }

    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)} ms`;
    }

    return `${Number((milliseconds / 1000).toPrecision(3))} s`;
}

export {
    formatEnergy,
    formatPercent,
    formatScientific,
    formatDuration,
    formatIterationTime,
    formatSpeedup,
    formatThroughput,
    formatChartEnergy,
    formatChartResidual,
    formatLinearTick,
    formatDecadeTick,
    formatChartTime
};
