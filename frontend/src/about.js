import { t, localizeMessage } from './i18n.js';
// The About dialog: build details, license texts and the reading pane isolation self-check.
export function createAbout({ icon, call, inspect, beforeShow, onError }) {
  const $ = s => dialog.querySelector(s);
  const dialog = document.createElement('dialog');
  dialog.className = 'about-dialog';
  dialog.innerHTML = `<div class="about-heading"><img src="${icon}" alt=""><div><h2>墨阅 MoRead</h2><p data-i18n="app.producer"></p></div><span class="grow"></span><button id="about-updates" data-i18n="about.updates" data-i18n-title="about.updatesHint"></button><button id="about-close" data-i18n="about.close"></button></div><dl id="build-details"></dl><details class="advanced-diagnostics"><summary data-i18n="about.diagnostics"></summary><pre id="open-timing"></pre><div class="isolation-check"><button id="check-isolation" data-i18n="about.check"></button><span id="isolation-result"></span></div></details><div class="about-tabs"><button data-license="own" class="active" data-i18n="about.own"></button><button data-license="thirdParty" data-i18n="about.thirdParty"></button><button data-license="brand" data-i18n="about.brand"></button></div><textarea id="license-text" readonly data-i18n-label="about.licenseLabel" spellcheck="false"></textarea>`;
  document.body.append(dialog);
  let licenseTexts = {},
    isolationBusy = false;
  $('#about-close').onclick = () => dialog.close();
  $('#about-updates').onclick = () => call('OpenReleases').catch(onError);
  dialog.querySelectorAll('[data-license]').forEach(
    b =>
      (b.onclick = () => {
        dialog.querySelectorAll('[data-license]').forEach(x => x.classList.toggle('active', x === b));
        $('#license-text').value = licenseTexts[b.dataset.license] || '';
        $('#license-text').scrollTop = 0;
      }),
  );
  $('#check-isolation').onclick = async () => {
    if (isolationBusy) return;
    isolationBusy = true;
    const control = $('#check-isolation'),
      target = $('#isolation-result');
    control.disabled = true;
    target.textContent = t('about.checking');
    try {
      const before = await call('AboutInfo');
      const result = await inspect();
      const first = await call('AboutInfo');
      await new Promise(resolve => setTimeout(resolve, 500));
      const after = await call('AboutInfo');
      if (result.cancelled) throw new Error(t('about.isoRetry'));
      const extra = after.calls - before.calls - 2;
      if (
        !result.parentAccessDenied ||
        (result.nativeProbeAttempted && (first.calls - before.calls !== 1 || extra !== 0)) ||
        (!result.nativeProbeAttempted && result.goVisible)
      )
        throw new Error(t('about.isoFail'));
      target.textContent = result.nativeProbeAttempted
        ? t('about.isoPass', { n: extra })
        : t('about.isoPartial');
    } catch (e) {
      target.textContent = localizeMessage(e.message || e);
    } finally {
      isolationBusy = false;
      control.disabled = false;
    }
  };
  async function show() {
    try {
      const [info, texts] = await Promise.all([call('AboutInfo'), call('LicenseTexts')]);
      licenseTexts = texts;
      $('#open-timing').textContent = JSON.stringify(info.openTiming, null, 2);
      $('#build-details').replaceChildren();
      for (const [label, value] of [
        ['about.version', info.version],
        ['about.platform', info.platform],
        ['about.built', info.builtAt],
        ['about.commit', info.commit],
        ['about.runtime', info.goVersion + ' · Wails ' + info.wailsVersion],
        // Shown only when the settings file could not be read or saved.
        ...(info.settingsError ? [['about.settings', info.settingsError]] : []),
      ]) {
        const dt = document.createElement('dt'),
          dd = document.createElement('dd');
        dt.textContent = t(label);
        dd.textContent = value;
        $('#build-details').append(dt, dd);
      }
      $('#license-text').value = texts.own;
      dialog
        .querySelectorAll('[data-license]')
        .forEach(b => b.classList.toggle('active', b.dataset.license === 'own'));
      beforeShow();
      dialog.showModal();
    } catch (e) {
      onError(e);
    }
  }
  return { show };
}
