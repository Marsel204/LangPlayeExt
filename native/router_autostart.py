"""Manage the fixed 9router.service in the current Linux user's session."""
import fcntl
import os
from pathlib import Path
import shutil
import socket
import subprocess

UNIT = '9router.service'


def command(args, *, check=True, env=None):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=20, env=env)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError('Could not run systemctl or the 9Router runtime. Use a Linux desktop with a systemd user session.') from error
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip()[:2000] or f'{args[0]} failed')
    return result


def startup_status():
    result = command(['systemctl', '--user', 'show', UNIT, '--property=LoadState,UnitFileState,ActiveState'], check=False)
    properties = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if 'LoadState' not in properties:
        raise RuntimeError(result.stderr.strip()[:2000] or 'Could not read the systemd user service status')
    return {'success': True, 'installed': properties['LoadState'] != 'not-found',
            'enabled': properties.get('UnitFileState') == 'enabled',
            'active': properties.get('ActiveState') == 'active'}


def port_in_use():
    with socket.socket() as probe:
        probe.settimeout(0.5)
        return probe.connect_ex(('127.0.0.1', 20128)) == 0


def quoted(value, *, executable=False):
    value = str(value)
    if any(char in value for char in '\n\r\0'):
        raise RuntimeError('The 9Router installation path contains an unsupported character')
    value = value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%')
    if executable:
        value = value.replace('$', '$$')
    return '"' + value + '"'


def installation(runtime_path):
    search_path = runtime_path or os.environ.get('PATH', os.defpath)
    search_path += os.pathsep + str(Path.home() / '.local/bin')
    node = shutil.which('node', path=search_path)
    if not node:
        raise RuntimeError('Install Node.js and 9Router first, then run the Linux setup again.')
    env = {**os.environ, 'PATH': search_path}
    node = command([node, '-p', 'process.execPath'], env=env).stdout.strip()
    if not Path(node).is_file():
        raise RuntimeError('Node.js could not resolve its executable. Run the Linux setup from your usual terminal.')
    candidates = []
    launcher = shutil.which('9router', path=search_path)
    if launcher:
        candidates.append(Path(launcher).resolve().parent / 'app')
    candidates += [Path.home() / '.local/lib/node_modules/9router/app',
                   Path('/usr/local/lib/node_modules/9router/app'), Path('/usr/lib/node_modules/9router/app')]
    for app in candidates:
        if (app / 'custom-server.js').is_file():
            return node, app, search_path
    npm = shutil.which('npm', path=search_path)
    if npm:
        root = command([npm, 'root', '-g'], env=env).stdout.strip()
        app = Path(root) / '9router/app'
        if (app / 'custom-server.js').is_file():
            return node, app, search_path
    raise RuntimeError('Install 9Router first with npm install -g 9router, then enable login startup again.')


def service_text(node, app, runtime_path):
    runtime_path = str(Path(node).parent) + os.pathsep + runtime_path
    return f'''# Created by LinguaPlay's Linux startup setup.
[Unit]
Description=9Router AI gateway
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=exec
WorkingDirectory={str(app).replace('%', '%%')}
Environment={quoted('PATH=' + runtime_path)}
Environment="DATA_DIR=%h/.9router"
Environment={quoted('NODE_PATH=' + str(Path.home() / '.9router/runtime/node_modules') + ':' + str(app / 'node_modules'))}
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=20128
ExecStart={quoted(node, executable=True)} --dns-result-order=ipv4first --max-old-space-size=6144 {quoted(app / 'custom-server.js', executable=True)}
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=default.target
'''


def enable_autostart(runtime_path=None):
    state = Path.home() / '.local/state/linguaplay'
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / 'router-startup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        status = startup_status()
        unit = Path.home() / '.config/systemd/user' / UNIT
        if not status['installed'] and not unit.exists():
            node, app, runtime_path = installation(runtime_path)
            unit.parent.mkdir(parents=True, exist_ok=True)
            unit.write_text(service_text(node, app, runtime_path))
        # Existing services belong to the user: enable them without rewriting.
        command(['systemctl', '--user', 'daemon-reload'])
        command(['systemctl', '--user', 'enable', UNIT])
        status = startup_status()
        if not status['active'] and port_in_use():
            return {**status, 'portBusy': True}
        command(['systemctl', '--user', 'start', UNIT])
        status = startup_status()
        if not status['enabled'] or not status['active']:
            raise RuntimeError('9Router did not stay running. Check journalctl --user -u 9router -n 50 for details.')
        return status


def disable_autostart():
    # Turning off login startup leaves a currently running AI session alone.
    command(['systemctl', '--user', 'disable', UNIT])
    return startup_status()


if __name__ == '__main__':
    import argparse
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'enable', 'disable'])
    args = parser.parse_args()
    try:
        result = {'status': startup_status, 'enable': enable_autostart, 'disable': disable_autostart}[args.action]()
    except Exception as error:
        parser.exit(1, str(error) + '\n')
    print(json.dumps(result))
