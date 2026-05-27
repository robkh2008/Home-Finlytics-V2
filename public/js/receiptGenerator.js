// ==================== js/receiptGenerator.js ====================

function refreshReceiptForm() {
    const sel = document.getElementById('receiptHouse');
    if (sel) {
        sel.innerHTML = '<option value="">Select</option>' +
            (state.houses || []).map(h => `<option value="${escapeHTML(h.id)}">House ${escapeHTML(h.houseNo)} - ${escapeHTML(h.tenant)} (Owner: ${escapeHTML(h.owner)})</option>`).join('');
            
    }
    
    const issueDate = document.getElementById('receiptIssueDate');
    if (issueDate) issueDate.value = new Date().toISOString().slice(0, 10);
    
    // FIX: Use CSS class to hide instead of inline style
    const previewCard = document.getElementById('receiptPreviewCard');
    if (previewCard) {
        previewCard.classList.add('hidden');
        previewCard.style.display = '';
    }
    
    // FIX: Use class selector for form total
    const formTotal = document.querySelector('#receiptForm .receipt-total-form');
    if (formTotal) formTotal.innerHTML = '<strong>Total: ₹0.00</strong>';

    const rateLabel = document.getElementById('electricRateLabel');
    if (rateLabel) rateLabel.textContent = (state.currency || '₹') + (state.electricRate || 8);
}

function generateReceipt() {
    try {
        const houseId = document.getElementById('receiptHouse').value;
        const house = state.houses.find(h => h.id === houseId);
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

        // --- Calculations ---
        const rent = parseFloat(document.getElementById('receiptRent').value) || 0;
        let total = rent;
        let details = `Rent: ${formatCurrency(rent)}\n`;

        if (document.getElementById('includeWaterBill')?.checked) {
            const w = parseFloat(document.getElementById('waterBillAmount')?.value) || 0;
            total += w;
            details += `Water Bill: ${formatCurrency(w)}\n`;
        }
        if (document.getElementById('includeMotorBill')?.checked) {
            const m = parseFloat(document.getElementById('motorBillAmount')?.value) || 0;
            total += m;
            details += `Motor Bill: ${formatCurrency(m)}\n`;
        }
        if (document.getElementById('includeElectricBill')?.checked) {
            const curr = parseFloat(document.getElementById('currentUnit')?.value) || 0;
            const prev = parseFloat(document.getElementById('previousUnit')?.value) || 0;
            const units = Math.max(0, curr - prev);
        const rate = state.electricRate || 8;
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
                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%23007aff'/%3E%3Ctext x='50' y='65' font-size='40' text-anchor='middle' fill='white'%3E💰%3C/text%3E%3C/svg%3E" alt="Home Finlytics Logo" width="55" height="55">
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

        // FIX: Use scoped querySelector to target the correct total preview
        const previewCard = document.getElementById('receiptPreviewCard');
        const totalPreview = previewCard.querySelector('.receipt-total-preview');
        if (totalPreview) {
            totalPreview.innerHTML = `<strong>Total: ${formatCurrency(total)}</strong>`;
        }

        // FIX: Show preview using CSS class (reliable) + remove inline display:none
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

        // Add payer to list if new
        if (payerName && !state.payers.includes(payerName)) {
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
    
    // Use parentNode.replaceChild for reliable DOM replacement
    const newBtn = printBtn.cloneNode(true);
    printBtn.parentNode.replaceChild(newBtn, printBtn);
    newBtn.addEventListener('click', printReceiptWithClass);
}

function printReceiptWithClass() {
    document.body.classList.add('printing-receipt');
    setTimeout(() => {
        window.print();
    }, 300);
}

window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-receipt');
});

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

    // Share via Web Share API
    document.getElementById('shareReceiptBtn')?.addEventListener('click', async () => {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        
        try {
            if (typeof html2canvas === 'undefined') {
                showToast('html2canvas library is missing.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { 
                scale: window.devicePixelRatio ? window.devicePixelRatio * 1.5 : 3,
                backgroundColor: '#ffffff',
                useCORS: true
            });
            canvas.toBlob(async (blob) => {
                if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'receipt.jpg', { type: 'image/jpeg' })] })) {
                    const file = new File([blob], `Receipt_${receiptNo}.jpg`, { type: 'image/jpeg' });
                    try {
                        await navigator.share({
                            title: 'Rent Receipt',
                            files: [file]
                        });
                        showToast('Receipt shared!', 'check-circle');
                    } catch (error) {
                        console.error('Error sharing:', error);
                    }
                } else {
                    showToast('Web Share API not supported on this device.', 'exclamation-triangle');
                }
            }, 'image/jpeg', 0.9);
        } catch (e) {
            console.error(e);
            showToast('Failed to generate image for sharing.', 'times-circle');
        }
    });

    // Download as JPG
    document.getElementById('downloadJPGBtn')?.addEventListener('click', async () => {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        try {
            if (typeof html2canvas === 'undefined') {
                showToast('html2canvas library is missing.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            const link = document.createElement('a');
            link.download = `Receipt_${receiptNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
            showToast('JPG downloaded!', 'check-circle');
        } catch (e) {
            console.error(e);
            showToast('Failed to download JPG.', 'times-circle');
        }
    });

    // Copy details to clipboard
    document.getElementById('copyReceiptBtn')?.addEventListener('click', () => {
        const text = document.getElementById('receiptPaper')?.innerText || '';
        navigator.clipboard.writeText(text).then(() => {
            showToast('Receipt copied to clipboard!', 'copy');
        });
    });

    // PDF – trigger print dialog
    document.getElementById('downloadPDFBtn')?.addEventListener('click', () => {
        printReceiptWithClass();
    });
}