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
            } else {
                const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : (state.categories?.['expense'] ? Object.values(state.categories['expense']).filter(Boolean) : []);
                catSelect.innerHTML = '<option value="">Select</option>' + cats.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('');
            }
        }
        // Also reset subcategory dropdown when category changes
        updateSubcategoryDropdown();
}
  
// Populate subcategory based on selected category
function updateSubcategoryDropdown() {
    const type = document.getElementById('addType')?.value || '';
    const catName = document.getElementById('addCategory')?.value;
    const subSelect = document.getElementById('addSubcategory');
    
    if (!subSelect) return;
    
    // Build the string first for better performance
    let optionsHTML = '<option value="">Select</option>';

    if (catName) {
        const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
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
            
            // Always add the "Add new..." option at the end if admin
            if (state.userRole === 'admin') {
                optionsHTML += '<option value="__new__">+ Add new...</option>';
                subSelect.disabled = false;
            }
        } else {
            // Disable the dropdown if no category is selected
            subSelect.disabled = true;
        }

        // Inject into the DOM exactly once
        subSelect.innerHTML = optionsHTML;

        // Hide the custom input row if visible and not relevant
        const row = document.getElementById('addCustomSubcatRow');
        if (row && subSelect.value !== '__new__') {
            row.style.display = 'none';
        }
}