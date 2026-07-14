# Shirazen Time Tracker

A reliable, project-aware time tracker for Visual Studio Code with persistent timers and polished Excel reporting.

## Highlights

- Start, pause, resume, save, reset, and stop work sessions from VS Code.
- Keep the active timer after a VS Code reload or restart.
- Use the workspace name automatically or configure a custom project name.
- View today's session count and total tracked time instantly.
- Store a lossless JSON history and regenerate a professional Excel workbook after every save.

## Professional Excel report

The generated `shirazen-time-tracker.xlsx` workbook includes:

- **Work Sessions** — sortable session-level history with project, start/end time, duration, and decimal hours.
- **Daily Summary** — daily totals grouped by project.
- **Project Summary** — lifetime totals, session counts, and latest activity by project.
- Styled Excel tables, frozen headings, filters, print-friendly pages, totals, conditional formatting, and consistent column sizing.

Reports are saved in the extension's global storage folder. Run **Shirazen: Open Time Logs Folder** to reveal them.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for `Shirazen`:

- `Shirazen: Start Timer`
- `Shirazen: Pause/Resume Timer`
- `Shirazen: Save Session and Continue`
- `Shirazen: Stop Timer`
- `Shirazen: Reset Timer`
- `Shirazen: Show Today's Summary`
- `Shirazen: Open Time Logs Folder`

## Settings

`shirazenTimeTracker.defaultProject` sets the project name written to reports. Leave it empty to use the current workspace name.

## Development

```bash
npm install
npm test
```

## License

MIT
