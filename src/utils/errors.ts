export function getErrorMetadata(err: Error): Record<string, any> {
    let metadata: Record<string, any> = {};

    if (err) {
        metadata['message'] = err.message || '';
        metadata['stack'] = err.stack || '';
        metadata['name'] = err.name || '';
        metadata['cause'] = err.cause || '';
    }

    return metadata;
}
