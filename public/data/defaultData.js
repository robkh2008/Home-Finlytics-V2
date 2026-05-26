// ==================== data/defaultData.js ====================
const DEFAULT_HOUSES = [
    { id: 'h1', houseNo: '37', address: 'Safdarjung Enclave', tenant: 'Robert', owner: 'Mr. Anil', rent: 8800, },
    { id: 'h2', houseNo: '85', address: 'Humayumpur', tenant: 'Esther', owner: 'Mr. Sandy', rent: 16000 },     
];

const DEFAULT_CATEGORIES = {
    expense: [{ name: 'Food', icon:"🍜", color: '#ff6b6b', subcategories: ['Dining Out', 'Snacks', 'Delivery & Takeout', 'Cafes & Coffee', 'Work Lunch', 'Fast Food'] },
        { name: 'Groceries', icon:"🛒", color: '#8bc34a', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household'] },
        { name: 'House Rent', icon:"🏠", color: '#ff9500', subcategories: ['House Rent', 'Water Bill', 'Electric Bill', 'Motor Bill'] },
        { name: 'Transport', icon:"🚌", color: '#17a2b8', subcategories: ['Fuel', 'Public Transport', 'Uber', 'Bike & Car Maintenance', 'Parking', 'Bike & Car Wash', 'Vehicle Insurance', 'Tolls', 'Flights'] },
        { name: 'Entertainment', icon:"🎮", color: '#fd7e14', subcategories: ['Movies', 'Games', 'Events', 'Subscriptions', 'Hobbies'] },
        { name: 'Utilities', icon:"💡", color: '#5ac8fa', subcategories: ['Electricity', 'Water', 'Internet', 'Gas', 'Phone Bill', 'Trash/Garbage'] },
        { name: 'Shopping', icon:"🛍️", color: '#e83e8c', subcategories: ['Clothing', 'Electronics', 'Home Appliances', 'Furniture & Decor', 'Kitchen Appliances', 'Gifts', 'Accessories'] },
        { name: 'Healthcare', icon:"🏥", color: '#20c997', subcategories: ['Doctor', 'Medicine', 'Health Insurance', 'Gym', 'Dental', 'Vision'] },
        { name: 'Education', icon:"📚", color: '#5856d6', subcategories: ['Tuition', 'Books', 'Courses','Admission fees', 'Stationery'] },
        { name: 'Personal Care', icon:"💆", color: '#d63384', subcategories: ['Haircut', 'Cosmetics', 'Hair Care', 'Body Care', 'Skin Care', 'Spa'] },
        { name: 'Debt & Loans', icon:"💳", color: '#dc3545', subcategories: ['Credit Card', 'EMI', 'Personal Loan', 'Home Loan', 'Car Loan', 'Business Loan'] },
        { name: 'Marup', icon:"💼", color: '#c0ca33', subcategories: ['Rohen', 'Echan', 'Abe Phanek'] },
        { name: 'Miscellaneous Expenses', icon:"📦", color: '#6c757d', subcategories: ['Other Expenses', 'Taxes', 'Home Transfer', 'Donations', 'Fines'] }],
    groceries: [
        { name: 'Groceries', icon:"🛒", color: '#8bc34a', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household'] }
    ]
}
// Default payers (now stored in state.payers)
const DEFAULT_PAYERS = ['Robert', 'Esther', 'Gedion', 'Angela'];