"""9Router startup tests use a temporary home and fake system commands."""
import importlib.util
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('router_autostart', ROOT / 'native/router_autostart.py')
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
REAL_RUN = subprocess.run
SYSTEMD_ANALYZE = shutil.which('systemd-analyze')


class RouterStartupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.bin = self.home / '.local/bin'
        self.bin.mkdir(parents=True)
        for name in ['node', '9router']:
            target = self.bin / name
            target.write_text('#!/bin/sh\n')
            target.chmod(0o700)
        app = self.home / '.local/lib/node_modules/9router/app'
        app.mkdir(parents=True)
        (app / 'custom-server.js').write_text('// fixture')
        self.calls = []
        self.enabled = False
        self.active = False
        self.unit = self.home / '.config/systemd/user/9router.service'
        self.patches = [patch.object(router.Path, 'home', return_value=self.home),
                        patch.dict(os.environ, {'PATH': str(self.bin)}),
                        patch.object(router.subprocess, 'run', side_effect=self.fake_run),
                        patch.object(router, 'port_in_use', return_value=False)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def fake_run(self, command, **kwargs):
        self.calls.append(command)
        output = ''
        if command[0] == str(self.bin / 'node'):
            output = str(self.bin / 'node')
        elif 'show' in command:
            output = f'LoadState={"loaded" if self.unit.exists() else "not-found"}\nUnitFileState={"enabled" if self.enabled else "disabled"}\nActiveState={"active" if self.active else "inactive"}\n'
        elif 'enable' in command:
            self.enabled = True
        elif 'start' in command:
            self.active = True
        elif 'disable' in command:
            self.enabled = False
        return subprocess.CompletedProcess(command, 0, output, '')

    def test_enable_installs_local_service_and_starts_it(self):
        result = router.enable_autostart()
        self.assertTrue(result['enabled'])
        self.assertTrue(result['active'])
        content = self.unit.read_text()
        self.assertIn('WantedBy=default.target', content)
        self.assertIn('HOSTNAME=127.0.0.1', content)
        self.assertIn('Restart=always', content)
        self.assertIn(str(self.home / '.local/lib/node_modules/9router/app/custom-server.js'), content)
        self.assertIn('NODE_PATH=', content)
        self.assertIn(['systemctl', '--user', 'daemon-reload'], self.calls)

    @unittest.skipUnless(SYSTEMD_ANALYZE, 'systemd-analyze is not installed')
    def test_generated_service_passes_systemds_own_validator(self):
        router.enable_autostart()
        result = REAL_RUN([SYSTEMD_ANALYZE, '--user', 'verify', str(self.unit)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_existing_service_is_preserved_and_reused(self):
        self.unit.parent.mkdir(parents=True)
        self.unit.write_text('# An existing user-managed router service\n')
        result = router.enable_autostart()
        self.assertTrue(result['active'])
        self.assertEqual(self.unit.read_text(), '# An existing user-managed router service\n')

    def test_manual_router_is_not_killed_or_started_twice(self):
        with patch.object(router, 'port_in_use', return_value=True):
            result = router.enable_autostart()
        self.assertTrue(result['enabled'])
        self.assertFalse(result['active'])
        self.assertTrue(result['portBusy'])
        self.assertFalse(any('start' in call for call in self.calls))

    def test_status_is_read_only_and_disable_retains_unit(self):
        result = router.startup_status()
        self.assertFalse(result['installed'])
        self.assertFalse(self.unit.exists())
        router.enable_autostart()
        result = router.disable_autostart()
        self.assertFalse(result['enabled'])
        self.assertTrue(result['active'])
        self.assertTrue(self.unit.exists())

    def test_missing_router_does_not_create_a_broken_service(self):
        (self.home / '.local/lib/node_modules/9router/app/custom-server.js').unlink()
        with self.assertRaisesRegex(RuntimeError, 'Install 9Router'):
            router.enable_autostart()
        self.assertFalse(self.unit.exists())

    def test_command_failures_and_timeouts_are_actionable(self):
        for error in [subprocess.TimeoutExpired(['systemctl'], 15), OSError('systemctl unavailable')]:
            with patch.object(router.subprocess, 'run', side_effect=error):
                with self.assertRaisesRegex(RuntimeError, 'systemd|systemctl'):
                    router.startup_status()


if __name__ == '__main__':
    unittest.main()
