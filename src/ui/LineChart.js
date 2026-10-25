import { computeLinearTicks, computeLogTicks, findNearestIndex } from './scales.js';
import { createElement } from './dom.js';

const PLOT_PADDING = Object.freeze({ top: 12, right: 14, bottom: 22, left: 50 });
const CHART_FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
const DEFAULT_SERIES_COLOR = '--chart-series';

const LINE_WIDTH = 2;
const POINT_RADIUS = 4;
const TICK_LABEL_GAP = 6;
const REFERENCE_LABEL_OFFSET = 4;
const END_LABEL_OFFSET = 6;
const END_LABEL_MIN_TOP_SPACE = 14;
const TOOLTIP_OFFSET = 8;

const DEFAULT_OPTIONS = Object.freeze({
    formatX: String,
    xLabel: 'Iteration',
    showEndLabel: true
});

class LineChart {
    #options;

    #rootElement;
    #subtitleElement;
    #plotElement;
    #canvasElement;
    #tooltipElement;
    #resizeObserver;

    #data;
    #message;
    #hoveredIndex;
    #scales;
    #isDrawScheduled;

    constructor(containerElement, options) {
        const chartOptions = { ...DEFAULT_OPTIONS, ...options };

        const rootElement = createElement('figure', { className: 'chart' });
        const captionElement = createElement('figcaption');
        const titleElement = createElement('span', { className: 'chart-title', textContent: chartOptions.title });
        const subtitleElement = createElement('span', { className: 'chart-subtitle' });
        const plotElement = createElement('div', { className: 'chart-plot' });
        const canvasElement = createElement('canvas', { tabIndex: 0 });
        const tooltipElement = createElement('div', { className: 'chart-tooltip', hidden: true });

        if (chartOptions.height) {
            plotElement.style.height = `${chartOptions.height}px`;
        }

        canvasElement.setAttribute('role', 'img');
        canvasElement.setAttribute('aria-label', chartOptions.title);

        captionElement.append(titleElement, subtitleElement);
        plotElement.append(canvasElement, tooltipElement);
        rootElement.append(captionElement, plotElement);
        containerElement.append(rootElement);

        const resizeObserver = new ResizeObserver(() => this.#scheduleDraw());

        resizeObserver.observe(plotElement);

        canvasElement.addEventListener('pointermove', (event) => this.#handlePointerMove(event));
        canvasElement.addEventListener('pointerleave', () => this.#setHoveredIndex(null));
        canvasElement.addEventListener('focus', () => this.#setHoveredIndex(this.#getPrimaryPointCount() - 1));
        canvasElement.addEventListener('blur', () => this.#setHoveredIndex(null));
        canvasElement.addEventListener('keydown', (event) => this.#handleKeyDown(event));

        this.#options = chartOptions;

        this.#rootElement = rootElement;
        this.#subtitleElement = subtitleElement;
        this.#plotElement = plotElement;
        this.#canvasElement = canvasElement;
        this.#tooltipElement = tooltipElement;
        this.#resizeObserver = resizeObserver;

        this.#data = { series: [], reference: null };
        this.#message = '';
        this.#hoveredIndex = null;
        this.#scales = null;
        this.#isDrawScheduled = false;
    }

    setData(data) {
        this.#data = { reference: null, subtitle: '', yDomain: null, ...data };
        this.#message = '';
        this.#subtitleElement.textContent = data.subtitle ?? '';

        if (this.#hoveredIndex !== null) {
            this.#hoveredIndex = Math.min(this.#hoveredIndex, this.#getPrimaryPointCount() - 1);
        }

        this.#scheduleDraw();
    }

    clear(message) {
        this.#data = { series: [], reference: null };
        this.#message = message;
        this.#subtitleElement.textContent = '';

        this.#setHoveredIndex(null);
    }

    dispose() {
        this.#resizeObserver.disconnect();
        this.#rootElement.remove();
    }

    #getPrimaryPointCount() {
        const [primarySeries] = this.#data.series;

        if (!primarySeries) {
            return 0;
        }

        return Math.min(primarySeries.x.length, primarySeries.y.length);
    }

    #toPlottedValue(value) {
        return this.#options.logScale ? Math.log10(value) : value;
    }

    #setHoveredIndex(index) {
        this.#hoveredIndex = index;

        this.#scheduleDraw();
    }

    #scheduleDraw() {
        if (this.#isDrawScheduled) {
            return;
        }

        this.#isDrawScheduled = true;

        requestAnimationFrame(() => {
            this.#isDrawScheduled = false;

            this.#draw();
        });
    }

    #handlePointerMove(event) {
        const scales = this.#scales;
        const [primarySeries] = this.#data.series;

        if (!scales || !primarySeries || this.#getPrimaryPointCount() === 0) {
            return;
        }

        const originPixelX = scales.toPixelX(0);
        const pixelsPerUnit = scales.toPixelX(1) - originPixelX;
        const hoveredX = (event.offsetX - originPixelX) / pixelsPerUnit;

        this.#setHoveredIndex(findNearestIndex(primarySeries.x, hoveredX));
    }

    #handleKeyDown(event) {
        const pointCount = this.#getPrimaryPointCount();

        if (pointCount === 0) {
            return;
        }

        const lastIndex = pointCount - 1;
        const currentIndex = this.#hoveredIndex ?? lastIndex;

        let nextIndex;

        switch (event.key) {
            case 'ArrowLeft':
                nextIndex = currentIndex - 1;

                break;

            case 'ArrowRight':
                nextIndex = currentIndex + 1;

                break;

            case 'Home':
                nextIndex = 0;

                break;

            case 'End':
                nextIndex = lastIndex;

                break;

            default:
                return;
        }

        event.preventDefault();

        this.#setHoveredIndex(Math.max(0, Math.min(lastIndex, nextIndex)));
    }

