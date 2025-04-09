# ShahGhasem Time Tracker

A professional VSCode extension for tracking and logging your work sessions with precision and elegance.

## Features

- **Automatic Time Tracking**: Tracks your active time in VSCode automatically
- **Multiple Session Support**: Records multiple work sessions per day
- **Excel Export**: Exports detailed work logs to Excel format
- **JSON Backup**: Maintains a JSON backup of all work sessions
- **Project-based Tracking**: Automatically detects and tracks time per project
- **Status Bar Integration**: Shows real-time work duration in the status bar

## Installation

1. Download the `.vsix` file from the releases page
2. Open VSCode
3. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
4. Type "Install from VSIX" and select it
5. Choose the downloaded `.vsix` file

## Usage

### Starting Time Tracking
The extension automatically starts tracking time when you open VSCode.

### Viewing Current Session
The current work duration is displayed in the status bar:
- Format: `HH:MM:SS (ProjectName)`
- The timer updates every second

### Saving Work Sessions
1. Click on the timer in the status bar
2. Or use the command palette (`Ctrl+Shift+P`) and search for "Save and Reset Work Timer"

### Accessing Logs
- Your work logs are saved in two formats:
  1. Excel file (`.xlsx`) - One file per project
  2. JSON file - Complete backup of all sessions

- To open the logs folder:
  1. Use the command palette
  2. Search for "Open Time Logs Folder"

### Excel Log Format
The Excel file contains:
- Date
- Total duration per day
- Detailed session times (start - end) for each day

## Development

### Setup
```bash
git clone https://github.com/local-publisher/shahghasem
cd shahghasem
npm install
```

### Build
```bash
npm run compile
```

### Package
```bash
vsce package
```

## Architecture

The extension follows SOLID principles and implements the following design patterns:
- **Observer Pattern**: For status bar updates and event handling
- **Singleton Pattern**: For managing global state
- **Factory Pattern**: For creating log entries
- **Strategy Pattern**: For different storage formats (Excel/JSON)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details 