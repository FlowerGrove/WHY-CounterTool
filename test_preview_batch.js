const puppeteer = require('puppeteer');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto('http://localhost:8080/');
  await sleep(3000);

  // Step 0: Create test markers with proper structure
  console.log('=== Step 0: Create test markers ===');
  const createResult = await page.evaluate(() => {
    if (typeof markers === 'undefined') return { error: 'markers not found' };
    if (typeof markerTypes === 'undefined') return { error: 'markerTypes not found' };
    
    // Get the first few types
    const types = markerTypes.slice(0, 5);
    if (types.length === 0) return { error: 'no marker types defined' };
    
    let counter = 0;
    
    for (let i = 0; i < Math.min(5, types.length); i++) {
      const t = types[i];
      const marker = {
        id: 'test_' + Date.now() + '_' + i,
        docId: null,
        pageIndex: 0,
        vx: 100 + i * 50,
        vy: 200 + i * 30,
        number: 100 + i,
        color: '#ff6600',
        typeId: t.id,
        typeCode: t.code || '',
        typeName: t.name || '',
        typeFullName: t.fullName || '',
        typeAbbr: t.abbr || '',
        _globalOrder: ++counter,
        location: 'Test Location ' + (i + 1),
        range: '0~100',
        service: 'Test Service ' + (i + 1),
        product: 'Test Product ' + (i + 1),
        dataSheet: 'DS-' + (i + 1),
        pid: 'PID-' + (i + 1),
        note: 'Note ' + (i + 1)
      };
      
      if (typeof insertMarkerToArray === 'function') {
        insertMarkerToArray(marker);
      } else {
        markers.push(marker);
      }
    }
    
    return { success: true, markersCount: markers.length, typesUsed: types.map(t => t.name) };
  });
  console.log('Create result:', JSON.stringify(createResult));

  console.log('=== Step 1: Open preview panel ===');
  await page.evaluate(() => {
    const btn = document.getElementById('previewBtn');
    if (btn) btn.click();
  });
  await sleep(2000);

  console.log('=== Step 2: Screenshot ===');
  await page.screenshot({ path: 'screenshots/step2-preview-panel.png' });
  console.log('Saved step2-preview-panel.png');

  console.log('=== Step 3: Check preview functions ===');
  const step3 = await page.evaluate(() => {
    const pvKeys = Object.keys(window).filter(k => k.startsWith('pv'));
    return {
      pvRenderPreview: typeof pvRenderPreview !== 'undefined',
      pvSortedMarkers: typeof pvSortedMarkers !== 'undefined',
      pvSwitchToTab: typeof pvSwitchToTab !== 'undefined',
      markersCount: typeof markers !== 'undefined' ? markers.length : 'markers not defined',
      previewFunctions: pvKeys.join(', ')
    };
  });
  console.log('Step 3:', JSON.stringify(step3, null, 2));

  console.log('=== Step 4: Switch to Detail List ===');
  await page.evaluate(() => {
    if (typeof pvSwitchToTab === 'function') pvSwitchToTab('detailList');
  });
  await sleep(1500);

  console.log('=== Step 5: Check batch edit elements ===');
  const step5 = await page.evaluate(() => {
    const batchToolbar = document.getElementById('pvBatchToolbar');
    const checkboxes = document.querySelectorAll('.pv-check-row');
    return {
      batchToolbarExists: !!batchToolbar,
      checkboxCount: checkboxes.length,
      batchToolbarHTML: batchToolbar ? batchToolbar.outerHTML.substring(0, 600) : 'not found'
    };
  });
  console.log('Step 5:', JSON.stringify(step5, null, 2));

  console.log('=== Step 6: Select first checkbox ===');
  const step6 = await page.evaluate(() => {
    const cb = document.querySelector('.pv-check-row');
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, checked: cb.checked };
    }
    return { success: false, message: 'no checkbox found' };
  });
  console.log('Step 6:', JSON.stringify(step6));
  await sleep(500);

  console.log('=== Step 7: Check batch count ===');
  const step7 = await page.evaluate(() => {
    const countEl = document.getElementById('pvBatchCount');
    return {
      countText: countEl ? countEl.textContent : 'not found',
      countElExists: !!countEl
    };
  });
  console.log('Step 7:', JSON.stringify(step7));

  console.log('=== Step 8: Test batch field application ===');
  const step8 = await page.evaluate(() => {
    const fieldSel = document.getElementById('pvBatchField');
    const valueInput = document.getElementById('pvBatchValue');
    const applyBtn = document.getElementById('pvBatchApply');
    
    const result = {
      fieldSelectExists: !!fieldSel,
      valueInputExists: !!valueInput,
      applyBtnExists: !!applyBtn
    };
    
    if (fieldSel && valueInput && applyBtn) {
      fieldSel.value = 'location';
      fieldSel.dispatchEvent(new Event('change', { bubbles: true }));
      valueInput.value = 'Batch Test Location';
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));
      applyBtn.click();
      result.batchApplied = true;
    } else {
      result.batchApplied = false;
    }
    return result;
  });
  console.log('Step 8:', JSON.stringify(step8));
  await sleep(500);

  const step8b = await page.evaluate(() => {
    if (typeof markers !== 'undefined') {
      return {
        markersWithNewLocation: markers.filter(m => m.location === 'Batch Test Location').length,
        totalMarkers: markers.length
      };
    }
    return { error: 'markers not defined' };
  });
  console.log('Step 8b:', JSON.stringify(step8b));

  console.log('=== Step 9: Screenshot batch editing ===');
  await page.screenshot({ path: 'screenshots/step9-batch-editing.png' });
  console.log('Saved step9-batch-editing.png');

  console.log('=== Step 10: Test MTO tab ===');
  await page.evaluate(() => {
    if (typeof pvSwitchToTab === 'function') pvSwitchToTab('mto');
  });
  await sleep(1500);

  const mtoResult = await page.evaluate(() => ({
    pvRenderMTO: typeof pvRenderMTO !== 'undefined'
  }));
  console.log('MTO result:', JSON.stringify(mtoResult));

  await page.screenshot({ path: 'screenshots/step10-mto-tab.png' });
  console.log('Saved step10-mto-tab.png');

  console.log('\n=== BROWSER CONSOLE LOGS ===');
  consoleLogs.forEach(log => console.log(log));

  console.log('\n=== ALL TESTS COMPLETE ===');
  await browser.close();
})();