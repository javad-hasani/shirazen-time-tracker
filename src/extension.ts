import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { formatLocalDate, formatLocalTime, TimeFormatter } from './time';

interface WorkLog {
    date: string;
    duration: string;
    startTime: string;
    endTime: string;
    project: string;
    totalDurationMs: number;
}

interface TimerState {
    isRunning: boolean;
    isPaused: boolean;
    startTime: number;
    pauseStartTime: number;
    totalPausedTime: number;
}

const TIMER_STATE_KEY = 'shirazen.timerState';

class WorkLogRepository {
    private readonly jsonFile: string;
    private readonly excelFile: string;
    private readonly formatter = new TimeFormatter();

    constructor(storageDirectory: string) {
        fs.mkdirSync(storageDirectory, { recursive: true });
        this.jsonFile = path.join(storageDirectory, 'work-logs.json');
        this.excelFile = path.join(storageDirectory, 'shirazen-time-tracker.xlsx');
        if (!fs.existsSync(this.jsonFile)) {
            fs.writeFileSync(this.jsonFile, '[]', 'utf8');
        }
    }

    public getLogs(): WorkLog[] {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.jsonFile, 'utf8'));
            return Array.isArray(parsed) ? parsed.filter(this.isValidLog) : [];
        } catch (error) {
            console.error('Unable to read work logs:', error);
            return [];
        }
    }

    public async save(log: WorkLog): Promise<void> {
        const logs = this.getLogs();
        logs.push(log);
        this.writeJsonAtomically(logs);
        await this.writeProfessionalWorkbook(logs);
    }

    public getExcelFileUri(): vscode.Uri {
        return vscode.Uri.file(this.excelFile);
    }

    public getTodaySummary(): { sessions: number; durationMs: number } {
        const today = formatLocalDate(new Date());
        const logs = this.getLogs().filter(log => this.normalizedDate(log.date) === today);
        return {
            sessions: logs.length,
            durationMs: logs.reduce((total, log) => total + this.durationMs(log), 0)
        };
    }

    private readonly isValidLog = (value: unknown): value is WorkLog => {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const log = value as Partial<WorkLog>;
        return typeof log.date === 'string'
            && typeof log.duration === 'string'
            && typeof log.startTime === 'string'
            && typeof log.endTime === 'string'
            && typeof log.project === 'string';
    };

    private durationMs(log: WorkLog): number {
        return Number.isFinite(log.totalDurationMs)
            ? Math.max(0, log.totalDurationMs)
            : this.formatter.parseDuration(log.duration);
    }

    private writeJsonAtomically(logs: WorkLog[]): void {
        const temporaryFile = `${this.jsonFile}.tmp`;
        fs.writeFileSync(temporaryFile, JSON.stringify(logs, null, 2), 'utf8');
        fs.renameSync(temporaryFile, this.jsonFile);
    }

    private normalizedDate(value: string): string {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : formatLocalDate(parsed);
    }

    private async writeProfessionalWorkbook(logs: WorkLog[]): Promise<void> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Shirazen Time Tracker';
        workbook.lastModifiedBy = 'Shirazen Time Tracker';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.calcProperties.fullCalcOnLoad = true;

        this.addSessionsSheet(workbook, logs);
        this.addDailySummarySheet(workbook, logs);
        this.addProjectSummarySheet(workbook, logs);

        const temporaryFile = `${this.excelFile}.tmp.xlsx`;
        await workbook.xlsx.writeFile(temporaryFile);
        if (fs.existsSync(this.excelFile)) {
            fs.unlinkSync(this.excelFile);
        }
        fs.renameSync(temporaryFile, this.excelFile);
    }

    private addSessionsSheet(workbook: ExcelJS.Workbook, logs: WorkLog[]): void {
        const sheet = workbook.addWorksheet('Work Sessions', {
            views: [{ state: 'frozen', ySplit: 4 }],
            properties: { tabColor: { argb: 'FF2563EB' } },
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        this.addSheetHeading(sheet, 'Shirazen Time Tracker', 'Detailed work-session history');
        const rows = logs
            .slice()
            .sort((a, b) => `${this.normalizedDate(a.date)} ${a.startTime}`.localeCompare(`${this.normalizedDate(b.date)} ${b.startTime}`))
            .map(log => [
                this.normalizedDate(log.date),
                log.project || 'unknown-project',
                log.startTime,
                log.endTime,
                this.formatter.formatDuration(this.durationMs(log)),
                this.durationMs(log) / 3_600_000
            ]);

        sheet.addTable({
            name: 'WorkSessionsTable',
            ref: 'A4',
            headerRow: true,
            totalsRow: rows.length > 0,
            style: { theme: 'TableStyleMedium2', showRowStripes: true },
            columns: [
                { name: 'Date', totalsRowLabel: rows.length ? 'TOTAL' : undefined },
                { name: 'Project' },
                { name: 'Start Time' },
                { name: 'End Time' },
                { name: 'Duration' },
                { name: 'Hours', totalsRowFunction: rows.length ? 'sum' : undefined }
            ],
            rows
        });

        sheet.columns = [
            { width: 14 }, { width: 28 }, { width: 14 },
            { width: 14 }, { width: 16 }, { width: 12 }
        ];
        sheet.getColumn(6).numFmt = '0.00';
        this.finishSheet(sheet, 6, rows.length + 5);
    }

    private addDailySummarySheet(workbook: ExcelJS.Workbook, logs: WorkLog[]): void {
        const grouped = new Map<string, { date: string; project: string; sessions: number; durationMs: number }>();
        for (const log of logs) {
            const date = this.normalizedDate(log.date);
            const project = log.project || 'unknown-project';
            const key = `${date}\u0000${project}`;
            const current = grouped.get(key) || { date, project, sessions: 0, durationMs: 0 };
            current.sessions += 1;
            current.durationMs += this.durationMs(log);
            grouped.set(key, current);
        }
        const rows = Array.from(grouped.values())
            .sort((a, b) => `${a.date}${a.project}`.localeCompare(`${b.date}${b.project}`))
            .map(item => [item.date, item.project, item.sessions, this.formatter.formatDuration(item.durationMs), item.durationMs / 3_600_000]);

        const sheet = workbook.addWorksheet('Daily Summary', {
            views: [{ state: 'frozen', ySplit: 4 }],
            properties: { tabColor: { argb: 'FF10B981' } },
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });
        this.addSheetHeading(sheet, 'Daily Summary', 'Daily totals grouped by project');
        sheet.addTable({
            name: 'DailySummaryTable', ref: 'A4', headerRow: true, totalsRow: rows.length > 0,
            style: { theme: 'TableStyleMedium4', showRowStripes: true },
            columns: [
                { name: 'Date', totalsRowLabel: rows.length ? 'TOTAL' : undefined },
                { name: 'Project' },
                { name: 'Sessions', totalsRowFunction: rows.length ? 'sum' : undefined },
                { name: 'Total Time' },
                { name: 'Hours', totalsRowFunction: rows.length ? 'sum' : undefined }
            ],
            rows
        });
        sheet.columns = [{ width: 14 }, { width: 30 }, { width: 12 }, { width: 16 }, { width: 12 }];
        sheet.getColumn(5).numFmt = '0.00';
        this.addHoursConditionalFormatting(sheet, `E5:E${Math.max(5, rows.length + 4)}`);
        this.finishSheet(sheet, 5, rows.length + 5);
    }

    private addProjectSummarySheet(workbook: ExcelJS.Workbook, logs: WorkLog[]): void {
        const grouped = new Map<string, { sessions: number; durationMs: number; lastActivity: string }>();
        for (const log of logs) {
            const project = log.project || 'unknown-project';
            const date = this.normalizedDate(log.date);
            const current = grouped.get(project) || { sessions: 0, durationMs: 0, lastActivity: date };
            current.sessions += 1;
            current.durationMs += this.durationMs(log);
            if (date > current.lastActivity) {
                current.lastActivity = date;
            }
            grouped.set(project, current);
        }
        const rows = Array.from(grouped.entries())
            .sort((a, b) => b[1].durationMs - a[1].durationMs)
            .map(([project, item]) => [project, item.sessions, this.formatter.formatDuration(item.durationMs), item.durationMs / 3_600_000, item.lastActivity]);

        const sheet = workbook.addWorksheet('Project Summary', {
            views: [{ state: 'frozen', ySplit: 4 }],
            properties: { tabColor: { argb: 'FFF59E0B' } },
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });
        this.addSheetHeading(sheet, 'Project Summary', 'Lifetime totals and latest activity');
        sheet.addTable({
            name: 'ProjectSummaryTable', ref: 'A4', headerRow: true, totalsRow: rows.length > 0,
            style: { theme: 'TableStyleMedium9', showRowStripes: true },
            columns: [
                { name: 'Project', totalsRowLabel: rows.length ? 'TOTAL' : undefined },
                { name: 'Sessions', totalsRowFunction: rows.length ? 'sum' : undefined },
                { name: 'Total Time' },
                { name: 'Hours', totalsRowFunction: rows.length ? 'sum' : undefined },
                { name: 'Last Activity' }
            ],
            rows
        });
        sheet.columns = [{ width: 32 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 16 }];
        sheet.getColumn(4).numFmt = '0.00';
        this.addHoursConditionalFormatting(sheet, `D5:D${Math.max(5, rows.length + 4)}`);
        this.finishSheet(sheet, 5, rows.length + 5);
    }

    private addSheetHeading(sheet: ExcelJS.Worksheet, title: string, subtitle: string): void {
        sheet.mergeCells('A1:F1');
        sheet.getCell('A1').value = title;
        sheet.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172554' } };
        sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
        sheet.getRow(1).height = 34;
        sheet.mergeCells('A2:F2');
        sheet.getCell('A2').value = `${subtitle} • Updated ${new Date().toLocaleString()}`;
        sheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };
        sheet.getRow(2).height = 22;
    }

    private addHoursConditionalFormatting(sheet: ExcelJS.Worksheet, ref: string): void {
        sheet.addConditionalFormatting({
            ref,
            rules: [{
                type: 'colorScale',
                priority: 1,
                cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
                color: [{ argb: 'FFFEE2E2' }, { argb: 'FFFEF3C7' }, { argb: 'FFDCFCE7' }]
            }]
        });
    }

    private finishSheet(sheet: ExcelJS.Worksheet, columnCount: number, rowCount: number): void {
        sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, rowCount), column: columnCount } };
        sheet.headerFooter.oddFooter = 'Shirazen Time Tracker • Page &P of &N';
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 5) {
                row.height = 21;
                row.alignment = { vertical: 'middle' };
            }
        });
    }
}

