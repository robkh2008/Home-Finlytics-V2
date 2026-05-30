// ==================== js/receiptGenerator.js ====================

// Toggle live receipt preview visibility
function toggleReceiptPreview() {
    const preview = document.getElementById('receiptLivePreview');
    if (preview) {
        preview.classList.toggle('collapsed');
    }
}

// Toggle adjustment +/- button
function toggleAdj(btn, hiddenId) {
    const toggle = btn.closest('.adj-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('.adj-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = btn.dataset.val;
    if (typeof updateLiveReceiptPreview === 'function') updateLiveReceiptPreview();
}

// Auto-fetch previous electric reading when house is selected
function autoFetchPreviousElectricUnits(houseId) {
    if (!houseId) return;
    // Search through all transactions for the most recent electric reading for this house
    const allTxs = state.transactions || [];
    let lastReading = null;
    let lastDate = '';
    
    allTxs.forEach(tx => {
        if (tx.houseId !== houseId) return;
        if (!tx.notes) return;
        // Look for electric unit info in notes: "Current: X, Previous: Y" or "X units"
        const match = tx.notes.match(/Current[:\s]*(\d+)/i) || tx.notes.match(/Electric[:\s\d\w]*?(\d+)\s*units/i);
        if (match && tx.date > lastDate) {
            lastReading = parseInt(match[1]);
            lastDate = tx.date;
        }
    });
    
    // Also check house's stored lastElectricReading
    const house = (state.houses || []).find(h => h.id === houseId);
    if (house && house.lastElectricReading && (!lastDate || house.lastElectricDate > lastDate)) {
        lastReading = house.lastElectricReading;
    }
    
    if (lastReading) {
        const prevUnitEl = document.getElementById('previousUnit');
        if (prevUnitEl) prevUnitEl.value = lastReading;
        updateLiveReceiptPreview();
    }
}

// Get electric rate for the currently selected house (fallback to global)
function getCurrentHouseElectricRate() {
    const houseId = document.getElementById('receiptHouse')?.value;
    if (houseId) {
        const house = (state.houses || []).find(h => h.id === houseId);
        if (house && house.electricRate) return house.electricRate;
    }
    return 8; // default fallback
}

// Toggle a bill card open/closed
function toggleBillCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.toggle('active');
    updateLiveReceiptPreview();
}

