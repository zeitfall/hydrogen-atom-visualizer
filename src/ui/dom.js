import { SVG_NAMESPACE } from './constants.js';

function createElement(tagName, properties = {}) {
    const element = document.createElement(tagName);

    Object.assign(element, properties);

    return element;
}

function createChevronIcon(className) {
    const svgElement = document.createElementNS(SVG_NAMESPACE, 'svg');
    const pathElement = document.createElementNS(SVG_NAMESPACE, 'path');

    svgElement.setAttribute('class', className);
    svgElement.setAttribute('viewBox', '0 0 16 16');
    svgElement.setAttribute('aria-hidden', 'true');

    pathElement.setAttribute('d', 'M4 6l4 4 4-4');

    svgElement.append(pathElement);

    return svgElement;
}

export {
    createElement,
    createChevronIcon
};