class TimerManager implements vscode.Disposable {
    private readonly timerDisplay: vscode.StatusBarItem;
    private readonly pauseResumeButton: vscode.StatusBarItem;
    private readonly startButton: vscode.StatusBarItem;
    private readonly saveButton: vscode.StatusBarItem;
    private readonly formatter = new TimeFormatter();
    private intervalId?: NodeJS.Timeout;
    private state: TimerState;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.state = context.globalState.get<TimerState>(TIMER_STATE_KEY) || this.emptyState();
        this.timerDisplay = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 104);
        this.startButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
        this.saveButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
        this.pauseResumeButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);

        this.timerDisplay.tooltip = 'Current tracked work time';
        this.startButton.text = '$(play-circle) Start';
        this.startButton.command = 'shirazen.startTimer';
        this.saveButton.text = '$(save) Save';
        this.saveButton.command = 'shirazen.saveAndResetTimer';
        this.pauseResumeButton.command = 'shirazen.pauseResumeTimer';
        this.refreshInterval();
        this.updateUI();
    }

    public isRunning(): boolean {
        return this.state.isRunning;
    }

    public startNewTimer(): void {
        this.state = { isRunning: true, isPaused: false, startTime: Date.now(), pauseStartTime: 0, totalPausedTime: 0 };
        void this.persist();
        this.refreshInterval();
        this.updateUI();
    }

    public togglePause(): void {
        if (!this.state.isRunning) {
            return;
        }
        if (this.state.isPaused) {
            this.state.totalPausedTime += Date.now() - this.state.pauseStartTime;
            this.state.pauseStartTime = 0;
            this.state.isPaused = false;
        } else {
            this.state.pauseStartTime = Date.now();
            this.state.isPaused = true;
        }
        void this.persist();
        this.updateUI();
    }

    public stop(): void {
        this.state = this.emptyState();
        void this.persist();
        this.refreshInterval();
        this.updateUI();
    }

    public reset(): void {
        this.startNewTimer();
    }

    public currentSession(): WorkLog | undefined {
        if (!this.state.isRunning) {
            return undefined;
        }
        const endDate = new Date();
        const elapsed = this.elapsedTime();
        return {
            date: formatLocalDate(endDate),
            duration: this.formatter.formatDuration(elapsed),
            startTime: formatLocalTime(new Date(this.state.startTime)),
            endTime: formatLocalTime(endDate),
            project: this.projectName(),
            totalDurationMs: elapsed
        };
    }

    public elapsedTime(): number {
        if (!this.state.isRunning) {
            return 0;
        }
        const referenceTime = this.state.isPaused ? this.state.pauseStartTime : Date.now();
        return Math.max(0, referenceTime - this.state.startTime - this.state.totalPausedTime);
    }

    private projectName(): string {
        const configured = vscode.workspace.getConfiguration('shirazenTimeTracker').get<string>('defaultProject', '').trim();
        if (configured) {
            return configured;
        }
        return vscode.workspace.workspaceFolders?.[0]?.name || 'unknown-project';
    }

    private updateUI(): void {
        const project = this.projectName();
        this.timerDisplay.text = `$(clock) ${this.formatter.formatDuration(this.elapsedTime())} (${project})`;
        this.timerDisplay.show();
        if (this.state.isRunning) {
            this.startButton.hide();
            this.saveButton.show();
            this.pauseResumeButton.show();
            this.pauseResumeButton.text = this.state.isPaused ? '$(debug-continue) Resume' : '$(debug-pause) Pause';
            this.pauseResumeButton.backgroundColor = this.state.isPaused
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;
        } else {
            this.startButton.show();
            this.saveButton.hide();
            this.pauseResumeButton.hide();
        }
    }

    private refreshInterval(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        if (this.state.isRunning && !this.state.isPaused) {
            this.intervalId = setInterval(() => this.updateUI(), 1_000);
        }
    }

    private async persist(): Promise<void> {
        await this.context.globalState.update(TIMER_STATE_KEY, this.state);
    }

    private emptyState(): TimerState {
        return { isRunning: false, isPaused: false, startTime: 0, pauseStartTime: 0, totalPausedTime: 0 };
    }

    public dispose(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.timerDisplay.dispose();
        this.startButton.dispose();
        this.saveButton.dispose();
        this.pauseResumeButton.dispose();
    }
}

