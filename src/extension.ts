import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

// Interfaces
interface IWorkLog {
    date: string;
    duration: string;
    startTime: string;
    endTime: string;
    project: string;
    totalDurationMs: number;
}

interface ITimeFormatter {
    formatDuration(ms: number): string;
    parseDuration(duration: string): number;
}

interface IStorageStrategy {
    save(workLog: IWorkLog): void;
}

// Time Formatter Implementation
class TimeFormatter implements ITimeFormatter {
    private padNumber(num: number): string {
        return num.toString().padStart(2, '0');
    }

    public formatDuration(ms: number): string {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        return `${this.padNumber(hours)}:${this.padNumber(minutes)}:${this.padNumber(seconds)}`;
    }

    public parseDuration(duration: string): number {
        const [hours, minutes, seconds] = duration.split(':').map(Number);
        return (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000);
    }
}

// Storage Strategies
class JsonStorageStrategy implements IStorageStrategy {
    private workLogsFile: string;

    constructor(workLogsFile: string) {
        this.workLogsFile = workLogsFile;
        this.ensureFileExists();
    }

    private ensureFileExists(): void {
        if (!fs.existsSync(this.workLogsFile)) {
            fs.writeFileSync(this.workLogsFile, '[]', 'utf8');
        }
    }

    public save(workLog: IWorkLog): void {
        try {
            const fileContent = fs.readFileSync(this.workLogsFile, 'utf8');
            const logs: IWorkLog[] = JSON.parse(fileContent);
            logs.push(workLog);
            fs.writeFileSync(this.workLogsFile, JSON.stringify(logs, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving to JSON:', error);
            throw error;
        }
    }
}

class ExcelStorageStrategy implements IStorageStrategy {
    private excelFile: string;
    private timeFormatter: ITimeFormatter;

    constructor(excelFile: string, timeFormatter: ITimeFormatter) {
        this.excelFile = excelFile;
        this.timeFormatter = timeFormatter;
    }

    public save(workLog: IWorkLog): void {
        let wb: XLSX.WorkBook;
        let existingData: any[] = [];

        if (fs.existsSync(this.excelFile)) {
            try {
                wb = XLSX.readFile(this.excelFile);
                if (wb.SheetNames.length > 0) {
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    if (ws) {
                        existingData = XLSX.utils.sheet_to_json(ws);
                    }
                }
            } catch (error) {
                console.error('Error reading Excel file:', error);
                wb = XLSX.utils.book_new();
            }
        } else {
            wb = XLSX.utils.book_new();
        }

        this.updateExcelData(existingData, workLog, wb);
    }

    private updateExcelData(existingData: any[], workLog: IWorkLog, wb: XLSX.WorkBook): void {
        const todayRecord = existingData.find(record => record['Date'] === workLog.date);
        
        if (todayRecord) {
            this.updateExistingRecord(todayRecord, workLog, existingData);
        } else {
            this.addNewRecord(workLog, existingData);
        }

        this.sortAndSaveData(existingData, wb);
    }

    private updateExistingRecord(todayRecord: any, workLog: IWorkLog, existingData: any[]): void {
        try {
            const previousDuration = this.timeFormatter.parseDuration(todayRecord['Total Duration']);
            const totalDurationMs = previousDuration + workLog.totalDurationMs;

            let times = [];
            if (todayRecord['Work Sessions']) {
                times = todayRecord['Work Sessions'].split('\n');
            }
            times.push(`${workLog.startTime} - ${workLog.endTime}`);

            todayRecord['Total Duration'] = this.timeFormatter.formatDuration(totalDurationMs);
            todayRecord['Work Sessions'] = times.join('\n');
            
            existingData = existingData.filter(record => record['Date'] !== workLog.date);
            existingData.push(todayRecord);
        } catch (error) {
            console.error('Error updating record:', error);
            this.addNewRecord(workLog, existingData);
        }
    }

    private addNewRecord(workLog: IWorkLog, existingData: any[]): void {
        existingData.push({
            'Date': workLog.date,
            'Total Duration': workLog.duration,
            'Work Sessions': `${workLog.startTime} - ${workLog.endTime}`
        });
    }

    private sortAndSaveData(existingData: any[], wb: XLSX.WorkBook): void {
        existingData.sort((a, b) => {
            try {
                const dateA = new Date(a['Date'].split('/').reverse().join('/'));
                const dateB = new Date(b['Date'].split('/').reverse().join('/'));
                return dateA.getTime() - dateB.getTime();
            } catch (error) {
                return 0;
            }
        });

        // Create header with styling
        const headers = ['Date', 'Total Duration', 'Work Sessions'];
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        
        // Add data rows
        XLSX.utils.sheet_add_json(ws, existingData, {
            header: headers,
            skipHeader: true,
            origin: 'A2'
        });

        // Apply cell styles
        this.applyWorksheetStyles(ws, existingData.length + 1);

        // Add title and info
        const titleRow = ['ShahGhasem Time Tracker - Work Sessions Log'];
        const infoRow = [`Generated on: ${new Date().toLocaleString()}`];
        XLSX.utils.sheet_add_aoa(ws, [titleRow], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(ws, [infoRow], { origin: `A${existingData.length + 4}` });

        // Protect worksheet
        ws['!protect'] = {
            password: '',
            formatCells: false,
            formatColumns: false,
            formatRows: false,
            insertColumns: false,
            insertRows: false,
            insertHyperlinks: false,
            deleteColumns: false,
            deleteRows: false,
            sort: false,
            autoFilter: false,
            pivotTables: false,
            selectLockedCells: true,
            selectUnlockedCells: true
        };

        // Lock all cells
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell) {
                    if (!cell.s) cell.s = {};
                    cell.s.locked = true;
                    cell.s.protection = { locked: true };
                }
            }
        }

        if (wb.SheetNames.includes('Work Sessions')) {
            wb.SheetNames = wb.SheetNames.filter(name => name !== 'Work Sessions');
            delete wb.Sheets['Work Sessions'];
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Work Sessions');
        XLSX.writeFile(wb, this.excelFile);
    }

    private applyWorksheetStyles(ws: XLSX.WorkSheet, totalRows: number): void {
        // Column widths
        ws['!cols'] = [
            { wch: 15 }, // Date
            { wch: 15 }, // Total Duration
            { wch: 60 }  // Work Sessions
        ];

        // Row heights
        ws['!rows'] = Array(totalRows).fill({ hpt: 25 });
        ws['!rows'][0] = { hpt: 35 }; // Header row height
        ws['!rows'][1] = { hpt: 40 }; // Title row height

        // Style all cells
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[cellAddress];
                if (!cell) continue;

                if (!cell.s) cell.s = {};

                // Default cell style
                cell.s.font = { name: 'Calibri', sz: 11 };
                cell.s.alignment = { vertical: 'center', horizontal: 'left', wrapText: true };
                cell.s.border = {
                    top: { style: 'thin', color: { rgb: 'D3D3D3' } },
                    bottom: { style: 'thin', color: { rgb: 'D3D3D3' } },
                    left: { style: 'thin', color: { rgb: 'D3D3D3' } },
                    right: { style: 'thin', color: { rgb: 'D3D3D3' } }
                };

                // Header row style (dark blue)
                if (R === 1) {
                    cell.s.font = { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } };
                    cell.s.fill = { fgColor: { rgb: '2F5597' }, type: 'pattern', patternType: 'solid' };
                    cell.s.alignment = { vertical: 'center', horizontal: 'center' };
                    cell.s.border = {
                        top: { style: 'medium', color: { rgb: '1F4287' } },
                        bottom: { style: 'medium', color: { rgb: '1F4287' } },
                        left: { style: 'medium', color: { rgb: '1F4287' } },
                        right: { style: 'medium', color: { rgb: '1F4287' } }
                    };
                }

                // Title style (light blue background)
                if (R === 0) {
                    cell.s.font = { name: 'Calibri', sz: 14, bold: true, color: { rgb: '2F5597' } };
                    cell.s.fill = { fgColor: { rgb: 'D9E2F3' }, type: 'pattern', patternType: 'solid' };
                    cell.s.alignment = { vertical: 'center', horizontal: 'center' };
                    cell.s.border = {
                        bottom: { style: 'medium', color: { rgb: '2F5597' } }
                    };
                }

                // Alternate row colors (very light gray)
                if (R > 1 && R % 2 === 0) {
                    cell.s.fill = { fgColor: { rgb: 'F8F9FA' }, type: 'pattern', patternType: 'solid' };
                }

                // Total Duration column style (center-aligned)
                if (C === 1 && R > 1) {
                    cell.s.alignment = { vertical: 'center', horizontal: 'center' };
                    cell.s.font = { ...cell.s.font, color: { rgb: '2F5597' } };
                }

                // Date column style
                if (C === 0 && R > 1) {
                    cell.s.alignment = { vertical: 'center', horizontal: 'center' };
                }
            }
        }

        // Merge title cells
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }  // Merge title row
        ];
    }
}

