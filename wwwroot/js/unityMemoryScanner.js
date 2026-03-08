window.unityMemoryScanner = {
    _unityInstance: null,
    _searchAttempts: 0,

    getUnity: (iframe, forceRescan = false) => {
        if (!iframe || !iframe.contentWindow) {
            console.log("Iframe or contentWindow not available");
            return null;
        }
        const win = iframe.contentWindow;

        if (!forceRescan && window.unityMemoryScanner._unityInstance) {
            return window.unityMemoryScanner._unityInstance;
        }

        console.log("Searching for Unity instance...");
        // Try common globals
        let instance = win.unityInstance || win.instance || win.gameInstance || win.UnityLoader?.instance || null;

        if (!instance && win.UnityLoader) {
            // Sometimes UnityLoader has an instances array
            if (win.UnityLoader.instances && win.UnityLoader.instances.length > 0) {
                instance = win.UnityLoader.instances[0];
            }
        }

        if (!instance) {
            console.log("Unity instance not found via globals, performing deep search...");
            instance = window.unityMemoryScanner.findHeapU8(win, 30);
            if (instance) {
                console.log("Found Unity instance via deep search");
            } else {
                console.log("Deep search failed - game may not be fully loaded");
            }
        }

        if (instance) {
            window.unityMemoryScanner._unityInstance = instance;
            console.log("Unity instance cached");
        }
        return instance;
    },

    findHeapU8: (obj, maxDepth = 20, visited = new WeakSet(), depth = 0) => {
        if (depth > maxDepth) return null;
        if (obj === null || typeof obj !== 'object') return null;
        if (visited.has(obj)) return null;
        visited.add(obj);
        if (obj.HEAPU8) return obj;
        for (let key of Object.keys(obj)) {
            try {
                let found = window.unityMemoryScanner.findHeapU8(obj[key], maxDepth, visited, depth + 1);
                if (found) return found;
            } catch (e) {}
        }
        return null;
    },

    readMemory: (iframe, retries = 3) => {
        return new Promise((resolve) => {
            const attempt = (retryCount) => {
                try {
                    const unity = window.unityMemoryScanner.getUnity(iframe, true); // always force fresh scan
                    if (!unity) {
                        if (retryCount > 0) {
                            console.log(`Unity instance not found, retrying... (${retryCount} left)`);
                            setTimeout(() => attempt(retryCount - 1), 500);
                        } else {
                            console.error("Unity instance not found after retries");
                            resolve(null);
                        }
                        return;
                    }
                    const heap = unity.HEAPU8 || (unity.Module && unity.Module.HEAPU8);
                    if (!heap) {
                        console.error("No heap found");
                        resolve(null);
                        return;
                    }
                    const buffer = new Uint8Array(heap.buffer, heap.byteOffset, heap.byteLength);
                    console.log("Memory read success, length:", buffer.length);
                    resolve(Array.from(buffer));
                } catch (e) {
                    console.error("readMemory error", e);
                    resolve(null);
                }
            };
            attempt(retries);
        });
    },

    writeMemory: (iframe, address, value, type) => {
        try {
            const unity = window.unityMemoryScanner.getUnity(iframe, false);
            if (!unity) return false;
            const heap = unity.HEAPU8 || (unity.Module && unity.Module.HEAPU8);
            if (!heap) return false;

            const addr = Number(address);
            switch (type) {
                case 'byte':
                    heap[addr] = value;
                    break;
                case 'int16':
                    (unity.HEAP16 || unity.Module.HEAP16)[addr >> 1] = value;
                    break;
                case 'int32':
                    (unity.HEAP32 || unity.Module.HEAP32)[addr >> 2] = value;
                    break;
                case 'float':
                    (unity.HEAPF32 || unity.Module.HEAPF32)[addr >> 2] = value;
                    break;
            }
            return true;
        } catch (e) {
            console.error("writeMemory error", e);
            return false;
        }
    },

    _frozenIntervals: {},

    freezeAddress: (iframe, address, type, value) => {
        if (window.unityMemoryScanner._frozenIntervals[address]) {
            clearInterval(window.unityMemoryScanner._frozenIntervals[address]);
        }
        const interval = setInterval(() => {
            window.unityMemoryScanner.writeMemory(iframe, address, value, type);
        }, 100);
        window.unityMemoryScanner._frozenIntervals[address] = interval;
    },

    unfreezeAddress: (address) => {
        if (window.unityMemoryScanner._frozenIntervals[address]) {
            clearInterval(window.unityMemoryScanner._frozenIntervals[address]);
            delete window.unityMemoryScanner._frozenIntervals[address];
        }
    },

    unfreezeAll: () => {
        for (let addr in window.unityMemoryScanner._frozenIntervals) {
            clearInterval(window.unityMemoryScanner._frozenIntervals[addr]);
        }
        window.unityMemoryScanner._frozenIntervals = {};
    }
};