// Live preview: updates the receipt preview panel in real-time as fields change
function updateLiveReceiptPreview() {
    const previewBody = document.getElementById('receiptLivePreviewBody');
    const liveTotal = document.getElementById('receiptLiveTotal');
    if (!previewBody) return;
    
    const houseId = document.getElementById('receiptHouse')?.value;
    const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
    const house = houses.find(h => h.id === houseId);
    const periodMonth = document.getElementById('receiptMonth')?.value;
    const issueDate = document.getElementById('receiptIssueDate')?.value;
    
    if (!house || !periodMonth) {
        previewBody.innerHTML = '<div class="rp-empty">🏠 Select a house and period to see preview</div>';
        if (liveTotal) liveTotal.innerHTML = 'Total: ₹0.00';
        return;
    }
    
    const rent = parseFloat(document.getElementById('receiptRent')?.value) || 0;
    let total = rent;
    let lines = [];
    
    if (rent > 0) lines.push({ label: '🏠 Rent', amount: rent });
    
    // Water bill
    if (document.getElementById('billCardWater')?.classList.contains('active')) {
        const w = parseFloat(document.getElementById('waterBillAmount')?.value) || 0;
        if (w > 0) { total += w; lines.push({ label: '💧 Water Bill', amount: w, badge: 'water' }); }
    }
    // Motor bill
    if (document.getElementById('billCardMotor')?.classList.contains('active')) {
        const m = parseFloat(document.getElementById('motorBillAmount')?.value) || 0;
        if (m > 0) { total += m; lines.push({ label: '🪣 Motor Bill', amount: m, badge: 'motor' }); }
    }
    // Electric bill
    if (document.getElementById('billCardElectric')?.classList.contains('active')) {
        const curr = parseFloat(document.getElementById('currentUnit')?.value) || 0;
        const prev = parseFloat(document.getElementById('previousUnit')?.value) || 0;
        const units = Math.max(0, curr - prev);
        const rate = getCurrentHouseElectricRate();
        const elec = units * rate;
        if (elec > 0) { total += elec; lines.push({ label: `⚡ Electric (${units} units × ₹${rate})`, amount: elec, badge: 'electric' }); }
    }
    // Adjustments
    const adj1 = parseFloat(document.getElementById('adj1Amount')?.value) || 0;
    if (adj1 > 0) {
        const sign = document.getElementById('adj1Type')?.value === 'add' ? 1 : -1;
        total += adj1 * sign;
        lines.push({ label: '🔧 Adjustment 1', amount: adj1 * sign, badge: 'adjust' });
    }
    const adj2 = parseFloat(document.getElementById('adj2Amount')?.value) || 0;
    if (adj2 > 0) {
        const sign = document.getElementById('adj2Type')?.value === 'add' ? 1 : -1;
        total += adj2 * sign;
        lines.push({ label: '🔧 Adjustment 2', amount: adj2 * sign, badge: 'adjust' });
    }
    
    total = Math.max(0, total);
    
    if (lines.length === 0) {
        previewBody.innerHTML = '<div class="rp-empty">📝 Enter amounts to see the breakdown</div>';
    } else {
        const safeIssueDate = issueDate ? (() => { const [y,m,d] = issueDate.split('-'); return new Date(y, m-1, d).toLocaleDateString(); })() : '—';
        previewBody.innerHTML = `
            <div style="margin-bottom:12px;font-size:0.75rem;color:#888;">
                <strong>${escapeHTML(house.houseNo ? 'House ' + house.houseNo : '')}</strong> · ${escapeHTML(house.tenant || '')} · ${escapeHTML(formatPeriodMonth(periodMonth))}
                ${issueDate ? ' · ' + safeIssueDate : ''}
            </div>
            ${lines.map(l => `
                <div class="rp-row">
                    <span>${l.label} ${l.badge ? '<span class="rp-badge rp-badge-' + l.badge + '">' + l.badge.toUpperCase() + '</span>' : ''}</span>
                    <span style="font-weight:600;color:${l.amount < 0 ? 'var(--danger)' : '#333'};">${l.amount < 0 ? '-' : ''}${formatCurrency(Math.abs(l.amount))}</span>
                </div>
            `).join('')}
            <div class="rp-total">
                <span>Total</span>
                <span>${formatCurrency(total)}</span>
            </div>
        `;
    }
    
    if (liveTotal) liveTotal.innerHTML = `Total: ${formatCurrency(total)}`;
    
    // Update electric calculation display
    const curr = parseFloat(document.getElementById('currentUnit')?.value) || 0;
    const prev = parseFloat(document.getElementById('previousUnit')?.value) || 0;
    const units = Math.max(0, curr - prev);
    const rate = getCurrentHouseElectricRate();
    const elecResult = document.getElementById('electricCalcResult');
    if (elecResult) elecResult.innerHTML = `Units: ${units} | ${formatCurrency(units * rate)}`;
}

