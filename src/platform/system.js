const UNKNOWN = 'Unknown';

const PLACEHOLDER_BRAND_PATTERN = /not.?a.?brand|chromium/i;
const CHROMIUM_BRAND_PATTERN = /chromium/i;
const USER_AGENT_BROWSER_PATTERN = /(Firefox|Edg|Chrome|Version)\/(\d+)/;

const USER_AGENT_BROWSER_NAMES = Object.freeze({
    Edg: 'Edge',
    Version: 'Safari'
});

function getSystemInfo(adapterInfo) {
    return Object.freeze({
        gpu: describeGPU(adapterInfo),
        browser: describeBrowser(),
        platform: navigator.userAgentData?.platform || navigator.platform || UNKNOWN,
        cpuThreadCount: navigator.hardwareConcurrency ?? 0
    });
}

function describeGPU(adapterInfo) {
    if (!adapterInfo) {
        return UNKNOWN;
    }

    const { vendor, architecture, description } = adapterInfo;
    const gpuName = [vendor, architecture, description].filter(Boolean).join(' ');

    return gpuName || UNKNOWN;
}

function describeBrowser() {
    const brands = navigator.userAgentData?.brands ?? [];

    const browserBrand = brands.find(({ brand }) => !PLACEHOLDER_BRAND_PATTERN.test(brand))
        ?? brands.find(({ brand }) => CHROMIUM_BRAND_PATTERN.test(brand));

    if (browserBrand) {
        return `${browserBrand.brand} ${browserBrand.version}`;
    }

    const userAgentMatch = navigator.userAgent.match(USER_AGENT_BROWSER_PATTERN);

    if (!userAgentMatch) {
        return UNKNOWN;
    }

    const [, browserToken, browserVersion] = userAgentMatch;
    const browserName = USER_AGENT_BROWSER_NAMES[browserToken] ?? browserToken;

    return `${browserName} ${browserVersion}`;
}

export {
    getSystemInfo
};