    #draw() {
        const plotElement = this.#plotElement;
        const width = plotElement.clientWidth;
        const height = plotElement.clientHeight;

        if (width === 0 || height === 0) {
            return;
        }

        const context = this.#prepareCanvas(width, height);
        const colors = readChartColors(this.#rootElement);
        const plottedSeries = this.#preparePlottedSeries(colors);

        if (plottedSeries.length === 0) {
            this.#scales = null;

            drawMessage(context, colors, this.#message, width, height);

            this.#updateTooltip(plottedSeries);

            return;
        }

        const layout = this.#computeLayout(plottedSeries, width, height);

        this.#scales = {
            toPixelX: layout.toPixelX,
            toPixelY: layout.toPixelY
        };

        this.#drawGrid(context, colors, layout);
        this.#drawReferenceLine(context, colors, layout);
        this.#drawSeries(context, colors, plottedSeries, layout);
        this.#drawEndLabel(context, colors, plottedSeries, layout);
        this.#drawCrosshair(context, colors, plottedSeries, layout);

        this.#updateTooltip(plottedSeries);
    }

    #prepareCanvas(width, height) {
        const canvasElement = this.#canvasElement;
        const pixelRatio = window.devicePixelRatio || 1;

        canvasElement.width = Math.round(width * pixelRatio);
        canvasElement.height = Math.round(height * pixelRatio);
        canvasElement.style.width = `${width}px`;
        canvasElement.style.height = `${height}px`;

        const context = canvasElement.getContext('2d');

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.font = CHART_FONT;

