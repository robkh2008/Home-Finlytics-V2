// ==================== js/receiptGenerator.js ====================

function refreshReceiptForm() {
    const sel = document.getElementById('receiptHouse');
    if (sel) {
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        sel.innerHTML = '<option value="">Select</option>' +
            houses.map(h => `<option value="${escapeHTML(h.id)}">House ${escapeHTML(h.houseNo)} - ${escapeHTML(h.tenant)} (Owner: ${escapeHTML(h.owner)})</option>`).join('');
            
    }
    
    const issueDate = document.getElementById('receiptIssueDate');
    if (issueDate) issueDate.value = new Date().toISOString().slice(0, 10);
    
    // FIX: Use CSS class to hide instead of inline style
    const previewCard = document.getElementById('receiptPreviewCard');
    if (previewCard) {
        previewCard.classList.add('hidden');
        previewCard.style.display = '';
    }
    
    // FIX: Update both total preview elements
    const inFormTotal = document.getElementById('receiptTotalPreview');
    if (inFormTotal) inFormTotal.innerHTML = '<strong>Total: ₹0.00</strong>';
    const standaloneTotal = document.getElementById('receiptTotalPreviewForm');
    if (standaloneTotal) standaloneTotal.innerHTML = '<strong>Total: ₹0.00</strong>';

    const rateLabel = document.getElementById('electricRateLabel');
    if (rateLabel) rateLabel.textContent = (state.currency || '₹') + (state.electricRate || 8);
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
    
    document.body.classList.add('printing-receipt');
    // Use requestAnimationFrame to ensure DOM updates before print
    requestAnimationFrame(() => {
        setTimeout(() => {
            window.print();
        }, 200);
    });
}

// FIX: Ensure cleanup happens reliably
window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-receipt');
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
    document.getElementById('shareReceiptBtn')?.addEventListener('click', async () => {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        
        try {
            const isLoaded = await loadHtml2Canvas();
            if (!isLoaded) {
                showToast('Failed to load image processor.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { 
                scale: window.devicePixelRatio ? window.devicePixelRatio * 1.5 : 3,
                backgroundColor: '#ffffff',
                useCORS: true
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
            showToast('Failed to generate image for sharing.', 'times-circle');
        }
    });

    // Download as JPG (works on desktop + Android; iOS opens image for long-press save)
    document.getElementById('downloadJPGBtn')?.addEventListener('click', async () => {
        const receiptPaper = document.getElementById('receiptPaper');
        if (!receiptPaper) return;
        try {
            const isLoaded = await loadHtml2Canvas();
            if (!isLoaded) {
                showToast('Failed to load image processor.', 'exclamation-triangle');
                return;
            }
            const canvas = await html2canvas(receiptPaper, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS) {
                // iOS Safari ignores download attribute — open in new tab for long-press save
                const win = window.open('');
                win.document.write(`<img src="${canvas.toDataURL('image/jpeg', 0.9)}" style="max-width:100%;"><p style="text-align:center;font-family:sans-serif;">Long-press the image and tap <strong>Save to Photos</strong>.</p>`);
                showToast('Long-press image to save to Photos', 'image');
            } else {
                const link = document.createElement('a');
                link.download = `Receipt_${receiptNo}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
                showToast('JPG downloaded!', 'check-circle');
            }
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