// Timer Manager (Singleton)
class TimerManager {
    private static instance: TimerManager;
    private timerDisplay: vscode.StatusBarItem;
    private pauseResumeButton: vscode.StatusBarItem;
    private startButton: vscode.StatusBarItem;
    private stopButton: vscode.StatusBarItem;
    private startTime: number;
    private intervalId?: NodeJS.Timeout;
    private timeFormatter: ITimeFormatter;
    private isPaused: boolean = false;
    private pauseStartTime: number = 0;
    private totalPausedTime: number = 0;
    private isRunning: boolean = false;

    private constructor(timeFormatter: ITimeFormatter) {
        this.timeFormatter = timeFormatter;
        this.startTime = Date.now();
        
        // Create timer display (rightmost)
        this.timerDisplay = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 104);
        this.timerDisplay.tooltip = 'Current work duration';
        
        // Create start button
        this.startButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
        this.startButton.text = `$(play-circle) Start`;
        this.startButton.command = 'shirazen.startTimer';
        this.startButton.tooltip = 'Start new timer';
        
        // Create stop/save button
        this.stopButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
        this.stopButton.text = `$(debug-stop) Save`;
        this.stopButton.command = 'shirazen.saveAndResetTimer';
        this.stopButton.tooltip = 'Save and reset timer';
        