function refreshReceiptForm() {
    const sel = document.getElementById('receiptHouse');
    if (sel) {
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        sel.innerHTML = '<option value="">Select House</option>' +
            houses.map(h => `<option value="${escapeHTML(h.id)}">House ${escapeHTML(h.houseNo)} - ${escapeHTML(h.tenant)} (Owner: ${escapeHTML(h.owner)})</option>`).join('');
    }
    
    const issueDate = document.getElementById('receiptIssueDate');
    if (issueDate) issueDate.value = new Date().toISOString().slice(0, 10);
    
    // Preload html2canvas
    if (typeof window.html2canvas === 'undefined') {
        loadHtml2Canvas().catch(() => {});
    }
    
    // Hide the generated receipt card
    const previewCard = document.getElementById('receiptPreviewCard');
    if (previewCard) {
        previewCard.classList.add('hidden');
        previewCard.style.display = '';
    }
    
    // Reset bill toggle cards to closed
    ['billCardWater', 'billCardMotor', 'billCardElectric'].forEach(id => {
        document.getElementById(id)?.classList.remove('active');
    });
    // Clear bill inputs
    ['waterBillAmount', 'motorBillAmount', 'currentUnit', 'previousUnit', 'adj1Amount', 'adj2Amount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const rateLabel = document.getElementById('electricRateLabel');
    if (rateLabel) rateLabel.textContent = (state.currency || '₹') + getCurrentHouseElectricRate();
    
    // Reset adj toggles to +
    document.querySelectorAll('.adj-toggle-btn[data-val="add"]').forEach(b => b.classList.add('active'));
    document.querySelectorAll('.adj-toggle-btn[data-val="deduct"]').forEach(b => b.classList.remove('active'));
    const adj1Type = document.getElementById('adj1Type');
    const adj2Type = document.getElementById('adj2Type');
    if (adj1Type) adj1Type.value = 'add';
    if (adj2Type) adj2Type.value = 'add';
    
    // Update live preview
    updateLiveReceiptPreview();
}

function generateReceipt() {
    try {
        const houseId = document.getElementById('receiptHouse').value;
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        const house = houses.find(h => h.id === houseId);
        if (!house) {
            showToast('Please select a house', 'exclamation-triangle');
            return;
        }

        const periodMonth = document.getElementById('receiptMonth').value;
        if (!periodMonth) {
            showToast('Please select the rental period', 'exclamation-triangle');
            return;
        }

        const issueDate = document.getElementById('receiptIssueDate')?.value;
        if (!issueDate) {
            showToast('Please select the issue date', 'exclamation-triangle');
            return;
        }

        const paymentMode = document.getElementById('receiptPaymentMode')?.value || 'cash';
        const receiptNo = generateReceiptNumber(issueDate);
        const payerName = house.tenant;

        // --- Calculations using bill toggle cards ---
        const rent = parseFloat(document.getElementById('receiptRent').value) || 0;
        let total = rent;
        let details = `Rent: ${formatCurrency(rent)}\n`;

        if (document.getElementById('billCardWater')?.classList.contains('active')) {
            const w = parseFloat(document.getElementById('waterBillAmount')?.value) || 0;
            total += w;
            details += `Water Bill: ${formatCurrency(w)}\n`;
        }
        if (document.getElementById('billCardMotor')?.classList.contains('active')) {
            const m = parseFloat(document.getElementById('motorBillAmount')?.value) || 0;
            total += m;
            details += `Motor Bill: ${formatCurrency(m)}\n`;
        }
        if (document.getElementById('billCardElectric')?.classList.contains('active')) {
            const curr = parseFloat(document.getElementById('currentUnit')?.value) || 0;
            const prev = parseFloat(document.getElementById('previousUnit')?.value) || 0;
            const units = Math.max(0, curr - prev);
            const rate = getCurrentHouseElectricRate();
            const elec = units * rate;
            total += elec;
            details += `Electric Bill: ${units} units × ${state.currency || '₹'}${rate} = ${formatCurrency(elec)}\n`;
        }
        
        const adj1 = parseFloat(document.getElementById('adj1Amount')?.value) || 0;
        if (adj1 > 0) {
            const sign = document.getElementById('adj1Type')?.value === 'add' ? '+' : '-';
            total += (document.getElementById('adj1Type')?.value === 'add' ? adj1 : -adj1);
            details += `Adjustment 1 (${sign}): ${formatCurrency(adj1)} - ${escapeHTML(document.getElementById('adj1Comment')?.value || '')}\n`;
        }
        
        const adj2 = parseFloat(document.getElementById('adj2Amount')?.value) || 0;
        if (adj2 > 0) {
            const sign = document.getElementById('adj2Type')?.value === 'add' ? '+' : '-';
            total += (document.getElementById('adj2Type')?.value === 'add' ? adj2 : -adj2);
            details += `Adjustment 2 (${sign}): ${formatCurrency(adj2)} - ${escapeHTML(document.getElementById('adj2Comment')?.value || '')}\n`;
        }
        total = Math.max(0, total);
        
        const [iYear, iMonth, iDay] = issueDate.split('-');
        const safeIssueDate = new Date(iYear, iMonth - 1, iDay).toLocaleDateString();

        // --- Build receipt HTML ---
        const paper = document.getElementById('receiptPaper');
        paper.innerHTML = `
            <div class="receipt-header" style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #ccc; padding-bottom: 12px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="/images/logo.svg" alt="Home Finlytics Logo" width="55" height="55" style="border-radius:12px;">
                    <div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em;">Home Finlytics</h2>
                        <small style="color: #666; font-size: 0.85rem;">Property Management</small>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h1 style="margin: 0; font-size: 1.15rem; color: #333; text-transform: uppercase; letter-spacing: 1px;">Rent Receipt</h1>
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.95rem; margin-bottom:14px; background: #f9f9f9; padding: 10px; border-radius: 6px; border: 1px solid #eee; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                <span>Receipt No: <strong>${escapeHTML(receiptNo)}</strong></span>
                <span>Date: <strong>${safeIssueDate}</strong></span>
            </div>
            <p><strong>Received From:</strong> ${escapeHTML(payerName)}</p>
            <p><strong>House:</strong> No. ${escapeHTML(house.houseNo)}, ${escapeHTML(house.address)}</p>
            <p><strong>Tenant:</strong> ${escapeHTML(house.tenant)}</p>
            <p><strong>Owner:</strong> ${escapeHTML(house.owner)}</p>
            <p><strong>Period:</strong> ${escapeHTML(formatPeriodMonth(periodMonth))}</p>
            <p><strong>Payment Mode:</strong> ${escapeHTML(paymentMode)}</p>
            <hr>
            <pre style="white-space:pre-wrap;">${details}</pre>
            <hr>
            <h4 style="text-align:right;">Total: ${formatCurrency(total)}</h4>
            <div style="margin-top:20px; display:flex; justify-content:space-between;">
                <div>Signature: _______________</div>
                <div style="font-family:monospace; letter-spacing:3px; transform:scaleX(0.5); transform-origin:right center; opacity:0.5;">*${escapeHTML(receiptNo.replace(/-/g,''))}*</div>
            </div>
            <small style="display:block; text-align:center; color:#888; margin-top:10px;">Generated by Home Finlytics on ${new Date().toLocaleString()}</small>
        `;

        // FIX: Show preview and update total safely
        const previewCard = document.getElementById('receiptPreviewCard');
        if (!previewCard) {
            showToast('Preview card not found', 'exclamation-triangle');
            return;
        }
        const totalPreview = previewCard.querySelector('.receipt-total-preview');
        if (totalPreview) {
            totalPreview.innerHTML = `<strong>Total: ${formatCurrency(total)}</strong>`;
        }

        // Show preview using CSS class
        previewCard.classList.remove('hidden');
        previewCard.style.display = 'block';

        // Scroll into view after browser paint
        requestAnimationFrame(() => {
            setTimeout(() => {
                previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        });

        // Save transaction
        const rentTransaction = {
            type: 'expense',
            category: 'House Rent',
            subcategory: 'House Rent',
            amount: total,
            date: issueDate,
            notes: `Receipt for House ${house.houseNo} - ${formatPeriodMonth(periodMonth)}`,
            payer: state.currentUser ? state.currentUser.name : 'Unknown',
            paymentMethod: paymentMode,
            houseId: house.id,
            receiptNo: receiptNo
        };
        const savedTx = addTransaction(rentTransaction, true);
        if (!savedTx) return; // Abort if transaction failed validation (e.g., amount <= 0)

        // Store electric reading for next month's auto-fetch
        if (document.getElementById('billCardElectric')?.classList.contains('active')) {
            const currUnit = parseFloat(document.getElementById('currentUnit')?.value) || 0;
            if (currUnit > 0 && house) {
                const houseIdx = (state.houses || []).findIndex(h => h.id === house.id);
                if (houseIdx >= 0) {
                    state.houses[houseIdx].lastElectricReading = currUnit;
                    state.houses[houseIdx].lastElectricDate = issueDate;
                }
            }
        }

        // Add payer to list if new
        const payers = state.payers ? Object.values(state.payers).filter(Boolean) : [];
        if (payerName && !payers.includes(payerName)) {
            state.payers.push(payerName);
            if (typeof saveState === 'function') saveState();
            if (typeof renderPayerList === 'function') renderPayerList();
        }

        showToast('Receipt generated and saved!', 'check-circle');

        // FIX: Reliable print button setup using parentNode.replaceChild
        setupPrintButton();

        showReceiptActionButtons(receiptNo);
        
    } catch (err) {
        console.error('Receipt generation failed:', err);
        showToast('Failed to generate receipt: ' + err.message, 'times-circle');
    }
}

// NEW: Reliable print button event listener setup
function setupPrintButton() {
    const printBtn = document.getElementById('printReceiptBtn');
    if (!printBtn) return;
    
    // FIX: Remove existing listeners by replacing with clone
    const newBtn = printBtn.cloneNode(true);
    printBtn.parentNode.replaceChild(newBtn, printBtn);
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        printReceiptWithClass();
    });
    // Also make sure the button is visible
    newBtn.style.display = '';
}

function printReceiptWithClass() {
    // FIX: Ensure the preview card is visible before printing
    const previewCard = document.getElementById('receiptPreviewCard');
    if (previewCard) {
        previewCard.classList.remove('hidden');
        previewCard.style.display = 'block';
    }
    
    // FIX: On iOS Safari, the print dialog is async and afterprint fires too aggressively.
    // Use a flag to prevent premature cleanup.
    window._isPrintingReceipt = true;
    
    document.body.classList.add('printing-receipt');
    // Use requestAnimationFrame to ensure DOM updates before print
    requestAnimationFrame(() => {
        setTimeout(() => {
            window.print();
            // On iOS, afterprint fires immediately when print dialog opens.
            // Keep the printing class until user explicitly dismisses.
            // We'll remove it on the next page interaction.
        }, 300);
    });
}

// FIX: Ensure cleanup happens reliably — but don't hide the receipt preview
window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-receipt');
    window._isPrintingReceipt = false;
});

