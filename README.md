# Nova S Pro Drill Control PLUS

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
   - MSYNC
5. Select a drill.
6. The countdown begins and the robot starts the selected drill.

The starting countdown can also be skipped by tapping it.

## Session Modes

### Reps

Runs the selected drill for the specified number of repetitions.

### Time

Runs the selected drill until the specified time expires.

### Music

Runs the selected drill for the duration of either a saved playlist or a
temporary Quick Music selection. Music mode does not use the drill-pause
setting.

To use Music mode:

1. Open the menu and select **Manage Playlists** to create a saved playlist
   and add audio files. **Stored Tracks** lists saved audio and provides the
   permanent-delete control.
2. Select **Music**.
3. In the left panel, choose a saved playlist and tap **Use Saved Playlist**.
   In **Quick Music**, choose one existing **Stored Audio** track or select one
   or more files from phone storage. Phone files remain temporary unless
   **Save chosen phone files to Nova Library** is checked. Saving uses the audio
   hash to reuse an existing Track instead of creating a duplicate; it does not
   automatically add the Track to a playlist.
4. Select a drill. Music and the robot begin after the countdown.
5. The robot stops automatically when the final track ends.

The selected music can be reused for succeeding drills without selecting it
again.

During the session, Nova displays:

- Current track
- Track number
- Elapsed playlist time
- Remaining playlist time
- Total playlist duration

Use **Update Statistics** in the menu to set the cumulative Balls and Drills
totals from which future activity will continue counting. Values must be whole,
non-negative numbers and remain stored on the device.

### MSYNC

MSYNC runs externally authored `.ini` cue files against audio saved through
Playlist Manager. Music mode ignores MSYNC attachments; synchronization is
used only in the MSYNC tab.

To use MSYNC mode:

1. Save the intended audio in **Manage Playlists**, then select **MSYNC**.
2. Choose the stored track. Use **Copy Audio Hash** when authoring the external
   `.ini` file.
3. Tap **Choose MSYNC .ini File** and select the matching file. Validation errors
   must be corrected; warnings require explicit acceptance.
   `DRILL` and `INLINE` cues repeat by default. Add `;ONCE` to either activation
   when it should run exactly one complete cycle and then leave the robot idle.
4. Adjust **Robot Lead** if needed. The default `1.300` seconds compensates for
   measured command-to-ball launch delay without changing the music timeline.
5. Use **Start Simulation** to verify the cues without robot commands.
6. Connect the robot, clear the table, and use **Start Live Robot** only after
   the simulation is correct.

The external file remains authoritative. Editing Robot Lead in the tab changes
only the current run and does not rewrite the attached file. See
[`MSYNC_FORMAT_V1.md`](MSYNC_FORMAT_V1.md) for the format and
[`MSYNC_V1_EXAMPLE.ini`](MSYNC_V1_EXAMPLE.ini) for a working example.
Validation behavior is documented in
[`MSYNC_VALIDATION_V1.md`](MSYNC_VALIDATION_V1.md).

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


[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/J4U0265K1Y)


