# Shirazen Time Tracker

A professional time tracking extension for Visual Studio Code that helps you track your work time with pause/resume functionality.

## Features

- 🕒 Track work time with start, pause, resume, and stop functionality
- 📊 Save work logs in both JSON and Excel formats
- 📅 Support for multiple work sessions per day
- 📂 Automatic folder opening after saving
- 🔄 Continuous timer after saving (no need to restart)
- 🎯 Project-based time tracking

## Installation

1. Download the latest `.vsix` file from the releases
2. Open VS Code
3. Go to the Extensions view (Ctrl+Shift+X)
4. Click on the "..." menu and select "Install from VSIX..."
5. Choose the downloaded `.vsix` file
6. Reload VS Code

## Usage

1. Open the Command Palette (Ctrl+Shift+P)
2. Type "Shirazen Time Tracker" to see available commands:
   - `Start Timer`: Start tracking time
   - `Pause Timer`: Pause the current timer
   - `Resume Timer`: Resume a paused timer
   - `Save Timer`: Save current work time and start a new session
   - `Stop Timer`: Stop the current timer

## Data Storage

- Work logs are saved in two formats:
  - JSON: Stored in the extension's global storage
  - Excel: Automatically generated and saved in the extension's global storage
- Each work session includes:
  - Project name
  - Start time
  - End time
  - Duration
  - Multiple sessions per day are supported

## Requirements

- Visual Studio Code 1.60.0 or higher
- Node.js 14.0.0 or higher

## Extension Settings

This extension contributes the following settings:

- `shirazenTimeTracker.defaultProject`: Default project name for new timers

## Known Issues

- None at the moment



## Contributing

Feel free to submit issues and enhancement requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 