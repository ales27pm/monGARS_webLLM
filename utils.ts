export const Storage = {
    get: <T>(key: string, defaultValue: T): T => {
        try {
            const item = localStorage.getItem(key);
            // Handle Date objects in JSON if needed, but for now simple parse is fine
            // We might need to revive dates for chat history
            return item ? JSON.parse(item, (key, value) => {
                if (key === 'timestamp') return new Date(value);
                return value;
            }) : defaultValue;
        } catch (error) {
            console.error(`Error reading from localStorage key "${key}":`, error);
            return defaultValue;
        }
    },
    
    set: (key: string, value: any): boolean => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage key "${key}":`, error);
            return false;
        }
    },
    
    remove: (key: string): boolean => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Error removing from localStorage key "${key}":`, error);
            return false;
        }
    }
};

export const TurboHaptics = {
    impactLight: () => { 
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(10); } catch (e) {}
        }
    },
    impactMedium: () => { 
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(20); } catch (e) {}
        }
    },
    notificationSuccess: () => { 
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([10, 50, 10]); } catch (e) {}
        }
    },
    notificationError: () => { 
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([50, 100, 50]); } catch (e) {}
        }
    }
};

export const PerformanceMonitor = {
    startTime: null as number | null,
    start: function() {
        this.startTime = performance.now();
    },
    end: function(label = 'Operation') {
        if (this.startTime) {
            const duration = performance.now() - this.startTime;
            console.log(`${label} took ${duration.toFixed(2)}ms`);
            return duration;
        }
        return 0;
    }
};