        // Create pause/resume button
        this.pauseResumeButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
        this.pauseResumeButton.command = 'shirazen.pauseResumeTimer';
        this.pauseResumeButton.tooltip = 'Pause/Resume timer';

        this.updateUI();
    }

    public static getInstance(timeFormatter: ITimeFormatter): TimerManager {
        if (!TimerManager.instance) {
            TimerManager.instance = new TimerManager(timeFormatter);
        }
        return TimerManager.instance;
    }

    private getProjectName(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].name
            : 'unknown-project';
    }

    private updateUI(): void {
        const projectName = this.getProjectName();
        const elapsedTime = this.getElapsedTime();
        
        // Update timer display
        this.timerDisplay.text = `$(clock) ${this.timeFormatter.formatDuration(elapsedTime)} (${projectName})`;
        this.timerDisplay.show();

        // Update buttons visibility and state
        if (this.isRunning) {
            this.startButton.hide();
            this.stopButton.show();
            this.pauseResumeButton.show();
            
            if (this.isPaused) {
                this.pauseResumeButton.text = `$(debug-continue) Resume`;
                this.pauseResumeButton.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                this.pauseResumeButton.text = `$(debug-pause) Pause`;
                this.pauseResumeButton.backgroundColor = undefined;
            }
        } else {
            this.startButton.show();
            this.stopButton.hide();
            this.pauseResumeButton.hide();
        }
    }

    public startNewTimer(): void {
        this.startTime = Date.now();
        this.isPaused = false;
        this.pauseStartTime = 0;
        this.totalPausedTime = 0;
        this.isRunning = true;
        this.startTimer();
        this.updateUI();
        vscode.window.showInformationMessage('Timer started');
    }

    public stopTimer(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.isRunning = false;
        this.isPaused = false;
        this.updateUI();
    }

    private startTimer(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.updateUI();
        this.intervalId = setInterval(() => this.updateUI(), 1000);
    }

    public togglePause(): void {
        if (!this.isRunning) return;

        if (this.isPaused) {
            // Resume
            this.totalPausedTime += (Date.now() - this.pauseStartTime);
            this.isPaused = false;
            vscode.window.showInformationMessage('Timer resumed');
        } else {
            // Pause
            this.pauseStartTime = Date.now();
            this.isPaused = true;
            vscode.window.showInformationMessage('Timer paused');
        }
        this.updateUI();
    }

    public getCurrentSession(): IWorkLog {
        const endTime = new Date();
        const startDate = new Date(this.startTime);
        const elapsedTime = this.getElapsedTime();
        
        return {
            date: endTime.toLocaleDateString(),
            duration: this.timeFormatter.formatDuration(elapsedTime),
            startTime: startDate.toLocaleTimeString(),
            endTime: endTime.toLocaleTimeString(),
            project: this.getProjectName(),
            totalDurationMs: elapsedTime
        };
    }

    public getElapsedTime(): number {
        const now = Date.now();
        let elapsedTime = now - this.startTime - this.totalPausedTime;
        
        if (this.isPaused) {
            elapsedTime -= (now - this.pauseStartTime);
        }
        
        return elapsedTime;
    }

    public dispose(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.timerDisplay.dispose();
        this.startButton.dispose();
        this.stopButton.dispose();
        this.pauseResumeButton.dispose();
    }
}

