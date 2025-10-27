import { copy, copyFileSync } from 'fs-extra';
import { logError } from './logging';

async function copyNonTsFiles() {
    try {
        const extensionsToCopy = ['.html', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 'Dockerfile'];

        await copy('src', 'dist', {
            filter: (src) => {
                if (extensionsToCopy.some((ext) => src.endsWith(ext))) {
                    const destPath = src.replace('src', 'dist');
                    copyFileSync(src, destPath);
                }

                return true;
            }
        });
    } catch (err) {
        logError('Error copying files', { err });
    }
}

copyNonTsFiles();
