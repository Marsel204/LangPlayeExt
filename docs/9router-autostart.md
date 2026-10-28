# Start 9Router automatically

9Router must be running for LinguaPlay's AI features. Configure startup once on each computer, then keep the same API URL and router key in the extension. The extension does not install or start 9Router itself.

## Use 9Router's tray startup

This is the simplest option on a desktop where 9Router's tray icon is available:

1. [Install and start 9Router](settings.md#install-and-start-9router).
2. Choose **Hide to Tray (Background)** in 9Router if that menu is shown.
3. Open the 9Router tray menu and select **Enable Auto-start**. It should change to **Auto-start Enabled**.
4. On your next login, open `http://127.0.0.1:20128/dashboard` and use **Test 9Router** in LinguaPlay Settings to confirm it started.

9Router provides startup entries for Windows, macOS, and Linux desktops; Linux tray support requires a graphical session. See its [tray menu](https://github.com/decolua/9router/blob/master/cli/src/cli/tray/tray.js) and [startup implementation](https://github.com/decolua/9router/blob/master/cli/src/cli/tray/autostart.js). If the tray is unavailable on a Linux desktop with systemd, use the service below.

Choose one startup method. If a service already manages 9Router, use that service's controls instead of enabling a second startup entry.

## Linux alternative: a systemd user service

This starts the installed server in the background at login and restarts it if it exits. It uses the Node executable and global npm installation found during setup. These instructions are for a local desktop router with the default `~/.9router` data directory and port `20128`.

### Install the service

1. Install 9Router globally with npm and start it once. Connect a provider and confirm **Test 9Router** works in LinguaPlay before changing startup.
2. Quit the manually started 9Router instance. If you enabled its tray **Auto-start**, disable that first.
3. Run this block in Bash. It creates `~/.config/systemd/user/9router.service`; it stops with a message if that file already exists.

   ```bash
   (
     set -eu
     router_node="$(node -p 'process.execPath')"
     router_app="$(npm root -g)/9router/app"
     router_node_dir="$(dirname "$router_node")"
     router_unit="$HOME/.config/systemd/user/9router.service"

     if [ ! -f "$router_app/custom-server.js" ]; then
       printf '%s\n' '9Router server not found. Install it with npm install -g 9router first.' >&2
       exit 1
     fi
     if [ -e "$router_unit" ]; then
       printf '%s\n' 'A 9Router service already exists. Use the management commands below.' >&2
       exit 1
     fi

     mkdir -p "$HOME/.config/systemd/user"
     cat > "$router_unit" <<EOF
   [Unit]
   Description=9Router AI gateway
   After=network.target
   StartLimitIntervalSec=60
   StartLimitBurst=10

   [Service]
   Type=exec
   WorkingDirectory=$router_app
   Environment="PATH=$router_node_dir:%h/.local/bin:/usr/local/bin:/usr/bin:/bin"
   Environment="DATA_DIR=%h/.9router"
   Environment="NODE_PATH=%h/.9router/runtime/node_modules:$router_app/node_modules"
   Environment=NODE_ENV=production
   Environment=HOSTNAME=127.0.0.1
   Environment=PORT=20128
   ExecStart="$router_node" --dns-result-order=ipv4first --max-old-space-size=6144 "$router_app/custom-server.js"
   Restart=always
   RestartSec=5
   TimeoutStopSec=30

   [Install]
   WantedBy=default.target
   EOF

     systemd-analyze --user verify "$router_unit"
     systemctl --user daemon-reload
     systemctl --user enable --now 9router.service
   )
   ```

4. Check the service and dashboard:

   ```sh
   systemctl --user is-enabled 9router
   systemctl --user is-active 9router
   ```

   The results should be `enabled` and `active`. Open [the dashboard](http://127.0.0.1:20128/dashboard), then run **Test 9Router** in LinguaPlay. The local API base URL remains `http://127.0.0.1:20128/v1`.

This user service starts when your user session starts. It does not require a terminal window, a tray icon, or administrator privileges. The example binds to `127.0.0.1` for a browser on the same computer. The service's `NODE_PATH` includes 9Router's user runtime so optional dependencies such as `wreq-js` can load.

### Manage the service

| Task | Command |
| --- | --- |
| Check status | `systemctl --user status 9router` |
| Restart after changing the runtime or providers | `systemctl --user restart 9router` |
| Read recent server logs | `journalctl --user -u 9router -n 50 --no-pager` |
| Stop now and turn off login startup | `systemctl --user disable --now 9router` |
| Enable login startup again and start now | `systemctl --user enable --now 9router` |

If you move Node, switch Node version managers, or change the global npm prefix, update the paths in `9router.service`, then run `systemctl --user daemon-reload` and restart the service. After updating 9Router, confirm the bundled `custom-server.js` path still exists. Do not launch a second manual instance while the service is running.

The user-session startup target and restart policy follow [systemd's user-unit documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.special.html#Special%20User%20Units) and [service restart documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#Restart=). For connection errors or OpenCode runtime issues, return to [settings troubleshooting](settings.md#troubleshooting).
