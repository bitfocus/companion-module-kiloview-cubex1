# Kiloview CUBE X1

This module controls the Kiloview CUBE X1 NDI High Bandwidth + NDI|HX Distribution System using its HTTP API. It supports matrix routing of NDI input sources to outputs, carousel playlists, output locking and favorites, and panel templates.

## Configuration

- **Device IP / Host** — Enter the IP address or hostname of the CUBE X1
- **Protocol** — HTTP (port: 80) or HTTPS (port: 443)
- **Port** — Connection port (defaults to 80 for HTTP, 443 for HTTPS)
- **Username / Password** — Device login credentials. The CUBE X1 requires a valid login; session tokens (valid ~5 minutes) are refreshed automatically by the module
- **Enable Polling** — Enable polling for feedbacks and variables (recommended: enabled)
- **Polling Rates** — Configurable intervals for panel state and system info polling
- **Verbose Logging** — Enable debug-level logging for troubleshooting

## Actions

### Routing

- **Route: Set Input Source for Output** — Route a discovered NDI input source to an output (or disconnect it)
- **Route: Disconnect Output** — Remove the input source from an output
- **Route: Select Input on All Outputs** — Route an input to all outputs at once (outputs with an active playlist are skipped by the device)

### Playlists

- **Playlist: Set Playlist for Output** — Start a carousel playlist on an output with optional looping
- **Playlist: Stop Playlist on Output** — Stop the playlist on an output
- **Playlist: Set Playlist Looping for Output** — Enable, disable or toggle looping for the active playlist on an output

### Outputs

- **Output: Lock / Unlock Output** — Lock, unlock or toggle the lock state of an output
- **Output: Favorite / Unfavorite Output** — Set, clear or toggle the favorite state of an output

### Templates

- **Template: Switch to Template** — Switch the panel to another template, optionally saving the current one first
- **Template: Save Current Template** — Save the current panel state into the active template
- **Template: Save Template As** — Save the current panel state into a new template
- **Template: Add Template** — Create a new template
- **Template: Delete Template** — Delete a template
- **Template: Undo Last Operation** — Undo the last panel operation

### System

- **System: Refresh Device Status** — Manually trigger a status refresh
- **System: Reboot Device** — Reboot the CUBE X1

## Feedbacks

- **Routing: Output is Routed from Input** — Active when the selected input is routed to the selected output
- **Routing: Output has No Input Source** — Active when the selected output has neither an input source nor a playlist assigned
- **Output: Output is Locked** — Active when the selected output is locked
- **Output: Output is Favorite** — Active when the selected output is set as a favorite
- **Playlist: Output is Playing Playlist** — Active when the selected output is playing the selected playlist
- **Input: Input Source is Available/Unavailable** — Based on the availability of the selected input source
- **Template: Template is Active** — Active when the selected template is the panel's active template

## Variables

### Device

- **Serial Number / Firmware Version**
- **CPU Usage / CPU Temperature (°C/°F) / Memory Usage / Uptime**
- **Input / Output counts** — Including abnormal source counts

### Panel

- **Panel Name** and **Active Template Name**

### Per Output (output*N*...)

- Name, routed input name, locked, favorite, playlist name, resolution, connection count

### Per Input (input*N*...)

- Name, available, URL, resolution

## Presets

- **General** — Refresh, Reboot, Undo
- **Info** — Serial number, firmware, CPU, memory, uptime, counts, active template
- **Route to [Output]** — One category per output with a button per input source (with routing feedback) and a disconnect button
- **Output Lock** — Toggle lock buttons per output with lock feedback
- **Output Status** — Current routed source display per output
- **Input Status** — Availability indicator per input source
- **Templates** — Switch-to-template buttons with active-template feedback, save current template
- **Playlists on [Output]** — Start each playlist on an output with playlist feedback, stop playlist

Note: routing, output, input, template and playlist presets are generated dynamically from the device once the module is connected. Reload the presets list after the first successful connection.