class ExtensionController implements vscode.Disposable {
    private readonly timer: TimerManager;
    private readonly logs: WorkLogRepository;
    private readonly formatter = new TimeFormatter();

    constructor(private readonly context: vscode.ExtensionContext) {
        this.timer = new TimerManager(context);
        this.logs = new WorkLogRepository(context.globalStorageUri.fsPath);
        this.registerCommands();
        context.subscriptions.push(this.timer);
    }

    private registerCommands(): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('shirazen.startTimer', () => this.startTimer()),
            vscode.commands.registerCommand('shirazen.saveAndResetTimer', () => this.saveAndReset()),
            vscode.commands.registerCommand('shirazen.pauseResumeTimer', () => this.pauseResume()),
            vscode.commands.registerCommand('shirazen.stopTimer', () => this.stopTimer()),
            vscode.commands.registerCommand('shirazen.resetTimer', () => this.resetTimer()),
            vscode.commands.registerCommand('shirazen.showTodaySummary', () => this.showTodaySummary()),
            vscode.commands.registerCommand('shirazen.openFolder', () => this.openFolder())
        );
    }

    private startTimer(): void {
        if (this.timer.isRunning()) {
            void vscode.window.showWarningMessage('A timer is already running.');
            return;
        }
        this.timer.startNewTimer();
        void vscode.window.showInformationMessage('Shirazen timer started.');
    }

    private async saveAndReset(): Promise<void> {
        const session = this.timer.currentSession();
        if (!session) {
            await vscode.window.showWarningMessage('Start the timer before saving a session.');
            return;
        }
        if (session.totalDurationMs < 1_000) {
            await vscode.window.showWarningMessage('The current session is too short to save.');
            return;
        }
        try {
            await this.logs.save(session);
            this.timer.startNewTimer();
            await this.showSavedReport(session);
        } catch (error) {
            console.error('Unable to save work session:', error);
            await vscode.window.showErrorMessage('Could not save the work session. Your timer is still running.');
        }
    }

    private async showSavedReport(session: WorkLog): Promise<void> {
        const excelFile = this.logs.getExcelFileUri();
        const action = await vscode.window.showInformationMessage(
            `Saved ${session.duration} for ${session.project}. Excel report: ${excelFile.fsPath}`,
            'Open Excel',
            'Show in Folder'
        );

        if (action === 'Open Excel') {
            const opened = await vscode.env.openExternal(excelFile);
            if (!opened) {
                await vscode.window.showWarningMessage(
                    `Could not open the Excel report automatically. File: ${excelFile.fsPath}`
                );
            }
            return;
        }

        if (action === 'Show in Folder') {
            await vscode.commands.executeCommand('revealFileInOS', excelFile);
        }
    }

    private pauseResume(): void {
        if (!this.timer.isRunning()) {
            void vscode.window.showWarningMessage('Start the timer first.');
            return;
        }
        this.timer.togglePause();
    }

    private async stopTimer(): Promise<void> {
        if (!this.timer.isRunning()) {
            await vscode.window.showWarningMessage('No timer is running.');
            return;
        }
        const choice = await vscode.window.showQuickPick(
            ['Save and stop', 'Discard and stop', 'Cancel'],
            { placeHolder: 'What should happen to the current session?' }
        );
        if (!choice || choice === 'Cancel') {
            return;
        }
        if (choice === 'Save and stop') {
            const session = this.timer.currentSession();
            if (session && session.totalDurationMs >= 1_000) {
                try {
                    await this.logs.save(session);
                } catch (error) {
                    console.error('Unable to save work session:', error);
                    await vscode.window.showErrorMessage('Could not save the session. The timer was not stopped.');
                    return;
                }
            }
        }
        this.timer.stop();
        await vscode.window.showInformationMessage('Shirazen timer stopped.');
    }

    private async resetTimer(): Promise<void> {
        if (!this.timer.isRunning()) {
            await vscode.window.showWarningMessage('No timer is running.');
            return;
        }
        const choice = await vscode.window.showWarningMessage(
            'Reset the current timer without saving it?',
            { modal: true },
            'Reset'
        );
        if (choice === 'Reset') {
            this.timer.reset();
        }
    }

    private async showTodaySummary(): Promise<void> {
        const summary = this.logs.getTodaySummary();
        await vscode.window.showInformationMessage(
            `Today: ${summary.sessions} session${summary.sessions === 1 ? '' : 's'} • ${this.formatter.formatDuration(summary.durationMs)}`
        );
    }

    private async openFolder(): Promise<void> {
        await vscode.commands.executeCommand('revealFileInOS', this.context.globalStorageUri);
    }

    public dispose(): void {
        // Timer state is already persisted. Deactivation must never create a work log.
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const controller = new ExtensionController(context);
    context.subscriptions.push(controller);
}

export function deactivate(): void {
    // Resources are disposed through context.subscriptions.
}
