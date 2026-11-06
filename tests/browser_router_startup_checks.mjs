// Settings interactions and real setup download; native mutations are fixtures.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function checkRouterStartup({root, profile, evaluate, rpc, sessionId}) {
  const downloads = path.join(profile, 'Downloads');
  const captures = path.join(root, '.impeccable/review/router-startup');
  await mkdir(downloads, {recursive: true});
  await mkdir(captures, {recursive: true});
  async function until(expression) {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Startup Settings did not settle: ' + expression);
  }
  await rpc('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: downloads});
  await evaluate(`(async () => {
    window.startupOriginalSend = chrome.runtime.sendMessage.bind(chrome.runtime);
    window.startupOriginalUrl = document.getElementById('9router-url').value;
    window.startupOriginalSaved = (await chrome.storage.local.get('linguaplay_9router_url')).linguaplay_9router_url;
    window.startupReply = {success:false,setupRequired:true,error:'Install or update the Linux helper using Download Linux setup, then check startup again.'};
    window.startupActions = [];
    chrome.runtime.sendMessage = (message, callback) => {
      if (!['GET_9ROUTER_STARTUP','ENABLE_9ROUTER_STARTUP','DISABLE_9ROUTER_STARTUP'].includes(message.action)) return window.startupOriginalSend(message, callback);
      window.startupActions.push(message.action);
      if (message.action === 'GET_9ROUTER_STARTUP') callback(window.startupReply);
      else window.finishStartupAction = () => callback(window.startupReply);
    };
    document.getElementById('9router-url').value = 'http://127.0.0.1:20128/v1';
    document.getElementById('9router-url').dispatchEvent(new Event('input'));
    await chrome.storage.local.set({linguaplay_9router_url:'http://127.0.0.1:20128/v1'});
  })()`);
  try {
    await until('!document.getElementById("check-router-startup").disabled');
    await evaluate('document.getElementById("check-router-startup").click()');
    await until('!document.getElementById("download-router-setup").hidden');
    assert.equal(await evaluate('document.getElementById("enable-router-startup").disabled'), true);
    await evaluate('document.getElementById("download-router-setup").click()');
    await until('!document.getElementById("router-setup-instruction").hidden');
    let script;
    for (let i = 0; i < 60; i++) {
      script = await readFile(path.join(downloads, 'langplay-9router-setup.sh'), 'utf8').catch(() => '');
      if (script) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(script.startsWith('#!/usr/bin/env bash'), 'Settings must download the complete shell script');
    const payload = JSON.parse(Buffer.from(script.match(/base64\.b64decode\('([^']+)'\)/)[1], 'base64').toString('utf8'));
    assert.equal(payload.extensionId, await evaluate('chrome.runtime.id'));
    assert.deepEqual(Object.keys(payload.files).sort(), ['install_host.py', 'native_host.py', 'router_autostart.py']);
    for (const theme of ['light', 'dark']) {
      await rpc('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: theme}]}, sessionId);
      for (const width of [1440, 420]) {
        await rpc('Emulation.setDeviceMetricsOverride', {width, height: 1000, deviceScaleFactor: 1, mobile: false}, sessionId);
        await evaluate('document.documentElement.style.scrollBehavior="auto";document.getElementById("router-startup").scrollIntoView({behavior:"instant",block:"start"})');
        await evaluate('document.getElementById("save-toast").classList.remove("show");new Promise(resolve=>setTimeout(resolve,200))');
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Startup controls must fit at ' + width);
        assert.equal(await evaluate('(()=>{const r=document.getElementById("router-startup").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'), true);
        const {data} = await rpc('Page.captureScreenshot', {format: 'png'}, sessionId);
        await writeFile(path.join(captures, `${width}-${theme}.png`), Buffer.from(data, 'base64'));
      }
    }
    await rpc('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    await rpc('Emulation.setEmulatedMedia', {features: []}, sessionId);
    await evaluate('window.startupReply={success:true,installed:true,enabled:false,active:false};document.getElementById("check-router-startup").click()');
    await until('!document.getElementById("enable-router-startup").disabled');
    await evaluate('document.getElementById("enable-router-startup").click()');
    assert.equal(await evaluate('document.getElementById("enable-router-startup").disabled && document.getElementById("check-router-startup").disabled'), true);
    await evaluate('window.startupReply={success:true,installed:true,enabled:true,active:true};window.finishStartupAction()');
    await until('document.getElementById("router-startup-status").textContent.includes("starts at login and is running")');
    assert.equal(await evaluate('document.getElementById("disable-router-startup").hidden'), false);
    await evaluate('document.getElementById("disable-router-startup").click();window.startupReply={success:true,installed:true,enabled:false,active:true};window.finishStartupAction()');
    await until('document.getElementById("router-startup-status").textContent.includes("startup is off")');
    assert.equal(await evaluate('window.startupActions.filter(action=>action==="ENABLE_9ROUTER_STARTUP").length'), 1);
    assert.equal(await evaluate('window.startupActions.filter(action=>action==="DISABLE_9ROUTER_STARTUP").length'), 1);
    await evaluate('document.getElementById("9router-url").value="https://router.example/v1";document.getElementById("9router-url").dispatchEvent(new Event("input"))');
    assert.equal(await evaluate('document.getElementById("enable-router-startup").disabled && document.getElementById("check-router-startup").disabled'), true);
    return {setupDownload: true,extensionIdentity: true,enableDisable: true,busyState: true,localOnly: true,responsive: true,captures};
  } finally {
    await evaluate(`(async()=>{
      chrome.runtime.sendMessage=window.startupOriginalSend;
      document.getElementById('9router-url').value=window.startupOriginalUrl;
      document.getElementById('9router-url').dispatchEvent(new Event('input'));
      if(window.startupOriginalSaved) await chrome.storage.local.set({linguaplay_9router_url:window.startupOriginalSaved});
      else await chrome.storage.local.remove('linguaplay_9router_url');
    })()`);
    await rpc('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    await rpc('Emulation.setEmulatedMedia', {features: []}, sessionId);
    await rpc('Browser.setDownloadBehavior', {behavior: 'default'});
  }
}
