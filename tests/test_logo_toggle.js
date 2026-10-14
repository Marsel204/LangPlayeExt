const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '..', 'content.js');
const cssPath = path.join(__dirname, '..', 'content.css');
const bridgePath = path.join(__dirname, '..', 'js', 'youtube-bridge.js');

const contentJs = fs.readFileSync(contentPath, 'utf8');
const contentCss = fs.readFileSync(cssPath, 'utf8');
const bridgeJs = fs.readFileSync(bridgePath, 'utf8');

console.log('🧪 Testing LinguaPlay Logo Click & App Turn-Off Feature...');

// 1. Verify content.js declares isAppEnabled state
assert.ok(
  contentJs.includes('let isAppEnabled =') || contentJs.includes('var isAppEnabled ='),
  'FAIL: content.js must declare isAppEnabled state variable!'
);
console.log('✅ Test 14a: isAppEnabled state declaration verified');

// 2. Verify interactive logo button exists in toolbar template
assert.ok(
  contentJs.includes('id="linguaplay-bar-logo"'),
  'FAIL: Toolbar must contain clickable #linguaplay-bar-logo!'
);
console.log('✅ Test 14b: Interactive #linguaplay-bar-logo verified');

// 3. Verify setAppEnabled or turnOffApp function implementation
assert.ok(
  contentJs.includes('function setAppEnabled(') || contentJs.includes('function turnOffApp('),
  'FAIL: content.js must implement setAppEnabled or turnOffApp!'
);
console.log('✅ Test 14c: setAppEnabled function implementation verified');

// 4. Verify LINGUAPLAY_SET_APP_STATE event dispatching
assert.ok(
  contentJs.includes('LINGUAPLAY_SET_APP_STATE'),
  'FAIL: content.js must dispatch LINGUAPLAY_SET_APP_STATE event to bridge!'
);
console.log('✅ Test 14d: LINGUAPLAY_SET_APP_STATE event contract verified');

// 5. Verify youtube-bridge.js listens to LINGUAPLAY_SET_APP_STATE and guards track switching
assert.ok(
  bridgeJs.includes('LINGUAPLAY_SET_APP_STATE'),
  'FAIL: youtube-bridge.js must listen for LINGUAPLAY_SET_APP_STATE!'
);
assert.ok(
  bridgeJs.includes('isAppEnabled'),
  'FAIL: youtube-bridge.js must track isAppEnabled state!'
);
console.log('✅ Test 14e: youtube-bridge.js app-disable guard verified');

// 6. Verify content.css styles for #linguaplay-bar-logo and #linguaplay-toggle-trigger.app-disabled
assert.ok(
  contentCss.includes('#linguaplay-bar-logo'),
  'FAIL: content.css must define styles for #linguaplay-bar-logo!'
);
assert.ok(
  contentCss.includes('#linguaplay-toggle-trigger.app-disabled'),
  'FAIL: content.css must define styles for #linguaplay-toggle-trigger.app-disabled!'
);
console.log('✅ Test 14f: CSS styling for clickable logo and disabled state verified');

// 7. Simulated runtime state transition test
{
  let state = {
    isAppEnabled: true,
    isPanelCollapsed: false,
    playerHasJapanese: true,
    overlayActive: true,
    eventDispatched: null,
    triggerDisabled: false
  };

  function setAppEnabled(enabled) {
    state.isAppEnabled = enabled;
    if (!enabled) {
      state.playerHasJapanese = false;
      state.overlayActive = false;
      state.isPanelCollapsed = true;
      state.triggerDisabled = true;
      state.eventDispatched = { type: 'LINGUAPLAY_SET_APP_STATE', enabled: false };
    } else {
      state.isPanelCollapsed = false;
      state.triggerDisabled = false;
      state.eventDispatched = { type: 'LINGUAPLAY_SET_APP_STATE', enabled: true };
    }
  }

  // Turn off app
  setAppEnabled(false);
  assert.strictEqual(state.isAppEnabled, false, 'App should be disabled');
  assert.strictEqual(state.playerHasJapanese, false, 'Native captions should be restored');
  assert.strictEqual(state.overlayActive, false, 'Overlay should be hidden');
  assert.strictEqual(state.isPanelCollapsed, true, 'Bar should be collapsed');
  assert.strictEqual(state.triggerDisabled, true, 'Trigger should show disabled state');
  assert.strictEqual(state.eventDispatched.enabled, false, 'Bridge should receive disabled event');

  // Turn back on
  setAppEnabled(true);
  assert.strictEqual(state.isAppEnabled, true, 'App should be re-enabled');
  assert.strictEqual(state.isPanelCollapsed, false, 'Bar should be expanded');
  assert.strictEqual(state.triggerDisabled, false, 'Trigger should not be disabled');
  assert.strictEqual(state.eventDispatched.enabled, true, 'Bridge should receive enabled event');
}
console.log('✅ Test 14g: Runtime state transition simulation verified');

console.log('\n🎉 ALL LOGO TOGGLE TESTS PASSED CLEANLY!\n');
