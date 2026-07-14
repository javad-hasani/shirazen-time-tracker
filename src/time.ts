export class TimeFormatter {
    private padNumber(value: number): string {
        return Math.floor(value).toString().padStart(2, '0');
    }

    public formatDuration(ms: number): string {
        const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
        const hours = Math.floor(safeMs / 3_600_000);
        const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
        const seconds = Math.floor((safeMs % 60_000) / 1_000);
        return `${this.padNumber(hours)}:${this.padNumber(minutes)}:${this.padNumber(seconds)}`;
    }

    public parseDuration(duration: string): number {
        const parts = duration.split(':').map(Number);
        if (parts.length !== 3 || parts.some(part => !Number.isFinite(part) || part < 0)) {
            return 0;
        }
        const [hours, minutes, seconds] = parts;
        return (hours * 3_600_000) + (minutes * 60_000) + (seconds * 1_000);
    }
}

export function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatLocalTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}
