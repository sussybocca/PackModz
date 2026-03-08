window.modInterop = {
    applyMods: (iframe, mods) => {
        if (!iframe || !iframe.contentWindow) return;
        const win = iframe.contentWindow;

        mods.forEach(mod => {
            // Resolve variable path like "player.score" or "window.speed"
            const parts = mod.variablePath.split('.');
            let target = win;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]]) {
                    // If the object doesn't exist, create it (some games may rely on this)
                    target[parts[i]] = {};
                }
                target = target[parts[i]];
            }
            const prop = parts[parts.length - 1];

            // Apply the value with proper type conversion
            if (mod.type === 'boolean') {
                target[prop] = mod.value === 1;
            } else if (mod.type === 'number') {
                target[prop] = parseFloat(mod.value);
            } else {
                target[prop] = mod.value;
            }
        });

        // Optional: trigger a custom event that the game can listen to
        if (win.document) {
            const event = new CustomEvent('modz-updated', { detail: mods });
            win.document.dispatchEvent(event);
        }
    }
};