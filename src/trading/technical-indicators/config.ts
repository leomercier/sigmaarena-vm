let config: Record<string, any> = {};

export function setConfig(key: string, value: any) {
    config[key] = value;
}

export function getConfig(key: any) {
    return config[key];
}