// Also handle the case where user navigates away after printing
// by cleaning up the class
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window._isPrintingReceipt) {
        // User returned from print dialog — keep preview visible
        window._isPrintingReceipt = false;
        document.body.classList.remove('printing-receipt');
    }
});

async function loadHtml2Canvas() {
    if (typeof window.html2canvas !== 'undefined') return true;
    if (typeof showToast === 'function') showToast('Loading image processor...', 'hourglass-half');
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
    });
}

function showReceiptActionButtons(receiptNo = '') {
    const previewCard = document.getElementById('receiptPreviewCard');
    if (!previewCard) return;

    // Remove any existing action row
    const existing = document.getElementById('receiptActionsRow');
    if (existing) existing.remove();

    const actionRow = document.createElement('div');
    actionRow.id = 'receiptActionsRow';
    actionRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;';

    actionRow.innerHTML = `
        <button class="btn btn-sm btn-secondary" id="shareReceiptBtn"><i class="fas fa-share-alt"></i> Share</button>
        <button class="btn btn-sm btn-secondary" id="downloadJPGBtn"><i class="fas fa-image"></i> JPG</button>
        <button class="btn btn-sm btn-secondary" id="copyReceiptBtn"><i class="fas fa-copy"></i> Copy Details</button>
        <button class="btn btn-sm btn-secondary" id="downloadPDFBtn"><i class="fas fa-file-pdf"></i> PDF (Print)</button>
    `;

    previewCard.appendChild(actionRow);

    // Share via Web Share API (with desktop/iOS fallback)
    document.getElementById('shareReceiptBtn')?.addEventListener('click', async function() {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        const origHTML = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        
        try {
            const isLoaded = await loadHtml2Canvas();
            if (!isLoaded) {
                showToast('Failed to load image processor.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { 
                scale: window.devicePixelRatio ? window.devicePixelRatio * 1.5 : 3,
                backgroundColor: '#ffffff',
                useCORS: true,
                willReadFrequently: true
            });
            
            // Try Web Share API with file (works on Android Chrome, iOS Safari)
            canvas.toBlob(async (blob) => {
                const file = new File([blob], `Receipt_${receiptNo}.jpg`, { type: 'image/jpeg' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ title: 'Rent Receipt', files: [file] });
                        showToast('Receipt shared!', 'check-circle');
                        return;
                    } catch (error) {
                        // User cancelled or share failed — fall through to fallback
                        if (error.name === 'AbortError') return;
                    }
                }
                // Fallback for desktop: download the JPG instead
                const link = document.createElement('a');
                link.download = `Receipt_${receiptNo}.jpg`;
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
                showToast('Web Share not supported — JPG downloaded instead.', 'download');
            }, 'image/jpeg', 0.9);
        } catch (e) {
            console.error(e);
            if (e.name !== 'AbortError') {
                showToast('Failed to generate image for sharing.', 'times-circle');
            }
        } finally {
            this.disabled = false;
            this.innerHTML = origHTML;
        }
    });

    // Download as JPG (works on desktop + Android; iOS opens image for long-press save)
    document.getElementById('downloadJPGBtn')?.addEventListener('click', async function() {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        const origHTML = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        try {
            const isLoaded = await loadHtml2Canvas();
            if (!isLoaded) {
                showToast('Failed to load image processor. Check your internet.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { 
                scale: 2, 
                backgroundColor: '#ffffff', 
                useCORS: true,
                willReadFrequently: true
            });
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS) {
                const win = window.open('');
                if (win) {
                    win.document.write(`<img src="${canvas.toDataURL('image/jpeg', 0.9)}" style="max-width:100%;"><p style="text-align:center;font-family:sans-serif;">Long-press the image and tap <strong>Save to Photos</strong>.</p>`);
                }
                showToast('Long-press image to save to Photos', 'image');
            } else {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `Receipt_${receiptNo}.jpg`;
                    link.href = url;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    showToast('JPG downloaded!', 'check-circle');
                }, 'image/jpeg', 0.9);
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to download JPG: ' + (e.message || 'Unknown error'), 'times-circle');
        } finally {
            this.disabled = false;
            this.innerHTML = origHTML;
        }
    });

    // Copy details to clipboard
    document.getElementById('copyReceiptBtn')?.addEventListener('click', () => {
        const text = document.getElementById('receiptPaper')?.innerText || '';
        navigator.clipboard.writeText(text).then(() => {
            showToast('Receipt copied to clipboard!', 'copy');
        });
    });

    // PDF – render receipt as high-quality image and open for print/Save as PDF
    document.getElementById('downloadPDFBtn')?.addEventListener('click', async function() {
        const origHTML = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        
        const receiptPaper = document.getElementById('receiptPaper');
        if (receiptPaper && typeof window.html2canvas !== 'undefined') {
            try {
                const canvas = await html2canvas(receiptPaper, { 
                    scale: 2, backgroundColor: '#ffffff', useCORS: true, willReadFrequently: true 
                });
                const win = window.open('');
                if (win) {
                    win.document.write(`
                        <html><head><title>Receipt ${receiptNo}</title>
                        <style>body{margin:0;display:flex;justify-content:center;background:#fff;}img{max-width:100%;}</style>
                        </head><body><img src="${canvas.toDataURL('image/jpeg', 0.95)}" onload="window.print()"></body></html>
                    `);
                    win.document.close();
                    showToast('Receipt opened for printing — use Save as PDF in the print dialog.', 'print');
                } else {
                    printReceiptWithClass();
                }
            } catch (e) {
                printReceiptWithClass();
            }
        } else {
            printReceiptWithClass();
        }
        
        this.disabled = false;
        this.innerHTML = origHTML;
    });
}