        return context;
    }

    #preparePlottedSeries(colors) {
        return this.#data.series
            .map((series) => {
                const pointCount = Math.min(series.x.length, series.y.length);
                const plottedValues = Array.from({ length: pointCount }, (_, pointIndex) => this.#toPlottedValue(series.y[pointIndex]));

                return {
                    ...series,
                    pointCount,
                    plottedValues,
                    color: colors.read(series.color ?? DEFAULT_SERIES_COLOR)
                };
            })
            .filter((series) => series.pointCount > 0);
    }

    #computeLayout(plottedSeries, width, height) {
        const { reference, yDomain } = this.#data;
        const referenceValue = reference == null ? null : this.#toPlottedValue(reference);

        let minValue = Infinity;
        let maxValue = -Infinity;
        let lastX = 1;

        plottedSeries.forEach((series) => {
            series.plottedValues.forEach((value) => {
                if (Number.isFinite(value)) {
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }
            });

            lastX = Math.max(lastX, series.x[series.pointCount - 1]);
        });

        if (Number.isFinite(referenceValue)) {
            minValue = Math.min(minValue, referenceValue);
            maxValue = Math.max(maxValue, referenceValue);
        }

        if (yDomain) {
            [minValue, maxValue] = yDomain;
        }

        const yTicks = this.#options.logScale ? computeLogTicks(minValue, maxValue) : computeLinearTicks(minValue, maxValue, 3);
        const xTicks = computeLinearTicks(0, lastX, 3).filter((tick) => tick >= 0);

        const minY = yTicks[0];
        const maxY = yTicks.at(-1);
        const maxX = xTicks.at(-1);

        const plotArea = {
            left: PLOT_PADDING.left,
            right: width - PLOT_PADDING.right,
            top: PLOT_PADDING.top,
            bottom: height - PLOT_PADDING.bottom
        };

        const toPixelX = (x) => plotArea.left + (x / maxX) * (plotArea.right - plotArea.left);
        const toPixelY = (y) => plotArea.bottom - ((y - minY) / (maxY - minY)) * (plotArea.bottom - plotArea.top);

        return {
            plotArea,
            xTicks,
            yTicks,
            referenceValue,
            toPixelX,
            toPixelY
        };
    }

    #drawGrid(context, colors, layout) {
        const { plotArea, xTicks, yTicks, toPixelX, toPixelY } = layout;
        const { formatX, formatYTick } = this.#options;

        context.lineWidth = 1;
        context.strokeStyle = colors.grid;
        context.fillStyle = colors.mutedText;
        context.textAlign = 'right';
        context.textBaseline = 'middle';

        yTicks.forEach((tick) => {
            const pixelY = Math.round(toPixelY(tick)) + 0.5;

            drawHorizontalLine(context, plotArea, pixelY);

            context.fillText(formatYTick(tick), plotArea.left - TICK_LABEL_GAP, pixelY);
        });

        context.textAlign = 'center';
        context.textBaseline = 'top';

        xTicks.forEach((tick) => {
            context.fillText(formatX(tick), toPixelX(tick), plotArea.bottom + TICK_LABEL_GAP);
        });
    }

    #drawReferenceLine(context, colors, layout) {
        const { plotArea, referenceValue, toPixelY } = layout;

        if (!Number.isFinite(referenceValue)) {
            return;
        }

        const { referenceLabel, formatValue } = this.#options;
        const pixelY = Math.round(toPixelY(referenceValue)) + 0.5;
        const referenceText = `${referenceLabel} ${formatValue(this.#data.reference)}`;

        context.strokeStyle = colors.reference;

        drawHorizontalLine(context, plotArea, pixelY);

        context.fillStyle = colors.secondaryText;
        context.textAlign = 'left';
        context.textBaseline = 'bottom';
        context.fillText(referenceText, plotArea.left + REFERENCE_LABEL_OFFSET, pixelY - 2);
    }

    #drawSeries(context, colors, plottedSeries, layout) {
        const { plotArea, toPixelX, toPixelY } = layout;

        context.save();
        context.beginPath();
        context.rect(plotArea.left, plotArea.top - 4, plotArea.right - plotArea.left + 4, plotArea.bottom - plotArea.top + 8);
        context.clip();

        plottedSeries.forEach((series) => {
            context.strokeStyle = series.color;
            context.lineWidth = LINE_WIDTH;
            context.lineJoin = 'round';
            context.lineCap = 'round';
            context.beginPath();

            let hasStarted = false;

            for (let pointIndex = 0; pointIndex < series.pointCount; pointIndex++) {
                const value = series.plottedValues[pointIndex];

                if (Number.isFinite(value)) {
                    const pixelX = toPixelX(series.x[pointIndex]);
                    const pixelY = toPixelY(value);

                    if (hasStarted) {
                        context.lineTo(pixelX, pixelY);
                    }
                    else {
                        context.moveTo(pixelX, pixelY);
                    }

                    hasStarted = true;
                }
            }

            context.stroke();
        });

        plottedSeries.forEach((series) => {
            const lastIndex = series.pointCount - 1;
            const lastValue = series.plottedValues[lastIndex];

            if (Number.isFinite(lastValue)) {
                drawPoint(context, toPixelX(series.x[lastIndex]), toPixelY(lastValue), series.color, colors.surface);
            }
        });

        context.restore();
    }

    #drawEndLabel(context, colors, plottedSeries, layout) {
        if (!this.#options.showEndLabel || plottedSeries.length !== 1) {
            return;
        }

        const [series] = plottedSeries;
        const lastIndex = series.pointCount - 1;
        const lastValue = series.plottedValues[lastIndex];

        if (!Number.isFinite(lastValue)) {
            return;
        }

        const { plotArea, toPixelX, toPixelY } = layout;
        const pixelX = toPixelX(series.x[lastIndex]);
        const pixelY = toPixelY(lastValue);
        const isPlacedBelow = pixelY - plotArea.top < END_LABEL_MIN_TOP_SPACE;
        const labelOffsetY = isPlacedBelow ? END_LABEL_OFFSET : -END_LABEL_OFFSET;

        context.fillStyle = colors.text;
        context.textAlign = 'right';
        context.textBaseline = isPlacedBelow ? 'top' : 'bottom';
        context.fillText(this.#options.formatValue(series.y[lastIndex]), pixelX - END_LABEL_OFFSET, pixelY + labelOffsetY);
    }

    #drawCrosshair(context, colors, plottedSeries, layout) {
        const hoveredIndex = this.#hoveredIndex;
        const [primarySeries] = plottedSeries;

        if (hoveredIndex === null || hoveredIndex >= primarySeries.pointCount) {
            return;
        }

        const { plotArea, toPixelX, toPixelY } = layout;
        const hoveredX = primarySeries.x[hoveredIndex];
        const pixelX = Math.round(toPixelX(hoveredX)) + 0.5;

        context.strokeStyle = colors.axis;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pixelX, plotArea.top);
        context.lineTo(pixelX, plotArea.bottom);
        context.stroke();

        plottedSeries.forEach((series) => {
            const pointIndex = findNearestIndex(series.x, hoveredX);
            const value = series.plottedValues[pointIndex];

            if (Number.isFinite(value)) {
                drawPoint(context, toPixelX(series.x[pointIndex]), toPixelY(value), series.color, colors.surface);
            }
        });
    }

    #updateTooltip(plottedSeries) {
        const tooltipElement = this.#tooltipElement;
        const hoveredIndex = this.#hoveredIndex;
        const scales = this.#scales;

        if (hoveredIndex === null || !scales || plottedSeries.length === 0 || hoveredIndex >= plottedSeries[0].pointCount) {
            tooltipElement.hidden = true;

            return;
        }

        const { formatX, formatValue, xLabel } = this.#options;
        const hoveredX = plottedSeries[0].x[hoveredIndex];
        const showSeriesLabels = plottedSeries.length > 1;

        const headingElement = createElement('span', { textContent: `${xLabel} ${formatX(hoveredX)}` });

        const rowElements = plottedSeries.map((series) => {
            const nearestIndex = findNearestIndex(series.x, hoveredX);

            const rowElement = createElement('div', { className: 'chart-tooltip-row' });
            const keyElement = createElement('i', { className: 'chart-key' });
            const valueElement = createElement('strong', { textContent: formatValue(series.y[nearestIndex]) });

            keyElement.style.background = series.color;

            rowElement.append(keyElement, valueElement);

            if (showSeriesLabels) {
                rowElement.append(createElement('span', { textContent: series.label }));
            }

            return rowElement;
        });

        tooltipElement.replaceChildren(headingElement, ...rowElements);
        tooltipElement.hidden = false;

        const plotWidth = this.#plotElement.clientWidth;
        const pixelX = scales.toPixelX(hoveredX);
        const isFlipped = pixelX > plotWidth / 2;

        tooltipElement.style.left = isFlipped ? '' : `${pixelX + TOOLTIP_OFFSET}px`;
        tooltipElement.style.right = isFlipped ? `${plotWidth - pixelX + TOOLTIP_OFFSET}px` : '';
    }
}

function readChartColors(element) {
    const computedStyle = getComputedStyle(element);
    const read = (propertyName) => computedStyle.getPropertyValue(propertyName).trim();

    return {
        read,
        grid: read('--chart-grid'),
        axis: read('--chart-axis'),
        reference: read('--chart-reference'),
        surface: read('--chart-surface'),
        text: read('--chart-text'),
        secondaryText: read('--chart-text-secondary'),
        mutedText: read('--chart-text-muted')
    };
}

function drawMessage(context, colors, message, width, height) {
    context.fillStyle = colors.mutedText;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, width / 2, height / 2);
}

function drawHorizontalLine(context, plotArea, pixelY) {
    context.beginPath();
    context.moveTo(plotArea.left, pixelY);
    context.lineTo(plotArea.right, pixelY);
    context.stroke();
}

function drawPoint(context, x, y, fillColor, ringColor) {
    context.beginPath();
    context.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = fillColor;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = ringColor;
    context.stroke();
}

export default LineChart;
