// ==================== js/categories.js ====================
// Category management helpers (used in settings and add form)
function refreshAddFormCategories() {
    const type = document.getElementById('addType')?.value || '';
    const catSelect = document.getElementById('addCategory');
        if (catSelect) {
            if (type === 'lent') {
                catSelect.innerHTML = '<option value="Lent" selected>Lent</option>';
            } else if (type === 'returned') {
                catSelect.innerHTML = '<option value="Returned" selected>Returned</option>';
            } else if (type === 'settlement') {
                catSelect.innerHTML = '<option value="Settlement" selected>Settlement</option>';
            } else if (type === 'rent') {
                // Auto-select House Rent category for rent type
                catSelect.innerHTML = '<option value="">Select</option><option value="House Rent" selected>House Rent</option>';
            } else {
                // USER-CENTRIC: All users can see expense categories for their own expenses
                let sourceType = type;
                if (!sourceType || !state.categories?.[sourceType]) {
                    // Default: expense for expense type, groceries for groceries type
                    sourceType = (type === 'groceries') ? 'groceries' : 'expense';
                }
                const cats = state.categories?.[sourceType] ? Object.values(state.categories[sourceType]).filter(Boolean) : [];
                catSelect.innerHTML = '<option value="">Select</option>' + cats.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('');
            }
        }
        // Also reset subcategory dropdown when category changes
        updateSubcategoryDropdown();
        
        // Refresh payment method dropdown with latest payment modes
        if (typeof refreshPaymentModeSelects === 'function') refreshPaymentModeSelects();
}
  
// Populate subcategory based on selected category
function updateSubcategoryDropdown() {
    const type = document.getElementById('addType')?.value || '';
    const catName = document.getElementById('addCategory')?.value;
    const subSelect = document.getElementById('addSubcategory');
    
    if (!subSelect) return;
    
    // Show/hide landing fields
    const borrowerGroup = document.getElementById('addBorrowerGroup');
    const landingStatusGroup = document.getElementById('addLandingStatusGroup');
    const isLanding = (catName === 'Landing');
    
    if (borrowerGroup) borrowerGroup.style.display = isLanding ? 'block' : 'none';
    if (landingStatusGroup) landingStatusGroup.style.display = isLanding ? 'block' : 'none';
    
    // Build the string first for better performance
    let optionsHTML = '<option value="">Select</option>';

    if (catName) {
        // FIX: Search across ALL category types when type is empty or not matching
        let cats = [];
        if (type && state.categories?.[type]) {
            cats = Object.values(state.categories[type]).filter(Boolean);
        }
        // If no cats found for the specific type, search all category collections
        if (cats.length === 0) {
            ['expense', 'groceries'].forEach(t => {
                if (state.categories?.[t]) {
                    const found = Object.values(state.categories[t]).filter(Boolean).filter(c => c.name === catName);
                    if (found.length > 0) cats = cats.concat(found);
                }
            });
            // Deduplicate
            cats = cats.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
        }
        const cat = cats.find(c => c.name === catName);

        const subs = cat && cat.subcategories ? Object.values(cat.subcategories).filter(Boolean) : [];
        if (subs.length > 0) {
            let groups = {};
            let ungrouped = [];
            
            subs.forEach(sub => {
                if (sub.includes(':')) {
                    let parts = sub.split(':');
                    let g = parts[0].trim();
                    if (!groups[g]) groups[g] = [];
                    groups[g].push(sub);
                } else {
                    ungrouped.push(sub);
                }
            });

            optionsHTML += ungrouped.map(sub => `<option value="${escapeHTML(sub)}">${escapeHTML(sub)}</option>`).join('');
            for (let g in groups) {
                optionsHTML += `<optgroup label="${escapeHTML(g)}">`;
                optionsHTML += groups[g].map(sub => `<option value="${escapeHTML(sub)}">${escapeHTML(sub.split(':').slice(1).join(':').trim())}</option>`).join('');
                optionsHTML += `</optgroup>`;
            }
            
            // Enable the dropdown if subcategories exist
            subSelect.disabled = false;
            } else {
                // Disable the dropdown if no subcategories exist
                subSelect.disabled = true;
            }
            
            // Always add the "Add new..." option at the end - all users can add subcategories now
            optionsHTML += '<option value="__new__">+ Add new...</option>';
            subSelect.disabled = false;
        } else {
            // Disable the dropdown if no category is selected
            subSelect.disabled = true;
            // Show a helpful placeholder
            optionsHTML = '<option value="">-- Select a category first --</option>';
        }

        // Inject into the DOM exactly once
        subSelect.innerHTML = optionsHTML;

        // Hide the custom input row if visible and not relevant
        const row = document.getElementById('addCustomSubcatRow');
        if (row && subSelect.value !== '__new__') {
            row.style.display = 'none';
        }
}