// Extension Controller
export class ExtensionController {
    private timerManager: TimerManager;
    private jsonStorage: IStorageStrategy;
    private excelStorage: IStorageStrategy;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        const timeFormatter = new TimeFormatter();
        this.context = context;
        this.timerManager = TimerManager.getInstance(timeFormatter);
        
        const storageDirectory = context.globalStoragePath;
        if (!fs.existsSync(storageDirectory)) {
            fs.mkdirSync(storageDirectory, { recursive: true });
        }

        const workLogsFile = path.join(storageDirectory, 'work-logs.json');
        const excelFile = path.join(storageDirectory, `${this.getProjectName()}.xlsx`);

        this.jsonStorage = new JsonStorageStrategy(workLogsFile);
        this.excelStorage = new ExcelStorageStrategy(excelFile, timeFormatter);

        this.registerCommands();
    }

    private getProjectName(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].name
            : 'unknown-project';
    }

    private registerCommands(): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('shirazen.startTimer', () => this.startTimer()),
            vscode.commands.registerCommand('shirazen.saveAndResetTimer', () => this.saveAndResetTimer()),
            vscode.commands.registerCommand('shirazen.pauseResumeTimer', () => this.pauseResumeTimer()),
            vscode.commands.registerCommand('shirazen.openFolder', () => this.openFolder())
        );
    }

    private startTimer(): void {
        this.timerManager.startNewTimer();
    }

    private async saveAndResetTimer(): Promise<void> {
        try {
            const workLog = this.timerManager.getCurrentSession();
            
            this.jsonStorage.save(workLog);
            this.excelStorage.save(workLog);

            vscode.window.showInformationMessage(
                `Work time saved for project ${workLog.project}: ${workLog.duration}`
            );

            // Open the folder after saving
            vscode.env.openExternal(vscode.Uri.file(this.context.globalStoragePath));

            // Start a new timer session instead of stopping
            this.timerManager.startNewTimer();
        } catch (error) {
            vscode.window.showErrorMessage('Error saving work time');
            console.error('Error:', error);
        }
    }

    private async pauseResumeTimer(): Promise<void> {
        this.timerManager.togglePause();
    }

    private openFolder(): void {
        vscode.env.openExternal(vscode.Uri.file(this.context.globalStoragePath));
    }

    public dispose(): void {
        // Save work time before disposing
        if (this.timerManager) {
            this.saveAndResetTimer().then(() => {
                this.timerManager.dispose();
            });
        }
    }
}

// Extension Entry Points
export function activate(context: vscode.ExtensionContext): void {
    const controller = new ExtensionController(context);
    context.subscriptions.push({ dispose: () => controller.dispose() });

    // Register window state change handler for auto-save
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState(e => {
            if (!e.focused) {
                controller.dispose();
            }
        })
    );
}

export function deactivate(): void {
    // Cleanup is handled by the ExtensionController's dispose method
} 