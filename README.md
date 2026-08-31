# Nova S Pro Drill Control

A browser-based controller for the Nova S Pro table tennis robot.

This project is based on the original Nova web client by [olanga](https://github.com/olanga/nova), which provides an alternative to the official application without requiring server connectivity or user login.

This fork adds additional training-session features while retaining the original drill editor, Bluetooth control, drill management, and local browser storage.

## Use Online

Open the web application:

https://shimuranmonk.github.io/nova/

A Chromium-based browser such as Chrome or Edge is recommended.

Web Bluetooth is required to connect to the Nova S Pro. iPhone/iOS browsers are currently not supported for the robot connection.

## Basic Use

1. Open the Nova web application.
2. Select **Connect** and choose the Nova S Pro.
3. Select a difficulty level.
4. Choose a session mode:
   - Reps
   - Time
   - Music
5. Select a drill.
6. The countdown begins and the robot starts the selected drill.

The starting countdown can also be skipped by tapping it.

## Session Modes

### Reps

Runs the selected drill for the specified number of repetitions.

### Time

Runs the selected drill until the specified time expires.

### Music

Runs the selected drill for the duration of a selected music playlist.

To use Music mode:

1. Select **Music**.
2. Tap **Choose Music**.
3. Select one or more MP3, WAV, or other browser-supported audio files.
4. Select a drill.
5. Music begins with the countdown.
6. The robot continues running while the playlist plays.
7. When the final track ends, the robot stops automatically.

The same selected playlist can be reused for succeeding drills without selecting the files again.

During the session, Nova displays:

- Current track
- Track number
- Elapsed playlist time
- Remaining playlist time
- Total playlist duration

Pausing the drill also pauses the music. Resuming continues both.

## Features

- Web Bluetooth control of the Nova S Pro
- Customizable drills and ball sequences
- Repetition-based sessions
- Timed sessions
- Music playlist-based sessions
- Pause, resume, and stop controls
- Adjustable pause between drill repetitions
- Drill randomization
- Ball scatter control
- Multiple ball variants
- Custom drill banks A, B, and C
- CSV import and export
- Drill sharing
- Drag-and-drop drill management
- Local browser storage
- Training statistics
- Multiple themes including dark mode
- Countdown skip

## Drill Editor

Long-press a drill to open the editor.

The editor supports:

- Adding and removing balls
- Editing speed, spin, height, drop point, BPM, and repetitions
- Reordering balls
- Renaming drills
- Testing individual balls
- Testing complete drills
- Saving modified drills
- Creating copies using Save As
- Deleting custom drills

## Credits & Support

Additional informations: [Wiki](https://github.com/olanga/nova/wiki/General-information)

Spinsight measurements: [Wiki](https://github.com/olanga/nova/wiki/Spinsight-measurements-with-Nova-S-Pro)

Based on findings by [smee](https://github.com/smee/nova-s-custom-drills) and plunder.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E1E21PUFEQ)


